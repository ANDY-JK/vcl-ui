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
) {
  /** 审核模式自动保存 timer */
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  /** 自动保存版本号（防抖期间旧请求结果不覆盖新状态） */
  let autoSaveVersion = 0

  /** 远程数据加载：GET 拉取 → 按 schema 字段回填（响应取 json.data ?? json）；edit 模式跳过（不覆盖回填数据） */
  async function loadRemoteData(): Promise<void> {
    const rc = submitConfig.value
    if (!rc?.apiUrl || rc.mode === 'edit') return
    try {
      const url = new URL(rc.apiUrl, window.location.origin)
      for (const [k, v] of Object.entries(rc.params ?? {})) url.searchParams.set(k, String(v))
      const resp = await fetch(url.toString())
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
        const resp = await fetch(rc.saveUrl!, {
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
    void applyRemoteDefaults(fields()).then((defaults) => {
      const patch: FormData = {}
      for (const key of Object.keys(defaults)) {
        if (formData.value[key] === initialData()[key]) patch[key] = defaults[key]
      }
      if (Object.keys(patch).length) formData.value = { ...formData.value, ...patch }
    })
  }

  /** 提交 POST（saveUrl + params）：成功 resolve，HTTP 非 2xx / 网络失败 reject（FormBuilder 统一 toast） */
  async function submitRemote(data: FormData): Promise<void> {
    const rc = submitConfig.value
    if (!rc?.saveUrl) return
    const resp = await fetch(rc.saveUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, ...(rc.params ?? {}) }),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  }

  /** 卸载清理（autoSave pending） */
  function dispose(): void {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
  }

  return { loadRemoteData, scheduleAutoSave, applyApiDefaults, submitRemote, dispose }
}
