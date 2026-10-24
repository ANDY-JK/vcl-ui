/**
 * route-planning 深层分支锁定：合并单店天 / targetDays 时间预算 / 2-opt 与绕路边界
 *
 * ## 为什么补（route-planning.ts 811 行，79 行未覆盖 / 分支 56.9% 全项目最低档）
 *
 * 既有 route-planning.spec.ts 只测了 planRoute 的 4 个入口行为，且断言多为
 * 「totalStores > 0」这类弱不变量。本轮锁定三块并**全部用精确数值/结构断言**：
 *
 * ① **targetDays 时间预算预过滤（L262-288）**——预算 = targetDays × dailyLimitHours × 60，
 *    逐店累加「驾驶 + 拜访」，超预算的进 timeSkipped（并入 totalSkipped）。
 *    这是用户「我要 3 天跑完」的入口。
 * ② **mergeSmallDays（L607-696）**——单店天并入相邻天（优先前一天），
 *    双重上限：总时间 ≤ limitMin×1.2 且驾驶 ≤ maxDrivingMinutesPerDay。
 *    分天切割产生碎片天时，它决定碎片被并掉还是浪费一天。
 * ③ **2-opt（L409-451）/ 绕路跳过（L725-779）/ 距离时间估算（L793-797）** 的公式与边界。
 *
 * ## 断言策略（写下来的教训）
 *
 * 首版大量使用「不变量」断言（>= / > 0 / 单调），负向对照只有 **6/22** 有效 ——
 * 变异体照样满足这些弱不变量（比如「预算累加不算驾驶时间」在小几何下结果不变、
 * 「2-opt 不跑」在多数几何下里程刚好一样）。本版逐条改为**精确值**：
 * 天数分布数组、门店 id 拼接串、里程精确数、时间字段精确值。
 */
import { describe, it, expect } from 'vitest'
import {
  planRoute,
  replanFrom,
  enrichAccommodations,
} from '@/components/route-planner/utils/route-planning'
import type { Store, RouteOptions } from '@/components/route-planner/types'

function mkStore(
  id: string,
  lon: number | null,
  lat: number | null,
  extra: Partial<Store> = {},
): Store {
  return {
    id,
    name: id,
    address: id,
    province: '北京',
    city: '北京',
    district: '海淀',
    town: '',
    contact: '',
    phone: '',
    longitude: lon,
    latitude: lat,
    coordSource: 'manual',
    skipped: false,
    ...extra,
  }
}

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

function denseStores(prefix: string, n: number): Store[] {
  return Array.from({ length: n }, (_, i) =>
    mkStore(prefix + i, 116.4 + (i % 4) * 0.01, 39.9 + Math.floor(i / 4) * 0.01),
  )
}

const shape = (plan: ReturnType<typeof planRoute>) =>
  plan.days.map((d) => d.stores.map((s) => s.id).join('+')).join(' | ')

/* ═══════════ targetDays 时间预算预过滤 ═══════════ */

describe('targetDays 时间预算预过滤', () => {
  it('**12 家 60 分钟拜访 + targetDays=1 → 恰好 7 家入计划、5 家剔除**', () => {
    // 预算 = 1 × 8 × 60 = 480 分钟。每家成本 = 到前一店的驾驶时间 + 60 拜访。
    // 12 家沿经度 0.005° 递增（≈430m 间隔），驾驶时间取整后每家 1 分钟。
    // 精确断言：弱化成区间就等于放过「cost 不算驾驶时间」这类变异。
    const stores = Array.from({ length: 12 }, (_, i) => mkStore('s' + i, 116.4 + i * 0.005, 39.9))
    const plan = planRoute(
      opts(
        stores.map((s) => ({ ...s, visitMinutes: 60 })),
        { targetDays: 1, maxStoresPerDay: 20 },
      ),
    )
    expect(plan.totalStores, '预算内保留 7 家').toBe(7)
    expect(plan.totalSkipped, '剔除 5 家').toBe(5)
    expect(shape(plan), '单天装 s0..s6').toBe('s0+s1+s2+s3+s4+s5+s6')
  })

  it('**dailyLimitHours 真切参与预算**（8h→7 家，2h→1 家）', () => {
    const stores = Array.from({ length: 12 }, (_, i) => mkStore('s' + i, 116.4 + i * 0.005, 39.9))
    const withVisits = stores.map((s) => ({ ...s, visitMinutes: 60 }))
    const eight = planRoute(opts(withVisits, { targetDays: 1, maxStoresPerDay: 20, dailyLimitHours: 8 }))
    const two = planRoute(opts(withVisits, { targetDays: 1, maxStoresPerDay: 20, dailyLimitHours: 2 }))
    expect(eight.totalStores, '8h 预算装 7 家').toBe(7)
    expect(two.totalStores, '2h 预算只装 1 家').toBe(1)
    expect(two.totalSkipped, '其余 11 家全剔').toBe(11)
  })

  it('**targetDays=0 退化为默认分天**（不过滤，按 maxStoresPerDay 切）', () => {
    const plan = planRoute(opts(denseStores('s', 6), { targetDays: 0, maxStoresPerDay: 2 }))
    expect(plan.totalStores, '6 家全保留').toBe(6)
    expect(plan.totalSkipped, '无剔除').toBe(0)
    expect(plan.days.map((d) => d.stores.length), '限 2 → 三天各 2 家').toEqual([2, 2, 2])
    // 末天被 2-opt 反转成 s5+s4（实测）——分天切割给 [s4,s5]，2-opt 后段反转更短
    expect(shape(plan)).toBe('s0+s1 | s2+s3 | s5+s4')
  })

  it('**预算充裕时不剔除**（2 天预算装得下 4 家）', () => {
    const plan = planRoute(opts(denseStores('s', 4), { targetDays: 2 }))
    expect(plan.totalStores).toBe(4)
    expect(plan.totalSkipped).toBe(0)
  })

  it('**无坐标门店在预算循环里被跳过且不消耗预算**', () => {
    // bad 的 visitMinutes=600 若被计入预算会立刻超（600 > 480）→ 后面的 good 全被剔。
    // 实测保留 3 家 → 证明 null 坐标的 continue 生效。
    const stores = [
      ...denseStores('good', 3),
      mkStore('bad', null, null, { visitMinutes: 600 }),
    ]
    const plan = planRoute(opts(stores, { targetDays: 1 }))
    expect(plan.totalStores, '无坐标店不消耗预算').toBe(3)
    expect(shape(plan)).toBe('good0+good1+good2')
  })
})

/* ═══════════ mergeSmallDays ═══════════ */

describe('mergeSmallDays 单店天合并', () => {
  it('**门店数上限挡住合并：3 家限 2 → [2,1]**', () => {
    // maxStoresPerDay=2，前一天已 2 家 → result[i-1].length+1=3 > 2 → 合并被挡。
    const plan = planRoute(opts(denseStores('s', 3), { maxStoresPerDay: 2, maxSegmentKm: 800 }))
    expect(plan.days.map((d) => d.stores.length), '顺序 [2,1]').toEqual([2, 1])
    expect(shape(plan)).toBe('s0+s1 | s2')
  })

  it('**放开上限后同一输入被合并：[2,1] → [3]**（mergeSmallDays 生效的直接对照）', () => {
    // 同一几何、同一分天切割，只改 maxStoresPerDay：2 → 挡合并；3 → 合并成一天。
    const stores = denseStores('s', 3)
    const capped = planRoute(opts(stores, { maxStoresPerDay: 2, maxSegmentKm: 800 }))
    const merged = planRoute(opts(stores, { maxStoresPerDay: 3, maxSegmentKm: 800 }))
    expect(capped.days.map((d) => d.stores.length), '限 2 → 挡合并').toEqual([2, 1])
    expect(merged.days.map((d) => d.stores.length), '限 3 → 合并成 1 天').toEqual([3])
    expect(merged.totalDays).toBe(1)
    expect(shape(merged)).toBe('s0+s1+s2')
  })

  it('**4 家限 2 → [2,2]：无单店天，mergeSmallDays 不改结构**', () => {
    const plan = planRoute(opts(denseStores('s', 4), { maxStoresPerDay: 2, maxSegmentKm: 800 }))
    expect(plan.days.map((d) => d.stores.length)).toEqual([2, 2])
    expect(shape(plan)).toBe('s0+s1 | s2+s3')
  })

  it('**8 家限 4 → [4,4]**', () => {
    const plan = planRoute(opts(denseStores('s', 8), { maxStoresPerDay: 4, maxSegmentKm: 800 }))
    expect(plan.days.map((d) => d.stores.length)).toEqual([4, 4])
    expect(plan.totalDays).toBe(2)
  })

  it('**5 家限 2 → [2,2,1]：末天单店保留（上限挡）**', () => {
    const plan = planRoute(opts(denseStores('s', 5), { maxStoresPerDay: 2, maxSegmentKm: 800 }))
    expect(plan.days.map((d) => d.stores.length), '尾部单店天').toEqual([2, 2, 1])
    expect(plan.totalStores).toBe(5)
    expect(shape(plan)).toBe('s0+s1 | s2+s3 | s4')
  })

  it('**限 1 家/天：全部单店天且无法合并**', () => {
    const stores = denseStores('s', 3).map((s) => ({ ...s, visitMinutes: 300 }))
    const plan = planRoute(opts(stores, { maxStoresPerDay: 1, maxSegmentKm: 800 }))
    expect(plan.days.map((d) => d.stores.length)).toEqual([1, 1, 1])
    expect(plan.totalDays).toBe(3)
    expect(shape(plan)).toBe('s0 | s1 | s2')
  })

  it('**并列顺序：每天门店按规划顺序连续**（分天不重排、不丢店）', () => {
    const plan = planRoute(opts(denseStores('s', 9), { maxStoresPerDay: 4, maxSegmentKm: 800 }))
    expect(plan.totalStores, '9 家全在').toBe(9)
    const flat = plan.days.flatMap((d) => d.stores.map((s) => s.id))
    expect(new Set(flat).size, '无重复').toBe(9)
    expect(flat.sort(), '无丢失').toEqual(denseStores('s', 9).map((s) => s.id).sort())
  })
})

/* ═══════════ 2-opt ═══════════ */

describe('2-opt 优化', () => {
  it('**2 家店走短路**（<=2 直接复制，不改顺序）', () => {
    const plan = planRoute(opts(denseStores('s', 2)))
    expect(plan.days.length).toBe(1)
    expect(shape(plan)).toBe('s0+s1')
  })

  it('**矩形四角 + 南边中点起点：里程精确落在 2-opt 后值**', () => {
    // 矩形 0.02°×0.04° ≈ 1.7km × 4.4km。2-opt 收敛后的回路里程是确定值；
    // 若 2-opt 不跑（走最近邻的 Z 字），里程会明显更大 → 精确值可分辨。
    const stores = [
      mkStore('tl', 116.39, 39.92),
      mkStore('tr', 116.41, 39.92),
      mkStore('bl', 116.39, 39.88),
      mkStore('br', 116.41, 39.88),
    ]
    const plan = planRoute(
      opts(stores, {
        startPoint: { lat: 39.88, lon: 116.4 },
        maxSegmentKm: 800,
        maxDetourKm: 5000,
        maxStoresPerDay: 10,
        maxDrivingMinutesPerDay: 2400,
        dailyLimitHours: 24,
      }),
    )
    expect(plan.totalStores, '4 家一天').toBe(4)
    expect(shape(plan), '访问顺序（实测 bl+br+tr+tl）').toBe('bl+br+tr+tl')
    expect(plan.totalDrivingDistanceM, '精确里程').toBe(12199)
    expect(plan.totalDrivingTimeMin, '精确时间').toBe(15)
  })

  it('**输入顺序影响跳过结果**（实测：正序 5 家全规划，逆序只 4 家且 c 被跳）', () => {
    const base = [
      mkStore('a', 116.4, 39.9),
      mkStore('b', 116.44, 39.93),
      mkStore('c', 116.38, 39.95),
      mkStore('d', 116.42, 39.88),
      mkStore('e', 116.46, 39.91),
    ]
    const p1 = planRoute(opts(base, { maxSegmentKm: 800, maxDetourKm: 5000, maxStoresPerDay: 10 }))
    const p2 = planRoute(
      opts([...base].reverse(), { maxSegmentKm: 800, maxDetourKm: 5000, maxStoresPerDay: 10 }),
    )
    // 真实行为：同一门店集合、仅数组顺序不同 → 规划结果不同。
    // 正序：5 家全规划（shape a+d+e+b+c，里程 22338）；逆序：4 家，c 被绕路守卫跳过（里程 17285）。
    expect(p1.totalStores, '正序全规划').toBe(5)
    expect(shape(p1)).toBe('a+d+e+b+c')
    expect(p1.totalDrivingDistanceM).toBe(22338)
    expect(p1.totalSkipped, '正序无跳过').toBe(0)

    expect(p2.totalStores, '逆序少 1 家').toBe(4)
    expect(p2.skippedStores.map((s) => s.id), '逆序时 c 被跳').toEqual(['c'])
    expect(shape(p2)).toBe('e+d+a+b')
    // P3 观察：绕路守卫的阈值由**平均段长**锚定，而平均段长随输入顺序变化，
    // 于是「同一批门店换个输入顺序」会改变哪些店被跳过 —— 结果对输入顺序敏感。
    expect(p1.totalDrivingDistanceM, '两种顺序里程不同').not.toBe(p2.totalDrivingDistanceM)
  })
})

/* ═══════════ 距离与时间估算公式 ═══════════ */

describe('距离与时间估算公式', () => {
  it('**roadFactor 参与里程：2.0/1.4 倍率精确**', () => {
    const stores = [mkStore('a', 116.5, 39.9)]
    const start = { lat: 39.9, lon: 116.4 }
    const r14 = planRoute(opts(stores, { startPoint: start, roadFactor: 1.4 }))
    const r20 = planRoute(opts(stores, { startPoint: start, roadFactor: 2.0 }))
    expect(r14.totalDrivingDistanceM).toBeGreaterThan(0)
    const ratio = r20.totalDrivingDistanceM / r14.totalDrivingDistanceM
    expect(ratio, '倍率 ≈ 2.0/1.4').toBeGreaterThan(1.428)
    expect(ratio).toBeLessThan(1.429)
  })

  it('**avgSpeedKmh 参与时间：50 vs 100 → 时间比 ≈ 2**', () => {
    const stores = [mkStore('a', 116.8, 39.9)]
    const start = { lat: 39.9, lon: 116.4 }
    const slow = planRoute(opts(stores, { startPoint: start, avgSpeedKmh: 50 }))
    const fast = planRoute(opts(stores, { startPoint: start, avgSpeedKmh: 100 }))
    expect(slow.totalDrivingTimeMin).toBeGreaterThan(fast.totalDrivingTimeMin)
    const ratio = slow.totalDrivingTimeMin / fast.totalDrivingTimeMin
    expect(ratio, '50km/h 用时约 2 倍').toBeGreaterThan(1.9)
    expect(ratio).toBeLessThan(2.1)
  })

  it('**时间取整到分钟**（精确值；起点须显式给远点）', () => {
    // ⚠️ 默认 startPoint 是**门店质心**（实测：单店时 startPoint 就等于该店坐标），
    // 所以单店 + 默认起点会得到 dist=0/time=0。要测时间必须显式给远起点。
    const plan = planRoute(opts([mkStore('a', 116.8, 39.9)], { startPoint: { lat: 39.9, lon: 116.4 } }))
    expect(plan.totalDrivingDistanceM, '精确里程').toBe(47771)
    expect(plan.totalDrivingTimeMin, '精确时间').toBe(57)
    expect(Number.isInteger(plan.totalDrivingTimeMin), '整数分钟').toBe(true)
  })

  it('**默认起点 = 首个有效门店的坐标**（单店时距离与时间均为 0）', () => {
    // ⚠️ 不是质心 —— L51-53 取 validStores[0] 的坐标（实测：两店几何下起点等于第一家的坐标）。
    const plan = planRoute(opts([mkStore('a', 116.45, 39.92)]))
    expect(plan.startPoint, '起点等于该店坐标').toEqual({ lat: 39.92, lon: 116.45 })
    expect(plan.totalDrivingDistanceM, '无位移').toBe(0)
    expect(plan.totalDrivingTimeMin).toBe(0)
  })

  it('**驾驶时间兜底反算行会被走到**（时间算出 0 但距离不为 0）', () => {
    // 起点距店 ~170m：直线 170m × 1.4 = 238m 路网 → 238/833.3 = 0.286 分钟 → 取整 0；
    // 而 round(238) = 238 > 0 → 触发 L319-320 的兜底反算。
    // ⚠️ P3 观察：兜底公式 round(round(d×rf)/v) 与主公式 round(d×rf/v) **几乎等价**
    // （仅当 d×roadFactor ∈ [416.5, 416.67) 的极窄窗口才有 0→1 差异），
    // 本用例下两者都得 0 —— 兜底行实际不改变结果，但它确实被执行。
    const near = planRoute(
      opts([mkStore('near', 116.402, 39.9)], { startPoint: { lat: 39.9, lon: 116.4 } }),
    )
    expect(near.totalDrivingDistanceM, '距离不为 0').toBeGreaterThan(0)
    expect(near.totalDrivingTimeMin, '时间取整后为 0（兜底也无法救）').toBe(0)
    expect(near.days[0].drivingDistanceM).toBeGreaterThan(0)
    expect(near.days[0].drivingTimeMin).toBe(0)
  })

  it('**visitMinutes 显式值不影响里程**（5 分钟 vs 默认 30）', () => {
    const s = mkStore('a', 116.5, 39.9)
    const explicit = planRoute(opts([{ ...s, visitMinutes: 5 }]))
    const dflt = planRoute(opts([s]))
    expect(explicit.totalDrivingDistanceM).toBe(dflt.totalDrivingDistanceM)
    expect(explicit.totalDays).toBe(dflt.totalDays)
  })
})

/* ═══════════ 绕路跳过 ═══════════ */

describe('绕路跳过（闭环绕路成本）', () => {
  it('**远店被跳过：精确 id 列表**', () => {
    const stores = [
      mkStore('a', 116.4, 39.9),
      mkStore('b', 116.41, 39.9),
      mkStore('c', 116.4, 39.91),
      mkStore('far', 118.4, 39.9),
    ]
    const plan = planRoute(opts(stores, { maxDetourKm: 30 }))
    expect(plan.totalStores).toBe(3)
    expect(plan.skippedStores.map((s) => s.id)).toEqual(['far'])
  })

  it('**阈值被平均段长锚定：maxDetourKm 再大也救不了远店**', () => {
    const stores = [...denseStores('p', 4), mkStore('lone', 118.0, 40.0)]
    const strict = planRoute(opts(stores, { maxDetourKm: 30 }))
    const loose = planRoute(
      opts(stores, { maxDetourKm: 5000, maxSegmentKm: 800, maxDrivingMinutesPerDay: 2400 }),
    )
    expect(strict.skippedStores.map((s) => s.id)).toContain('lone')
    expect(loose.skippedStores.map((s) => s.id), '平均段长锚定 → 宽松也跳').toContain('lone')
    expect(loose.totalStores, '密集 4 家保留').toBe(4)
  })

  it('**阈值下限 10km 兜底：短距离店集不被误跳**', () => {
    // 密集店平均段长 ~800m × 1.5 = 1.2km，但阈值下限 10km → 全部保留
    const plan = planRoute(opts(denseStores('s', 6), { maxDetourKm: 1 }))
    expect(plan.totalStores, '6 家全保留').toBe(6)
    expect(plan.totalSkipped).toBe(0)
  })

  it('**单店输入短路：不判绕路直接保留**', () => {
    const plan = planRoute(opts([mkStore('only', 116.4, 39.9)]))
    expect(plan.totalStores).toBe(1)
    expect(shape(plan)).toBe('only')
  })
})

/* ═══════════ 平局择优 ═══════════ */

describe('平局择优（门店数相同比里程）', () => {
  it('**平局时取里程更短的排序**（精确里程）', () => {
    // 实测：本版实现给 221755；旧实现无条件取角度环形法给 316906。
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
    expect(plan.totalDrivingDistanceM).toBe(221755)
  })
})

/* ═══════════ replanFrom ═══════════ */

describe('replanFrom', () => {
  it('**保留原计划起点**（新起点只用于规划，不覆盖 startPoint 字段）', () => {
    const original = planRoute(opts([mkStore('a', 116.4, 39.9)]))
    const replan = replanFrom({ lat: 39.95, lon: 116.45 }, [mkStore('b', 116.5, 40.0)], original)
    expect(replan.totalStores).toBe(1)
    expect(replan.startPoint, '起点来自原计划').toEqual(original.startPoint)
    expect(replan.startPoint).not.toEqual({ lat: 39.95, lon: 116.45 })
  })

  it('**剩余为空 → 空计划，起点仍保留**', () => {
    const original = planRoute(opts([mkStore('a', 116.4, 39.9)]))
    const replan = replanFrom({ lat: 39.9, lon: 116.4 }, [], original)
    expect(replan.days).toEqual([])
    expect(replan.totalStores).toBe(0)
    expect(replan.startPoint).toEqual(original.startPoint)
  })

  it('**剩余含 null 坐标被过滤**', () => {
    const original = planRoute(opts([mkStore('a', 116.4, 39.9)]))
    const replan = replanFrom({ lat: 39.9, lon: 116.4 }, [mkStore('bad', null, null)], original)
    expect(replan.totalStores).toBe(0)
  })
})

/* ═══════════ mergeSmallDays：时间驱动切割下的真实合并 ═══════════ */

describe('mergeSmallDays 时间驱动切割下的合并', () => {
  /** n 家密集店（间隔 0.005° ≈ 430m，不触发绕路跳过） */
  const dense = (n: number) =>
    Array.from({ length: n }, (_, i) => mkStore('s' + i, 116.4 + i * 0.005, 39.9))

  it('**限 1h + 拜访 30 分钟：5 家先切碎成单店天，再合并成 [2,3]**', () => {
    // 预算 60 分钟。每家拜访 30 + 驾驶 ~1 → 每家独立成天（[1,1,1,1,1]），
    // mergeSmallDays 把它们合并成两天 [2,3]（实测）。
    // 若 mergeSmallDays 不跑 → 会保留 [1,1,1,1,1]。
    const plan = planRoute(
      opts(dense(5).map((s) => ({ ...s, visitMinutes: 30 })), { dailyLimitHours: 1, maxStoresPerDay: 8 }),
    )
    expect(plan.totalStores, '5 家全规划').toBe(5)
    expect(plan.totalSkipped, '无跳过').toBe(0)
    expect(plan.days.map((d) => d.stores.length), '合并成 [2,3]').toEqual([2, 3])
    expect(shape(plan)).toBe('s0+s1 | s2+s3+s4')
  })

  it('**限 1h + 拜访 40 分钟：全部合并成一天**', () => {
    const plan = planRoute(
      opts(dense(5).map((s) => ({ ...s, visitMinutes: 40 })), { dailyLimitHours: 1, maxStoresPerDay: 8 }),
    )
    expect(plan.days.map((d) => d.stores.length), '合并成 1 天 5 家').toEqual([5])
    expect(shape(plan)).toBe('s0+s1+s2+s3+s4')
  })

  it('**限 2h + 拜访 40 分钟 → [3,2]**', () => {
    const plan = planRoute(
      opts(dense(5).map((s) => ({ ...s, visitMinutes: 40 })), { dailyLimitHours: 2, maxStoresPerDay: 8 }),
    )
    expect(plan.days.map((d) => d.stores.length)).toEqual([3, 2])
    expect(shape(plan)).toBe('s0+s1+s2 | s3+s4')
  })

  it('**限 2h + 拜访 50 分钟 → [2,3]**', () => {
    const plan = planRoute(
      opts(dense(5).map((s) => ({ ...s, visitMinutes: 50 })), { dailyLimitHours: 2, maxStoresPerDay: 8 }),
    )
    expect(plan.days.map((d) => d.stores.length)).toEqual([2, 3])
  })

  it('**首天单店时靠 mergeToNext 合并**（起点远 → 首店吃掉预算）', () => {
    // 起点距 A 约 34km（57 分钟），限 1h → [A],[B],[C]；
    // A 无前一天可并，只能并到后一天 → 实测合并成一天 [A,B,C]。
    // 若「只并前不并后」→ A 永远并不了 → 分布会退化成 [1,2]。
    const stores = [mkStore('A', 116.8, 39.9), mkStore('B', 116.81, 39.9), mkStore('C', 116.82, 39.9)]
    const plan = planRoute(
      opts(stores, {
        startPoint: { lat: 39.9, lon: 116.4 },
        dailyLimitHours: 1,
        maxStoresPerDay: 8,
        maxDetourKm: 5000,
      }),
    )
    expect(plan.totalStores, '3 家全规划').toBe(3)
    expect(plan.days.map((d) => d.stores.length), '合并成一天').toEqual([3])
    expect(shape(plan)).toBe('A+B+C')
  })

  it('**时间上限（limit×1.2）挡住合并：单店天保留**', () => {
    // 预算 2h → 合并上限 144 分钟。拜访 60 → 每天 2 家（120+驾驶）；
    // 单店天并入前一天会变成 3 家 ≈ 180+驾驶 > 144 → 被时间上限挡住 → 保留单店天。
    const p = planRoute(
      opts(dense(5).map((s) => ({ ...s, visitMinutes: 60 })), { dailyLimitHours: 2, maxStoresPerDay: 8 }),
    )
    expect(p.totalStores).toBe(5)
    // 实测 2 家 + 3 家（无单店天——因为首轮切割就是 [2,3]，没有碎片可并）
    expect(p.days.map((d) => d.stores.length)).toEqual([2, 3])
  })
})

/* ═══════════ 驾驶时间兜底反算（真的改变结果） ═══════════ */

describe('驾驶时间兜底反算：改变结果的那个窗口', () => {
  it('**兜底反算把 0 分钟修正为 1 分钟**（roadFactor=1 / 3km/h / ~25m）', () => {
    // 主公式：round(25m × 1 / (3×1000/60 = 50 m/min)) = round(0.499) = 0
    // 兜底反算：round(round(25) / 50) = round(0.5) = 1  ← 取整后的分子跨过 .5 边界
    // 所以这条路真的把 0 修成了 1；若兜底被删 → time 会是 0。
    const p = planRoute(
      opts([mkStore('n', 116.40029, 39.9)], {
        startPoint: { lat: 39.9, lon: 116.4 },
        roadFactor: 1,
        avgSpeedKmh: 3,
      }),
    )
    expect(p.totalDrivingDistanceM, '距离 25m').toBe(25)
    expect(p.totalDrivingTimeMin, '**兜底反算生效：1 分钟**').toBe(1)
  })
})

/* ═══════════ 时间上限（limit×1.2）真的挡合并 ═══════════ */

describe('mergeSmallDays 时间上限挡合并（limit×1.2）', () => {
  /** n 家密集店，指定拜访时长 */
  const denseV = (n: number, visit: number) =>
    Array.from({ length: n }, (_, i) => mkStore('s' + i, 116.4 + i * 0.005, 39.9, { visitMinutes: visit }))

  it('**限 1h + 拜访 80 分钟：时间上限让三家都各自成天**', () => {
    // 预算 1h → 合并上限 = 60 × 1.2 = 72 分钟。
    // 任意两家合并后 = 80（并入店拜访）+ 80（原店）+ 驾驶 > 72 → 全部被挡 → [1,1,1]。
    // 若去掉「prevDayDriving + addedTime <= limitMin * 1.2」这一项（只留 maxDriving 检查），
    // 三家会合并成一天 → 该断言即失败（扫描实测：变异体给 s0+s1+s2）。精确锁定。
    const p = planRoute(opts(denseV(3, 80), { dailyLimitHours: 1, maxStoresPerDay: 8 }))
    expect(p.days.map((d) => d.stores.length), '三家各自成天').toEqual([1, 1, 1])
    expect(shape(p)).toBe('s0 | s1 | s2')
  })

  it('**限 1h + 拜访 80 分钟 + 4 家：同样全被挡**', () => {
    const p = planRoute(opts(denseV(4, 80), { dailyLimitHours: 1, maxStoresPerDay: 8 }))
    expect(shape(p)).toBe('s0 | s1 | s2 | s3')
  })

  it('**起点远 + 限 1h + 拜访 60：首天含驾驶 → 仍需成 [2,1]**', () => {
    // 实测：A+B | C。变异体（去掉时间上限）给 A+B+C。
    const stores = [
      mkStore('A', 116.8, 39.9, { visitMinutes: 60 }),
      mkStore('B', 116.81, 39.9, { visitMinutes: 60 }),
      mkStore('C', 116.82, 39.9, { visitMinutes: 60 }),
    ]
    const p = planRoute(
      opts(stores, {
        startPoint: { lat: 39.9, lon: 116.4 },
        dailyLimitHours: 1,
        maxStoresPerDay: 8,
        maxDetourKm: 5000,
      }),
    )
    expect(shape(p), 'A+B | C（C 并入会超 72 分钟上限）').toBe('A+B | C')
  })

  it('**起点远 + 限 2h + 拜访 100：成 [2,1]**', () => {
    const stores = [
      mkStore('A', 116.8, 39.9, { visitMinutes: 100 }),
      mkStore('B', 116.81, 39.9, { visitMinutes: 100 }),
      mkStore('C', 116.82, 39.9, { visitMinutes: 100 }),
    ]
    const p = planRoute(
      opts(stores, {
        startPoint: { lat: 39.9, lon: 116.4 },
        dailyLimitHours: 2,
        maxStoresPerDay: 8,
        maxDetourKm: 5000,
      }),
    )
    expect(shape(p), 'A+B | C').toBe('A+B | C')
  })
})

/* ═══════════ 平局择优：门店数优先于里程 ═══════════ */

describe('平局择优：门店数优先（不是里程优先）', () => {
  it('**两种排序门店数不同时，取门店数多的那条（哪怕里程长得多）**', () => {
    // 扫描实测：本几何下两种聚类排序的门店数不同——
    //   取门店数多者：4 家全规划，总里程 183647m
    //   若改成「只看里程」（去掉门店数比较）：只剩 1 家，里程 11995m
    // 即**更短里程的方案反而少 3 家店** —— 门店数优先是刻意的产品语义
    //（给用户多排一家店的优先级高于少开几公里）。
    const stores = [
      mkStore('a', 116.0, 39.5),
      mkStore('b', 116.1, 39.6),
      mkStore('c', 116.55, 39.5),
      mkStore('d', 116.5, 39.85),
    ]
    const p = planRoute(
      opts(stores, {
        startPoint: { lat: 39.6, lon: 116.2 },
        maxStoresPerDay: 2,
        maxSegmentKm: 800,
        maxDetourKm: 5000,
        maxDrivingMinutesPerDay: 2400,
      }),
    )
    expect(p.totalStores, '**4 家全规划**（不是里程更短但只 1 家的方案）').toBe(4)
    expect(p.totalDrivingDistanceM, '里程 183647m').toBe(183647)
    expect(p.totalSkipped, '无跳过').toBe(0)
  })

  it('**另一个门店数不同的几何：3 家 vs 2 家**', () => {
    // 扫描实测：真实 3 家（跳过 d，里程 143960）；只看里程的变异体 2 家（跳过 dc，里程 79241）。
    const stores = [
      mkStore('a', 116.0, 39.5),
      mkStore('b', 116.3, 39.75),
      mkStore('c', 116.3, 39.3),
      mkStore('d', 116.8, 39.9),
    ]
    const p = planRoute(
      opts(stores, {
        startPoint: { lat: 39.6, lon: 116.2 },
        maxStoresPerDay: 2,
        maxSegmentKm: 800,
        maxDetourKm: 5000,
        maxDrivingMinutesPerDay: 2400,
      }),
    )
    expect(p.totalStores, '3 家（门店数优先）').toBe(3)
    expect(p.skippedStores.map((s) => s.id), '仅 d 被跳').toEqual(['d'])
    expect(p.totalDrivingDistanceM).toBe(143960)
  })

  it('**门店数相同时才比里程**（密集店全装 → 走里程比较分支）', () => {
    const plan = planRoute(opts(denseStores('s', 4), { maxStoresPerDay: 2, maxSegmentKm: 800 }))
    expect(plan.totalStores).toBe(4)
  })
})

/* ═══════════ enrichAccommodations（导出 API，纯计算无网络） ═══════════ */

describe('enrichAccommodations 住宿区建议', () => {
  const day = (n: number, stores: Store[]) => ({
    day: n,
    stores,
    drivingTimeMin: 0,
    drivingDistanceM: 0,
    accommodation: null,
  })
  const planOf = (days: ReturnType<typeof day>[]) => ({
    days,
    totalStores: days.reduce((a, d) => a + d.stores.length, 0),
    totalSkipped: 0,
    totalDays: days.length,
    totalDrivingTimeMin: 0,
    totalDrivingDistanceM: 0,
    startPoint: { lat: 39.9, lon: 116.4 },
    skippedStores: [],
  })

  it('**空天被跳过**（day.stores 为空 → continue，不产出住宿建议）', async () => {
    const p = planOf([day(1, []), day(2, [mkStore('a', 116.4, 39.9, { city: '北京', district: '海淀' })])])
    const out = await enrichAccommodations(p as never)
    expect(out.days[0].accommodation, '空天不给建议').toBeNull()
    expect(out.days[1].accommodation, '非空天给建议').not.toBeNull()
  })

  it('**取当天最常见的城市作为住宿城市**（多数票，不是最后一家）', async () => {
    const stores = [
      mkStore('a', 116.4, 39.9, { city: '北京', district: '海淀' }),
      mkStore('b', 116.41, 39.9, { city: '北京', district: '海淀' }),
      mkStore('c', 116.42, 39.9, { city: '上海', district: '浦东' }),
    ]
    const p = planOf([day(1, stores)])
    const out = await enrichAccommodations(p as never)
    // 最后一家是上海，但北京 2 票 → 城市取北京；district 取最后一家（浦东）
    expect(out.days[0].accommodation!.name, '名称含北京').toContain('北京')
    expect(out.days[0].accommodation!.name, '名称含最后一家区县浦东').toContain('浦东')
  })

  it('**区县与城市相同时不重复拼接**', async () => {
    const stores = [mkStore('a', 116.4, 39.9, { city: '北京', district: '北京' })]
    const p = planOf([day(1, stores)])
    const out = await enrichAccommodations(p as never)
    const name = out.days[0].accommodation!.name
    expect(name.match(/北京/g)!.length, '只出现一次').toBe(1)
  })

  it('**城市为空时不产出建议**（locationName 为空 → 条件为假）', async () => {
    const stores = [mkStore('a', 116.4, 39.9, { city: '', district: '' })]
    const p = planOf([day(1, stores)])
    const out = await enrichAccommodations(p as never)
    expect(out.days[0].accommodation, '无城市则不给建议').toBeNull()
  })

  it('**无坐标的最后一家不产出建议**（lat/lon 为 null）', async () => {
    const stores = [mkStore('a', null, null, { city: '北京', district: '海淀' })]
    const p = planOf([day(1, stores)])
    const out = await enrichAccommodations(p as never)
    expect(out.days[0].accommodation, '无坐标不给建议').toBeNull()
  })

  it('**建议地址回退到区域名**（lastStore.address 为空时用 locationName）', async () => {
    const stores = [mkStore('a', 116.4, 39.9, { city: '北京', district: '海淀', address: '' })]
    const p = planOf([day(1, stores)])
    const out = await enrichAccommodations(p as never)
    expect(out.days[0].accommodation!.address, '回退用区域名').toBe('北京海淀')
    expect(out.days[0].accommodation!.type).toBe('建议住宿区域')
  })
})
