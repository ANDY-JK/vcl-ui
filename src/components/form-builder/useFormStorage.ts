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
 * 校验草稿数据有效性
 * - 必须是对象
 * - 不能是数组或原始值
 * - 键必须是字符串
 */
function isValidDraft(data: unknown): data is FormData {
  if (data === null || data === undefined) return false
  if (typeof data !== 'object') return false
  if (Array.isArray(data)) return false
  const obj = data as Record<string, unknown>
  // 键必须是字符串
  for (const key of Object.keys(obj)) {
    if (typeof key !== 'string') return false
  }
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
        console.warn('[FormBuilder] 草稿数据格式无效，自动清除:', key)
        await dbDelete(STORE_NAME, key).catch(() => {})
        return null
      }
      return data
    } catch (err) {
      console.warn('[FormBuilder] 草稿加载失败，尝试清除:', key, err)
      // 加载失败时清除损坏的草稿，避免下次还报错
      await dbDelete(STORE_NAME, key).catch(() => {})
      return null
    }
  }

  /**
   * 保存草稿
   *
   * 含容量保护：数据超过 DRAFT_MAX_SIZE 时跳过保存并警告
   *
   * @param key 存储键
   * @param data 表单数据
   */
  async function saveDraft(key: string, data: FormData): Promise<void> {
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
        console.warn(`[FormBuilder] 草稿数据过大 (${(size / 1024 / 1024).toFixed(1)}MB)，跳过保存:`, key)
        return
      }
      await dbPut(STORE_NAME, key, plain, DRAFT_TTL)
    } catch {
      console.warn('[FormBuilder] 草稿保存失败:', key)
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
      console.warn('[FormBuilder] 草稿清除失败:', key)
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
        return { usage: est.usage ?? 0, quota: est.quota ?? 0 }
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
