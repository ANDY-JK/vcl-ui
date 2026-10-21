// unified 门面：同步 API / remove / has / onChange（2026-10-21，审查 6.3 / 覆盖洼地 storage）
//
// 背景：storage 域函数覆盖 52.8%，`unified.ts` 只有 5/12。
// 已有 `storage-resilience.spec.ts` 锁了 `get` 的三级降级链，
// 但 `getSync` / `setSync` / `removeSync` / `remove` / `has` / `onChange` **一条都没测**。
//
// ## 这六条各自的"容易改坏"点
//
// ① **`remove` 必须三级全删** —— 只删本地不删云端，用户"退出登录"后
//    下次登录云端又把 token 灌回来（表现为"退不出去"）。
// ② **`remove` 的云端失败不能冒泡** —— 本地已删干净，云端失败只该 warn；
//    若 throw，调用方会以为整个删除失败，于是不跳转、卡在页面上。
// ③ **`has` 的降级顺序与 `get` 对称** —— localStorage → IndexedDB → 云端。
//    IDB 故障时要继续查云端，而不是直接返回 false（否则"数据明明在云端却显示不存在"）。
// ④ **`onChange` 必须解包 StoreItem** —— 写入侧存的是 `{key, value, _ts, _exp}` 包装，
//    回调契约是 `(key, value)`。不解包的话调用方拿到的是包装对象，
//    读 `v.foo` 永远是 undefined（这类 bug 极难查）。
// ⑤ **`onChange` 只响应同源其他标签页** —— 依赖浏览器 storage 事件语义，本标签页写不触发。
// ⑥ **`getSync`/`setSync` 强制 localStorage** —— 用于登录初始化等必须同步读的场景，
//    不能被"自动路由"改到大值走 IDB（那样同步读就拿不到）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/components/storage/indexedDB', () => ({
  storageSet: vi.fn(),
  storageGet: vi.fn(() => null),
  storageDelete: vi.fn(),
  storageHas: vi.fn(() => false),
  dbPut: vi.fn(),
  dbGet: vi.fn(),
  dbDelete: vi.fn(),
  dbHas: vi.fn(),
}))

import { setCloudAdapter, storage } from '@/components/storage/unified'
import { storageGet, storageSet, storageDelete, dbDelete, dbHas } from '@/components/storage/indexedDB'

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(storageGet).mockReset().mockReturnValue(null)
  vi.mocked(storageSet).mockReset()
  vi.mocked(storageDelete).mockReset()
  vi.mocked(dbDelete).mockReset().mockResolvedValue(undefined)
  vi.mocked(dbHas).mockReset().mockResolvedValue(false)
})
afterEach(() => {
  setCloudAdapter(null)
  vi.restoreAllMocks()
})

describe('同步 API 强制走 localStorage', () => {
  it('setSync → 写 localStorage（不是 IDB，即使值很大）', () => {
    const big = 'x'.repeat(5000) // > 2KB，自动路由会走 IDB，但 setSync 必须走 localStorage
    storage.setSync('token', big)
    expect(storageSet).toHaveBeenCalledWith('token', big, undefined)
  })

  it('getSync → 读 localStorage', () => {
    vi.mocked(storageGet).mockReturnValue('cached')
    expect(storage.getSync('token')).toBe('cached')
    expect(storageGet).toHaveBeenCalledWith('token')
  })

  it('getSync 读不到 → 返回 null（不抛错）', () => {
    expect(storage.getSync('missing')).toBeNull()
  })

  it('removeSync → 只删 localStorage', () => {
    storage.removeSync('token')
    expect(storageDelete).toHaveBeenCalledWith('token')
  })

  it('setSync 透传 ttl', () => {
    storage.setSync('draft', 'v', 60000)
    expect(storageSet).toHaveBeenCalledWith('draft', 'v', 60000)
  })
})

describe('remove · 三级全删', () => {
  it('同时删 localStorage 与 IndexedDB', async () => {
    await storage.remove('user-token')
    expect(storageDelete, 'localStorage 应删').toHaveBeenCalledWith('user-token')
    expect(dbDelete, 'IndexedDB 应删').toHaveBeenCalledWith('kv', 'user-token')
  })

  it('云端适配器存在时也删云端（否则下次登录云端把 token 灌回来）', async () => {
    const cloudRemove = vi.fn().mockResolvedValue(undefined)
    setCloudAdapter({ get: vi.fn(), set: vi.fn(), remove: cloudRemove })

    await storage.remove('user-token')
    expect(cloudRemove, '云端也要删').toHaveBeenCalledWith('user-token')
  })

  it('云端删除失败不冒泡（本地已删干净，只 warn）', async () => {
    setCloudAdapter({ get: vi.fn(), set: vi.fn(), remove: vi.fn().mockRejectedValue(new Error('500')) })

    // 关键：不能 throw。否则调用方以为整个删除失败，于是不跳转、卡在页面上
    await expect(storage.remove('user-token')).resolves.toBeUndefined()
    expect(storageDelete).toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('has · 降级顺序与 get 对称', () => {
  it('localStorage 命中 → true，不再查 IDB', async () => {
    vi.mocked(storageGet).mockReturnValue('v')
    expect(await storage.has('k')).toBe(true)
    expect(dbHas, 'localStorage 命中就不该再查 IDB').not.toHaveBeenCalled()
  })

  it('localStorage 未命中 → 查 IndexedDB', async () => {
    vi.mocked(storageGet).mockReturnValue(null)
    vi.mocked(dbHas).mockResolvedValue(true)
    expect(await storage.has('k')).toBe(true)
    expect(dbHas).toHaveBeenCalledWith('kv', 'k')
  })

  it('IDB 故障 → 继续查云端（不直接返回 false）', async () => {
    vi.mocked(dbHas).mockRejectedValue(new Error('InvalidStateError'))
    setCloudAdapter({ get: vi.fn().mockResolvedValue('cloud-value'), set: vi.fn(), remove: vi.fn() })

    // 若这里返回 false，用户会看到"数据明明在云端却显示不存在"
    expect(await storage.has('k'), 'IDB 故障应降级到云端').toBe(true)
  })

  it('三级都没有 → false', async () => {
    expect(await storage.has('nothing')).toBe(false)
  })
})

describe('onChange · 跨标签页感知', () => {
  /** 造一个 storage 事件（模拟其他标签页写入） */
  function fireStorage(key: string | null, newValue: string | null) {
    const e = new StorageEvent('storage', { key, newValue })
    window.dispatchEvent(e)
  }

  it('解包 StoreItem 包装：回调拿到的是 value 而不是包装对象', () => {
    const handler = vi.fn()
    const off = storage.onChange(handler)

    // 写入侧存的是 StoreItem 包装
    fireStorage('user', JSON.stringify({ key: 'user', value: { name: '张三' }, _ts: 1, _exp: 0 }))

    // 关键：不解包的话调用方拿到包装对象，读 v.name 永远是 undefined
    expect(handler).toHaveBeenCalledWith('user', { name: '张三' })
    off()
  })

  it('非 StoreItem 的裸值原样交出', () => {
    const handler = vi.fn()
    const off = storage.onChange(handler)

    fireStorage('plain', JSON.stringify('just-a-string'))
    expect(handler).toHaveBeenCalledWith('plain', 'just-a-string')
    off()
  })

  it('无法 JSON 解析的值 → 交原始字符串（不丢事件）', () => {
    const handler = vi.fn()
    const off = storage.onChange(handler)

    fireStorage('raw', '{not json')
    expect(handler).toHaveBeenCalledWith('raw', '{not json')
    off()
  })

  it('key 为 null（clear 事件）→ 忽略，不回调', () => {
    const handler = vi.fn()
    const off = storage.onChange(handler)

    fireStorage(null, null)
    expect(handler, 'key 为 null 应忽略').not.toHaveBeenCalled()
    off()
  })

  it('取消订阅后不再回调（否则组件卸载后仍响应，泄漏）', () => {
    const handler = vi.fn()
    const off = storage.onChange(handler)

    fireStorage('a', JSON.stringify({ key: 'a', value: 1, _ts: 1, _exp: 0 }))
    expect(handler).toHaveBeenCalledTimes(1)

    off()
    fireStorage('b', JSON.stringify({ key: 'b', value: 2, _ts: 1, _exp: 0 }))
    expect(handler, '取消订阅后不该再回调').toHaveBeenCalledTimes(1)
  })
})

describe('setCloudAdapter · 返回值便于恢复', () => {
  it('返回先前适配器', () => {
    const a = { get: vi.fn(), set: vi.fn(), remove: vi.fn() }
    const b = { get: vi.fn(), set: vi.fn(), remove: vi.fn() }

    expect(storage.setCloudAdapter(a), '首次注入前是 null').toBeNull()
    expect(storage.setCloudAdapter(b), '应返回上一个').toBe(a)
    expect(storage.setCloudAdapter(null), '传 null 关闭也应返回上一个').toBe(b)
  })
})
