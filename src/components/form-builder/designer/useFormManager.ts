/**
 * 表单管理器 — 保存 / 我的表单 / 重命名 / 删除 / 分享码 / 存储方式切换 的共享逻辑
 *
 * 从 FormDesigner 拆出（超 800 行约束整改）：
 * - FormDesigner 与 SavedFormsDrawer 共享同一 manager 实例（reactive 对象，模板内自动解包 ref）
 * - 存储实现优先级：宿主注入 store prop > 全局活动 store（getActiveFormStore）
 * - 云端配置持久化在 localStorage（anon key 为公开密钥），支持 VITE_SUPABASE_* env 兜底
 */
import { computed, reactive, ref } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { validateSupabaseConfig } from '@/components/storage/supabase-transport'
import { FORM_DESIGN_VERSION, type DesignerNode, type FormMeta, type FormDesign } from './types'
import {
  type FormStore,
  type FormMetaItem,
  type FormStoreMode,
  type FormCloudConfig,
  createLocalFormStore,
  createCloudFormStore,
  getActiveFormStore,
  setActiveFormStore,
  loadStoreMode,
  saveStoreMode,
  loadCloudConfig,
  saveCloudConfig,
  envCloudConfig,
} from './store'
import { encodeShareCode, signShareCodeWith } from './share'
import { getActiveShareSigner } from './share-signer'

const t = useT()

export interface FormManagerHost {
  /** 当前画布节点（getter 保持响应） */
  nodes: () => DesignerNode[]
  /** 当前表单元信息 */
  meta: () => FormMeta
  /** 回填表单元信息（打开已存表单时） */
  updateMeta: (m: FormMeta) => void
  /** 画布替换为指定节点树（打开已存表单时；调用方负责先 snapshot 进撤销栈） */
  applyNodes: (nodes: DesignerNode[]) => void
  /** 打开前的撤销栈快照 */
  snapshot: () => void
  /** 宿主注入的存储实现（存在时隐藏存储方式切换 UI） */
  injectedStore?: () => FormStore | undefined
  /** 轻提示 */
  showTip: (msg: string) => void
  /** 表单打开完成后的 UI 收尾（如切回设计页签） */
  onFormOpened?: () => void
  /** 保存成功后通知宿主 */
  onSaved?: (item: FormMetaItem) => void
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** 表单管理编排：存储实现选择（宿主注入优先）、列表/草稿/收集数据的增删改查与落库调度 */
export function useFormManager(host: FormManagerHost) {
  /** 存储实现：宿主注入优先，否则全局活动 store */
  const activeStore = computed<FormStore>(() => host.injectedStore?.() ?? getActiveFormStore())
  const hasInjectedStore = computed(() => !!host.injectedStore?.())

  /** 当前表单 id：保存覆盖目标；打开已存表单后设置；删除后清空 */
  const currentFormId = ref<string | null>(null)

  // ════════════════════════════════════════
  // 存储方式（本地 / 云端）
  // ════════════════════════════════════════

  const storageMode = ref<FormStoreMode>(loadStoreMode())
  const cloudUrl = ref('')
  const cloudKey = ref('')
  const cloudBucket = ref('')
  const cloudTesting = ref(false)
  const cloudTestMsg = ref('')
  const cloudTestOk = ref(false)

  // 云端配置输入初始化：持久化偏好 → env 兜底
  const _initCfg = loadCloudConfig() ?? envCloudConfig()
  if (_initCfg) {
    cloudUrl.value = _initCfg.url
    cloudKey.value = _initCfg.anonKey
    cloudBucket.value = _initCfg.bucket
  }

  function collectCloudCfg(): FormCloudConfig {
    return { url: cloudUrl.value.trim(), anonKey: cloudKey.value.trim(), bucket: cloudBucket.value.trim() }
  }

  /** 切换存储方式：云端需配置完整才生效（配置非法时保持原模式并提示） */
  function onModeChange(e: Event): void {
    const mode = (e.target as HTMLSelectElement).value as FormStoreMode
    if (mode === storageMode.value || hasInjectedStore.value) return
    if (mode === 'cloud') {
      const cfg = collectCloudCfg()
      const invalid = validateSupabaseConfig(cfg)
      if (invalid) {
        cloudTestOk.value = false
        cloudTestMsg.value = invalid
        host.showTip(invalid)
        return
      }
      try {
        setActiveFormStore(createCloudFormStore(cfg))
      } catch (err) {
        cloudTestOk.value = false
        cloudTestMsg.value = errText(err)
        host.showTip(errText(err))
        return
      }
      saveCloudConfig(cfg)
      saveStoreMode('cloud')
      storageMode.value = 'cloud'
      host.showTip(t('fbd.storageSwitched', { mode: t('fbd.storageCloud') }))
    } else {
      setActiveFormStore(createLocalFormStore())
      saveStoreMode('local')
      storageMode.value = 'local'
      host.showTip(t('fbd.storageSwitched', { mode: t('fbd.storageLocal') }))
    }
  }

  /** 云端连通性测试：真实拉一次表单列表，成功/失败如实展示 */
  async function testCloud(): Promise<void> {
    const cfg = collectCloudCfg()
    const invalid = validateSupabaseConfig(cfg)
    if (invalid) {
      cloudTestOk.value = false
      cloudTestMsg.value = invalid
      return
    }
    cloudTesting.value = true
    cloudTestMsg.value = ''
    try {
      await createCloudFormStore(cfg).listForms()
      cloudTestOk.value = true
      cloudTestMsg.value = t('fbd.storageTestOk')
    } catch (err) {
      cloudTestOk.value = false
      cloudTestMsg.value = t('fbd.storageTestFail', { err: errText(err) })
    } finally {
      cloudTesting.value = false
    }
  }

  // ════════════════════════════════════════
  // 保存
  // ════════════════════════════════════════

  const saving = ref(false)

  /**
   * 目标表单是否仍在库里（第 151 轮，delete 与 rename 共用）。
   *
   * 为什么需要：存储层的 `deleteForm(id)` 与 `renameForm(id, name)` 都是
   * **找不到目标就静默 `return`**（不抛错、返回 `void`）—— 于是"目标早就没了"与
   * "操作成功了"在上层**完全无法区分**，一律提示成功就是假成功。
   * 接口表达力不足时，只能由上层补一次读校验。
   *
   * **尽力而为**：取索引失败（网络抖动）时按"还在"处理 —— 查存在性是防御，
   * 不能反过来让删除/改名失败。真实失败仍由存储层抛错兜住。
   */
  async function targetStillExists(id: string): Promise<boolean> {
    try {
      const index = await activeStore.value.listForms()
      return index.some((f) => f.id === id)
    } catch {
      return true
    }
  }

  /**
   * 新建时是否有同名表单（第 147 轮）。
   *
   * 为什么需要：表单名就是导航项标签。低代码的目标是"用户完全自己建导航项"，
   * 两个都叫「报表」的导航项在侧栏里分不清，用户只能点开猜。
   * **只拦新建**：覆盖保存是同一份表单改名，不该被自己挡。
   * **尽力而为**：取索引失败（网络抖动）时放行 —— 查重是体验优化，不能反过来让保存失败。
   */
  async function findSameName(name: string): Promise<string | null> {
    if (!name) return null
    try {
      const index = await activeStore.value.listForms()
      // 调用方传进来的 name 已 trim（=\`trimmed || meta.title\`），这里不再重复 trim；
      // 也**不需要排除自己**：只有新建才会调本函数，此时还没有 currentFormId。
      // 两处都是本轮负向对照专门盯出来的死代码（探针"未生效"就是信号）。
      const hit = index.find((f) => f.name.trim() === name)
      return hit ? hit.name : null
    } catch {
      return null
    }
  }

  /** 保存当前画布；成功返回元信息，失败返回 null（错误经 showTip 展示） */
  async function saveForm(name: string): Promise<FormMetaItem | null> {
    if (saving.value) return null
    if (!host.nodes().length) {
      host.showTip(t('fbd.nothingToSave'))
      return null
    }
    const trimmed = name.trim()
    const finalName = trimmed || host.meta().title || ''
    // ⚠️ 锁必须在查重**之前**上：查重里有 await，先查后锁会让并发的第二次调用
    // 穿过 `saving` 检查（本轮的负向对照真的抓到了这个回归）。
    saving.value = true
    try {
      // 新建才查重（覆盖保存是同一份表单改名，不该被自己挡）
      if (!currentFormId.value) {
        const clash = await findSameName(finalName)
        if (clash) {
          host.showTip(t('fbd.duplicateName', { name: clash }))
          return null
        }
      }
      const design: FormDesign = { schemaVersion: FORM_DESIGN_VERSION, meta: host.meta(), nodes: host.nodes() }
      const item = await activeStore.value.saveForm(
        currentFormId.value,
        design,
        trimmed || host.meta().title || undefined,
      )
      currentFormId.value = item.id
      // 第 150 轮：保存时用户可能改了名字，而存储层的兜底是 `name || design.meta.title`。
      // 若不回写，画布标题会继续停留在旧名 —— 下次名字框留空再保存就退回旧名（改名白改）。
      // 用 `item.name`（存储层归一后的最终名）回写，保证"画布标题 = 库里的名字"。
      const metaNow = host.meta()
      if (metaNow.title !== item.name) host.updateMeta({ ...metaNow, title: item.name })
      markClean() // 存下去的这份就是"已保存"基线（必须在回写之后取，否则刚保存就变脏）
      host.showTip(t('fbd.savedTip', { name: item.name }))
      host.onSaved?.(item)
      return item
    } catch (err) {
      host.showTip(t('fbd.saveFail', { err: errText(err) }))
      return null
    } finally {
      saving.value = false
    }
  }

  // ════════════════════════════════════════
  // 我的表单（列表 / 打开 / 重命名 / 删除）
  // ════════════════════════════════════════

  const formsOpen = ref(false)
  const formsList = ref<FormMetaItem[]>([])
  const formsLoading = ref(false)
  const formsError = ref('')

  async function refreshForms(): Promise<void> {
    formsLoading.value = true
    formsError.value = ''
    try {
      formsList.value = await activeStore.value.listForms()
    } catch (err) {
      formsError.value = errText(err)
    } finally {
      formsLoading.value = false
    }
  }

  function openForms(): void {
    formsOpen.value = true
    void refreshForms()
  }

  /** 打开非空画布前需确认的候选表单 */
  const pendingLoad = ref<FormMetaItem | null>(null)

  /**
   * 当前画布的"内容签名"（第 148 轮）。
   *
   * 为什么需要：打开确认弹窗的文案是「当前画布**尚有未保存内容**」，但原实现判的是
   * `host.nodes().length`（画布非空）—— 两者不等价，于是两个方向同时出错：
   * ① **真丢数据**：画布为空但改过标题（meta）时判为"空" → 不确认 → 标题被静默覆盖；
   * ② **虚假警报**：刚打开/刚保存、什么都没改，也被告知"尚有未保存内容"。
   *
   * 签名取 `nodes + meta`：设计内容就是这两样。只在"要不要确认"这一刻算一次，
   * 不做响应式追踪（比 watch 深比较便宜，也不会在拖拽时抖动）。
   */
  function contentSignature(): string {
    try {
      return JSON.stringify({ n: host.nodes(), m: host.meta() })
    } catch {
      // 极端情况（循环引用等）算不出签名时按"脏"处理 —— 宁可多问一句，不可静默丢
      return '\u0000unserializable'
    }
  }

  /**
   * 上次"已持久化/已同步"时的内容签名；`null` = 挂载时画布就有内容、且此后从未保存/打开过。
   *
   * 首次基线怎么定，取决于"画布上那些东西是谁写的"：
   * - **挂载时为空** → 以当下（空 + 默认 meta）为基线：此后改标题/加字段才算脏。
   *   这样"空画布改标题"能被拦下（原来的实现把它判成"空"→ 静默丢标题）。
   * - **挂载时非空** → 保持 `null`（按脏处理）：这些内容是宿主给进来的（草稿恢复、外部编辑），
   *   本层无从知道它存没存过 —— 宁可多问一句，不能静默替换。
   */
  const savedSig = ref<string | null>(host.nodes().length > 0 ? null : contentSignature())

  /** 建立基线：保存成功、打开成功时调用 */
  function markClean(): void {
    savedSig.value = contentSignature()
  }

  /** 是否有未保存的修改 */
  function isDirty(): boolean {
    if (savedSig.value === null) return true // 挂载即有内容、从未保存/打开 → 按脏处理
    return savedSig.value !== contentSignature()
  }

  /**
   * 打开完成后建立基线。
   *
   * 回填是经 `host.updateMeta` / `host.applyNodes` 走宿主 emit 的，同一 tick 内
   * `host.meta()` 可能还是旧值 —— 那样会把"刚打开"误判成"已修改"。故下一微任务再取签名。
   */
  function marksCleanAfterApply(): void {
    savedSig.value = '\u0000pending'
    void Promise.resolve().then(() => {
      // 期间用户可能已经动手改了；只在本函数认领的窗口内建基线
      savedSig.value = contentSignature()
    })
  }

  function requestOpenForm(item: FormMetaItem): void {
    if (isDirty()) {
      pendingLoad.value = item
      return
    }
    void doOpenForm(item)
  }

  async function doOpenForm(item: FormMetaItem): Promise<void> {
    try {
      const design = await activeStore.value.loadForm(item.id)
      if (!design) {
        host.showTip(t('fbd.loadFail', { err: t('fbd.formNotFound', { id: item.id }) }))
        return
      }
      host.snapshot()
      host.applyNodes(design.nodes ?? design.fields ?? [])
      host.updateMeta(design.meta ?? {})
      currentFormId.value = item.id
      marksCleanAfterApply()
      formsOpen.value = false
      host.showTip(t('fbd.loadedTip', { name: item.name }))
      host.onFormOpened?.()
    } catch (err) {
      host.showTip(t('fbd.loadFail', { err: errText(err) }))
    }
  }

  const renaming = ref(false)

  /**
   * 重命名；**真的改了**才返回 true（调用方据此刷新列表）。
   *
   * 第 145 轮修：原来无论是否真改名都提示"已重命名" —— 空白名被 `trim() || item.name`
   * 兜底回落原名（不写库是对的），但界面照样报成功，用户以为改了。
   * 表单名就是导航项标签，"改了没生效却提示成功"比报错更难查。
   * 现在：名没变就提示"名称未变化"并返回 false，调用方保持弹窗打开让用户重填。
   */
  async function renameForm(item: FormMetaItem, name: string): Promise<boolean> {
    if (renaming.value) return false
    const next = name.trim() || item.name
    if (next === item.name) {
      // 空白（回落原名）或只加了首尾空格 —— 都不是"改名"
      host.showTip(t('fbd.renameNoChange'))
      return false
    }
    // ⚠️ 锁必须**早于任何 await**：`targetStillExists` 里有一次读，
    // 先查后锁会让并发的第二次调用穿过防重复检查（第 147 轮在 `saving` 上踩过同一个坑，
    // 本轮用例又抓了一次）。`finally` 会复位，所以提前上锁是安全的。
    renaming.value = true
    try {
      if (!(await targetStillExists(item.id))) {
        // 已经被别的会话删掉了 —— 改名无从谈起，且**不能报"已重命名"**
        host.showTip(t('fbd.renameGone'))
        return false
      }
      await activeStore.value.renameForm(item.id, next)
      // 第 150 轮：改名只落在列表索引上，设计稿/画布的 `meta.title` 仍是旧名。
      // 而名字框留空保存时会回落到 `meta.title` —— 于是"改名 → 保存"会把新名写回旧名。
      // 只同步**当前打开的那份**；改别人的名字不能动我的画布。
      if (currentFormId.value === item.id) {
        const metaNow = host.meta()
        if (metaNow.title !== next) host.updateMeta({ ...metaNow, title: next })
      }
      host.showTip(t('fbd.renamedTip'))
      return true
    } catch (err) {
      host.showTip(t('fbd.saveFail', { err: errText(err) }))
      return false
    } finally {
      renaming.value = false
    }
  }

  const deleting = ref(false)

  /**
   * 删除表单；**真的删掉了**才返回 true。
   *
   * 第 146 轮修：存储层的接口是 `deleteForm(id): Promise<void>`，**找不到目标就静默 return**
   * （不抛错），于是"已经被别人删掉了"和"真的删掉了"在返回值上完全一样，这里一律提示"已删除"。
   * 两个标签页同时打开、或多人共用后端时会看到"我说删成功了，刷新一下它又回来了"。
   * 现在删前先看索引：目标不在 → 不调存储层、提示"已不存在"并返回 false
   * （调用方据此弹一句"该表单已被删除"或直接刷新，而不是报成功）。
   */
  async function deleteForm(item: FormMetaItem): Promise<boolean> {
    if (deleting.value) return false
    deleting.value = true
    try {
      if (!(await targetStillExists(item.id))) {
        // 已经被别的会话删掉了 —— 目标达成但**不是本次删除**，不能报"已删除"
        host.showTip(t('fbd.deleteGone'))
        return false
      }
      await activeStore.value.deleteForm(item.id)
      if (currentFormId.value === item.id) currentFormId.value = null
      host.showTip(t('fbd.deletedTip'))
      return true
    } catch (err) {
      host.showTip(t('fbd.saveFail', { err: errText(err) }))
      return false
    } finally {
      deleting.value = false
    }
  }

  // ════════════════════════════════════════
  // 分享码
  // ════════════════════════════════════════

  /** 画布为空返回空串（调用方判断） */
  function buildShareCode(): string {
    if (!host.nodes().length) return ''
    const design: FormDesign = { schemaVersion: FORM_DESIGN_VERSION, meta: host.meta(), nodes: host.nodes() }
    return encodeShareCode(design)
  }

  /**
   * 分享码（可选签名）。
   *
   * 与上面同步版的区别：宿主若通过 `setActiveShareSigner()` 配了签发者，
   * 这里产出 **FD2** 已签名码（签发者可以是本地 HMAC，也可以是将来接的服务端）；
   * 没配就与同步版一致，产出 FD1，**保持向后兼容**。
   * 签名失败**不静默降级为未签名**——那会让"看起来签了"变成假象，直接抛给调用方处置。
   */
  async function buildShareCodeAsync(): Promise<string> {
    const plain = buildShareCode()
    if (!plain) return ''
    const signer = getActiveShareSigner()
    if (!signer) return plain
    const signed = await signShareCodeWith(plain, signer)
    if (!signed) throw new Error('分享码签名失败：分享码格式无法解析')
    return signed
  }

  return reactive({
    activeStore,
    hasInjectedStore,
    currentFormId,
    // 存储
    storageMode,
    cloudUrl,
    cloudKey,
    cloudBucket,
    cloudTesting,
    cloudTestMsg,
    cloudTestOk,
    onModeChange,
    testCloud,
    // 保存
    saving,
    saveForm,
    isDirty,
    // 我的表单
    formsOpen,
    formsList,
    formsLoading,
    formsError,
    refreshForms,
    openForms,
    pendingLoad,
    requestOpenForm,
    doOpenForm,
    renaming,
    renameForm,
    deleting,
    deleteForm,
    // 分享
    buildShareCode,
    buildShareCodeAsync,
  })
}

export type FormManager = ReturnType<typeof useFormManager>

/** 本地 store 工厂再导出：宿主/测试创建隔离实例用 */
export { createLocalFormStore }
