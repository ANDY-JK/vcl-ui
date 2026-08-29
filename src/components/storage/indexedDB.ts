// ⛔ 保护 — 存储抽象层，禁止：storageGet/Set/Delete 接口签名修改，键名格式
//    需我确认：新增存储后端、TTL 策略
/**
 * 本地存储抽象层 —— 按场景自动选后端
 *
 *   Storage（localStorage）    → 轻量 KV：token、用户标记、开关、小配置
 *   IndexedDB                  → 重量数据：业务记录、表缓存、文件、需要查询/事务
 *
 * 场景路由：
 *   storageGet/Set/Delete ──── 纯 Storage，同步，跨标签页感知（存 token 用这个）
 *   dbPut/dbGet/dbDelete  ──── 走 IndexedDB，异步，支持 TTL、动态 store、批量事务
 */

import { warnOnce } from '@/components/_internal/warnOnce'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：用户可见错误消息按当前语言 */
const t = useT()

// ======================== 类型 ========================

/**
 * 存储条目包装 — IndexedDB 持久化的统一容器格式。
 *
 * ⛔ 受保护契约：所有 store 用 keyPath:'key'，value 即调用方传入的原始对象，
 * dbPut 自动包裹、dbGet/dbGetAll 自动解包并过滤过期条目。
 * 依赖此格式的上层（如 contract-storage）据此解构，改动包装格式必须同步迁移。
 */
export interface StoreItem<T = unknown> {
  key: string
  value: T
  _ts: number // 写入时间戳
  _exp: number // 过期时间戳，0 = 永不过期
}

/** 批量操作项 */
export interface BatchOp {
  type: 'put' | 'delete' | 'clear'
  store: string
  key?: string
  value?: unknown
  ttl?: number
}

// ======================== IndexedDB 引擎 ========================

const DB_NAME = 'saas_local_v2'

let _db: IDBDatabase | null = null
let _dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db)
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    // 失败时清理内部状态并重置 _dbPromise，下次调用重新尝试（避免一次失败后永久 reject）
    const fail = (err: unknown) => {
      _db = null
      _dbPromise = null
      reject(err)
    }
    if (typeof indexedDB === 'undefined') return fail(new Error(t('storage.idbUnavailable')))
    // 打开当前已存在版本（不写死版本号）：ensureStore 会按需把库升级到更高版本，
    // 若此处写死低版本号，升级后再打开必触发 VersionError。
    const req = indexedDB.open(DB_NAME)
    req.onupgradeneeded = () => {
      const db = req.result
      const defaults = ['records', 'tables', 'kv']
      for (const name of defaults) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'key' })
        }
      }
    }
    req.onsuccess = () => {
      _db = req.result
      // 另一标签页升级版本时主动释放旧连接并重置缓存，
      // 下次调用 openDB 按新版本重开（复用上方失败自愈机制），避免旧连接事务报 InvalidStateError
      _db.onversionchange = () => {
        try {
          _db?.close()
        } catch {
          /* 已关闭 */
        }
        _db = null
        _dbPromise = null
      }
      resolve(_db)
    }
    req.onerror = () => {
      warnOnce('indexedDB', '打开数据库失败: ' + String(req.error))
      fail(req.error)
    }
    req.onblocked = () => fail(new Error(t('storage.idbUpgradeBlocked')))
  })
  return _dbPromise
}

// ---- 动态 store 创建（按需升级版本） ----

/** 并发锁：防止多个 ensureStore 同时升级数据库版本 */
let _ensureLock: Promise<void> | null = null

/** 确保 store 存在，不存在则关闭旧库 → 升级版本 → 创建 store */
async function ensureStore(store: string): Promise<void> {
  const db = await openDB()
  if (db.objectStoreNames.contains(store)) return

  // 串行化升级操作，防止并发竞态
  if (_ensureLock) await _ensureLock
  let resolveLock: () => void
  _ensureLock = new Promise<void>((r) => {
    resolveLock = r
  })

  try {
    // 重新获取 db（可能在等待锁期间被其他调用方升级了）
    const db2 = await openDB()
    if (db2.objectStoreNames.contains(store)) return

    const oldVersion = db2.version
    db2.close()
    _db = null
    _dbPromise = null

    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, oldVersion + 1)
      req.onupgradeneeded = () => {
        const upgraded = req.result
        if (!upgraded.objectStoreNames.contains(store)) {
          upgraded.createObjectStore(store, { keyPath: 'key' })
        }
      }
      req.onsuccess = () => {
        _db = req.result
        _dbPromise = Promise.resolve(_db)
        resolve()
      }
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error(t('storage.idbStoreBlocked', { store })))
    })
  } finally {
    resolveLock!()
    _ensureLock = null
  }
}

// ---- 基础 CRUD ----

/** 写入（自动包裹 StoreItem） */
async function idbPut<T>(store: string, key: string, value: T, ttl?: number): Promise<void> {
  await ensureStore(store)
  const db = await openDB()
  const now = Date.now()
  const item: StoreItem<T> = { key, value, _ts: now, _exp: ttl ? now + ttl : 0 }
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(item)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/** 读取（自动解包 StoreItem，过期返回 null 并后台清理） */
async function idbGet<T>(store: string, key: string): Promise<T | null> {
  await ensureStore(store)
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key)
    req.onsuccess = () => {
      const item = req.result as StoreItem<T> | undefined
      if (!item) return resolve(null)
      if (item._exp > 0 && Date.now() > item._exp) {
        idbDelete(store, key).catch(() => {})
        return resolve(null)
      }
      resolve(item.value)
    }
    req.onerror = () => reject(req.error)
  })
}

/** 删除 */
async function idbDelete(store: string, key: string): Promise<void> {
  await ensureStore(store)
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/** 全量读取（支持 key 前缀过滤，自动跳过过期条目） */
async function idbGetAll<T>(store: string, prefix?: string): Promise<T[]> {
  await ensureStore(store)
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll()
    req.onsuccess = () => {
      const now = Date.now()
      const results: T[] = []
      const expired: string[] = []
      for (const item of (req.result || []) as StoreItem<T>[]) {
        if (item._exp > 0 && now > item._exp) {
          expired.push(item.key)
          continue
        }
        if (!prefix || item.key.startsWith(prefix)) {
          results.push(item.value)
        }
      }
      if (expired.length > 0) {
        idbBatchDelete(store, expired).catch(() => {})
      }
      resolve(results)
    }
    req.onerror = () => reject(req.error)
  })
}

/** 列出所有 key（支持前缀过滤） */
async function idbKeys(store: string, prefix?: string): Promise<string[]> {
  await ensureStore(store)
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAllKeys()
    req.onsuccess = () => {
      const keys = req.result as string[]
      resolve(prefix ? keys.filter((k) => k.startsWith(prefix)) : keys)
    }
    req.onerror = () => reject(req.error)
  })
}

/** 统计条目数 */
async function idbCount(store: string): Promise<number> {
  await ensureStore(store)
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** 清空 store */
async function idbClear(store: string): Promise<void> {
  await ensureStore(store)
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/** 批量删除 key（单事务） */
async function idbBatchDelete(store: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return
  await ensureStore(store)
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const os = tx.objectStore(store)
    for (const key of keys) os.delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 批量写入/删除/清空（跨 store 事务） */
async function idbBatch(ops: BatchOp[]): Promise<void> {
  if (ops.length === 0) return
  for (const op of ops) await ensureStore(op.store)
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const stores = [...new Set(ops.map((o) => o.store))]
    const tx = db.transaction(stores, 'readwrite')
    const now = Date.now()
    for (const op of ops) {
      const os = tx.objectStore(op.store)
      switch (op.type) {
        case 'put': {
          const item: StoreItem = { key: op.key!, value: op.value, _ts: now, _exp: op.ttl ? now + op.ttl : 0 }
          os.put(item)
          break
        }
        case 'delete':
          os.delete(op.key!)
          break
        case 'clear':
          os.clear()
          break
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 检查 key 是否存在（复用 idbGet 的过期检查逻辑） */
async function idbHas(store: string, key: string): Promise<boolean> {
  const value = await idbGet(store, key)
  return value !== null
}

// ======================== 通用 API ========================

/**
 * 在任意 store 中存入数据（store 不存在则自动创建）
 *
 * @example
 * await dbPut('user_settings', 'theme', { dark: true }, 3600000)
 */
export async function dbPut<T = unknown>(store: string, key: string, value: T, ttl?: number): Promise<void> {
  return idbPut(store, key, value, ttl)
}

/**
 * 从任意 store 中读取数据
 */
export async function dbGet<T = unknown>(store: string, key: string): Promise<T | null> {
  return idbGet<T>(store, key)
}

/**
 * 从任意 store 中删除数据
 */
export async function dbDelete(store: string, key: string): Promise<void> {
  return idbDelete(store, key)
}

/**
 * 检查 key 是否存在
 */
export async function dbHas(store: string, key: string): Promise<boolean> {
  return idbHas(store, key)
}

/**
 * 获取任意 store 中的全部数据（可选 key 前缀过滤）
 */
export async function dbGetAll<T = unknown>(store: string, prefix?: string): Promise<T[]> {
  return idbGetAll<T>(store, prefix)
}

/**
 * 列出任意 store 中的全部 key
 */
export async function dbKeys(store: string, prefix?: string): Promise<string[]> {
  return idbKeys(store, prefix)
}

/**
 * 统计任意 store 中的有效条目数
 */
export async function dbCount(store: string): Promise<number> {
  return idbCount(store)
}

/**
 * 清空任意 store
 */
export async function dbClear(store: string): Promise<void> {
  return idbClear(store)
}

/**
 * 批量事务操作：单次 IDB 事务保证原子性
 *
 * @example
 * await dbBatch([
 *   { type: 'put', store: 'cache', key: 'a', value: { x: 1 }, ttl: 60000 },
 *   { type: 'delete', store: 'cache', key: 'b' },
 *   { type: 'clear', store: 'temp' },
 * ])
 */
export async function dbBatch(ops: BatchOp[]): Promise<void> {
  if (ops.length === 0) return
  return idbBatch(ops)
}

// ======================== Storage 轻量 API（localStorage） ========================

const STORAGE_PREFIX = 'saas_'

/** 轻量写入 —— token、标记、小配置。同步，不阻塞。 */
export function storageSet<T>(key: string, value: T, ttl?: number): void {
  try {
    const now = Date.now()
    const item: StoreItem<T> = { key, value, _ts: now, _exp: ttl ? now + ttl : 0 }
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(item))
  } catch {
    console.warn('[Storage] 写入失败:', key)
  }
}

/** 轻量读取 —— 自动判过期 */
export function storageGet<T>(key: string): T | null {
  try {
    const raw: string | null = localStorage.getItem(STORAGE_PREFIX + key)
    if (!raw) return null
    const item = JSON.parse(raw) as StoreItem<T>
    if (item._exp > 0 && Date.now() > item._exp) {
      localStorage.removeItem(STORAGE_PREFIX + key)
      return null
    }
    return item.value
  } catch (e) {
    // 隐私模式/数据损坏静默返回 null 是既有语义；warnOnce 保证损坏数据至少可被观测到
    warnOnce('storageGet', `[Storage] 读取失败（返回 null）: ${key} — ${String(e)}`)
    return null
  }
}

/** 轻量删除 */
export function storageDelete(key: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key)
  } catch {
    console.warn('[Storage] localStorage.removeItem 失败:', key)
  }
}

/** 检查 key 是否存在且未过期 */
export function storageHas(key: string): boolean {
  return storageGet(key) !== null
}
