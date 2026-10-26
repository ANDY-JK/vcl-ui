/**
 * 表单远程数据链路 composable — 拆分自 FormBuilder（超 800 行约束整改）
 *
 * submitConfig 驱动的两条远程链路：
 * - loadRemoteData: GET 拉取（apiUrl+params）→ 按 schema 字段回填 → emit 'loaded'
 * - scheduleAutoSave: review 模式防抖 POST 自动保存（版本号防过期覆盖）
 * - applyApiDefaults: api 型动态默认值（defaultMeta.type='api'）打开表单时异步回填
 */
import type { Ref } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { applyRemoteDefaults } from './useFormSchema'
import type { FormData, FormField } from './types'
import type { FormSubmitConfig } from './types'
import { checkApiUrl, type ApiUrlPolicy } from './api-url-guard'
import { makeIdempotencyKey, IDEMPOTENCY_HEADER } from './idempotency'
import { reportEvent } from '@/components/_internal/runtime-observer'

/** 调用方没配 reviewAutoSave 时的默认防抖：审核中边改边存，连改只发一次请求 */
const _DEFAULT_AUTOSAVE_DEBOUNCE_MS = 3000

const t = useT()

export function useFormRemote(
  submitConfig: Ref<FormSubmitConfig | undefined>,
  formData: Ref<FormData>,
  schemaFields: () => { key: string }[],
  emitLoaded: (data: Record<string, unknown>) => void,
  showToast: (msg: string, type: 'error', ms: number) => void,
  loadFailMsg: (err: string) => string,
  /** 外发 URL 策略：默认同源 only（submitConfig 可经分享码/URL 参数流入） */
  apiUrlPolicy: ApiUrlPolicy = {},
) {
  /** 审核模式自动保存 timer */
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  /** 自动保存版本号（防抖期间旧请求结果不覆盖新状态） */
  let autoSaveVersion = 0
  /** 挂起中的提交幂等键：同一逻辑提交内复用，成功后置 null（见 submitRemote 注释） */
  let pendingIdempotencyKey: string | null = null

  /** 远程数据加载：GET 拉取 → 按 schema 字段回填（响应取 json.data ?? json）；edit 模式跳过（不覆盖回填数据） */
  async function loadRemoteData(): Promise<void> {
    const rc = submitConfig.value
    if (!rc?.apiUrl || rc.mode === 'edit') return
    try {
      // SSR / 无 window 环境：拿不到 origin 时用相对基准，交给 checkApiUrl 按同源处理
      const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : undefined
      const url = new URL(rc.apiUrl, origin)
      for (const [k, v] of Object.entries(rc.params ?? {})) url.searchParams.set(k, String(v))
      // 外发前置校验（默认同源 only）：submitConfig 可经分享码/URL 参数流入
      const verdict = checkApiUrl(url.toString(), apiUrlPolicy)
      if (!verdict.ok) {
        showToast(
          t('formBuilder.eventApiBlocked', { field: t('formBuilder.remoteLoad'), reason: verdict.reason }),
          'error',
          3000,
        )
        return
      }
      const resp = await fetch(verdict.url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const json = (await resp.json()) as Record<string, unknown>
      const raw = (json && typeof json === 'object' && 'data' in json && json.data) || json
      const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
      const next: FormData = { ...formData.value }
      let changed = false
      const fields = schemaFields()
      for (const field of fields) {
        const v = source[field.key]
        if (v !== undefined && v !== null) {
          next[field.key] = v
          changed = true
        }
      }
      if (changed) formData.value = next
      emitLoaded(source)
    } catch (e) {
      showToast(loadFailMsg(String(e instanceof Error ? e.message : e)), 'error', 2500)
    }
  }

  /** 审核模式自动保存：mode='review' + saveUrl 时按 reviewAutoSave 防抖 POST */
  function scheduleAutoSave(): void {
    const rc = submitConfig.value
    if (rc?.mode !== 'review' || !rc.saveUrl || rc.reviewAutoSave === 0) return
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    const ver = ++autoSaveVersion
    autoSaveTimer = setTimeout(async () => {
      if (ver !== autoSaveVersion) return
      try {
        // 外发前置校验（默认同源 only）
        const verdict = checkApiUrl(rc.saveUrl!, apiUrlPolicy)
        if (!verdict.ok) {
          if (ver === autoSaveVersion) {
            showToast(
              t('formBuilder.eventApiBlocked', { field: t('formBuilder.remoteSave'), reason: verdict.reason }),
              'error',
              3000,
            )
          }
          return
        }
        const resp = await fetch(verdict.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData.value, ...(rc.params ?? {}) }),
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        // 成功静默（避免每 3 秒打断），失败才提示
      } catch {
        if (ver !== autoSaveVersion) return
        showToast(t('formBuilder.autoSaveFail'), 'error', 2500)
      }
    }, rc.reviewAutoSave ?? _DEFAULT_AUTOSAVE_DEBOUNCE_MS)
  }

  /**
   * api 型动态默认值（defaultMeta.type='api'）：打开表单时异步 GET 回填。
   * 发出后不等待（不阻塞 GET 回填/草稿加载）；仅回填仍等于初始占位值的字段——
   * 优先级天然低于 submitConfig GET 回填与草稿（它们先改值 → 守卫跳过）。
   */
  function applyApiDefaults(fields: () => FormField[], initialData: () => FormData): void {
    void applyRemoteDefaults(fields(), { apiUrlPolicy }).then((defaults) => {
      const patch: FormData = {}
      for (const key of Object.keys(defaults)) {
        if (formData.value[key] === initialData()[key]) patch[key] = defaults[key]
      }
      if (Object.keys(patch).length) formData.value = { ...formData.value, ...patch }
    })
  }

  /**
   * 提交 POST（saveUrl + params）：成功 resolve，HTTP 非 2xx / 网络失败 reject（FormBuilder 统一 toast）
   *
   * **幂等键**：一次「逻辑提交」期间复用同一个键，**成功后才换新的**。
   * 于是失败重试、用户在 3 秒守卫重置后再点一次，都带同一个键 → 服务端可去重；
   * 而下一次真正的提交拿到新键，不会被误判成重复。
   * 见 `idempotency.ts`（为何客户端守卫堵不住这个洞）。
   */
  async function submitRemote(data: FormData): Promise<void> {
    const rc = submitConfig.value
    if (!rc?.saveUrl) return
    // 外发前置校验（默认同源 only）：提交是数据外发的最后一道口，尤其要拦
    const verdict = checkApiUrl(rc.saveUrl, apiUrlPolicy)
    if (!verdict.ok) throw new Error(`提交地址被安全策略拒绝：${verdict.reason}`)
    const key = pendingIdempotencyKey ?? (pendingIdempotencyKey = makeIdempotencyKey())
    const fieldCount = Object.keys(data).length
    let resp: Response
    try {
      resp = await fetch(verdict.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [IDEMPOTENCY_HEADER]: key },
        body: JSON.stringify({ ...data, ...(rc.params ?? {}) }),
      })
    } catch (err) {
      // 传输层失败（断网/DNS/CORS）：结构化事件发在这里——它比 UI 层更懂失败原因
      reportEvent(
        'form-builder/submit-failed',
        '表单提交失败（网络层）',
        { saveUrl: verdict.url, fieldCount, reason: err instanceof Error ? err.message : String(err) },
        'error',
      )
      throw err
    }
    if (!resp.ok) {
      reportEvent(
        'form-builder/submit-failed',
        '表单提交失败（服务端拒绝）',
        { saveUrl: verdict.url, status: resp.status, fieldCount },
        'error',
      )
      throw new Error(`HTTP ${resp.status}`)
    }
    // 成功才换新键：失败保留，使"同一次提交"的重试仍能被服务端识别
    pendingIdempotencyKey = null
  }

  /** 当前挂起的幂等键（测试与宿主排查用；未提交时为 null） */
  function currentIdempotencyKey(): string | null {
    return pendingIdempotencyKey
  }

  /**
   * 丢弃挂起的幂等键（下一次提交会拿新键）。
   *
   * ⚠️ 第 138 轮修：键只在**提交成功**后轮换，失败会一直挂着等重试。这在"重试同一次提交"
   * 时是对的，但**放弃这次提交、改录一条新记录**时就错了 —— 新记录会带着旧键出去，
   * 服务端若实现了去重，会把它当成"上一次失败的重复"直接丢弃（静默丢数据）。
   * 所以「重置表单」必须同时丢弃这个键：重置的语义就是"这次提交不要了"。
   */
  function resetIdempotency(): void {
    pendingIdempotencyKey = null
  }

  /** 卸载清理（autoSave pending） */
  function dispose(): void {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
  }

  return {
    loadRemoteData,
    scheduleAutoSave,
    applyApiDefaults,
    submitRemote,
    currentIdempotencyKey,
    resetIdempotency,
    dispose,
  }
}
