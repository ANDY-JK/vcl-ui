import { reportWarn } from '@/components/_internal/runtime-observer'
/**
 * 表单存储适配 composable
 *
 * 复用现有 indexedDB.ts 的 dbPut/dbGet/dbDelete：
 * - loadDraft:  从 IndexedDB 读取草稿数据
 * - saveDraft:  保存草稿到 IndexedDB（防抖由调用方控制）
 * - clearDraft: 删除草稿
 *
 * 存储格式：store='form-drafts', key=storageKey, value=FormData
 *
 * 可选云端同步（P2 扩展点）：
 * - 传入 StorageConfig 则走 CompositeBackend 模式（同 contract-storage）
 * - 当前版本仅本地 IndexedDB，云端同步留接口
 */

import { dbPut, dbGet, dbDelete } from '@/components/storage/indexedDB'
import type { FormData } from './types'
import { DRAFT_MAX_SIZE, DRAFT_TTL } from './draft-policy'

// ════════════════════════════════════════
// 常量
// ════════════════════════════════════════

/** IndexedDB store 名（表单草稿专用） */
const STORE_NAME = 'form-drafts'

/** 草稿容量策略与表单数据草稿共用一份，见 draft-policy */

/**
 * 深度转为纯 JSON（草稿写库前置）
 *
 * Vue 响应式对象是 Proxy，IndexedDB 的 structuredClone 无法克隆（DataCloneError），
 * 且错误被草稿的静默降级 catch 吞掉——表现为草稿「静默不保存」。
 * 草稿本就是 JSON 数据，JSON 往返是最小且无副作用的纯化手段。
 */
export function toPlainJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/**
 * 草稿保存结果
 *
 * 为什么不是 `Promise<void>`（第 159 轮）：草稿"没保存成"有两种原因——**超容量被跳过**与
 * **写入失败**。两者此前都只进开发控制台（`reportWarn`），宿主无从得知：用户以为草稿在，
 * 刷新后没了，且全程没有任何提示。把结果交回调用方，宿主才能给出用户可见的提示。
 */
export type DraftSaveResult =
  { ok: true; size: number } | { ok: false; reason: 'too-large'; size: number } | { ok: false; reason: 'error' }

/**
 * 校验草稿数据有效性
 * - 必须是对象
 * - 不能是数组或原始值
 *
 * 注（第 159 轮）：这里**只**能挡"明显不是草稿"的形态。原先还有一段
 * `for (const key of Object.keys(obj)) if (typeof key !== 'string')` 的检查——
 * `Object.keys()` 只会返回字符串，该分支**永远不可能为假**，是"看起来在校验"的死代码，已删。
 * 深层可序列化性由写入前的 `toPlainJson` 保证（structuredClone 遇 Proxy 会抛）。
 *
 * 注（第 167 轮）：这里原有的 `if (data === null || data === undefined) return false` 也已删。
 * 本函数全仓只有一个调用点（loadDraft），而它上一行已经 `if (data === null || data === undefined) return null`，
 * 所以那行**永远为假**——覆盖率长期显示它是该文件唯一未执行语句，正是"不可达"的直接证据。
 * 删掉后既有 23 例全绿，反过来印证没有任何输入能走到它。null 归属由 loadDraft 的早退负责：
 * "没有草稿"不该被当成"草稿损坏"（损坏要清库，没有不需清库）。
 */
function isValidDraft(data: unknown): data is FormData {
  if (typeof data !== 'object') return false
  if (Array.isArray(data)) return false
  return true
}

// ════════════════════════════════════════
// composable
// ════════════════════════════════════════

/**
 * 表单存储 composable
 *
 * 使用方式：
 * ```ts
 * const { loadDraft, saveDraft, clearDraft } = useFormStorage()
 * // 加载草稿
 * const draft = await loadDraft('my-form')
 * // 保存草稿
 * await saveDraft('my-form', formData)
 * // 清除草稿
 * await clearDraft('my-form')
 * ```
 */
export function useFormStorage() {
  /**
   * 加载草稿
   *
   * 含错误恢复机制：
   * - 加载失败时自动清除损坏的草稿
   * - 数据格式校验（防止存储被污染导致程序崩溃）
   *
   * @param key 存储键（FormBuilder 的 storageKey prop）
   * @returns 草稿数据，无草稿/已过期/数据损坏返回 null
   */
  async function loadDraft(key: string): Promise<FormData | null> {
    try {
      const data = await dbGet<FormData>(STORE_NAME, key)
      if (data === null || data === undefined) return null
      // 数据有效性校验
      if (!isValidDraft(data)) {
        reportWarn('[FormBuilder] 草稿数据格式无效，自动清除:', key)
        await dbDelete(STORE_NAME, key).catch(() => {})
        return null
      }
      return data
    } catch (err) {
      reportWarn('[FormBuilder] 草稿加载失败，尝试清除:', key, err)
      // 加载失败时清除损坏的草稿，避免下次还报错
      await dbDelete(STORE_NAME, key).catch(() => {})
      return null
    }
  }

  /**
   * 保存草稿
   *
   * 含容量保护：数据超过 DRAFT_MAX_SIZE 时跳过保存。
   * **跳过与失败都通过返回值告知调用方**（不再是静默 no-op）——宿主据此提示用户，
   * 否则用户以为草稿在、刷新后发现没了。
   *
   * @param key 存储键
   * @param data 表单数据
   * @returns 保存结果；`ok:false` 时 `reason` 区分「超容量跳过」与「写入失败」
   */
  async function saveDraft(key: string, data: FormData): Promise<DraftSaveResult> {
    try {
      const plain = toPlainJson(data)
      // 数据大小检查（防止超出 IndexedDB 配额）
      let size = 0
      try {
        size = new Blob([JSON.stringify(plain)]).size
      } catch {
        /* Blob 不可用时跳过 */
      }
      if (size > DRAFT_MAX_SIZE) {
        reportWarn(`[FormBuilder] 草稿数据过大 (${(size / 1024 / 1024).toFixed(1)}MB)，跳过保存:`, key)
        return { ok: false, reason: 'too-large', size }
      }
      await dbPut(STORE_NAME, key, plain, DRAFT_TTL)
      return { ok: true, size }
    } catch {
      reportWarn('[FormBuilder] 草稿保存失败:', key)
      return { ok: false, reason: 'error' }
    }
  }

  /**
   * 清除草稿
   *
   * @param key 存储键
   */
  async function clearDraft(key: string): Promise<void> {
    try {
      await dbDelete(STORE_NAME, key)
    } catch {
      reportWarn('[FormBuilder] 草稿清除失败:', key)
    }
  }

  /**
   * 估算 IndexedDB 存储用量
   *
   * 使用 navigator.storage.estimate() API（如可用），
   * 返回 { usage, quota } 字节，供 UI 展示容量警告。
   */
  async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate()
        // 量不到就报"量不到"（第 167 轮）：这个 API 的结果直接进宿主 UI，
        // 交出 NaN 会渲染成「NaN%」，交出负数会渲染成「-5 B」。原先只用 ?? 0 兜缺字段，
        // NaN/负值会原样漏出去；若改成"归 0"则更糟——NaN 用量会变成"已用 0"，**假报容量充足**。
        // 归 null 让调用方与 checkStorageStatus 都能诚实地回答 'unknown'。
        const usage = Number(est.usage ?? 0)
        const quota = Number(est.quota ?? 0)
        if (!Number.isFinite(usage) || usage < 0 || !Number.isFinite(quota) || quota < 0) return null
        return { usage, quota }
      }
    } catch {
      // 非安全上下文或旧浏览器不支持
    }
    return null
  }

  /**
   * 检查存储容量是否接近上限
   *
   * @returns 'ok' | 'warning' | 'critical' | 'unknown'
   */
  async function checkStorageStatus(): Promise<'ok' | 'warning' | 'critical' | 'unknown'> {
    const est = await estimateStorage()
    // quota=0 必须单独挡（第 167 轮）：estimateStorage 已保证数值有限，但 quota=0 会让
    // ratio=usage/0=Infinity → 被下面的 > 0.9 判成 'critical'，即"配额未知"被报成"爆满"。
    // 0 在这里的含义是"配额未知"，不是"没有空间"。
    if (!est || est.quota === 0) return 'unknown'
    const ratio = est.usage / est.quota
    if (ratio > 0.9) return 'critical'
    if (ratio > 0.7) return 'warning'
    return 'ok'
  }

  return {
    loadDraft,
    saveDraft,
    clearDraft,
    estimateStorage,
    checkStorageStatus,
  }
}
