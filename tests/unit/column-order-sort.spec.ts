// sortColumnsByOrder —— 主表可见列与列设置面板共用的一份拖拽顺序排序（原先两处各写一遍 `?? 999`）
import { describe, it, expect } from 'vitest'
import { sortColumnsByOrder } from '@/components/data/composables/utils'

const cols = (keys: string[]) => keys.map((key) => ({ key }))
const keysOf = (out: { key: string }[]) => out.map((c) => c.key)

describe('sortColumnsByOrder', () => {
  it('按拖拽顺序重排列', () => {
    expect(keysOf(sortColumnsByOrder(cols(['a', 'b', 'c']), ['c', 'a', 'b']))).toEqual(['c', 'a', 'b'])
  })

  it('未登记在顺序表里的列落到末尾，且保持原始相对顺序', () => {
    expect(keysOf(sortColumnsByOrder(cols(['a', 'b', 'x', 'y', 'z']), ['b', 'a']))).toEqual(['b', 'a', 'x', 'y', 'z'])
  })

  it('顺序表长于 999 列时未登记列仍在最后（旧哨兵 999 会把它挤进已登记列中间）', () => {
    const order = Array.from({ length: 1200 }, (_, i) => `c${i}`)
    const out = keysOf(sortColumnsByOrder(cols([...order, 'late']), order))
    expect(out[out.length - 1]).toBe('late')
    // 旧实现（?? 999）在这份数据上的实际落点，用来说明这条断言不是空转：
    // 'late' 与第 999 位同权重，被稳定排序夹在已登记列中间
    const legacy = new Map(order.map((k, i) => [k, i]))
    const legacyOut = keysOf(
      [...cols([...order, 'late'])].sort((a, b) => (legacy.get(a.key) ?? 999) - (legacy.get(b.key) ?? 999)),
    )
    expect(legacyOut.indexOf('late')).toBe(1000)
  })

  it('不改动传入数组本身', () => {
    const src = cols(['b', 'a'])
    sortColumnsByOrder(src, ['a', 'b'])
    expect(keysOf(src)).toEqual(['b', 'a'])
  })
})
