// ChartTable 行为锁定（Q4 后半·chart 域）——图表+表格复合容器的布局与开关。
// ChartTable.vue 294 行此前 0% 覆盖。Chart/DataTable 用 stub 替掉（Chart 拽 echarts、
// DataTable 是动态 import 的大家伙），本组只锁 ChartTable 自己的契约：
// 宽度分配、图例/表格开关、窄容器纵向堆叠、事件透传、ResizeObserver 清理。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

// ── stubs： Chart 与 DataTable 都不真加载（前者拽 echarts，后者是异步大家伙） ──
const chartProps = [
  'type',
  'option',
  'data',
  'categories',
  'series',
  'darkMode',
  'colors',
  'title',
  'showLegend',
  'showTooltip',
  'smooth',
  'showSymbol',
  'showDataLabel',
  'horizontal',
  'stacked',
  'stacked100',
  'legendPosition',
  'xAxis',
  'yAxis',
  'animation',
  'animationDuration',
  'toolbar',
  'palette',
  'markLine',
  'markArea',
]
vi.mock('@/components/chart/Chart.vue', async () => {
  const { defineComponent } = await import('vue')
  const stub = defineComponent({
    name: 'ChartStub',
    props: chartProps,
    // 'click' 必须一起声明：真实 Chart.vue 会 emit('click')，而 ChartTable 用 `@click` 把它
    // 转成自己的 chart-click。桩子不声明就会在 `$emit('click')` 时触发 Vue 警告
    // （"emitted event click but it is neither declared…"），而且桩子与真实组件的契约也不一致。
    emits: ['click', 'chart-click', 'chart-ready'],
    template: '<div class="chart-stub" />',
  })
  // __esModule: true 是关键：defineAsyncComponent 的加载器按 __esModule/Module
  // 标记决定是否取 .default，mock 命名空间没这个标记时 Vue 会把命名空间本身当组件，
  // VTU 随后经 mock 代理读 __isTeleport 等内部旗标逐一抛错（vitest 5 起未声明导出
  // 访问即抛，4.x 是静默 undefined）。打了标记，Vue 取 default，命名空间不再上场。
  return { default: stub, __esModule: true }
})
vi.mock('@/components/data/DataTable.vue', async () => {
  const { defineComponent } = await import('vue')
  const stub = defineComponent({
    name: 'DataTableStub',
    props: ['columns', 'data', 'rowKey', 'striped', 'dense', 'autoHeight'],
    template: '<div class="table-stub" />',
  })
  return { default: stub, __esModule: true }
})

const ChartTable = (await import('@/components/chart/ChartTable.vue')).default

// ── ResizeObserver 可控 stub：手动触发回调模拟容器尺寸变化 ──
let roCallback: (() => void) | null = null
let roDisconnected = false
class ROStub {
  constructor(cb: () => void) {
    roCallback = cb
  }
  observe() {}
  disconnect() {
    roDisconnected = true
  }
}
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/** 挂载并等异步 DataTable 解析完——defineAsyncComponent 的动态 import 若在测试结束
 *  时才落地会冒 EnvironmentTeardownError（coverage 环境下模块加载更慢更易触发） */
const mountCT = async (props = {}) => {
  const w = mount(ChartTable, { props })
  await new Promise((r) => setTimeout(r, 0))
  await w.vm.$nextTick()
  return w
}

describe('ChartTable · 宽度分配', () => {
  it('默认 chartRatio 0.45：图表 45% / 表格 55%', async () => {
    const w = await mountCT()
    const chart = w.find('.ct-chart')
    const table = w.find('.ct-table')
    expect(chart.attributes('style')).toContain('width: 45%')
    expect(table.attributes('style')).toContain('width: 55%') // (1-0.45)*100 的浮点尾差已由组件取整
  })

  it('自定义 chartRatio 0.6：图表 60% / 表格 40%', async () => {
    const w = await mountCT({ chartRatio: 0.6 })
    expect(w.find('.ct-chart').attributes('style')).toContain('width: 60%')
    expect(w.find('.ct-table').attributes('style')).toContain('width: 40%')
  })

  it('showTable=false：表格不渲染，图表满宽', async () => {
    const w = await mountCT({ showTable: false })
    expect(w.find('.ct-table').exists()).toBe(false)
    expect(w.find('.ct-chart').attributes('style')).toContain('width: 100%')
  })
})

describe('ChartTable · 开关按钮', () => {
  it('表格开关：点击后表格消失、图表满宽、按钮态翻转', async () => {
    const w = await mountCT()
    const btns = w.findAll('.ct-toggle')
    const tableBtn = btns[1]! // [图例, 表格]
    await tableBtn.trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.ct-table').exists()).toBe(false)
    expect(w.find('.ct-chart').attributes('style')).toContain('width: 100%')
    expect(tableBtn.classes()).toContain('off')
    // 再点恢复
    await tableBtn.trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.ct-table').exists()).toBe(true)
  })

  it('图例开关：透传给 Chart 的 show-legend', async () => {
    const w = await mountCT()
    const chart = w.findComponent({ name: 'ChartStub' })
    expect(chart.props('showLegend')).toBe(true)
    await w.findAll('.ct-toggle')[0]!.trigger('click')
    await w.vm.$nextTick()
    expect(chart.props('showLegend')).toBe(false)
  })
})

describe('ChartTable · 窄容器纵向堆叠', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ROStub)
    roCallback = null
    roDisconnected = false
  })
  afterEach(() => vi.unstubAllGlobals())

  it('容器宽度低于复合最低宽度：ct-body 加 vertical 类（图表上+表格下）', async () => {
    const w = await mountCT()
    const root = w.find('.ct-root')
    // 默认无 columns → 表格最低 180，复合最低 = 200+180+20 = 400
    Object.defineProperty(root.element, 'clientWidth', { value: 300, configurable: true })
    roCallback!() // 模拟 ResizeObserver 触发
    await nextFrame()
    await w.vm.$nextTick()
    expect(w.find('.ct-body').classes()).toContain('vertical')
  })

  it('容器够宽：不堆叠', async () => {
    const w = await mountCT()
    const root = w.find('.ct-root')
    Object.defineProperty(root.element, 'clientWidth', { value: 1200, configurable: true })
    roCallback!()
    await nextFrame()
    await w.vm.$nextTick()
    expect(w.find('.ct-body').classes()).not.toContain('vertical')
  })

  it('showTable 关闭时复合最低宽度只剩图表 200：极窄也不堆叠表格', async () => {
    const w = await mountCT({ showTable: false })
    const root = w.find('.ct-root')
    Object.defineProperty(root.element, 'clientWidth', { value: 250, configurable: true })
    roCallback!()
    await nextFrame()
    await w.vm.$nextTick()
    expect(w.find('.ct-body').classes()).not.toContain('vertical')
  })
})

describe('ChartTable · 事件透传与清理', () => {
  it('chart-click / chart-ready 原样转 emit', async () => {
    const w = await mountCT()
    const chart = w.findComponent({ name: 'ChartStub' })
    const payload = { name: 'click' }
    // ChartTable 的契约：Chart 的 click → 自己的 chart-click（@click 绑定，非 @chart-click）
    chart.vm.$emit('click', payload)
    expect(w.emitted('chart-click')).toHaveLength(1)
    expect(w.emitted('chart-click')![0]).toEqual([payload])
    const inst = { fake: 'echarts' }
    chart.vm.$emit('chart-ready', inst)
    expect(w.emitted('chart-ready')![0]).toEqual([inst])
  })

  it('卸载时 disconnect ResizeObserver（防泄漏）', async () => {
    vi.stubGlobal('ResizeObserver', ROStub)
    const w = await mountCT()
    w.unmount()
    expect(roDisconnected).toBe(true)
    vi.unstubAllGlobals()
  })
})

describe('ChartTable · 插槽', () => {
  it('header/footer 插槽渲染，未传时回落 tableTitle', async () => {
    const w = await mountCT({ tableTitle: '排行榜' })
    expect(w.find('.ct-title').text()).toBe('排行榜')
    const w2 = mount(ChartTable, {
      props: {},
      slots: { header: '<span class="my-header">自定义头</span>', footer: '<span class="my-footer">自定义尾</span>' },
    })
    expect(w2.find('.my-header').exists()).toBe(true)
    expect(w2.find('.my-footer').exists()).toBe(true)
  })
})
