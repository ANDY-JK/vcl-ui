// route-planning 核心算法行为锁定：聚类分组 / 分天切割 / 绕路跳过 / 空输入
// 背景：审计发现该纯函数模块（聚类/2-opt/分天/绕路）仅 4 用例，回归风险高
import { describe, it, expect } from 'vitest'
import { planRoute, replanFrom } from '@/components/route-planner/utils/route-planning'
import type { Store, RouteOptions } from '@/components/route-planner/types'

function mkStore(id: string, lon: number, lat: number, extra: Partial<Store> = {}): Store {
  return { id, name: id, longitude: lon, latitude: lat, ...extra }
}

/** 构造标准 options：不限制天数，靠绕路/分天规则驱动 */
function opts(stores: Store[], over: Partial<RouteOptions> = {}): RouteOptions {
  return {
    stores,
    dailyLimitHours: 8,
    maxStoresPerDay: 8,
    maxSegmentKm: 80,
    maxDetourKm: 50,
    roadFactor: 1.4,
    avgSpeedKmh: 50,
    clusterRadiusKm: 30,
    defaultVisitMinutes: 30,
    maxDrivingMinutesPerDay: 240,
    ...over,
  }
}

describe('planRoute · 基础行为', () => {
  it('空门店 → 空计划（0 天 0 店）', () => {
    const plan = planRoute(opts([]))
    expect(plan.days).toEqual([])
    expect(plan.totalStores).toBe(0)
    expect(plan.totalDays).toBe(0)
  })

  it('无坐标门店被过滤（null 坐标不计入规划）', () => {
    // 算法按 longitude/latitude 非 null 判定有效；null 坐标门店被排除
    const plan = planRoute(opts([mkStore('bad', null as any, null as any)]))
    expect(plan.totalStores).toBe(0)
  })

  it('全部被标记 skipped 的门店 → 归入 skippedStores', () => {
    const s = mkStore('s1', 116.4, 39.9, { skipped: true })
    const plan = planRoute(opts([s]))
    expect(plan.totalStores).toBe(0)
    expect(plan.skippedStores.map((x) => x.id)).toContain('s1')
  })
})

describe('planRoute · 分天切割', () => {
  it('maxStoresPerDay 限制生效：8 家店 → 每天 4 家 → 2 天', () => {
    const stores = Array.from({ length: 8 }, (_, i) => mkStore(`s${i}`, 116.4 + i * 0.01, 39.9))
    const plan = planRoute(opts(stores, { maxStoresPerDay: 4 }))
    expect(plan.totalStores).toBe(8)
    expect(plan.days.length).toBe(2)
    for (const day of plan.days) expect(day.stores.length).toBe(4)
  })

  it('密集门店（相距 <1km）不触发绕路跳过，全部规划', () => {
    const stores = [
      mkStore('a', 116.4, 39.9),
      mkStore('b', 116.405, 39.905),
      mkStore('c', 116.41, 39.91),
      mkStore('d', 116.415, 39.915),
    ]
    const plan = planRoute(opts(stores))
    expect(plan.totalStores).toBe(4)
    expect(plan.totalSkipped).toBe(0)
  })
})

describe('planRoute · 绕路跳过', () => {
  it('偏离回路太远的门店被跳过（绕路成本 > maxDetourKm）', () => {
    // 起点附近 3 家密集店 + 1 家 200km 外孤店
    const stores = [
      mkStore('a', 116.4, 39.9),
      mkStore('b', 116.41, 39.9),
      mkStore('c', 116.4, 39.91),
      mkStore('far', 118.4, 39.9), // ≈ 180km 外
    ]
    const plan = planRoute(opts(stores, { maxDetourKm: 30 }))
    expect(plan.totalStores).toBe(3)
    expect(plan.skippedStores.map((x) => x.id)).toContain('far')
  })

  it('绕路成本随 maxDetourKm 放大而容忍远店（阈值依赖绕路差而非单段距离）', () => {
    // 算法跳过依据是"闭环绕路差"（到店+离店-直连）：起点旁 1 家近店 + 1 家远店，
    // 远店插在起点→近店之间时绕路差大 → maxDetourKm 大则不跳、小则跳
    const stores = [mkStore('near', 116.401, 39.901), mkStore('far', 117.0, 40.0)]
    const strict = planRoute(opts(stores, { maxDetourKm: 30 }))
    const loose = planRoute(opts(stores, { maxDetourKm: 300 }))
    // loose 至少不比 strict 规划得少（更大的绕路容忍不应跳过更多门店）
    expect(loose.totalStores).toBeGreaterThanOrEqual(strict.totalStores)
  })
})

describe('planRoute · 驾驶时间估算', () => {
  it('估算字段非负且随距离单调（起点固定时）', () => {
    // 起点远离门店，保证行驶距离 > 0
    const start = { lat: 30.0, lon: 110.0 }
    const near = planRoute(opts([mkStore('n', 110.01, 30.01)], { startPoint: start }))
    const far = planRoute(opts([mkStore('f', 111.0, 31.0)], { startPoint: start })) // ~130km
    expect(near.totalDrivingDistanceM).toBeGreaterThan(0)
    expect(far.totalDrivingDistanceM).toBeGreaterThan(near.totalDrivingDistanceM)
  })
})

describe('planRoute · 平局择优（门店数相同比里程）', () => {
  it('两种聚类排序都规划全部门店时，返回总里程更短的那条', () => {
    // 4 家店、每天最多 2 家 → 必然切成 2 天；两种聚类排序都能规划全部门店（门店数平局）。
    // 旧实现平局无条件取角度环形法（实测 316906m），更优排序实测 221755m。
    const stores = [
      mkStore('a', 116.6159, 39.3532),
      mkStore('b', 116.8922, 39.4246),
      mkStore('c', 116.1386, 39.4067),
      mkStore('d', 116.2994, 40.0515),
    ]
    const plan = planRoute(
      opts(stores, {
        startPoint: { lat: 39.9, lon: 116.4 },
        maxStoresPerDay: 2,
        maxSegmentKm: 800,
        maxDetourKm: 5000,
        maxDrivingMinutesPerDay: 2400,
      }),
    )
    expect(plan.totalStores).toBe(4)
    expect(plan.totalDrivingDistanceM).toBeLessThan(316906)
  })
})

describe('replanFrom · 重规划', () => {
  it('从当前位置重新规划剩余门店', () => {
    const remaining = [mkStore('a', 116.4, 39.9), mkStore('b', 116.5, 40.0)]
    const original = planRoute(opts(remaining))
    const replan = replanFrom({ lat: 39.95, lon: 116.45 }, remaining, original)
    expect(replan.totalStores).toBe(2)
    // 保留原计划起点
    expect(replan.startPoint).toEqual(original.startPoint)
  })
})
