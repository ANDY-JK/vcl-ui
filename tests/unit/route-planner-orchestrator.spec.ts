// useRoutePlanner / useCoordinateResolver 编排行为锁定：状态机（loading/enriching/error/progress）、
// 调用时序（enrich 必须先于 buildNavLinks，注释写明的 accommodation 依赖）、失败兜底（保留估算值）。
// 背景：route-planner 域覆盖洼地在 composables（11.81%）；两个编排器是纯 mock 面，成本低。
// 与 route-store-data.spec.ts 分文件：vi.mock 按文件提升，那边的 useStoreData 要真依赖。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRoutePlanner } from '@/components/route-planner/composables/useRoutePlanner'
import { useCoordinateResolver } from '@/components/route-planner/composables/useCoordinateResolver'
import {
  planRoute,
  enrichAccommodations,
  enrichWithDrivingRoutes,
  buildAllNavLinks,
  replanFrom,
  batchResolveCoordinates,
} from '@/components/route-planner/utils'
import type { RoutePlan, RouteOptions, Store } from '@/components/route-planner/types'

vi.mock('@/components/route-planner/utils', () => ({
  planRoute: vi.fn(),
  enrichAccommodations: vi.fn(),
  enrichWithDrivingRoutes: vi.fn(),
  buildAllNavLinks: vi.fn(),
  replanFrom: vi.fn(),
  batchResolveCoordinates: vi.fn(),
}))

function mkStore(id: string, over: Partial<Store> = {}): Store {
  return {
    id,
    name: `门店${id}`,
    address: '某路1号',
    province: '湖南省',
    city: '长沙市',
    district: '岳麓区',
    town: '',
    contact: '',
    phone: '',
    longitude: 112.9,
    latitude: 28.2,
    coordSource: 'original',
    skipped: false,
    ...over,
  }
}

/** 最小可用 plan 形状：编排器只透传 days/startPoint 给 enrich/buildNavLinks */
function fakePlan(): RoutePlan {
  return { days: [], startPoint: mkStore('start') } as unknown as RoutePlan
}

const fakeOptions = { stores: [] } as unknown as RouteOptions

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRoutePlanner · generate', () => {
  it('成功：loading 置位/复位、plan 写入、enrich 先于 buildNavLinks（accommodation 依赖）', async () => {
    const plan = fakePlan()
    vi.mocked(planRoute).mockReturnValue(plan)
    vi.mocked(enrichAccommodations).mockResolvedValue(undefined)

    const p = useRoutePlanner()
    const promise = p.generate(fakeOptions)
    expect(p.loading.value).toBe(true) // 进行中即置位
    const result = await promise

    expect(result).toBe(plan)
    // ref 对对象值返回响应式代理（≠原始引用），这里断言深相等
    expect(p.plan.value).toStrictEqual(plan)
    expect(p.loading.value).toBe(false)
    expect(p.error.value).toBeNull()
    expect(planRoute).toHaveBeenCalledWith(fakeOptions)
    // 时序：buildAllNavLinks 依赖 enrichAccommodations 填充的 day.accommodation
    expect(vi.mocked(enrichAccommodations).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(buildAllNavLinks).mock.invocationCallOrder[0],
    )
    expect(vi.mocked(buildAllNavLinks)).toHaveBeenCalledWith(plan.days, plan.startPoint)
  })

  it('Error 抛出：error 取消息、返回 null、loading 复位', async () => {
    vi.mocked(planRoute).mockImplementation(() => {
      throw new Error('聚类失败')
    })
    const p = useRoutePlanner()
    const result = await p.generate(fakeOptions)
    expect(result).toBeNull()
    expect(p.plan.value).toBeNull()
    expect(p.error.value).toBe('聚类失败')
    expect(p.loading.value).toBe(false)
  })

  it('非 Error 抛出：error 回退到内置 i18n 文案而非 undefined', async () => {
    vi.mocked(planRoute).mockImplementation(() => {
      throw 'string-throw' // eslint-disable-line no-throw-literal
    })
    const p = useRoutePlanner()
    const result = await p.generate(fakeOptions)
    expect(result).toBeNull()
    expect(typeof p.error.value).toBe('string')
    expect(p.error.value!.length).toBeGreaterThan(0)
  })
})

describe('useRoutePlanner · enrichDriving', () => {
  it('无 plan 时直接返回：不触 enrich、enriching 恒 false', async () => {
    const p = useRoutePlanner()
    await p.enrichDriving()
    expect(vi.mocked(enrichWithDrivingRoutes)).not.toHaveBeenCalled()
    expect(p.enriching.value).toBe(false)
  })

  it('成功：替换真实驾车数据后重建导航链接', async () => {
    // 前置：generate 必须真的成功（planRoute 不 mock 会让 plan 为空、enrichDriving 静默早退）
    vi.mocked(planRoute).mockReturnValue(fakePlan())
    vi.mocked(enrichAccommodations).mockResolvedValue(undefined)
    vi.mocked(enrichWithDrivingRoutes).mockResolvedValue(undefined)
    const p = useRoutePlanner()
    await p.generate(fakeOptions)
    vi.clearAllMocks()
    vi.mocked(enrichWithDrivingRoutes).mockResolvedValue(undefined)

    await p.enrichDriving((cur, total) => void [cur, total])
    expect(vi.mocked(enrichWithDrivingRoutes)).toHaveBeenCalledWith(p.plan.value, expect.any(Function))
    expect(vi.mocked(buildAllNavLinks)).toHaveBeenCalled()
    expect(p.enriching.value).toBe(false)
  })

  it('驾车数据获取失败：保留估算值仍重建导航链接，且不置 error', async () => {
    vi.mocked(planRoute).mockReturnValue(fakePlan())
    vi.mocked(enrichAccommodations).mockResolvedValue(undefined)
    const p = useRoutePlanner()
    await p.generate(fakeOptions)
    vi.clearAllMocks()
    vi.mocked(enrichWithDrivingRoutes).mockRejectedValue(new Error('网络超时'))

    await p.enrichDriving()
    expect(vi.mocked(buildAllNavLinks)).toHaveBeenCalled()
    expect(p.enriching.value).toBe(false)
    expect(p.error.value).toBeNull()
  })
})

describe('useRoutePlanner · replan / reset', () => {
  it('无 plan 时 replan 返回 null 且不触算法', async () => {
    const p = useRoutePlanner()
    expect(await p.replan({ lat: 28, lon: 112 }, [mkStore('x')])).toBeNull()
    expect(vi.mocked(replanFrom)).not.toHaveBeenCalled()
  })

  it('有 plan：replanFrom 收到当前位置与剩余门店，新 plan 经 enrich 后替换', async () => {
    const old = fakePlan()
    const fresh = fakePlan()
    vi.mocked(planRoute).mockReturnValue(old)
    vi.mocked(enrichAccommodations).mockResolvedValue(undefined)
    const p = useRoutePlanner()
    await p.generate(fakeOptions)
    vi.clearAllMocks()
    vi.mocked(enrichAccommodations).mockResolvedValue(undefined)
    vi.mocked(replanFrom).mockReturnValue(fresh)

    const remaining = [mkStore('r1'), mkStore('r2')]
    const result = await p.replan({ lat: 28.1, lon: 112.8 }, remaining)

    expect(vi.mocked(replanFrom)).toHaveBeenCalledWith({ lat: 28.1, lon: 112.8 }, remaining, old)
    expect(result).toBe(fresh)
    expect(p.plan.value).toStrictEqual(fresh)
    expect(vi.mocked(enrichAccommodations).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(buildAllNavLinks).mock.invocationCallOrder[0],
    )
  })

  it('reset 清空全部状态', async () => {
    vi.mocked(planRoute).mockReturnValue(fakePlan())
    vi.mocked(enrichAccommodations).mockResolvedValue(undefined)
    const p = useRoutePlanner()
    await p.generate(fakeOptions)
    p.reset()
    expect(p.plan.value).toBeNull()
    expect(p.loading.value).toBe(false)
    expect(p.enriching.value).toBe(false)
    expect(p.error.value).toBeNull()
  })
})

describe('useCoordinateResolver · resolveBatch', () => {
  it('空数组直返：不置 processing、progress 不动', async () => {
    const r = useCoordinateResolver()
    const out = await r.resolveBatch([])
    expect(out).toEqual([])
    expect(r.processing.value).toBe(false)
    expect(r.progress.value).toEqual({ current: 0, total: 0, success: 0, fail: 0 })
    expect(vi.mocked(batchResolveCoordinates)).not.toHaveBeenCalled()
  })

  it('成功：progress 回调透传 + success/fail 按 coordSource 终计', async () => {
    vi.mocked(batchResolveCoordinates).mockImplementation(async (_stores, onProgress) => {
      onProgress?.(1, 2)
      onProgress?.(2, 2)
      return [
        mkStore('ok', { coordSource: 'manual' }),
        mkStore('fail', { coordSource: 'none', longitude: null, latitude: null }),
      ]
    })
    const r = useCoordinateResolver()
    const promise = r.resolveBatch([mkStore('1'), mkStore('2')] as Partial<Store>[])
    expect(r.processing.value).toBe(true)
    const out = await promise

    expect(out).toHaveLength(2)
    expect(r.processing.value).toBe(false)
    expect(r.error.value).toBeNull()
    expect(r.progress.value).toEqual({ current: 2, total: 2, success: 1, fail: 1 })
  })

  it('抛错：error 取消息、返回空数组、processing 复位', async () => {
    vi.mocked(batchResolveCoordinates).mockRejectedValue(new Error('接口超时'))
    const r = useCoordinateResolver()
    const out = await r.resolveBatch([mkStore('1')] as Partial<Store>[])
    expect(out).toEqual([])
    expect(r.error.value).toBe('接口超时')
    expect(r.processing.value).toBe(false)
  })
})

describe('useCoordinateResolver · resolveOne / reset', () => {
  it('单个解析取结果首项；批次失败回 null 而非抛出', async () => {
    vi.mocked(batchResolveCoordinates).mockResolvedValue([mkStore('one')])
    const r = useCoordinateResolver()
    expect(await r.resolveOne({ name: 'one' })).toMatchObject({ id: 'one' })

    vi.mocked(batchResolveCoordinates).mockRejectedValue(new Error('x'))
    expect(await r.resolveOne({ name: 'one' })).toBeNull()
  })

  it('reset 复位 processing/progress/error', async () => {
    vi.mocked(batchResolveCoordinates).mockRejectedValue(new Error('x'))
    const r = useCoordinateResolver()
    await r.resolveBatch([mkStore('1')] as Partial<Store>[])
    expect(r.error.value).not.toBeNull()
    r.reset()
    expect(r.processing.value).toBe(false)
    expect(r.progress.value).toEqual({ current: 0, total: 0, success: 0, fail: 0 })
    expect(r.error.value).toBeNull()
  })
})
