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

  function requestOpenForm(item: FormMetaItem): void {
    if (host.nodes().length) {
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
    renaming.value = true
    try {
      await activeStore.value.renameForm(item.id, next)
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
      const index = await activeStore.value.listForms()
      if (!index.some((f) => f.id === item.id)) {
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
