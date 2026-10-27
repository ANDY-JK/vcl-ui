/**
 * `Chart` 的事件与暴露方法此前覆盖极低（语句 55.6%，L389-390 未覆盖）。
 *
 * 重点验证公开事件 `chart-ready`（文档：`instance: ECharts 实例就绪（拿到实例可做
 * setOption/dispose 等深度定制）`）—— 它 watch 的是 `baseChartRef.value?.chart`，
 * 而 BaseChart 的 `chartInstance` 是**非响应式**的闭包变量。若 getter 的变化无法触发
 * watcher，这个事件就永不发出，用户拿不到实例。
 *
 * 手法沿用 base-chart-behavior.spec.ts：mock `utils/echarts-setup` 造一个记录调用的假实例，
 * 并给 clientWidth/clientHeight 打桩（jsdom 无布局，恒 0 会让 ensureInstance 直接 return）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

interface FakeInstance {
  setOption: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
  clear: ReturnType<typeof vi.fn>
  showLoading: ReturnType<typeof vi.fn>
  hideLoading: ReturnType<typeof vi.fn>
  dispatchAction: ReturnType<typeof vi.fn>
  getOption: ReturnType<typeof vi.fn>
  getDataURL: ReturnType<typeof vi.fn>
  isDisposed: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
  _disposed: boolean
}

let instances: FakeInstance[] = []

function makeInstance(): FakeInstance {
  const inst: FakeInstance = {
    _disposed: false,
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(() => {
      inst._disposed = true
    }),
    clear: vi.fn(),
    showLoading: vi.fn(),
    hideLoading: vi.fn(),
    dispatchAction: vi.fn(),
    getOption: vi.fn(() => ({ series: [{ name: 's' }] })),
    getDataURL: vi.fn(() => 'data:image/png;base64,AAA'),
    isDisposed: vi.fn(() => inst._disposed),
    on: vi.fn(),
    off: vi.fn(),
  }
  return inst
}

vi.mock('@/components/chart/utils/echarts-setup', () => ({
  init: vi.fn(() => {
    const inst = makeInstance()
    instances.push(inst)
    return inst
  }),
  getInstanceByDom: vi.fn(() => instances[instances.length - 1] ?? null),
  registerMap: vi.fn(),
  ensureWordCloud: vi.fn(async () => true),
}))

const { default: Chart } = await import('@/components/chart/Chart.vue')

const proto = window.HTMLElement.prototype
const origW = Object.getOwnPropertyDescriptor(proto, 'clientWidth')
const origH = Object.getOwnPropertyDescriptor(proto, 'clientHeight')

beforeEach(() => {
  instances = []
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => 400 })
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => 300 })
  document.body.innerHTML = ''
})
afterEach(() => {
  if (origW) Object.defineProperty(proto, 'clientWidth', origW)
  if (origH) Object.defineProperty(proto, 'clientHeight', origH)
  vi.clearAllMocks()
})

async function mountSettled(props: Record<string, unknown> = {}): Promise<VueWrapper> {
  const w = mount(Chart, {
    props: { type: 'bar', categories: ['a', 'b'], series: [{ name: 's', data: [1, 2] }], ...props },
    attachTo: document.body,
  })
  for (let i = 0; i < 4; i++) await nextTick()
  return w
}

describe('Chart · chart-ready 事件（公开承诺：实例就绪）', () => {
  it('**实例创建后必须发出 chart-ready 且带上实例**', async () => {
    const w = await mountSettled()
    expect(instances.length, '前置：实例确实被创建（否则本用例是空断言）').toBe(1)
    const ready = w.emitted('chart-ready')
    expect(ready, '文档承诺"实例就绪"事件，必须发出').toBeTruthy()
    expect((ready![0] as unknown[])[0], '事件要带上实例').toBe(instances[0])
    w.unmount()
  })

  it('发出的事件里绑定了 ECharts 事件（click 等）', async () => {
    const w = await mountSettled()
    const inst = instances[0]
    expect(inst, '前置：有实例').toBeTruthy()
    const bound = inst.on.mock.calls.map((c) => c[0] as string)
    expect(bound, '至少要绑定 click').toContain('click')
    expect(bound, 'datazoom 与 finished 也要绑（文档列了）').toContain('finished')
    w.unmount()
  })

  it('**绑定的 ECharts 事件真的抵达用户**（把注册的 handler 调一次）', async () => {
    const w = await mountSettled()
    const inst = instances[0]
    const clickCall = inst.on.mock.calls.find((c) => c[0] === 'click')
    expect(clickCall, 'click 应已绑定').toBeTruthy()
    const clickHandler = clickCall![1] as (p: unknown) => void
    clickHandler({ name: 'series-1', value: 2 })
    expect(w.emitted('click'), '组件应把 click 转成 Vue 事件').toBeTruthy()
    expect((w.emitted('click')![0] as unknown[])[0], '原样透传 params').toEqual({ name: 'series-1', value: 2 })

    // legendselectchanged 是**双向**的：ECharts 内置图例切换（用户传 option 带 legend 时）
    // 也要同步进 hiddenSeries —— 可观察点是"被隐藏的系列其 data 被置空后重新 setOption"
    const legendCall = inst.on.mock.calls.find((c) => c[0] === 'legendselectchanged')
    expect(legendCall, 'legendselectchanged 应已绑定').toBeTruthy()
    const legendHandler = legendCall![1] as (p: unknown) => void
    inst.setOption.mockClear()
    legendHandler({ selected: { s: false } })
    await nextTick()
    await nextTick()
    expect(w.emitted('legendselectchanged'), '原样透传给用户').toBeTruthy()
    const synced = inst.setOption.mock.calls.map((c) => (c[0] as { series?: { data?: unknown[] }[] }).series?.[0]?.data)
    expect(
      synced.some((d) => Array.isArray(d) && d.length === 0),
      '画布图例隐藏后，对应系列数据应被置空（否则两套图例状态打架）',
    ).toBe(true)
    w.unmount()
  })

  it('darkMode 切换 → 重建实例并**再次**发出 chart-ready（带新实例）', async () => {
    const w = await mountSettled()
    expect(instances.length, '前置：初始 1 个实例').toBe(1)
    expect(w.emitted('chart-ready')!.length, '初始发过一次').toBe(1)

    await w.setProps({ darkMode: true })
    for (let i = 0; i < 4; i++) await nextTick()

    expect(instances.length, '应重建实例').toBe(2)
    const ready = w.emitted('chart-ready')!
    expect(ready.length, '重建后要再发一次（新实例）').toBe(2)
    expect((ready[1] as unknown[])[0], '第二次带的是新实例').toBe(instances[1])
    w.unmount()
  })

  it('暴露的 setOption/resize/clear/dispatchAction 透传到实例', async () => {
    const w = await mountSettled()
    const inst = instances[0]
    const vm = w.vm as unknown as {
      setOption: (o: unknown, opts?: unknown) => void
      resize: (o?: unknown) => void
      clear: () => void
      dispatchAction: (p: unknown) => void
      getOption: () => unknown
    }
    vm.setOption({ series: [] })
    vm.resize({ width: 100 })
    vm.clear()
    vm.dispatchAction({ type: 'showTip' })
    vm.getOption()
    expect(inst.setOption, 'setOption 应透传').toHaveBeenCalled()
    expect(inst.resize).toHaveBeenCalled()
    expect(inst.clear).toHaveBeenCalled()
    expect(inst.dispatchAction).toHaveBeenCalledWith({ type: 'showTip' })
    w.unmount()
  })
})