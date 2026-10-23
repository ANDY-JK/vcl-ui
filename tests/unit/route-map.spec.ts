/**
 * RouteMap.vue — 路线地图（门店标记 / 分天路线 / 起点 / 失败重试 / 防抖重绘）
 *
 * 此前**零覆盖**（0% 语句 / 0% 分支 / 0% 函数）。SDK 边界全部打桩：
 *   - `@vuemap/vue-amap` 的 `ElAmap` 换成薄桩件，由测试手动 `$emit('init', fakeMap)`
 *     模拟「地图就绪」时点（真实 SDK 不可在 happy-dom 里加载）
 *   - 全局 `AMap` 用记录型假类（Marker/Icon/Size/Pixel/InfoWindow/Polyline），
 *     每个实例都留存构造参数，便于断言「用什么坐标、什么颜色、什么文案画的」
 *
 * 断言落在**对外可观测行为**上：传进 SDK 的参数、信息窗内容是否消毒、DOM 分支
 * （loading / failed / empty-guide / legend）、以及 emit 出来的事件。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { mapMarkerIcon, MAP_MARKER_BLUE } from '@/components/_internal/map-marker'
import type { Store, RoutePlan } from '@/components/route-planner/types'

// ── 假地图实例：记录 add/clearMap/setFitView ──
const h = vi.hoisted(() => ({
  markers: [] as Array<Record<string, unknown> & { handlers: Record<string, () => void> }>,
  icons: [] as Array<Record<string, unknown>>,
  sizes: [] as Array<[number, number]>,
  pixels: [] as Array<[number, number]>,
  infoWindows: [] as Array<Record<string, unknown>>,
  polylines: [] as Array<Record<string, unknown>>,
  map: {
    added: [] as unknown[],
    clearMapCalls: 0,
    fitViews: [] as unknown[][],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clearMap(this: any) {
      this.clearMapCalls++
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    add(this: any, o: unknown) {
      this.added.push(o)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setFitView(this: any, ...a: unknown[]) {
      this.fitViews.push(a)
    },
  },
  ensureInit: [] as unknown[][],
}))

vi.mock('@vuemap/vue-amap', () => ({
  // 薄桩件：只负责被找到并让测试手动 emit('init')。用**普通对象**而非 defineComponent，
  // 避免触发 vue/one-component-per-file（全仓 warning 正压在阈值上）
  ElAmap: {
    name: 'ElAmap',
    props: { center: { type: Array, default: null }, zoom: { type: Number, default: 0 } },
    render: () => null,
  },
}))
vi.mock('@/components/amap', () => ({
  getAmapJsKey: () => 'test-js-key',
  getAmapSecurityCode: () => 'test-secret',
}))
vi.mock('@/components/amap/amap-loader', () => ({
  amapLoader: { ensureInit: (...a: unknown[]) => h.ensureInit.push(a) },
}))

/** 假 AMap：每个类都记录构造参数，Marker 额外支持 on() 以便触发信息窗 */
function installFakeAMap(): void {
  class Marker {
    opts: Record<string, unknown>
    handlers: Record<string, () => void> = {}
    constructor(opts: Record<string, unknown>) {
      this.opts = opts
      h.markers.push(this as never)
    }
    on(ev: string, cb: () => void) {
      this.handlers[ev] = cb
    }
  }
  class Icon {
    opts: Record<string, unknown>
    constructor(opts: Record<string, unknown>) {
      this.opts = opts
      h.icons.push(opts)
    }
  }
  class Size {
    constructor(public w: number, public hh: number) {
      h.sizes.push([w, hh])
    }
  }
  class Pixel {
    constructor(public x: number, public y: number) {
      h.pixels.push([x, y])
    }
  }
  class InfoWindow {
    opts: Record<string, unknown>
    openedAt: unknown[] | null = null
    constructor(opts: Record<string, unknown>) {
      this.opts = opts
      // 记录**实例**（不是 opts）：否则拿不到 open() 有没有被调用
      h.infoWindows.push(this as never)
    }
    open(map: unknown, pos: unknown) {
      this.openedAt = [map, pos]
    }
  }
  class Polyline {
    opts: Record<string, unknown>
    constructor(opts: Record<string, unknown>) {
      this.opts = opts
      h.polylines.push(opts)
    }
  }
  ;(globalThis as Record<string, unknown>).AMap = { Marker, Icon, Size, Pixel, InfoWindow, Polyline }
}

const { default: RouteMap } = await import('@/components/route-planner/RouteMap.vue')
const t = useT()

const store = (over: Partial<Store> = {}): Store => ({
  id: 's1',
  name: '门店甲',
  address: '望京街 1 号',
  province: '北京市',
  city: '北京市',
  district: '朝阳区',
  town: '望京',
  contact: '张三',
  phone: '13800000000',
  longitude: 116.48,
  latitude: 39.99,
  coordSource: 'original',
  skipped: false,
  ...over,
})

const plan = (over: Partial<RoutePlan> = {}): RoutePlan =>
  ({
    days: [
      {
        day: 1,
        stores: [store({ id: 'a', name: '甲', longitude: 116.1, latitude: 39.1 })],
        drivingTimeMin: 0,
        drivingDistanceM: 0,
        accommodation: null,
        routePolyline: [
          [116.1, 39.1],
          [116.2, 39.2],
        ],
      },
    ],
    startPoint: { lon: 116.0, lat: 39.0 },
    ...over,
  }) as unknown as RoutePlan

let wrapper: VueWrapper | null = null

function mountMap(props: { stores?: Store[]; plan?: RoutePlan | null } = {}): VueWrapper {
  wrapper = mount(RouteMap, {
    props: { stores: props.stores ?? [], plan: props.plan ?? null },
    attachTo: document.body,
  })
  return wrapper
}

/** 模拟地图就绪：ElAmap 把实例交回宿主 */
async function ready(w: VueWrapper): Promise<void> {
  w.findComponent({ name: 'ElAmap' }).vm.$emit('init', h.map)
  await nextTick()
}

beforeEach(() => {
  h.markers.length = 0
  h.icons.length = 0
  h.sizes.length = 0
  h.pixels.length = 0
  h.infoWindows.length = 0
  h.polylines.length = 0
  h.map.added.length = 0
  h.map.clearMapCalls = 0
  h.map.fitViews.length = 0
  h.ensureInit.length = 0
  installFakeAMap()
  delete (window as unknown as Record<string, unknown>)._AMapSecurityConfig
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/* ═══════════ 初始化与安全配置 ═══════════ */

describe('初始化与安全配置', () => {
  it('**挂载即触发 ensureInit（用 js key）**', () => {
    mountMap()
    expect(h.ensureInit.length, '应在 setup 里初始化 SDK').toBeGreaterThan(0)
    expect(h.ensureInit[0], '应传入 js key').toEqual(['test-js-key'])
  })

  it('**安全密钥：宿主未配置时写入 _AMapSecurityConfig**', () => {
    mountMap()
    const cfg = (window as unknown as Record<string, Record<string, unknown>>)._AMapSecurityConfig
    expect(cfg, '应写入安全配置').toBeTruthy()
    expect(cfg.securityJsCode).toBe('test-secret')
  })

  it('**不覆盖宿主已有的安全配置**（混用组件时后者不得抹掉有效值）', () => {
    ;(window as unknown as Record<string, unknown>)._AMapSecurityConfig = { securityJsCode: 'host-own' }
    mountMap()
    const cfg = (window as unknown as Record<string, Record<string, unknown>>)._AMapSecurityConfig
    expect(cfg.securityJsCode, '已有值不该被覆盖').toBe('host-own')
  })

  it('**未就绪时显示 loading，就绪后消失**', async () => {
    const w = mountMap({ stores: [store()] })
    expect(w.find('.map-loading').exists(), '未就绪应有 loading').toBe(true)
    expect(w.text(), '应显示加载文案').toContain(t('routePlanner.mapLoading'))

    await ready(w)
    expect(w.find('.map-loading').exists(), '就绪后 loading 应消失').toBe(false)
  })

  it('**就绪后无数据 → 显示空数据引导**', async () => {
    const w = mountMap({ stores: [], plan: null })
    await ready(w)
    expect(w.find('.map-empty-guide').exists()).toBe(true)
    expect(w.text()).toContain(t('routePlanner.mapEmpty'))
    expect(w.text()).toContain(t('routePlanner.mapGuide'))
  })

  it('**只有计划、没有门店 → 也算有内容**（hasContent 两个来源都要能单独成立）', async () => {
    const w = mountMap({ stores: [], plan: plan() })
    await ready(w)
    expect(w.find('.map-empty-guide').exists(), '有计划时不该显示空数据引导').toBe(false)
  })

  it('**就绪且有数据 → 不显示空数据引导**', async () => {
    const w = mountMap({ stores: [store()] })
    await ready(w)
    expect(w.find('.map-empty-guide').exists()).toBe(false)
  })

  it('**未就绪时 props 变化 → 重绘入口安全早退（不碰空实例）**', async () => {
    const w = mountMap({ stores: [store()] })
    // 还没 emit init 就改门店：watch 会调 renderAll，此时 mapInstance 为 null
    await w.setProps({ stores: [store(), store({ id: 'b', name: '乙' })] })
    await nextTick()
    await nextTick()
    expect(h.map.clearMapCalls, '未就绪不该操作地图').toBe(0)
    expect(w.find('.map-loading').exists(), '仍处于 loading').toBe(true)
  })

  it('**就绪即渲染：先 clearMap，最后 setFitView 自适应视野**', async () => {
    const w = mountMap({ stores: [store()] })
    await ready(w)
    expect(h.map.clearMapCalls, '重绘前应清图').toBe(1)
    expect(h.map.fitViews.length, '应自适应视野').toBe(1)
    expect(h.map.fitViews[0], '四边留 60 像素').toEqual([null, false, [60, 60, 60, 60]])
  })
})

/* ═══════════ 地图中心 ═══════════ */

describe('地图中心', () => {
  const center = async (props: { stores?: Store[]; plan?: RoutePlan | null }) => {
    const w = mountMap(props)
    const el = w.findComponent({ name: 'ElAmap' })
    return el.props('center') as [number, number]
  }

  it('**无数据 → 默认中心（长沙）**', async () => {
    expect(await center({})).toEqual([112.9388, 28.2282])
  })

  it('**有计划起点 → 用起点坐标**', async () => {
    expect(await center({ plan: plan() })).toEqual([116.0, 39.0])
  })

  it('**无计划 → 取有坐标门店的几何中心**', async () => {
    const c = await center({
      stores: [
        store({ id: 'a', longitude: 116.0, latitude: 39.0 }),
        store({ id: 'b', longitude: 118.0, latitude: 41.0 }),
      ],
    })
    expect(c).toEqual([117.0, 40.0])
  })

  it('**坐标为 null 的门店不参与中心计算**', async () => {
    const c = await center({
      stores: [
        store({ id: 'a', longitude: 116.0, latitude: 39.0 }),
        store({ id: 'b', longitude: null, latitude: null }),
      ],
    })
    expect(c, '平均只算有坐标的那家').toEqual([116.0, 39.0])
  })

  it('**计划起点存在但为 0 值仍优先于门店**（起点是显式指定）', async () => {
    const c = await center({ plan: plan({ startPoint: { lon: 0, lat: 0 } }), stores: [store()] })
    expect(c).toEqual([0, 0])
  })
})

/* ═══════════ 标记与路线渲染 ═══════════ */

describe('标记与路线渲染', () => {
  it('**无计划：每个有坐标门店一个 Marker，title 用门店名**', async () => {
    const w = mountMap({
      stores: [store({ id: 'a', name: '甲' }), store({ id: 'b', name: '乙', longitude: 117, latitude: 40 })],
    })
    await ready(w)
    expect(h.markers.length, '两家门店两个标记').toBe(2)
    expect(h.markers.map((m) => m.opts.title)).toEqual(['甲', '乙'])
    expect(h.markers[0]!.opts.position, '坐标原样传入').toEqual([116.48, 39.99])
    expect(h.map.added.length, '标记应全部 add 到地图').toBe(2)
  })

  it('**无计划：坐标为 null 的门店不画点**', async () => {
    const w = mountMap({
      stores: [store({ id: 'a' }), store({ id: 'b', longitude: null, latitude: null })],
    })
    await ready(w)
    expect(h.markers.length, '只画有坐标的').toBe(1)
  })

  it('**有计划：先画起点针（Icon/Size/Pixel 与蓝色针图）**', async () => {
    const w = mountMap({ plan: plan() })
    await ready(w)
    const start = h.markers[0]!
    expect(start.opts.title, '起点标记带独占标题').toBe(t('routePlanner.startEnd'))
    expect(start.opts.position).toEqual([116.0, 39.0])
    expect(h.icons[0]!.image, '起点针用蓝色标记图（原主题图已 404）').toBe(mapMarkerIcon(MAP_MARKER_BLUE))
    expect(h.pixels[0], '起点针左上偏移 (-15,-15) 使其居中').toEqual([-15, -15])
    expect(h.sizes.some(([a, b]) => a === 30 && b === 30), '图标尺寸 30×30').toBe(true)
  })

  it('**有计划：按天画门店标记与路线折线（颜色按天取色）**', async () => {
    const w = mountMap({ plan: plan() })
    await ready(w)
    expect(h.polylines.length, '一天的路线一条折线').toBe(1)
    expect(h.polylines[0]!.strokeColor, '第 1 天用调色板首色').toBe('#3b82f6')
    expect(h.polylines[0]!.strokeWeight, '线宽 4').toBe(4)
    expect(h.polylines[0]!.strokeOpacity, '透明度 0.8').toBe(0.8)
    expect(h.polylines[0]!.path).toEqual([
      [116.1, 39.1],
      [116.2, 39.2],
    ])
  })

  it('**路线只有 1 个点 → 不画折线**（画不出线段）', async () => {
    const p = plan()
    p.days[0]!.routePolyline = [[116.1, 39.1]]
    const w = mountMap({ plan: p })
    await ready(w)
    expect(h.polylines.length).toBe(0)
  })

  it('**无 routePolyline → 不画折线**', async () => {
    const p = plan()
    delete p.days[0]!.routePolyline
    const w = mountMap({ plan: p })
    await ready(w)
    expect(h.polylines.length).toBe(0)
  })

  it('**当天门店坐标为 null → 不画点但仍画路线**', async () => {
    const p = plan()
    p.days[0]!.stores = [store({ id: 'a', longitude: null, latitude: null })]
    const w = mountMap({ plan: p })
    await ready(w)
    expect(h.markers.length, '只有起点针').toBe(1)
    expect(h.polylines.length, '路线照画').toBe(1)
  })

  it('**调色板按天循环**（第 15 天回到首色）', async () => {
    const p = plan()
    p.days = [15].map((d) => ({
      day: d,
      stores: [],
      drivingTimeMin: 0,
      drivingDistanceM: 0,
      accommodation: null,
      routePolyline: [
        [1, 1],
        [2, 2],
      ],
    }))
    const w = mountMap({ plan: p })
    await ready(w)
    expect(h.polylines[0]!.strokeColor, '14 色循环').toBe('#3b82f6')
  })
})

/* ═══════════ 信息窗 ═══════════ */

describe('信息窗', () => {
  it('**点击门店标记 → 建信息窗并 open 到该坐标**', async () => {
    const w = mountMap({ stores: [store({ name: '甲店' })] })
    await ready(w)
    h.markers[0]!.handlers.click!()

    expect(h.infoWindows.length).toBe(1)
    expect(h.infoWindows[0]!.opts.content, '应含门店名').toContain('甲店')
    expect(h.infoWindows[0]!.opts.offset, '上移 28px 不压住标记').toBeTruthy()
    expect(h.pixels[h.pixels.length - 1], '信息窗偏移 (0,-28)').toEqual([0, -28])
  })

  it('**信息窗内容经消毒**（门店名/地址来自 Excel 导入，属外部输入）', async () => {
    const w = mountMap({ stores: [store({ name: '<img src=x onerror=alert(1)>恶意' })] })
    await ready(w)
    h.markers[0]!.handlers.click!()
    const content = String(h.infoWindows[0]!.opts.content)
    expect(content, '不该残留事件属性').not.toContain('onerror')
    expect(content, '不该残留原始 img 标签').not.toContain('<img src=x')
  })

  it('**无计划分支的信息窗含地址与城市/区**', async () => {
    const w = mountMap({ stores: [store({ address: '望京街 1 号', city: '北京市', district: '朝阳区' })] })
    await ready(w)
    h.markers[0]!.handlers.click!()
    const content = String(h.infoWindows[0]!.opts.content)
    expect(content).toContain('望京街 1 号')
    expect(content).toContain('北京市')
    expect(content).toContain('朝阳区')
  })

  it('**计划分支的信息窗：同样消毒、同样偏移、并且真的 open 到该坐标**', async () => {
    const p = plan()
    p.days[0]!.stores = [store({ id: 'a', name: '<b onerror=alert(1)>坏名字', address: '望京街 1 号', longitude: 116.1, latitude: 39.1 })]
    const w = mountMap({ plan: p })
    await ready(w)
    h.markers[1]!.handlers.click!()

    const win = h.infoWindows[0] as unknown as { openedAt: unknown[] | null }
    expect(win.openedAt, '计划分支也要真的把信息窗打开').toBeTruthy()
    expect(win.openedAt![1], 'open 到该门店坐标').toEqual([116.1, 39.1])
    expect(h.pixels[h.pixels.length - 1], '信息窗偏移 (0,-28)').toEqual([0, -28])
    const content = String(h.infoWindows[0]!.opts.content)
    expect(content, '计划分支的门店名同样要消毒').not.toContain('onerror')
    expect(content, '不该残留原始标签').not.toContain('<b onerror')
  })

  it('**有计划分支的信息窗带第几天 + 当天第几个**', async () => {
    const p = plan()
    const w = mountMap({ plan: p })
    await ready(w)
    // markers[0] 是起点针；markers[1] 是当天首家门店
    h.markers[1]!.handlers.click!()
    const content = String(h.infoWindows[0]!.opts.content)
    expect(content, '应含天数与序号').toContain(String(t('routePlanner.mapInfoWindow', { day: 1, idx: 1 }).slice(0, 2)))
  })

  // 注意：非计划分支是**分行**渲染（📍 地址 / 🏙️ 城市 区），并没有「地址空→回退城市」；
  // 三级回退只发生在计划分支（📍 address || city || ''）。两条分开如实断言，别互相冒充。
  it('**非计划分支：地址与城市/区分行渲染**（城市不靠地址回退）', async () => {
    const w = mountMap({ stores: [store({ address: '', city: '南京市', district: '鼓楼区' })] })
    await ready(w)
    h.markers[0]!.handlers.click!()
    const content = String(h.infoWindows[0]!.opts.content)
    expect(content, '城市单独一行也要出现').toContain('南京市')
    expect(content, '区也要出现').toContain('鼓楼区')
  })

  it('**有计划分支同样三级回退**（地址空→城市；都空→空串不出现 undefined）', async () => {
    const p1 = plan()
    p1.days[0]!.stores = [store({ id: 'a', name: '甲', address: '', city: '南京市', longitude: 116.1, latitude: 39.1 })]
    const w1 = mountMap({ plan: p1 })
    await ready(w1)
    h.markers[1]!.handlers.click!()
    expect(String(h.infoWindows[0]!.opts.content), '应回退到城市').toContain('南京市')
    w1.unmount()
    wrapper = null
    h.markers.length = 0
    h.infoWindows.length = 0

    const p2 = plan()
    p2.days[0]!.stores = [store({ id: 'a', name: '甲', address: '', city: '', longitude: 116.1, latitude: 39.1 })]
    const w2 = mountMap({ plan: p2 })
    await ready(w2)
    h.markers[1]!.handlers.click!()
    expect(String(h.infoWindows[0]!.opts.content), '都空时不该出现 undefined').not.toContain('undefined')
  })

  it('**非计划分支：地址/城市/区都空时不该出现 undefined**', async () => {
    const w = mountMap({ stores: [store({ address: '', city: '', district: '' })] })
    await ready(w)
    h.markers[0]!.handlers.click!()
    const content = String(h.infoWindows[0]!.opts.content)
    expect(content, '空值应回退空串').not.toContain('undefined')
  })
})

/* ═══════════ 防抖重绘 ═══════════ */

describe('防抖重绘', () => {
  it('**plan 变化 → 600ms 后重绘；期间连续变化只重绘一次**', async () => {
    vi.useFakeTimers()
    const w = mountMap({ stores: [store()] })
    await ready(w)
    const before = h.map.clearMapCalls

    await w.setProps({ plan: plan() })
    await w.setProps({ plan: plan({ startPoint: { lon: 115, lat: 38 } }) })
    expect(h.map.clearMapCalls, '防抖期内不该重绘').toBe(before)

    // 关键：先推进到**未满防抖**，确认确实在等 600ms（否则把时长改成 10ms 也测不出来）
    vi.advanceTimersByTime(500)
    await nextTick()
    expect(h.map.clearMapCalls, '未满 600ms 不该重绘').toBe(before)

    vi.advanceTimersByTime(100)
    await nextTick()
    expect(h.map.clearMapCalls, '600ms 后重绘一次').toBe(before + 1)
  })

  it('**deep 监听：原地改 plan 内部字段也能触发重绘**（上游回填不换引用）', async () => {
    vi.useFakeTimers()
    // 必须用 ref 持有：真实宿主就是这么放的。传普通对象时深层赋值不会被响应式捕获，
    // 那样即使把 watch 的 deep 去掉本用例也照样通过（假绿）。
    const p = ref(plan())
    const w = mountMap({ stores: [store()], plan: p.value })
    await ready(w)
    const before = h.map.clearMapCalls

    p.value.days[0]!.routePolyline = [
      [1, 1],
      [3, 3],
    ]
    await nextTick()
    vi.advanceTimersByTime(600)
    await nextTick()
    expect(h.map.clearMapCalls, '原地回填应触发重绘').toBeGreaterThan(before)
  })

  it('**stores 变化 → nextTick 后重绘（无防抖）**', async () => {
    const w = mountMap({ stores: [store()] })
    await ready(w)
    const before = h.map.clearMapCalls

    await w.setProps({ stores: [store(), store({ id: 'b', name: '乙' })] })
    await nextTick()
    await nextTick()
    expect(h.map.clearMapCalls, '门店变化应重绘').toBeGreaterThan(before)
  })

  it('**卸载后不再重绘**（pending 的防抖回调必须被清掉）', async () => {
    vi.useFakeTimers()
    const w = mountMap({ stores: [store()] })
    await ready(w)
    const before = h.map.clearMapCalls

    await w.setProps({ plan: plan() })
    w.unmount()
    wrapper = null
    vi.advanceTimersByTime(600)
    await nextTick()
    expect(h.map.clearMapCalls, '卸载后不该再操作地图').toBe(before)
  })
})

/* ═══════════ 失败态与重试 ═══════════ */

describe('失败态与重试', () => {
  it('**15s 未就绪 → 失败态 + 重试按钮**（spinner 永远转圈不如给出口）', async () => {
    vi.useFakeTimers()
    const w = mountMap()
    expect(w.find('.map-failed').exists(), '15s 内不该判失败').toBe(false)

    vi.advanceTimersByTime(15000)
    await nextTick()
    expect(w.find('.map-failed').exists(), '超时应显示失败态').toBe(true)
    expect(w.find('.map-retry-btn').exists(), '应给重试按钮').toBe(true)
    expect(w.text()).toContain(t('routePlanner.mapLoadFail'))
  })

  it('**就绪后不再判失败**', async () => {
    vi.useFakeTimers()
    const w = mountMap()
    await ready(w)
    vi.advanceTimersByTime(20000)
    await nextTick()
    expect(w.find('.map-failed').exists(), '已就绪不该判失败').toBe(false)
  })

  it('**重试期间若已就绪 → 该周期结束不判失败**', async () => {
    vi.useFakeTimers()
    const w = mountMap({ stores: [store()] })
    vi.advanceTimersByTime(15000)
    await nextTick()
    await w.find('.map-retry-btn').trigger('click')

    // 重试后地图就绪，再走完一整个超时周期
    await ready(w)
    vi.advanceTimersByTime(15000)
    await nextTick()
    expect(w.find('.map-failed').exists(), '已就绪不该被判失败').toBe(false)
  })

  it('**点重试：清失败态、重开计时、再次 ensureInit**', async () => {
    vi.useFakeTimers()
    const w = mountMap()
    vi.advanceTimersByTime(15000)
    await nextTick()
    const initBefore = h.ensureInit.length

    await w.find('.map-retry-btn').trigger('click')
    expect(w.find('.map-failed').exists(), '重试后失败态应立即消失').toBe(false)
    expect(h.ensureInit.length, '重试应再次初始化 SDK').toBeGreaterThan(initBefore)

    vi.advanceTimersByTime(15000)
    await nextTick()
    expect(w.find('.map-failed').exists(), '仍不就绪则再次判失败').toBe(true)
  })
})

/* ═══════════ 图例 ═══════════ */

describe('图例', () => {
  it('**有 days → 每天一个图例项，颜色与画线一致**', async () => {
    const w = mountMap({ plan: plan() })
    await ready(w)
    const items = w.findAll('.legend-item')
    expect(items.length).toBe(1)
    const dot = items[0]!.find('.legend-color')
    expect(dot.attributes('style'), '图例色应与折线首色一致').toContain('#3b82f6')
    expect(items[0]!.text()).toContain(String(1))
  })

  it('**无 plan → 不渲染图例**', async () => {
    const w = mountMap({ stores: [store()] })
    await ready(w)
    expect(w.find('.map-legend').exists()).toBe(false)
  })

  it('**plan 有但 days 为空 → 不渲染图例**', async () => {
    const w = mountMap({ plan: plan({ days: [] }) })
    await ready(w)
    expect(w.find('.map-legend').exists(), '空 days 不显示图例').toBe(false)
  })

  it('**多天图例各用各自的颜色**', async () => {
    const p = plan()
    p.days = [1, 2].map((d) => ({
      day: d,
      stores: [],
      drivingTimeMin: 0,
      drivingDistanceM: 0,
      accommodation: null,
    }))
    const w = mountMap({ plan: p })
    await ready(w)
    const dots = w.findAll('.legend-color')
    expect(dots.length).toBe(2)
    expect(dots[0]!.attributes('style')).toContain('#3b82f6')
    expect(dots[1]!.attributes('style')).toContain('#ef4444')
  })
})