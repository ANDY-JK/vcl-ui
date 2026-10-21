// enrichWithDrivingRoutes 补充驾车数据（2026-10-21，审查 6.3 / 覆盖洼地 route-planner）
//
// 背景：`driving-direction.ts` 函数覆盖 **0/6（0%）** —— 整个文件零测试。
// 它负责把"估算距离"换成"高德实际驾车距离"，是路线规划结果可信度的关键一环。
//
// ## 刻意锁住的五条语义
//
// ① **API 失败不覆盖已有估算值** —— 这是最容易被"顺手改成 0"的地方：
//    估算值是兜底，失败时保留它，用户至少还能看到个数字；
//    覆盖成 0 会让行程看起来"零公里"。
// ② **只有 >0 才写入** —— `route.distance > 0` 才赋值，因为高德偶尔返回 0
//    表示"未算出"，不是"距离为零"。
// ③ **汇总值重新累加** —— `totalDrivingDistanceM/TimeMin` 必须是当天之和，
//    否则结果页显示的总里程与逐天列表对不上。
// ④ **空天跳过** —— `day.stores.length === 0` 直接 continue，不发起无意义请求。
// ⑤ **点不足两个跳过** —— 只有一个点算不出路线（`points.length < 2`）。
//
// ## 为什么必须用 fake timers
// 每天之间有 800ms 请求配额间隔。真等会让 3 天的用例慢 1.6 秒；
// 假定时器既能验证"确实隔了"，又不拖慢全链。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { enrichWithDrivingRoutes, findNearbyAccommodation } from '@/components/route-planner/utils/driving-direction'
import { getDrivingRoute, searchNearby } from '@/components/amap'
import type { RoutePlan, DayPlan } from '@/components/route-planner/types'

vi.mock('@/components/amap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/amap')>()
  return { ...actual, getDrivingRoute: vi.fn(), searchNearby: vi.fn() }
})

const mockRoute = vi.mocked(getDrivingRoute)
const mockNearby = vi.mocked(searchNearby)

/** 造一天的行程 */
function day(overrides: Partial<DayPlan> = {}): DayPlan {
  return {
    day: 1,
    stores: [{ id: 's1', name: 'A', longitude: 113.1, latitude: 28.2 }],
    accommodation: null,
    drivingDistanceM: 0,
    drivingTimeMin: 0,
    ...overrides,
  } as unknown as DayPlan
}

/** 造一份路线规划 */
function plan(days: DayPlan[], startPoint?: { lat: number; lon: number }): RoutePlan {
  return {
    days,
    startPoint,
    totalDrivingDistanceM: 0,
    totalDrivingTimeMin: 0,
  } as unknown as RoutePlan
}

beforeEach(() => {
  mockRoute.mockReset()
  mockNearby.mockReset()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

/** 推进假定时器直到 promise 完成（处理串联的 setTimeout） */
async function advance(p: Promise<unknown>) {
  let done = false
  p.then(() => {
    done = true
  })
  // 每轮推 1000ms，足够跨过 800ms 配额间隔
  for (let i = 0; i < 20 && !done; i++) {
    await vi.advanceTimersByTimeAsync(1000)
  }
  return p
}

describe('enrichWithDrivingRoutes · 写入实测值', () => {
  it('API 返回距离/时长 → 写入当天，并重新汇总', async () => {
    mockRoute.mockResolvedValue({ distance: 12000, duration: 1800, polyline: [[113.1, 28.2], [113.2, 28.3]] })

    const p = plan([day({ stores: [{ id: 's1', name: 'A', longitude: 113.1, latitude: 28.2 }] as never })], {
      lat: 28.1,
      lon: 113.0,
    })
    await advance(enrichWithDrivingRoutes(p))

    expect(p.days[0].drivingDistanceM, '应写入实测距离').toBe(12000)
    expect(p.days[0].drivingTimeMin, '1800 秒应折算成 30 分钟').toBe(30)
    expect(p.days[0].routePolyline, 'polyline 应写入').toBeTruthy()
    expect(p.totalDrivingDistanceM, '汇总应重新累加').toBe(12000)
    expect(p.totalDrivingTimeMin, '汇总时长应重新累加').toBe(30)
  })

  it('多天 → 汇总值是各天之和（不是取最后一天）', async () => {
    mockRoute
      .mockResolvedValueOnce({ distance: 10000, duration: 1200, polyline: [] })
      .mockResolvedValueOnce({ distance: 5000, duration: 600, polyline: [] })

    const p = plan(
      [
        day({ day: 1, stores: [{ id: 's1', name: 'A', longitude: 113.1, latitude: 28.2 }] as never }),
        day({
          day: 2,
          stores: [{ id: 's2', name: 'B', longitude: 113.5, latitude: 28.5 }] as never,
          accommodation: { name: 'H1', lat: 28.3, lon: 113.2 },
        }),
      ],
      { lat: 28.1, lon: 113.0 },
    )
    await advance(enrichWithDrivingRoutes(p))

    expect(p.totalDrivingDistanceM, '总里程应是两天之和').toBe(15000)
    expect(p.totalDrivingTimeMin, '总时长应是两天之和').toBe(30)
  })
})

describe('enrichWithDrivingRoutes · 不覆盖已有值', () => {
  it('API 抛错 → 保留原估算值（不改写成 0）', async () => {
    mockRoute.mockRejectedValue(new Error('quota'))

    const p = plan([day({ drivingDistanceM: 8888, drivingTimeMin: 77 })], { lat: 28.1, lon: 113.0 })
    await advance(enrichWithDrivingRoutes(p))

    expect(p.days[0].drivingDistanceM, 'API 失败必须保留估算值，不能变 0').toBe(8888)
    expect(p.days[0].drivingTimeMin, '时长同理').toBe(77)
  })

  it('API 返回 distance=0 → 不覆盖（0 表示未算出，不是零距离）', async () => {
    mockRoute.mockResolvedValue({ distance: 0, duration: 0, polyline: [] })

    const p = plan([day({ drivingDistanceM: 5000, drivingTimeMin: 40 })], { lat: 28.1, lon: 113.0 })
    await advance(enrichWithDrivingRoutes(p))

    expect(p.days[0].drivingDistanceM, 'distance=0 不该覆盖已有值').toBe(5000)
    expect(p.days[0].drivingTimeMin).toBe(40)
  })
})

describe('enrichWithDrivingRoutes · 跳过条件', () => {
  it('当天没有门店 → 不发起请求', async () => {
    const p = plan([day({ stores: [] })], { lat: 28.1, lon: 113.0 })
    await advance(enrichWithDrivingRoutes(p))

    expect(mockRoute, '空天不该请求').not.toHaveBeenCalled()
  })

  it('点不足两个 → 不发起请求（算不出路线）', async () => {
    // 没有 startPoint 且不是第二天（无前一天住宿）→ collectDayPoints 只有门店点本身
    const p = plan([day({ stores: [{ id: 's1', name: 'A', longitude: 113.1, latitude: 28.2 }] as never })], undefined)
    await advance(enrichWithDrivingRoutes(p))

    expect(mockRoute, '只有一个点不该请求').not.toHaveBeenCalled()
  })
})

describe('enrichWithDrivingRoutes · 进度与配额', () => {
  it('每天回调一次进度', async () => {
    mockRoute.mockResolvedValue({ distance: 1000, duration: 60, polyline: [] })
    const progress: Array<[number, number]> = []
    const p = plan(
      [
        day({ day: 1, stores: [{ id: 's1', name: 'A', longitude: 113.1, latitude: 28.2 }] as never }),
        day({ day: 2, stores: [{ id: 's2', name: 'B', longitude: 113.5, latitude: 28.5 }] as never }),
      ],
      { lat: 28.1, lon: 113.0 },
    )
    await advance(enrichWithDrivingRoutes(p, (cur, total) => progress.push([cur, total])))

    expect(progress, '两天应回调两次').toEqual([
      [1, 2],
      [2, 2],
    ])
  })

  it('相邻两天之间有配额间隔（不立刻发第二个请求）', async () => {
    // 这条验证 800ms 限速真的存在。若不隔，逐天串行调 API 会撞高德限流，
    // 表现为"第一天的数据有、后面几天全是估算值"这种难查的半失败。
    mockRoute.mockResolvedValue({ distance: 1000, duration: 60, polyline: [] })
    const p = plan(
      [
        day({ day: 1, stores: [{ id: 's1', name: 'A', longitude: 113.1, latitude: 28.2 }] as never }),
        day({ day: 2, stores: [{ id: 's2', name: 'B', longitude: 113.5, latitude: 28.5 }] as never }),
      ],
      { lat: 28.1, lon: 113.0 },
    )

    let done = false
    enrichWithDrivingRoutes(p).then(() => {
      done = true
    })

    // 只推 100ms：第一天应已请求，第二天还没（因为要等 800ms）
    await vi.advanceTimersByTimeAsync(100)
    expect(mockRoute.mock.calls.length, '100ms 内只该发第一个请求').toBe(1)

    // 推到 900ms：第二个请求该发了
    await vi.advanceTimersByTimeAsync(800)
    expect(mockRoute.mock.calls.length, '跨过 800ms 后应发第二个').toBe(2)

    for (let i = 0; i < 10 && !done; i++) await vi.advanceTimersByTimeAsync(1000)
  })
})

describe('findNearbyAccommodation · 附近住宿搜索', () => {
  it('有结果 → 取最近的一条并映射成 Accommodation', async () => {
    mockNearby.mockResolvedValue([
      { name: '某酒店', address: '长沙市某路1号', latitude: 28.2, longitude: 113.1, distance: 800, type: '住宿服务' },
      { name: '远一点的酒店', address: '长沙市某路99号', latitude: 28.5, longitude: 113.5, distance: 5000, type: '住宿服务' },
    ] as never)

    const r = await findNearbyAccommodation(28.1, 113.0)
    expect(r, '应返回一条住宿').not.toBeNull()
    // 取 pois[0]（searchNearby 已按距离排序），不是自己再排一遍
    expect(r!.name).toBe('某酒店')
    expect(r!.distanceM).toBe(800)
    expect(r!.lat).toBe(28.2)
    expect(r!.lon).toBe(113.1)
  })

  it('无结果 → 返回 null（不是抛错、不是空对象）', async () => {
    mockNearby.mockResolvedValue([] as never)
    const r = await findNearbyAccommodation(28.1, 113.0)
    expect(r, '搜不到应返回 null').toBeNull()
  })

  it('搜索抛错 → 返回 null（住宿是可选补充，不能因此中断整个规划）', async () => {
    mockNearby.mockRejectedValue(new Error('network'))
    const r = await findNearbyAccommodation(28.1, 113.0)
    expect(r, 'API 失败应静默返回 null').toBeNull()
  })

  it('默认半径 5000 米，可覆盖', async () => {
    mockNearby.mockResolvedValue([] as never)
    await findNearbyAccommodation(28.1, 113.0)
    expect(mockNearby.mock.calls[0][2], '默认半径应是 5000').toBe(5000)

    mockNearby.mockClear()
    await findNearbyAccommodation(28.1, 113.0, 2000)
    expect(mockNearby.mock.calls[0][2], '可传入自定义半径').toBe(2000)
  })

  it('POI 类型固定传 100000（住宿服务），不是随便搜', async () => {
    // 若不限定类型，附近第一家可能是餐馆/加油站 —— 那就成了"在加油站过夜"
    mockNearby.mockResolvedValue([] as never)
    await findNearbyAccommodation(28.1, 113.0)
    expect(mockNearby.mock.calls[0][3], 'POI 类型应是 100000（住宿服务）').toBe('100000')
  })
})
