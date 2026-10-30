/**
 * `ensureStore` 升级路径的自愈契约（第 181 轮）
 *
 * `openDB()` 的 onsuccess 给连接挂了 `onversionchange`（另一标签页升级版本时
 * 主动 close 并重置缓存，避免旧连接把对方的升级挡在 onblocked）——但
 * `ensureStore()` 自己 open(version+1) 建立的升级连接**绕过了这段代码**，
 * 没挂任何 handler。多标签页下：A 页 dbPut 建了自定义 store（升级连接），
 * B 页再升级另一个 store 时会被 A 页的旧连接挡住，写入报"升级被阻塞"。
 *
 * 契约：**模块缓存里的任何连接都必须挂 onversionchange** —— 不管它来自
 * openDB 还是 ensureStore 的升级路径。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

interface FakeReq {
  result?: unknown
  error: unknown
  onupgradeneeded: (() => void) | null
  onsuccess: (() => void) | null
  onerror: (() => void) | null
}

/** 带版本语义的 fake：每次 open 产生新连接对象（与真实 IDB 一致），记录到 opened[] */
function makeVersionedIdb() {
  const storeNames = new Set<string>()
  const data = new Map<string, Map<string, unknown>>()
  const opened: Array<Record<string, unknown>> = []
  let version = 0

  const storeFor = (name: string) => {
    if (!data.has(name)) data.set(name, new Map())
    return data.get(name)!
  }

  function makeDb() {
    const db: Record<string, unknown> = {
      version,
      objectStoreNames: { contains: (n: string) => storeNames.has(n) },
      createObjectStore: (n: string) => {
        storeNames.add(n)
        storeFor(n)
        return {}
      },
      close: vi.fn(() => {
        db.closed = true
      }),
      closed: false,
      onversionchange: null as (() => void) | null,
      transaction: (names: unknown) => {
        void names
        const tx: Record<string, unknown> = {
          objectStore: (n: string) => ({
            put: (item: unknown) => {
              const k = (item as { key: string }).key
              storeFor(n).set(k, item)
              const r: Record<string, unknown> = { result: k, error: null }
              setTimeout(() => (r.onsuccess as (() => void) | null)?.(), 0)
              return r
            },
            get: (k: string) => {
              const r: Record<string, unknown> = { result: storeFor(n).get(k), error: null }
              setTimeout(() => (r.onsuccess as (() => void) | null)?.(), 0)
              return r
            },
          }),
          oncomplete: null as (() => void) | null,
          onerror: null as (() => void) | null,
          error: null,
        }
        setTimeout(() => (tx.oncomplete as (() => void) | null)?.(), 0)
        return tx
      },
    }
    opened.push(db)
    return db
  }

  ;(globalThis as Record<string, unknown>).indexedDB = {
    open: (_name: string, target?: number) => {
      const req: FakeReq = { onupgradeneeded: null, onsuccess: null, onerror: null, error: null }
      const want = target ?? Math.max(1, version)
      setTimeout(() => {
        if (want > version) {
          version = want
          req.result = makeDb()
          req.onupgradeneeded?.()
        } else {
          req.result = makeDb()
        }
        setTimeout(() => req.onsuccess?.(), 0)
      }, 0)
      return req
    },
  }
  return { opened, storeFor }
}

async function freshModule() {
  vi.resetModules()
  return await import('@/components/storage/indexedDB')
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).indexedDB
  vi.restoreAllMocks()
})

describe('ensureStore 升级连接的自愈契约', () => {
  it('**openDB 路径（默认 store，无升级）同样挂 onversionchange**（两路径对称）', async () => {
    const { opened } = makeVersionedIdb()
    const m = await freshModule()
    await m.dbPut('kv', 'k1', 'v1') // kv 是默认 store：ensureStore 直接命中，连接来自 openDB
    const last = opened[opened.length - 1] as { onversionchange: (() => void) | null }
    expect(typeof last.onversionchange, 'openDB 路径也必须挂自愈 handler').toBe('function')
  })

  it('**升级路径建立的连接也必须挂 onversionchange**（openDB 路径有，升级路径此前没有）', async () => {
    const { opened } = makeVersionedIdb()
    const m = await freshModule()
    await m.dbPut('alpha', 'k1', 'v1') // 触发 ensureStore：open(version+1) 建立升级连接
    const last = opened[opened.length - 1] as { onversionchange: (() => void) | null }
    expect(typeof last.onversionchange, '升级连接必须挂自愈 handler').toBe('function')
  })

  it('触发 onversionchange 后旧连接被 close，后续写入自动重开新连接', async () => {
    const { opened } = makeVersionedIdb()
    const m = await freshModule()
    await m.dbPut('alpha', 'k1', 'v1')
    const before = opened.length
    const last = opened[opened.length - 1] as { onversionchange: (() => void) | null; closed?: boolean }
    expect(typeof last.onversionchange).toBe('function')
    last.onversionchange!()
    expect(last.closed, '自愈要主动 close 旧连接').toBe(true)
    await m.dbPut('alpha', 'k2', 'v2') // 应自动重开新连接并成功写入
    expect(opened.length, '自愈后必须重开连接').toBeGreaterThan(before)
  })
})