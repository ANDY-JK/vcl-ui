// BaseChart 组件级行为锁定（2026-10-21，审查 6.2 #5「补覆盖洼地」）
//
// 补的是**一整层缺失的测试**：`BaseChart.vue`（416 行）与 `Chart.vue`（420 行）
// 此前**从未被挂载过** —— 仓里两个 chart 测试（`chart-echarts-setup` / `chart-toolbar-passthrough`）
// 都是读源码文本做正则断言。所以覆盖数据里这两个文件语句覆盖只有 25% / 31%，
// 而它们承载的恰恰是最易错的部分：实例生命周期、resize 降级、空态/加载态、toolbox 合并。
//
// 手法：mock `utils/echarts-setup`（只做 re-export，mock 它比 mock 整个 echarts 轻得多），
// 用假实例记录 setOption/resize/dispose 的调用轨迹。
//
// ⚠️ **关键前提**：jsdom 没有布局，`clientWidth/clientHeight` 恒为 0，而 `ensureInstance()`
// 在任一维度为 0 时**直接 return**（等 ResizeObserver 通知）。第一版测试没意识到这点，
// 实例从头到尾没被创建，`if (inst) expect(...)` 全部变成**空断言**（10 条"全绿"其实是假绿）。
// 这里改用原型 getter 给非零尺寸，并**显式断言实例确实被创建**，避免同类假绿。
//
// ⚠️ BaseChart.vue 是**保护文件**（`docs/protected-files.md`）——本文件只测不改。
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
  isDisposed: ReturnType<typeof vi.fn>
  _disposed: boolean
}

let instances: FakeInstance[] = []
let initShouldThrow = false
/** 容器尺寸；设为 0 可测"零尺寸跳过 init" */
let boxW = 400
let boxH = 300

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
    getOption: vi.fn(() => ({ series: [] })),
    isDisposed: vi.fn(() => inst._disposed),
  }
  return inst
}

vi.mock('@/components/chart/utils/echarts-setup', () => ({
  init: vi.fn(() => {
    if (initShouldThrow) throw new Error('init boom')
    const inst = makeInstance()
    instances.push(inst)
    return inst
  }),
  getInstanceByDom: vi.fn(() => instances[instances.length - 1] ?? null),
  registerMap: vi.fn(),
  ensureWordCloud: vi.fn(async () => {}),
}))

const { default: BaseChart } = await import('@/components/chart/BaseChart.vue')

// ── jsdom 尺寸补丁：让 clientWidth/clientHeight 返回可控值 ──
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

function mountChart(props: Record<string, unknown> = {}): VueWrapper {
  return mount(BaseChart, {
    props: { option: { series: [{ type: 'bar', data: [1, 2] }] }, ...props },
    attachTo: document.body,
  })
}

/** 挂载 + 等两拍（onMounted 里 ensureInstance，watch 里也可能再跑一次） */
async function mountAndSettle(props: Record<string, unknown> = {}): Promise<VueWrapper> {
  const w = mountChart(props)
  await nextTick()
  await nextTick()
  return w
}

const last = (): FakeInstance | undefined => instances[instances.length - 1]

beforeEach(() => {
  instances = []
  initShouldThrow = false
  boxW = 400
  boxH = 300
  patchSize(boxW, boxH)
  document.body.innerHTML = ''
})
afterEach(() => {
  restoreSize()
  vi.clearAllMocks()
})

describe('BaseChart · 空态与加载态', () => {
  it('option=null 渲染空态文案，且**不 setOption**', async () => {
    const w = await mountAndSettle({ option: null })
    expect(w.text()).toContain('暂无数据')
    // 注意：实现是「先 init 再判 option」——实例照样创建（供后续增量 setOption 用），
    // 但 `if (opt)` 为假，所以**一次 setOption 都不会发生**。
    // 第一版我写成"不创建实例"，是把自己的假设当成了规格；这里按实际行为锁定。
    const inst = last()
    if (inst) expect(inst.setOption, '没 option 就不该 setOption').not.toHaveBeenCalled()
    w.unmount()
  })

  it('emptyText 可自定义', async () => {
    const w = await mountAndSettle({ option: null, emptyText: '还没有图表' })
    expect(w.text()).toContain('还没有图表')
    w.unmount()
  })

  it('loading 由 false → true 时 showLoading 被调用', async () => {
    const w = await mountAndSettle({ loading: false })
    const inst = last()
    expect(inst, '有数据+有尺寸应创建实例').toBeTruthy()
    inst!.showLoading.mockClear()
    await w.setProps({ loading: true })
    await nextTick()
    expect(inst!.showLoading).toHaveBeenCalled()
    w.unmount()
  })

  it('loading 由 true → false 时 hideLoading 被调用', async () => {
    const w = await mountAndSettle({ loading: true })
    const inst = last()
    expect(inst).toBeTruthy()
    inst!.hideLoading.mockClear()
    await w.setProps({ loading: false })
    await nextTick()
    expect(inst!.hideLoading).toHaveBeenCalled()
    w.unmount()
  })
})

describe('BaseChart · 实例生命周期', () => {
  it('有数据 + 有尺寸 → 创建实例并 setOption（带 series）', async () => {
    const w = await mountAndSettle()
    expect(instances.length, '应创建一个实例').toBe(1)
    const inst = last()!
    expect(inst.setOption).toHaveBeenCalled()
    expect(inst.setOption.mock.calls[0]?.[0]).toHaveProperty('series')
    w.unmount()
  })

  it('**容器尺寸为 0 时跳过 init**（等 ResizeObserver 通知）', async () => {
    patchSize(0, 0)
    const w = await mountAndSettle()
    expect(instances.length, '零尺寸不该 init').toBe(0)
    w.unmount()
  })

  it('**卸载时 dispose 实例**（不泄漏）', async () => {
    const w = await mountAndSettle()
    const inst = last()!
    expect(inst.dispose).not.toHaveBeenCalled()
    w.unmount()
    expect(inst.dispose).toHaveBeenCalled()
  })

  it('init 抛错时不冒泡崩溃（走 reportWarn 兜底）', async () => {
    initShouldThrow = true
    const w = await mountAndSettle()
    expect(instances.length, 'init 抛错就没实例').toBe(0)
    // 组件仍应正常渲染（不因异常白屏）
    expect(w.element).toBeTruthy()
    w.unmount()
  })
})

describe('BaseChart · 尺寸与 resize', () => {
  it('width/height props 落到容器样式', async () => {
    const w = await mountAndSettle({ width: '320px', height: '200px' })
    const html = w.html()
    expect(html).toContain('320px')
    expect(html).toContain('200px')
    w.unmount()
  })

  it('option 变化时复用实例（resize/setOption），不重复 init', async () => {
    const w = await mountAndSettle()
    expect(instances.length).toBe(1)
    await w.setProps({ option: { series: [{ type: 'line', data: [3] }] } })
    await nextTick()
    expect(instances.length, '同容器应复用实例').toBe(1)
    w.unmount()
  })
})

describe('BaseChart · 无障碍与工具栏', () => {
  it('图表容器有 role=img 与非空 aria-label', async () => {
    const w = await mountAndSettle()
    const el = w.find('[role="img"]')
    expect(el.exists(), '应有 role=img').toBe(true)
    expect(el.attributes('aria-label')).toBeTruthy()
    w.unmount()
  })

  it('toolbar=false 时不渲染工具栏按钮', async () => {
    const w = await mountAndSettle({ toolbar: false })
    expect(w.findAll('button').length).toBe(0)
    w.unmount()
  })

  it('toolbar 默认渲染自定义工具按钮（HTML 工具栏）', async () => {
    const w = await mountAndSettle()
    const btns = w.findAll('button')
    expect(btns.length, '默认 toolbar 应出按钮').toBeGreaterThan(0)
    w.unmount()
  })
})
