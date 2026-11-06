// Chart 组件**暴露方法面**（#476）
//
// `Chart.vue` 把 BaseChart 的方法面原样转发给宿主（README 公开面清单里的一节）。
// 这条转发链此前 0 覆盖（coverage 里 chart/showLoading/hideLoading 三个函数是 0）——
// 宿主拿 `chartRef.value.showLoading()` 时到底有没有真的落到 ECharts 实例上，
// 在补这条之前是**没人验过的**。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

interface FakeInstance {
  setOption: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  clear: ReturnType<typeof vi.fn>
  showLoading: ReturnType<typeof vi.fn>
  hideLoading: ReturnType<typeof vi.fn>
  dispatchAction: ReturnType<typeof vi.fn>
  getOption: ReturnType<typeof vi.fn>
  isDisposed: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
  trigger: ReturnType<typeof vi.fn>
}

let instances: FakeInstance[] = []

vi.mock('@/components/chart/utils/echarts-setup', () => ({
  init: vi.fn(() => {
    const inst: FakeInstance = {
      setOption: vi.fn(),
      resize: vi.fn(),
      clear: vi.fn(),
      showLoading: vi.fn(),
      hideLoading: vi.fn(),
      dispatchAction: vi.fn(),
      getOption: vi.fn(() => ({ series: [] })),
      isDisposed: vi.fn(() => false),
      dispose: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      trigger: vi.fn(),
    }
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

function patchSize(w: number, h: number) {
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => w })
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => h })
}
function restoreSize() {
  if (origW) Object.defineProperty(proto, 'clientWidth', origW)
  if (origH) Object.defineProperty(proto, 'clientHeight', origH)
}

async function mountChart(props: Record<string, unknown> = {}): Promise<VueWrapper> {
  const w = mount(Chart, {
    props: { type: 'bar', data: [1, 2, 3], ...props },
    attachTo: document.body,
  })
  await nextTick()
  await nextTick()
  return w
}

const last = () => instances[instances.length - 1]

beforeEach(() => {
  instances = []
  patchSize(400, 300)
  document.body.innerHTML = ''
})
afterEach(() => {
  restoreSize()
  vi.clearAllMocks()
})

describe('Chart · 暴露方法面转发到 BaseChart 实例', () => {
  it('showLoading / hideLoading 落到 ECharts 实例', async () => {
    const w = await mountChart()
    const vm = w.vm as unknown as {
      showLoading: (t?: string, o?: Record<string, unknown>) => void
      hideLoading: () => void
    }
    vm.showLoading('circular', { text: '加载中' })
    expect(last()!.showLoading).toHaveBeenCalledWith('circular', { text: '加载中' })
    vm.hideLoading()
    expect(last()!.hideLoading).toHaveBeenCalledTimes(1)
  })

  it('clear / dispatchAction / resize 透传', async () => {
    const w = await mountChart()
    const vm = w.vm as unknown as {
      clear: () => void
      dispatchAction: (p: Record<string, unknown>) => void
      resize: (o?: Record<string, unknown>) => void
    }
    vm.clear()
    expect(last()!.clear).toHaveBeenCalledTimes(1)
    vm.dispatchAction({ type: 'highlight', seriesIndex: 0 })
    expect(last()!.dispatchAction).toHaveBeenCalledWith({ type: 'highlight', seriesIndex: 0 })
    vm.resize({ width: 500 })
    expect(last()!.resize).toHaveBeenCalledWith({ width: 500 })
  })

  it('chart getter 与 getOption 透传实例', async () => {
    const w = await mountChart()
    const vm = w.vm as unknown as { chart: unknown; getOption: () => unknown }
    expect(vm.chart, 'chart getter 应给到实例').toBeTruthy()
    expect(vm.getOption()).toEqual({ series: [] })
  })

  it('setOption 透传给 BaseChart（自动注入 toolbox 的那一层）', async () => {
    const w = await mountChart()
    const vm = w.vm as unknown as { setOption: (o: unknown, opts?: unknown) => void }
    vm.setOption({ series: [{ type: 'bar', data: [9] }] }, { notMerge: true })
    expect(last()!.setOption).toHaveBeenCalled()
  })

  it('**BaseChart 未挂载时全部 no-op**（零尺寸不 init → 转发不抛）', async () => {
    patchSize(0, 0)
    const w = await mountChart()
    const vm = w.vm as unknown as {
      showLoading: () => void
      hideLoading: () => void
      clear: () => void
      dispatchAction: (p: Record<string, unknown>) => void
      resize: () => void
      getOption: () => unknown
    }
    expect(() => {
      vm.showLoading()
      vm.hideLoading()
      vm.clear()
      vm.dispatchAction({ type: 'highlight' })
      vm.resize()
    }).not.toThrow()
    expect(vm.getOption()).toBeUndefined()
  })
})
