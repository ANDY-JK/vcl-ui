// storage 三后端（localStorage / IndexedDB / 云端）容错降级链回归测试
// 背景：容错审查发现 unified 门面的降级链在 IDB 故障时断裂（get 直接 throw、
// set 云端失败让已落盘的本地写也变 rejected）。此处锁定修复后的行为。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// IDB 层全部 mock：可注入故障（happy-dom 无真实 IndexedDB，正好隔离验证门面逻辑）
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
import { dbGet, dbPut, dbHas, storageSet } from '@/components/storage/indexedDB'

// 本组用例预期产生降级 warn——静默避免污染日志
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(dbGet).mockReset()
  vi.mocked(dbPut).mockReset()
  vi.mocked(dbHas).mockReset()
  vi.mocked(storageSet).mockReset()
})
afterEach(() => {
  setCloudAdapter(null)
  vi.restoreAllMocks()
})

describe('storage.get · 三级降级链', () => {
  it('IDB 故障（throw）不中断降级链：继续查云端并命中', async () => {
    vi.mocked(dbGet).mockRejectedValue(new Error('InvalidStateError'))
    setCloudAdapter({
      get: vi.fn().mockResolvedValue({ foo: 'cloud-value' }),
      set: vi.fn(),
      remove: vi.fn(),
    })
    const r = await storage.get<{ foo: string }>('some-key')
    expect(r).toEqual({ foo: 'cloud-value' })
  })

  it('IDB 故障且云端也失败：返回 null 而非 throw', async () => {
    vi.mocked(dbGet).mockRejectedValue(new Error('IndexedDB 不可用'))
    setCloudAdapter({
      get: vi.fn().mockRejectedValue(new Error('network down')),
      set: vi.fn(),
      remove: vi.fn(),
    })
    const r = await storage.get('some-key')
    expect(r).toBeNull()
  })

  it('无云端适配器且 IDB 故障：返回 null 而非 throw（纯本地降级）', async () => {
    vi.mocked(dbGet).mockRejectedValue(new Error('IDB down'))
    const r = await storage.get('some-key')
    expect(r).toBeNull()
  })
})

describe('storage.set · 写失败容错', () => {
  it('大值 IDB 写失败：降级 localStorage（storageSet 被调用）且不 throw', async () => {
    vi.mocked(dbPut).mockRejectedValue(new Error('QuotaExceededError'))
    const big = 'x'.repeat(3000) // > 2KB → 路由到 IDB
    await expect(storage.set('big-key', big)).resolves.toBeUndefined()
    expect(storageSet).toHaveBeenCalledWith('big-key', big, undefined)
  })

  it('大值 IDB 写失败且 LS 也失败：上抛（写失败必须可见，不静默丢数据）', async () => {
    vi.mocked(dbPut).mockRejectedValue(new Error('QuotaExceededError'))
    vi.mocked(storageSet).mockImplementation(() => {
      throw new Error('LS full')
    })
    const big = 'x'.repeat(3000)
    await expect(storage.set('big-key', big)).rejects.toThrow('QuotaExceededError')
  })

  it('云端写失败：本地已保存成功，set 整体不 reject', async () => {
    setCloudAdapter({
      get: vi.fn(),
      set: vi.fn().mockRejectedValue(new Error('network down')),
      remove: vi.fn(),
    })
    await expect(storage.set('k', 'v', { cloud: true })).resolves.toBeUndefined()
  })

  it('未注入云端适配器且 cloud:true：不 throw，仅 warn', async () => {
    await expect(storage.set('k', 'v', { cloud: true })).resolves.toBeUndefined()
  })
})

describe('storage.has · 与 get 降级链对称', () => {
  it('本地 miss、IDB 故障、云端命中 → true（此前 has 不查云端也不容错）', async () => {
    vi.mocked(dbHas).mockRejectedValue(new Error('IDB down'))
    setCloudAdapter({
      get: vi.fn().mockResolvedValue('exists-in-cloud'),
      set: vi.fn(),
      remove: vi.fn(),
    })
    expect(await storage.has('k')).toBe(true)
  })

  it('三层全 miss → false 而非 throw', async () => {
    vi.mocked(dbHas).mockRejectedValue(new Error('IDB down'))
    setCloudAdapter({
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      remove: vi.fn(),
    })
    expect(await storage.has('k')).toBe(false)
  })
})
