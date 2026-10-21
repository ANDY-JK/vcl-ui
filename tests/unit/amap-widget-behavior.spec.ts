// AmapWidget 组件级行为锁定（2026-10-21，审查 6.2 #5「补覆盖洼地」）
//
// 补的同样是**整层缺失的测试**：`AmapWidget.vue`（265 行）此前**从未被挂载过** ——
// 仓里唯一的 widget 测试 `amap-widget-sanitize.spec.ts` 是 `readFileSync` + 正则读源码。
// 覆盖数据因此显示 **函数 0/18、语句 19%、分支 7%**：所有 marker 增删、事件回传、
// 插件挂载、infoWindow 打开、center/zoom 联动全都没被测过。
//
// 手法：mock `@vuemap/vue-amap` 的 ElAmap（挂载后立刻 emit('init', fakeMap)）、
// mock amap-key / amap-loader，并用一个假的 `globalThis.AMap` 命名空间提供
// Marker / Icon / InfoWindow / Pixel / ToolBar / Scale 构造器。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, onMounted } from 'vue'
import { nextTick } from 'vue'

// ── 假 AMap 实例与命名空间 ──
interface FakeMarker {
  opts: Record<string, unknown>
  _handlers: Record<string, () => void>
  on: (ev: string, cb: () => void) => void
  getPosition: () => [number, number]
}
interface FakeInfoWindow {
  content: string | null
  opened: boolean
  setContent: (c: string) => void
  open: () => void
  close: () => void
}
interface FakeMap {
  _plugins: string[]
  _controls: unknown[]
  _added: unknown[]
  _removed: unknown[]
  _handlers: Record<string, (e: unknown) => void>
  plugin: (list: string[], cb: () => void) => void
  addControl: (c: unknown) => void
  add: (m: unknown) => void
  remove: (m: unknown) => void
  on: (ev: string, cb: (e: unknown) => void) => void
  setCenter: ReturnType<typeof vi.fn>
  setZoom: ReturnType<typeof vi.fn>
  setZoomAndCenter: ReturnType<typeof vi.fn>
}

let fakeMap: FakeMap
let markers: FakeMarker[]
let infoWindows: FakeInfoWindow[]

function makeFakeMap(): FakeMap {
  const m: FakeMap = {
    _plugins: [],
    _controls: [],
    _added: [],
    _removed: [],
    _handlers: {},
    plugin(list, cb) {
      m._plugins.push(...list)
      cb()
    },
    addControl: (c) => m._controls.push(c),
    add: (x) => m._added.push(x),
    remove: (x) => m._removed.push(x),
    on(ev, cb) {
      m._handlers[ev] = cb
    },
    setCenter: vi.fn(),
    setZoom: vi.fn(),
    setZoomAndCenter: vi.fn(),
  }
  return m
}

/** 假的全局 AMap 命名空间（组件里按 `AMap.Marker` 等取用） */
function installFakeAmap(): void {
  class Marker implements FakeMarker {
    opts: Record<string, unknown>
    _handlers: Record<string, () => void> = {}
    constructor(opts: Record<string, unknown>) {
      this.opts = opts
      markers.push(this)
    }
    on(ev: string, cb: () => void) {
      this._handlers[ev] = cb
    }
    getPosition() {
      return [0, 0] as [number, number]
    }
  }
  class Icon {
    constructor(public opts: Record<string, unknown>) {}
  }
  class InfoWindow implements FakeInfoWindow {
    content: string | null = null
    opened = false
    constructor(public opts: Record<string, unknown>) {
      infoWindows.push(this)
    }
    setContent(c: string) {
      this.content = c
    }
    open() {
      this.opened = true
    }
    close() {
      this.opened = false
    }
  }
  class Pixel {
    constructor(public x: number, public y: number) {}
  }
  class ToolBar {}
  class Scale {}
  ;(globalThis as Record<string, unknown>).AMap = { Marker, Icon, InfoWindow, Pixel, ToolBar, Scale }
}

vi.mock('@vuemap/vue-amap', () => ({
  // 桩件：挂载即报告 init，模拟 vue-amap 把地图实例交给宿主
  ElAmap: defineComponent({
    name: 'ElAmap',
    props: { center: { type: Array, default: null }, zoom: { type: Number, default: 0 }, mapStyle: { type: String, default: '' } },
    emits: ['init'],
    setup(_props, { emit }) {
      onMounted(() => emit('init', fakeMap))
      return () => h('div', { class: 'fake-el-amap' })
    },
  }),
}))
vi.mock('@/components/amap/amap-key', () => ({
  getAmapJsKey: () => 'test-js-key',
  getAmapSecurityCode: () => '',
}))
const ensureInit = vi.fn()
vi.mock('@/components/amap/amap-loader', () => ({
  amapLoader: { ensureInit: (...a: unknown[]) => ensureInit(...a) },
}))

const { default: AmapWidget } = await import('@/components/amap/AmapWidget.vue')

const CENTER: [number, number] = [116.397428, 39.90923]

function mountWidget(props: Record<string, unknown> = {}): VueWrapper {
  return mount(AmapWidget, { props: { center: CENTER, ...props }, attachTo: document.body })
}

beforeEach(() => {
  fakeMap = makeFakeMap()
  markers = []
  infoWindows = []
  ensureInit.mockClear()
  installFakeAmap()
  document.body.innerHTML = ''
})
afterEach(() => {
  vi.clearAllMocks()
  delete (globalThis as Record<string, unknown>).AMap
})

describe('AmapWidget · 初始化', () => {
  it('挂载时用当前 JS Key 调 amapLoader.ensureInit', () => {
    const w = mountWidget()
    expect(ensureInit).toHaveBeenCalledWith('test-js-key')
    w.unmount()
  })

  it('地图 init 后 emit ready 并暴露 getMap', async () => {
    const w = mountWidget()
    await nextTick()
    expect(w.emitted('ready'), 'ready 应带地图实例').toBeTruthy()
    expect(w.emitted('ready')![0]![0]).toBe(fakeMap)
    // defineExpose.getMap 能取到同一实例
    expect((w.vm as unknown as { getMap: () => unknown }).getMap()).toBe(fakeMap)
    w.unmount()
  })

  it('容器有 role=region 与带标记数的 aria-label', async () => {
    const w = mountWidget({ markers: [{ longitude: 1, latitude: 2, title: 'A' }] })
    await nextTick()
    const el = w.find('[role="region"]')
    expect(el.exists()).toBe(true)
    expect(el.attributes('aria-label')).toBeTruthy()
    w.unmount()
  })
})

describe('AmapWidget · 插件挂载', () => {
  it('默认 showToolBar + showScale → 申请两个插件并各挂一个控件', async () => {
    const w = mountWidget()
    await nextTick()
    expect(fakeMap._plugins).toEqual(['AMap.ToolBar', 'AMap.Scale'])
    expect(fakeMap._controls.length).toBe(2)
    w.unmount()
  })

  it('两者都关 → 不申请插件、不挂控件', async () => {
    const w = mountWidget({ showToolBar: false, showScale: false })
    await nextTick()
    expect(fakeMap._plugins).toEqual([])
    expect(fakeMap._controls.length).toBe(0)
    w.unmount()
  })
})

describe('AmapWidget · 标记增删', () => {
  it('初始 markers 全部 add 到地图', async () => {
    const w = mountWidget({
      markers: [
        { longitude: 1, latitude: 2, title: 'A' },
        { longitude: 3, latitude: 4, title: 'B' },
      ],
    })
    await nextTick()
    await nextTick()
    expect(markers.length, '应创建两个 Marker').toBe(2)
    expect(fakeMap._added.length).toBe(2)
    w.unmount()
  })

  it('markers 变化 → 先 remove 旧的再 add 新的（不重复堆积）', async () => {
    const w = mountWidget({ markers: [{ longitude: 1, latitude: 2, title: 'A' }] })
    await nextTick()
    await nextTick()
    expect(fakeMap._added.length).toBe(1)

    await w.setProps({ markers: [{ longitude: 9, latitude: 9, title: 'B' }] })
    await nextTick()
    await nextTick()
    expect(fakeMap._removed.length, '旧标记应被移除').toBe(1)
    expect(fakeMap._added.length).toBe(2)
    w.unmount()
  })

  it('markers 为空数组 → 不创建标记', async () => {
    const w = mountWidget({ markers: [] })
    await nextTick()
    expect(markers.length).toBe(0)
    w.unmount()
  })
})

describe('AmapWidget · 事件回传', () => {
  it('点标记 → emit marker-click（带对象与序号）', async () => {
    const item = { longitude: 1, latitude: 2, title: 'A' }
    const w = mountWidget({ markers: [item] })
    await nextTick()
    await nextTick()
    markers[0]._handlers.click?.()
    const ev = w.emitted('marker-click')
    expect(ev).toBeTruthy()
    expect(ev![0]![0]).toEqual(item)
    expect(ev![0]![1]).toBe(0)
    w.unmount()
  })

  it('点标记带 infoWindow → setContent 收到**已消毒**内容（剥掉 script）', async () => {
    const w = mountWidget({
      markers: [{ longitude: 1, latitude: 2, title: 'A', infoWindow: '<b>店名</b><script>alert(1)</script>' }],
    })
    await nextTick()
    await nextTick()
    markers[0]._handlers.click?.()
    const c = infoWindows[0]?.content ?? ''
    expect(c, '应保留白名单标签').toContain('<b>店名</b>')
    expect(c, 'script 必须被剥掉').not.toContain('alert(1)')
    expect(infoWindows[0].opened, '应打开信息窗').toBe(true)
    w.unmount()
  })

  it('点标记**不带** infoWindow → 不打开信息窗', async () => {
    const w = mountWidget({ markers: [{ longitude: 1, latitude: 2, title: 'A' }] })
    await nextTick()
    await nextTick()
    markers[0]._handlers.click?.()
    expect(infoWindows[0]?.opened ?? false).toBe(false)
    w.unmount()
  })

  it('点地图 → emit map-click(lng, lat)', async () => {
    const w = mountWidget()
    await nextTick()
    fakeMap._handlers.click?.({ lnglat: { getLng: () => 120.5, getLat: () => 30.25 } })
    const ev = w.emitted('map-click')
    expect(ev![0]).toEqual([120.5, 30.25])
    w.unmount()
  })

  it('点地图但事件无 lnglat → 不 emit（不抛错）', async () => {
    const w = mountWidget()
    await nextTick()
    expect(() => fakeMap._handlers.click?.({})).not.toThrow()
    expect(w.emitted('map-click')).toBeUndefined()
    w.unmount()
  })
})

describe('AmapWidget · center / zoom 联动', () => {
  it('center 变化 → setCenter', async () => {
    const w = mountWidget()
    await nextTick()
    await w.setProps({ center: [120, 30] })
    await nextTick()
    expect(fakeMap.setCenter).toHaveBeenCalledWith([120, 30])
    w.unmount()
  })

  it('zoom 变化 → setZoom', async () => {
    const w = mountWidget()
    await nextTick()
    await w.setProps({ zoom: 16 })
    await nextTick()
    expect(fakeMap.setZoom).toHaveBeenCalledWith(16)
    w.unmount()
  })
})

describe('AmapWidget · defineExpose API', () => {
  type Exposed = {
    setZoomAndCenter: (z: number, c: [number, number]) => void
    openInfoWindow: (content: string, pos: [number, number]) => void
    closeInfoWindow: () => void
    clearMarkers: () => void
  }

  it('openInfoWindow 同样消毒内容', async () => {
    const w = mountWidget()
    await nextTick()
    ;(w.vm as unknown as Exposed).openInfoWindow('<i>ok</i><script>x</script>', [1, 2])
    const c = infoWindows[0]?.content ?? ''
    expect(c).toContain('<i>ok</i>')
    expect(c).not.toContain('<script>')
    expect(infoWindows[0].opened).toBe(true)
    w.unmount()
  })

  it('closeInfoWindow / setZoomAndCenter 透传到实例', async () => {
    const w = mountWidget()
    await nextTick()
    const api = w.vm as unknown as Exposed
    api.setZoomAndCenter(15, [1, 2])
    expect(fakeMap.setZoomAndCenter).toHaveBeenCalledWith(15, [1, 2])
    api.openInfoWindow('x', [1, 2])
    api.closeInfoWindow()
    expect(infoWindows[0].opened).toBe(false)
    w.unmount()
  })

  it('clearMarkers 把已加的标记全部 remove', async () => {
    const w = mountWidget({ markers: [{ longitude: 1, latitude: 2 }, { longitude: 3, latitude: 4 }] })
    await nextTick()
    await nextTick()
    expect(fakeMap._added.length).toBe(2)
    ;(w.vm as unknown as Exposed).clearMarkers()
    expect(fakeMap._removed.length).toBe(2)
    w.unmount()
  })
})
