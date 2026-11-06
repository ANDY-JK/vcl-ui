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

/* ── 第 155 轮：toolbox 让位判定此前**零覆盖** ──
 * `mergeToolbox` 用 `'title' in opt` 判"有没有标题"，而各 builder 写的是
 * `title: p.title`（`p.title = props.title || ''`）—— **空标题也留一个 title 键**。
 * 于是"无标题"被当成"有标题"：toolbox 下移 36px，而 grid.top 仍是 builder 给的 16px
 * → 工具栏正好压在图上（`reserveToolboxBand` 存在的意义就是防这个，被绕过了）。
 *
 * 只有 `toolbar` 含 `dataView` 时才走 canvas 浮层（否则是图上方 HTML 行），所以用
 * `toolbar: ['dataView']` 触发这条路径。 */
describe('BaseChart · toolbox 让位（按标题**内容**判定，不是按键存在）', () => {
  const DATA_VIEW: string[] = ['dataView']

  /** 取首次 setOption 的载荷 */
  function firstOption(): Record<string, unknown> {
    const inst = last()
    expect(inst, '应创建实例').toBeTruthy()
    const call = inst!.setOption.mock.calls[0]
    expect(call, '应至少 setOption 一次').toBeTruthy()
    return call[0] as Record<string, unknown>
  }

  it('**无标题（title: ""）→ toolbox 不下移、grid 不多留**（builder 的实际形状）', async () => {
    const w = await mountAndSettle({
      toolbar: DATA_VIEW,
      option: { title: '', series: [{ type: 'bar', data: [1, 2] }] },
    })
    const opt = firstOption()
    const toolbox = opt.toolbox as Record<string, unknown>
    expect(toolbox.top, '空标题不该按"有标题"下移到 36').toBe(4)
    const grid = opt.grid as Record<string, unknown> | undefined
    // 原来会算成 36+32=68（按"有标题"让位），净多出 32px 空带
    expect(grid?.top, 'grid.top 应按无标题算（4+32=36）').toBe(36)
    w.unmount()
  })

  it('有标题（title.text 非空）→ toolbox 下移 36、grid 让位 68（既有设计）', async () => {
    const w = await mountAndSettle({
      toolbar: DATA_VIEW,
      option: { title: { text: '销售趋势' }, series: [{ type: 'bar', data: [1, 2] }] },
    })
    const opt = firstOption()
    expect((opt.toolbox as Record<string, unknown>).top, '有标题才下移').toBe(36)
    expect((opt.grid as Record<string, unknown>)?.top, '有标题要让出两行').toBe(68)
    w.unmount()
  })

  it('**纯空白标题算"无标题"**（`title: "   "` 不该按有标题让位）', async () => {
    const w = await mountAndSettle({
      toolbar: DATA_VIEW,
      option: { title: '   ', series: [{ type: 'bar', data: [1, 2] }] },
    })
    const opt = firstOption()
    expect((opt.toolbox as Record<string, unknown>).top, '空白标题不占位，工具栏不该下移').toBe(4)
    expect((opt.grid as Record<string, unknown>)?.top, '空白标题不该让出两行').toBe(36)
    w.unmount()
  })

  it('用户自设 grid.top 时不动它（尊重自定义）', async () => {
    const w = await mountAndSettle({
      toolbar: DATA_VIEW,
      option: { title: '', grid: { top: 10 }, series: [{ type: 'bar', data: [1, 2] }] },
    })
    expect((firstOption().grid as Record<string, unknown>).top, '自设值不该被覆盖').toBe(10)
    w.unmount()
  })

  it('timeline 复合 option：按**内容**判定 baseOption 与各子 option', async () => {
    const w = await mountAndSettle({
      toolbar: DATA_VIEW,
      option: {
        baseOption: { title: '', series: [{ type: 'bar', data: [1] }] },
        options: [{ title: '', series: [{ type: 'bar', data: [2] }] }],
      },
    })
    const opt = firstOption()
    const bo = opt.baseOption as Record<string, unknown>
    expect((bo.toolbox as Record<string, unknown>).top, '空标题的 baseOption 不该下移').toBe(4)
    expect((bo.grid as Record<string, unknown>)?.top, 'baseOption grid 按无标题算').toBe(36)
    // ECharts timeline 复合形态：`options` 是 baseOption 的**兄弟**（顶层），子项也要让位
    const childOptions = opt.options as Record<string, unknown>[]
    expect(childOptions?.length, '子 option 不能丢').toBe(1)
    expect((childOptions[0].grid as Record<string, unknown>)?.top, '子 option 同样按内容判定').toBe(36)
    w.unmount()
  })

  it('用户自定义 toolbox 被合并而非覆盖（feature 合并保留双方）', async () => {
    const w = await mountAndSettle({
      toolbar: DATA_VIEW,
      option: {
        title: '',
        toolbox: { left: 8, feature: { restore: { show: true } } },
        series: [{ type: 'bar', data: [1, 2] }],
      },
    })
    const toolbox = firstOption().toolbox as Record<string, unknown>
    expect(toolbox.left, '用户的自定义项要保留').toBe(8)
    const feature = toolbox.feature as Record<string, unknown>
    expect(feature.restore, '用户的 feature 要保留').toBeTruthy()
    expect(feature.dataView, '库注入的 dataView 也要在').toBeTruthy()
    w.unmount()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// BaseChart **暴露方法面**（#476）
//
// 上面几组测的是「组件自己怎么用实例」，这组测的是「宿主怎么用组件」：
// defineExpose 出去的方法是**公开契约**（README 的公开面清单里有），
// 此前一条都没被调用过 —— coverage 里 showLoading/hideLoading 两个函数是 0。
// 契约要点：①参数原样透传给实例；②实例不存在时全部退化为 no-op（不抛）。
describe('BaseChart · 暴露方法面（宿主契约）', () => {
  it('showLoading(type, opts) 原样透传', async () => {
    const w = await mountAndSettle()
    const vm = w.vm as unknown as {
      showLoading: (type?: string, opts?: Record<string, unknown>) => void
    }
    vm.showLoading('circular', { text: '加载中' })
    expect(last()!.showLoading).toHaveBeenCalledWith('circular', { text: '加载中' })
  })

  it('hideLoading / clear / dispatchAction 透传', async () => {
    const w = await mountAndSettle()
    const vm = w.vm as unknown as {
      hideLoading: () => void
      clear: () => void
      dispatchAction: (p: Record<string, unknown>) => void
      resize: (o?: Record<string, unknown>) => void
    }
    vm.hideLoading()
    expect(last()!.hideLoading).toHaveBeenCalledTimes(1)
    vm.clear()
    expect(last()!.clear).toHaveBeenCalledTimes(1)
    vm.dispatchAction({ type: 'showTip', seriesIndex: 0 })
    expect(last()!.dispatchAction).toHaveBeenCalledWith({ type: 'showTip', seriesIndex: 0 })
    vm.resize({ width: 800, height: 600, silent: true })
    expect(last()!.resize).toHaveBeenCalledWith({ width: 800, height: 600, silent: true })
  })

  it('getOption 返回实例副本（宿主读图表现状）', async () => {
    const w = await mountAndSettle()
    const vm = w.vm as unknown as { getOption: () => unknown }
    expect(vm.getOption()).toEqual({ series: [] })
  })

  it('**实例不存在时全部退化为 no-op**（零尺寸不 init → 方法照调不抛）', async () => {
    patchSize(0, 0)
    const w = await mountAndSettle()
    expect(last(), '零尺寸不该创建实例').toBeUndefined()
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
