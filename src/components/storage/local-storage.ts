import { reportWarn } from '@/components/_internal/runtime-observer'
/**
 * 轻量存储 API（localStorage）—— 从 indexedDB.ts 物理拆出（2026-09-20，Q17）
 *
 * 拆分原因：storageSet/Get/Delete/Has 走的是 localStorage，与 indexedDB.ts 的
 * 文件名（IndexedDB 家族）不符，读代码的人按文件名找会找不到这批同步 API。
 * 原文件保留 re-export，故所有现存导入路径与 API 签名均不变（⛔ 契约不受影响）。
 *
 * 用法边界：轻量 KV（token、用户标记、开关、小配置）。重量数据走 db* 家族
 * （IndexedDB，异步、TTL、动态 store、批量事务）。
 *
 * ⛔ 保护 — 禁止修改 storageGet/Set/Delete 接口签名与键名格式（saas_ 前缀）。
 */
import { warnOnce } from '@/components/_internal/warnOnce'
import type { StoreItem } from './indexedDB'

const STORAGE_PREFIX = 'saas_'

/** 轻量写入 —— token、标记、小配置。同步，不阻塞。 */
export function storageSet<T>(key: string, value: T, ttl?: number): void {
  try {
    const now = Date.now()
    const item: StoreItem<T> = { key, value, _ts: now, _exp: ttl ? now + ttl : 0 }
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(item))
  } catch {
    reportWarn('[Storage] 写入失败:', key)
  }
}

/**
 * 内部：读取并校验**一条记录**（键存在 + 未过期 + 能解析）。
 * 返回 null 表示「不存在 / 已过期 / 损坏」。
 *
 * 为什么与 `storageGet` 分开（#495）：`storageHas` 以前用 `storageGet(key) !== null` 判存在，
 * 而 `storageGet` 返回的是**值** —— 存了 `null`（合法值，JSON 会原样写入）时会被误判成
 * "键不存在"，和真的 `storageDelete` 之后不可区分。判存在必须看记录本身，与 value 无关。
 */
function readItem<T>(key: string): StoreItem<T> | null {
  try {
    const raw: string | null = localStorage.getItem(STORAGE_PREFIX + key)
    if (!raw) return null
    const item = JSON.parse(raw) as StoreItem<T>
    if (item._exp > 0 && Date.now() > item._exp) {
      localStorage.removeItem(STORAGE_PREFIX + key)
      return null
    }
    return item
  } catch (e) {
    // 隐私模式/数据损坏静默返回 null 是既有语义；warnOnce 保证损坏数据至少可被观测到
    warnOnce('storageGet', `[Storage] 读取失败（返回 null）: ${key} — ${String(e)}`)
    return null
  }
}

/** 轻量读取 —— 自动判过期 */
export function storageGet<T>(key: string): T | null {
  const item = readItem<T>(key)
  return item ? item.value : null
}

/** 轻量删除 */
export function storageDelete(key: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key)
  } catch {
    reportWarn('[Storage] localStorage.removeItem 失败:', key)
  }
}

/**
 * 检查 key 是否存在且未过期。
 *
 * 判据是**记录本身**（readItem），不是读回来的值（#495）：`null` 是合法值，
 * `storageSet('k', null)` 之后这里必须是 true，否则宿主分不清"存了 null"和"删过键"。
 */
export function storageHas(key: string): boolean {
  return readItem(key) !== null
}
