/**
 * 统一存储门面 —— 调用方只声明意图，内部按场景自动路由后端
 *
 * 后端分工（三选由门面代劳，调用方无需关心底层）：
 *   localStorage（sync）   → 轻量 KV：token、用户标记、开关、小配置（同步、跨标签页感知）
 *   IndexedDB（async）     → 重量数据：业务记录、表缓存、文件/图片 Blob、需要 TTL 的草稿
 *   云端（cloud adapter）  → 跨设备/服务端权威，需通过 setCloudAdapter 注入
 *
 * 自动路由规则：
 *   setSync / getSync / removeSync —— 强制 localStorage（登录初始化等必须同步读的场景）
 *   set / get / remove            —— 小值（≤2KB 且非 Blob）落 localStorage，其余落 IndexedDB
 *
 * 兼容说明：这是「新增」的统一入口，底层仍复用 indexedDB.ts 的 storageSet/storageGet/dbPut/dbGet。
 * 旧 API（storageGet/Set/Delete、dbPut/dbGet/...）保持不变，存量调用零改动。
 */

import { storageSet, storageGet, storageDelete, dbPut, dbGet, dbDelete, dbHas } from './indexedDB'

// ════════════════════════════════════════
// 类型
// ════════════════════════════════════════

/** 写入选项 */
export interface StorageWriteOptions {
  /** 过期时间（毫秒），0/缺省 = 永不过期 */
  ttl?: number
  /** 是否同步云端（需先 setCloudAdapter 注入云端后端，否则忽略并 warn） */
  cloud?: boolean
}

/** 通用云端 KV 适配器 —— 由调用方注入（如 Supabase KV 表 / 自建后端） */
export interface CloudKVAdapter {
  get<T = unknown>(key: string): Promise<T | null>
  set<T = unknown>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
}

// ════════════════════════════════════════
// 云端适配器（可选注入）
// ════════════════════════════════════════

let cloudAdapter: CloudKVAdapter | null = null

/**
 * 注入/移除云端 KV 适配器。传 null 关闭云端能力（退化为纯本地）。
 * 返回先前适配器，便于调用方在测试/临时切换后恢复。
 */
export function setCloudAdapter(adapter: CloudKVAdapter | null): CloudKVAdapter | null {
  const prev = cloudAdapter
  cloudAdapter = adapter
  return prev
}

// ════════════════════════════════════════
// 路由判定
// ════════════════════════════════════════

/** IndexedDB 的 KV 专用 store */
const KV_STORE = 'kv'

/** 判定是否应走 IndexedDB（大值 / 二进制 / 无法 JSON 序列化） */
function isLargeValue(value: unknown): boolean {
  if (value == null) return false
  // Blob / File / ArrayBuffer 等二进制：localStorage 无法正确保存
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true
  try {
    return JSON.stringify(value).length > 2048
  } catch {
    // 循环引用等无法序列化的对象 → 走 IndexedDB（structured clone 可存）
    return true
  }
}

// ════════════════════════════════════════
// 同步 API（localStorage）—— token / 开关 / 小配置
// ════════════════════════════════════════

function getSync<T = unknown>(key: string): T | null {
  return storageGet<T>(key)
}

function setSync<T = unknown>(key: string, value: T, ttl?: number): void {
  storageSet(key, value, ttl)
}

function removeSync(key: string): void {
  storageDelete(key)
}

// ════════════════════════════════════════
// 异步 API（自动路由 localStorage / IndexedDB / 云端）
// ════════════════════════════════════════

async function set<T = unknown>(key: string, value: T, opts: StorageWriteOptions = {}): Promise<void> {
  if (isLargeValue(value)) {
    try {
      await dbPut(KV_STORE, key, value, opts.ttl)
    } catch (e) {
      // IDB 不可用（隐私模式/配额满/版本冲突）：小值尽力降级 localStorage，仍失败才上抛
      // （写失败静默 = 调用方无感知的数据丢失，必须让失败可见）
      try {
        storageSet(key, value, opts.ttl)
        console.warn('[storage] IndexedDB 写入失败，已降级 localStorage:', key, e)
      } catch {
        throw e
      }
    }
  } else {
    storageSet(key, value, opts.ttl)
  }
  if (opts.cloud) {
    if (cloudAdapter) {
      try {
        await cloudAdapter.set(key, value)
      } catch (e) {
        // 本地已写成功：云端失败不应让整个 set 变 rejected（与 get 的云端降级对称）
        console.warn('[storage] 云端写入失败（本地已保存）:', key, e)
      }
    } else {
      console.warn('[storage] 未注入云端适配器（setCloudAdapter），cloud 选项已忽略:', key)
    }
  }
}

/** 读取：先 localStorage（同步命中），miss 再 IndexedDB，再 miss 查云端 */
async function get<T = unknown>(key: string): Promise<T | null> {
  const local = storageGet<T>(key)
  if (local !== null) return local

  // IDB 故障（隐私模式/版本冲突/不可用）不中断降级链：跳过继续查云端
  let idb: T | null = null
  try {
    idb = await dbGet<T>(KV_STORE, key)
  } catch (e) {
    console.warn('[storage] IndexedDB 读取失败，跳过继续降级:', key, e)
  }
  if (idb !== null) return idb

  if (cloudAdapter) {
    try {
      const cloud = await cloudAdapter.get<T>(key)
      if (cloud !== null) {
        // 云端命中回填本地缓存
        if (isLargeValue(cloud)) await dbPut(KV_STORE, key, cloud)
        else storageSet(key, cloud)
        return cloud
      }
    } catch (e) {
      console.warn('[storage] 云端读取失败，降级为本地:', key, e)
    }
  }
  return null
}

async function remove(key: string): Promise<void> {
  storageDelete(key)
  await dbDelete(KV_STORE, key)
  if (cloudAdapter) {
    try {
      await cloudAdapter.remove(key)
    } catch (e) {
      console.warn('[storage] 云端删除失败:', key, e)
    }
  }
}

async function has(key: string): Promise<boolean> {
  if (storageGet(key) !== null) return true
  try {
    if (await dbHas(KV_STORE, key)) return true
  } catch {
    /* IDB 故障时继续查云端，与 get 的降级链对称 */
  }
  if (cloudAdapter) {
    try {
      return (await cloudAdapter.get(key)) !== null
    } catch {
      return false
    }
  }
  return false
}

// ════════════════════════════════════════
// 跨标签页感知（localStorage storage 事件）
// ════════════════════════════════════════

type ChangeHandler = (key: string, value: unknown) => void

/** 监听同源其他标签页对 localStorage 的写入（本标签页写不触发） */
function onChange(handler: ChangeHandler): () => void {
  const listener = (e: StorageEvent): void => {
    if (!e.key) return
    let value: unknown
    try {
      value = e.newValue != null ? JSON.parse(e.newValue) : null
    } catch {
      value = e.newValue
    }
    // 写入侧是 StoreItem 包装（{key,value,_ts,_exp}），回调契约是 (key, value) —— 解包后再交出
    if (
      value &&
      typeof value === 'object' &&
      'value' in value &&
      '_ts' in value &&
      (value as Record<string, unknown>).key === e.key
    ) {
      value = (value as Record<string, unknown>).value
    }
    handler(e.key, value)
  }
  window.addEventListener('storage', listener)
  return () => window.removeEventListener('storage', listener)
}

// ════════════════════════════════════════
// 统一命名空间导出
// ════════════════════════════════════════

export const storage = {
  /** 同步读（localStorage）—— token、开关、小配置 */
  getSync,
  /** 同步写（localStorage） */
  setSync,
  /** 同步删（localStorage） */
  removeSync,
  /** 自动路由读（localStorage → IndexedDB → 云端） */
  get,
  /** 自动路由写（小值 localStorage / 大值 IndexedDB；opts.cloud 额外写云端） */
  set,
  /** 自动路由删（本地两级 + 云端） */
  remove,
  /** 是否存在 */
  has,
  /** 跨标签页变更监听，返回取消订阅函数 */
  onChange,
  /** 注入/移除云端 KV 适配器 */
  setCloudAdapter,
}
