// storageSet 的 TTL 参数契约（#402）：0 = 永不过期，负数 = 已过期
// （这是「语义化参数」，不是边界 bug —— 用例把它锁定，防止未来被当成"0 也要判过期"而改坏）
import { describe, it, expect, vi } from 'vitest'
import { storageSet, storageGet } from '@/components/storage/local-storage'

describe('storageSet · TTL 参数契约', () => {
  it('ttl=0（或省略）→ 永不过期', () => {
    storageSet('probe-never', { v: 1 }, 0)
    expect(storageGet('probe-never')).toEqual({ v: 1 })
  })

  it('负数 ttl = 立即过期 → 读回 null 且条目被清掉', () => {
    storageSet('probe-expired', { v: 2 }, -5)
    expect(storageGet('probe-expired')).toBeNull()
  })

  it('**同一毫秒内写入并读取**：ttl=0 与缺省的条目必须能立刻读回（#402）', () => {
    // 变异 `_exp: ttl === undefined ? 0 : now + ttl` 会把 ttl=0 算成 _exp=now，
    // 读取时 Date.now() > _exp → 立即过期 → 返回 null。本例必须保持绿。
    storageSet('same-tick-zero', { v: 1 }, 0)
    expect(storageGet('same-tick-zero'), 'ttl=0 承诺永不过期，必须能读回').toEqual({ v: 1 })
    storageSet('same-tick-omit', { v: 2 })
    expect(storageGet('same-tick-omit')).toEqual({ v: 2 })
  })

  it('ttl=0 的条目**过一段时间仍在**（真·永不过期，不只是一毫秒内可读）', () => {
    const base = Date.now()
    const spy = vi.spyOn(Date, 'now').mockReturnValue(base)
    try {
      storageSet('forever-after-day', { v: 9 }, 0)
      // 一天后再读：永不过期的条目必须还在（若把 0 算成 _exp=now，这里会返回 null）
      spy.mockReturnValue(base + 24 * 60 * 60 * 1000)
      expect(storageGet('forever-after-day')).toEqual({ v: 9 })
    } finally {
      spy.mockRestore()
    }
  })
})
