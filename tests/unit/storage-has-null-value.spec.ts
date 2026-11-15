/**
 * storageHas · 「键存在」不等于「值非 null」（#495）
 *
 * 现状：`storageHas(key) { return storageGet(key) !== null }`。
 * `storageGet` 返回的是**值**，于是：
 *   · `storageSet('k', null)` → 键确实在 localStorage 里，但 `storageHas('k')` 返回 **false**；
 *   · 更糟：`storageDelete('k')` 之后与"存了 null"这两种状态**不可区分** ——
 *     宿主用 `storageHas` 判断"用户有没有做过这个选择"时会得到完全相反的结论
 *     （典型场景：nullable 的偏好项、被显式清空的用户标记）。
 *
 * `null` 是合法值（JSON.stringify 会原样写进去），不是"不存在"的表示。
 * 判存在应该看**记录本身**（键 + 未过期 + 能解析），与 `value` 无关。
 *
 * 保护标记核对：`local-storage.ts` 头部禁止改 storageGet/Set/Delete 的**接口签名**
 * 与 `saas_` 键名格式；本轮不动这两样，只抽一个内部读取函数、修 `storageHas` 的判据。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// 损坏 JSON 那条用例会经 warnOnce → reportWarn 打一条警告。
// 本 spec 只关心「返回值」，把告警出口 mock 掉，免得给 console-noise 基线添新类别
// （整链第 40 步只拦"新增类别"，测试夹具制造的噪音不该进基线）。
vi.mock('@/components/_internal/runtime-observer', () => ({
  reportWarn: vi.fn(),
}))

import { storageSet, storageGet, storageHas, storageDelete } from '@/components/storage/local-storage'

const K = 'probe-null-value'

beforeEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

describe('storageHas · 键存在性（#495）', () => {
  it('存了值 → true', () => {
    storageSet(K, 'abc')
    expect(storageHas(K)).toBe(true)
  })

  it('没存过 / 已删除 → false', () => {
    expect(storageHas(K)).toBe(false)
    storageSet(K, 'abc')
    storageDelete(K)
    expect(storageHas(K)).toBe(false)
  })

  it('**存了 null → 仍应报「存在」（旧实现返回 false）**', () => {
    storageSet(K, null)
    expect(localStorage.getItem('saas_' + K), '底层确实写进去了').not.toBeNull()
    expect(storageGet(K)).toBeNull()
    expect(storageHas(K), '值是不是 null 与键在不在是两件事').toBe(true)
  })

  it('存了 0 / false / 空串 → 都报存在（回归护栏）', () => {
    for (const v of [0, false, '']) {
      storageSet(K, v)
      expect(storageHas(K), `${JSON.stringify(v)} 也是合法值`).toBe(true)
    }
  })

  it('过期项 → false 且被清掉（storageGet 的既有语义不能破）', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    storageSet(K, 'abc', 1000)
    expect(storageHas(K)).toBe(true)
    vi.advanceTimersByTime(1001)
    expect(storageHas(K)).toBe(false)
    expect(localStorage.getItem('saas_' + K)).toBeNull()
    vi.useRealTimers()
  })

  it('存了 null 但设了 TTL → 过期后同样报不存在', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    storageSet(K, null, 1000)
    expect(storageHas(K)).toBe(true)
    vi.advanceTimersByTime(1001)
    expect(storageHas(K)).toBe(false)
    vi.useRealTimers()
  })

  it('损坏的 JSON → false（既有语义 + warnOnce 可观测）', () => {
    localStorage.setItem('saas_' + K, '{not json')
    expect(storageHas(K)).toBe(false)
  })

  it('ttl 为 0 → 永不过期', () => {
    storageSet(K, null, 0)
    expect(storageHas(K)).toBe(true)
  })
})
