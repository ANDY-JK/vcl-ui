// RouteResult 的数值格式化边界 —— 这些函数是**纯计算**，但只在汇总卡片里露一行，
// 出错的形态很隐蔽：不是崩溃，而是显示成"60分钟""1000米"这种自相矛盾的单位。
//
// 为什么要专门测：`formatTime` 先 `Math.floor(min/60)` 再 `Math.round(min%60)` ——
// 59.6 分钟会得到 h=0、m=60 → 渲染"60分钟"（应为 1小时）。而 `totalDrivingTimeMin`
// 是各天 drivingTimeMin 的浮点累加，59.x 这种值在真实路线里完全可能出现。
// 同理 `formatDistance` 用 `m < 1000` 判米，999.6 会被 round 成"1000米"。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { RoutePlan, Store } from '@/components/route-planner/types'

const openExternalUrl = vi.fn()
vi.mock('@/components/_internal/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/_internal/utils')>()
  return { ...actual, openExternalUrl: (...a: unknown[]) => openExternalUrl(...a) }
})

const { default: RouteResult } = await import('@/components/route-planner/RouteResult.vue')

const store = (id: string, lat: number | undefined = 26.07, lon: number | undefined = 119.3): Store => ({
  id,
  name: `店${id}`,
  address: `${id} 路 1 号`,
  province: '福建省',
  city: '福州市',
  district: '鼓楼区',
  town: '',
  contact: '',
  phone: '',
  latitude: lat,
  longitude: lon,
  coordSource: 'manual',
  skipped: false,
})

/** 造一个只有一天的 plan；时间/距离由调用方给定，用来打边界值 */
function makePlan(opts: { timeMin: number; distM: number; stores?: Store[]; navUrl?: string }): RoutePlan {
  return {
    days: [
      {
        day: 1,
        stores: opts.stores ?? [store('s1'), store('s2')],
        drivingTimeMin: opts.timeMin,
        drivingDistanceM: opts.distM,
        accommodation: null,
        navLink: opts.navUrl ? { label: '导航', url: opts.navUrl, webUrl: opts.navUrl } : undefined,
      },
    ],
    totalStores: (opts.stores ?? [store('s1'), store('s2')]).length,
    totalSkipped: 0,
    totalDays: 1,
    totalDrivingTimeMin: opts.timeMin,
    totalDrivingDistanceM: opts.distM,
    startPoint: { lat: 26.07, lon: 119.3 },
    skippedStores: [],
  } as RoutePlan
}

const mountResult = (plan: RoutePlan) =>
  mount(RouteResult, { props: { plan, loading: false, enriching: false }, global: { stubs: { teleport: true } } })

/** 汇总卡片里第 n 个 stat 的数值 */
const statNum = (w: ReturnType<typeof mountResult>, idx: number) => w.findAll('.stat-num')[idx]!.text()

beforeEach(() => openExternalUrl.mockClear())

describe('RouteResult · 时间格式化边界', () => {
  it('59.6 分钟必须显示「1小时」，不是「60分钟」', () => {
    const w = mountResult(makePlan({ timeMin: 59.6, distM: 5000 }))
    const shown = statNum(w, 3) // 汇总卡片第 4 格 = 总驾驶时间
    expect(shown).toBe('1小时')
    expect(shown).not.toContain('60分钟')
  })

  it('59.4 分钟显示「59分钟」（向下取整不会凭空进位）', () => {
    expect(statNum(mountResult(makePlan({ timeMin: 59.4, distM: 5000 })), 3)).toBe('59分钟')
  })

  it('90 分钟显示「1小时30分钟」', () => {
    expect(statNum(mountResult(makePlan({ timeMin: 90, distM: 5000 })), 3)).toBe('1小时30分钟')
  })

  it('整天行车时间在分天行头也走同一口径（59.6 → 1小时）', () => {
    const w = mountResult(makePlan({ timeMin: 59.6, distM: 5000 }))
    const row = w.find('.day-summary-text').text()
    expect(row).toContain('1小时')
    expect(row).not.toContain('60分钟')
  })
})

describe('RouteResult · 距离格式化边界', () => {
  it('999.6 米必须显示「1.0公里」，不是「1000米」', () => {
    const w = mountResult(makePlan({ timeMin: 10, distM: 999.6 }))
    const shown = statNum(w, 2) // 汇总卡片第 3 格 = 总距离
    expect(shown).toBe('1.0公里')
    expect(shown).not.toBe('1000米')
  })

  it('999 米显示「999米」', () => {
    expect(statNum(mountResult(makePlan({ timeMin: 10, distM: 999 })), 2)).toBe('999米')
  })
})

describe('RouteResult · 门店密度', () => {
  it('距离为 0 时不显示密度标签（避免除以 0）', () => {
    const w = mountResult(makePlan({ timeMin: 10, distM: 0 }))
    expect(w.find('.density-tag').exists()).toBe(false)
  })

  it('2 家 / 5km = 40 家/100km，且落在「密度好」档', () => {
    const w = mountResult(makePlan({ timeMin: 10, distM: 5000 }))
    const tag = w.find('.density-tag')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toContain('40家/100km')
    expect(tag.classes()).toContain('density-good')
  })

  it('没有门店时不显示密度（即使有距离）', () => {
    const w = mountResult(makePlan({ timeMin: 10, distM: 5000, stores: [] }))
    expect(w.find('.density-tag').exists()).toBe(false)
  })
})

describe('RouteResult · 缺坐标与导航出口', () => {
  it('门店缺经纬度时路段不渲染 NaN', () => {
    const w = mountResult(
      makePlan({ timeMin: 10, distM: 5000, stores: [store('a'), store('b', undefined, undefined)] }),
    )
    expect(w.text()).not.toContain('NaN')
  })

  it('点「开始导航」走统一出口 openExternalUrl（不能绕过 noopener 保护）', async () => {
    const w = mountResult(makePlan({ timeMin: 10, distM: 5000, navUrl: 'https://uri.amap.com/navi?x=1' }))
    const btn = w.find('.btn-nav-day')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(openExternalUrl).toHaveBeenCalledWith('https://uri.amap.com/navi?x=1')
  })
})

describe('RouteResult · 分天折叠', () => {
  it('点天头切换展开/折叠（默认展开第一天）', async () => {
    const w = mountResult(makePlan({ timeMin: 10, distM: 5000 }))
    expect(w.find('.day-detail').exists()).toBe(true)
    await w.find('.day-header').trigger('click')
    expect(w.find('.day-detail').exists()).toBe(false)
    await w.find('.day-header').trigger('click')
    expect(w.find('.day-detail').exists()).toBe(true)
  })
})
