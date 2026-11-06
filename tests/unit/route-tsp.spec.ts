/* routeTsp · 2-opt 与最近邻（#463）
 *
 * 从 route-planning.ts 拆出的纯算法模块：只读经纬度，无 i18n / 无业务类型依赖。
 * 钉住三件事：2-opt 的收敛与不 mutate、最近邻的顺序正确性、方位角象限。
 */
import { describe, it, expect } from 'vitest'
import { twoOptOptimize, nearestNeighborSort, computeBearing, distBetween, reverseSegment } from '@/components/route-planner/utils/route-tsp'
import type { Store } from '@/components/route-planner/types'

function store(lon: number, lat: number): Store {
  return { id: `${lon},${lat}`, latitude: lat, longitude: lon } as unknown as Store
}

describe('distBetween / reverseSegment', () => {
  it('缺坐标按 0 处理（调用方已过滤，但契约要稳）', () => {
    const a = store(0, 0)
    const b = { id: 'x' } as unknown as Store
    expect(distBetween(a, b)).toBe(0)
  })

  it('reverseSegment 反转闭区间且不越界', () => {
    const arr = [1, 2, 3, 4, 5]
    reverseSegment(arr, 1, 3)
    expect(arr).toEqual([1, 4, 3, 2, 5])
    reverseSegment(arr, 0, 0) // 单元素不动
    expect(arr).toEqual([1, 4, 3, 2, 5])
  })
})

describe('twoOptOptimize', () => {
  it('<=2 个点直接返回副本（不改原数组）', () => {
    const src = [store(0, 0), store(1, 1)]
    const out = twoOptOptimize(src)
    expect(out).not.toBe(src)
    expect(out).toEqual(src)
  })

  it('之字形（交叉）被拉直：总里程严格下降', () => {
    // 交叉四边形：A(0,0) → B(1,0) → C(1,1) → D(0,1) 的"之"字路径
    // 正确顺序应绕圈，而不是交叉
    const zigzag = [store(0, 0), store(1, 1), store(1, 0), store(0, 1)]
    const srcLen = pathLen(zigzag)
    const out = twoOptOptimize(zigzag)
    expect(pathLen(out)).toBeLessThan(srcLen)
    // 不 mutate 入参
    expect(zigzag).toEqual([store(0, 0), store(1, 1), store(1, 0), store(0, 1)])
  })

  it('已经有序的路径保持不动（无改进）', () => {
    const inOrder = [store(0, 0), store(0.01, 0), store(0.02, 0), store(0.03, 0)]
    expect(twoOptOptimize(inOrder)).toEqual(inOrder)
  })

  function pathLen(list: Store[]): number {
    let sum = 0
    for (let i = 1; i < list.length; i++) sum += distBetween(list[i - 1], list[i])
    return sum
  }
})

describe('nearestNeighborSort', () => {
  it('每次取最近：从 (0,0) 出发依次是近→远', () => {
    const start = { lat: 0, lon: 0 }
    const out = nearestNeighborSort([store(0.1, 0), store(0.02, 0), store(0.05, 0)], start)
    expect(out.map((s) => s.longitude)).toEqual([0.02, 0.05, 0.1])
  })

  it('0/1 个点直接返回副本', () => {
    expect(nearestNeighborSort([], { lat: 0, lon: 0 })).toEqual([])
    const one = [store(1, 1)]
    const out = nearestNeighborSort(one, { lat: 0, lon: 0 })
    expect(out).not.toBe(one)
    expect(out).toEqual(one)
  })

  it('反向保护：缺坐标的点不会死循环，按原序排在最后', () => {
    const out = nearestNeighborSort(
      [store(0.02, 0), { id: 'no-coord' } as unknown as Store],
      { lat: 0, lon: 0 },
    )
    expect(out).toHaveLength(2)
    expect(out[0].longitude).toBe(0.02)
  })
})

describe('computeBearing', () => {
  it('正东 → 90°，正北 → 0°，正西 → 270°，正南 → 180°', () => {
    expect(computeBearing(0, 0, 0, 1)).toBeCloseTo(90, 0)
    expect(computeBearing(0, 0, 1, 0)).toBeCloseTo(0, 0)
    expect(computeBearing(0, 0, 0, -1)).toBeCloseTo(270, 0)
    expect(computeBearing(0, 0, -1, 0)).toBeCloseTo(180, 0)
  })

  it('同一坐标 → 0（不 NaN）', () => {
    expect(Number.isNaN(computeBearing(1, 1, 1, 1))).toBe(false)
  })
})
