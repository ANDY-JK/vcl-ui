// M10 接线测试：enrichAccommodations（住宿建议）从死代码接入 generate 链路
// 锁定：planRoute 结果无住宿 → enrichAccommodations 填充 → useRoutePlanner.generate 接线后住宿非空
import { describe, it, expect } from 'vitest'
import { planRoute, enrichAccommodations } from '@/components/route-planner/utils/route-planning'
import { useRoutePlanner } from '@/components/route-planner/composables/useRoutePlanner'
import type { Store, RouteOptions } from '@/components/route-planner/types'

// 密集门店（相距 <1km，不触发绕路跳过），maxStoresPerDay:2 强制分 2 天
const stores: Store[] = [
  { id: 's1', name: '店A', longitude: 116.4, latitude: 39.9, city: '北京', district: '朝阳区' },
  { id: 's2', name: '店B', longitude: 116.45, latitude: 39.91, city: '北京', district: '朝阳区' },
  { id: 's3', name: '店C', longitude: 116.5, latitude: 39.92, city: '北京', district: '海淀区' },
  { id: 's4', name: '店D', longitude: 116.55, latitude: 39.93, city: '北京', district: '海淀区' },
]

const options: RouteOptions = {
  stores,
  startPoint: { lat: 39.9, lon: 116.4 },
  dailyLimitHours: 8,
  maxStoresPerDay: 2,
  maxSegmentKm: 80,
  maxDetourKm: 50,
  roadFactor: 1.4,
  avgSpeedKmh: 50,
  clusterRadiusKm: 30,
  defaultVisitMinutes: 30,
  maxDrivingMinutesPerDay: 240,
}

describe('M10 住宿建议接线', () => {
  it('planRoute 原始结果无住宿（accommodation 均为 null）', () => {
    const plan = planRoute(options)
    expect(plan.days.length).toBeGreaterThan(1)
    for (const day of plan.days) expect(day.accommodation).toBeNull()
  })

  it('enrichAccommodations 为中间天填充住宿建议（城市+区县区域）', async () => {
    const plan = planRoute(options)
    const enriched = await enrichAccommodations(plan)
    // 第 1 天结束需住宿（非最后一天）
    const midDay = enriched.days[0]
    expect(midDay.accommodation).not.toBeNull()
    expect(midDay.accommodation?.name).toMatch(/附近/)
    expect(midDay.accommodation?.lat).toBeTypeOf('number')
    expect(midDay.accommodation?.lon).toBeTypeOf('number')
  })

  it('useRoutePlanner.generate 接线后住宿已填充（非死代码）', async () => {
    const rp = useRoutePlanner()
    const plan = await rp.generate(options)
    expect(plan).not.toBeNull()
    expect(plan!.days.length).toBeGreaterThan(1)
    // 住宿已被填充（若未接线，enrichAccommodations 是死代码，accommodation 恒 null）
    const hasAccommodation = plan!.days.some((d) => d.accommodation != null)
    expect(hasAccommodation).toBe(true)
  })

  it('单天行程（无需住宿）时 enrichAccommodations 幂等不报错', async () => {
    const singleOptions: RouteOptions = { ...options, stores: stores.slice(0, 2), maxStoresPerDay: 8 } // 全放一天
    const plan = planRoute(singleOptions)
    const enriched = await enrichAccommodations(plan)
    expect(enriched).toBe(plan)
    expect(enriched.days.length).toBe(1)
  })
})
