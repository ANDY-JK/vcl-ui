/**
 * `BaseChart` · 图上方 HTML 工具行（导出 PNG / 放大 / 还原）与 aria-label 取名（第 175 轮）
 *
 * 覆盖率实测：语句 75.7% / 分支 60%，未执行行集中在 `onTool`（导出/缩放/还原）、
 * `ariaLabel` 的数组分支、以及 HTML 工具行的渲染 —— 即**用户真正会点的那些按钮**。
 * 既有 `base-chart-behavior.spec.ts` 覆盖了实例生命周期/空态/加载态/resize，但不含工具行。
 *
 * 手法与既有 spec 一致：只 mock `utils/echarts-setup`（轻量 re-export 层），
 * 用假实例记录 `getDataURL` / `dispatchAction` 轨迹；jsdom 无布局，
 * 必须给 `clientWidth/clientHeight` 非零值，否则 `ensureInstance()` 直接 return（假绿）。
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
  _disposed: boolean
}

let instances: FakeInstance[] = []
let dataUrl = 'data:image/png;base64,AAAA'

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
    getDataURL: vi.fn(() => dataUrl),
    isDisposed: vi.fn(() => inst._disposed),
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
  ensureWordCloud: vi.fn(async () => {}),
}))

const { default: BaseChart } = await import('@/components/chart/BaseChart.vue')

const proto = window.HTMLElement.prototype
const origW = Object.getOwnPropertyDescriptor(proto, 'clientWidth')
const origH = Object.getOwnPropertyDescriptor(proto, 'clientHeight')

function patchSize(w: number, h: number) {
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => w })
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => h })
}

let wrappers: VueWrapper[] = []
let clickSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  instances = []
  wrappers = []
  dataUrl = 'data:image/png;base64,AAAA'
  patchSize(400, 300)
  // 捕获下载链接触发（happy-dom 不真的下载，这里只看 href/download 两个属性）
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  wrappers.forEach((w) => w.unmount())
  clickSpy.mockRestore()
  if (origW) Object.defineProperty(proto, 'clientWidth', origW)
  if (origH) Object.defineProperty(proto, 'clientHeight', origH)
})

function lastAnchor(): HTMLAnchorElement | null {
  const calls = clickSpy.mock.instances
  return calls.length ? (calls[calls.length - 1] as unknown as HTMLAnchorElement) : null
}

function mountChart(props: Record<string, unknown> = {}): VueWrapper {
  const w = mount(BaseChart, {
    props: { option: { series: [{ type: 'bar', data: [1, 2, 3] }] }, ...props },
    attachTo: document.body,
  })
  wrappers.push(w)
  return w
}

/**
 * 挂载 + 等两拍。
 *
 * ★ 为什么必须等：样例创建在 `onMounted → ensureInstance()` 里，而 `onTool` 第一行就是
 * `if (!inst) return`。不等就会在"实例还没建好"的时刻点按钮，工具函数全部静默无操作，
 * 断言变成空断言（既有 spec 头部专门记过这个坑：第一版 10 条"全绿"其实是假绿）。
 */
async function mountSettled(props: Record<string, unknown> = {}): Promise<VueWrapper> {
  const w = mountChart(props)
  await nextTick()
  await nextTick()
  return w
}

async function clickTool(w: VueWrapper, index = 0) {
  const btns = w.findAll('.chart-tool-btn')
  expect(btns.length, 'HTML 工具行按钮应渲染').toBeGreaterThan(index)
  await btns[index].trigger('click')
  await w.vm.$nextTick()
}

describe('BaseChart · HTML 工具行渲染', () => {
  it('toolbar 默认（saveAsImage+zoom）→ 三个按钮：导出 / 放大 / 还原', async () => {
    const w = await mountSettled()
    const btns = w.findAll('.chart-tool-btn')
    expect(btns.map((b) => b.attributes('aria-label'))).toHaveLength(3)
  })

  it('toolbar=false → 不渲染工具行', async () => {
    const w = await mountSettled({ toolbar: false })
    expect(w.findAll('.chart-tool-btn')).toHaveLength(0)
  })

  it('toolbar 含 dataView → 退回 ECharts canvas 浮层，不渲染 HTML 行', async () => {
    const w = await mountSettled({ toolbar: ['saveAsImage', 'dataView'] })
    expect(w.findAll('.chart-tool-btn')).toHaveLength(0)
  })
})

describe('BaseChart · 导出 PNG', () => {
  it('点导出 → getDataURL(pixelRatio 2, 白底) + 触发下载', async () => {
    const w = await mountSettled({ option: { title: { text: '销售报表' }, series: [{ type: 'bar', data: [1] }] } })
    await clickTool(w, 0)

    const inst = instances[0]
    expect(inst, '实例必须已创建（否则是空断言假绿）').toBeTruthy()
    expect(inst.getDataURL).toHaveBeenCalledWith({ pixelRatio: 2, backgroundColor: '#ffffff' })
    const a = lastAnchor()
    expect(a, '应通过 <a>.click() 触发下载').toBeTruthy()
    expect(a!.href).toBe('data:image/png;base64,AAAA')
  })

  it('darkMode 时导出用深色底（否则深色图表导出白底、文字不可读）', async () => {
    const w = await mountSettled({ darkMode: true })
    await clickTool(w, 0)
    expect(instances[0].getDataURL).toHaveBeenCalledWith({ pixelRatio: 2, backgroundColor: '#1f2937' })
  })

  it('文件名沿用图表标题（中文保留，去掉空格与标点）', async () => {
    const w = await mountSettled({ option: { title: { text: '销售 报表 (2026)' }, series: [{ type: 'bar', data: [1] }] } })
    await clickTool(w, 0)
    expect(lastAnchor()!.download).toBe('销售报表2026.png')
  })

  it('**标题只有标点时，文件名不得变成无主名的 ".png"**', async () => {
    const w = await mountSettled({ option: { title: { text: '###' }, series: [{ type: 'bar', data: [1] }] } })
    await clickTool(w, 0)
    const name = lastAnchor()!.download
    expect(name, `"${name}" 没有主文件名：Windows 下非法、浏览器会另取名甚至丢弃`).toBe('chart.png')
  })
})

describe('BaseChart · aria-label 取名（标题三种形态）', () => {
  it('title 为字符串 → 直接用', async () => {
    const w = await mountSettled({ option: { title: '纯字符串标题', series: [{ type: 'bar', data: [1] }] } })
    expect(w.attributes('aria-label')).toBe('纯字符串标题')
  })

  it('title 为数组 → 各段 text 用「、」连接（多标题图才有完整语义）', async () => {
    const w = await mountSettled({
      option: { title: [{ text: '主标题' }, { text: '副标题' }], series: [{ type: 'bar', data: [1] }] },
    })
    expect(w.attributes('aria-label')).toBe('主标题、副标题')
  })

  it('**数组里全是空 text → 回退空态文案**（不能朗读出空字符串）', async () => {
    const w = await mountSettled({ option: { title: [{ text: '' }, {}], series: [{ type: 'bar', data: [1] }] } })
    const label = w.attributes('aria-label')
    expect(label, 'aria-label 不能为空').toBeTruthy()
    expect(label).not.toBe('')
  })
})

describe('BaseChart · 放大 / 还原', () => {
  it('点放大 → dispatchAction 聚焦中部区间（start 25 / end 75）', async () => {
    const w = await mountSettled()
    await clickTool(w, 1)
    expect(instances[0].dispatchAction).toHaveBeenCalledWith({ type: 'dataZoom', start: 25, end: 75 })
  })

  it('点还原 → dispatchAction restore', async () => {
    const w = await mountSettled()
    await clickTool(w, 2)
    expect(instances[0].dispatchAction).toHaveBeenCalledWith({ type: 'restore' })
  })

  it('实例尚未创建时点按钮不抛错（静默无操作）', async () => {
    patchSize(0, 0) // 零尺寸 → ensureInstance 跳过创建
    const w = await mountSettled()
    expect(instances).toHaveLength(0)
    await clickTool(w, 0)
    expect(clickSpy).not.toHaveBeenCalled()
  })
})
