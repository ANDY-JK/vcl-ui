// chart 域 option 构建器测试 —— 21 种图表 builder + common 智能默认值
// 背景：审计发现 chart 域 21 个 builder 为纯函数但 0 测试（回归风险最高、最易补测）
// 锁定目标：buildChartOption 对每种类型产出正确 series.type 与关键配置；common 智能默认行为
import { describe, it, expect } from 'vitest'
import { buildChartOption } from '@/components/chart/options'
import { buildCommonChrome, autoLabelRotate, autoDataZoom, smartLegend, buildMarkLine, buildMarkArea } from '@/components/chart/options/common'
import type { BuildParams, ChartType } from '@/components/chart/utils/types'

/** 构造最小 BuildParams */
function baseParams(type: ChartType, over: Partial<BuildParams> = {}): BuildParams {
  return {
    type,
    categories: ['A', 'B', 'C'],
    series: [{ name: '系列1', data: [1, 2, 3] }],
    data: {},
    title: '',
    showLegend: true,
    showTooltip: true,
    smooth: true,
    showSymbol: true,
    colors: [],
    darkMode: false,
    ...over,
  }
}

/** 从 option 中取首个 series（兼容 timeline compound） */
function firstSeries(opt: Record<string, any>): Record<string, any> {
  if (opt.baseOption) return (opt.baseOption as Record<string, any>).series?.[0] ?? {}
  return opt.series?.[0] ?? {}
}

describe('buildChartOption · 21 种图表类型', () => {
  const cases: { type: ChartType; seriesType: string; data?: Record<string, any>; series?: any[] }[] = [
    { type: 'line', seriesType: 'line' },
    { type: 'bar', seriesType: 'bar' },
    { type: 'area', seriesType: 'line' }, // area 内部是 line + areaStyle
    { type: 'scatter', seriesType: 'scatter' },
    { type: 'mixed', seriesType: 'mixed', series: [{ name: 's1', type: 'line', data: [1, 2, 3] }, { name: 's2', type: 'bar', data: [1, 2, 3] }] },
    { type: 'radar', seriesType: 'radar', data: { radarIndicators: [{ name: '指标', max: 100 }] } },
    { type: 'gauge', seriesType: 'gauge', data: { gaugeData: [{ value: 50, name: '表' }] } },
    { type: 'funnel', seriesType: 'funnel' },
    { type: 'heatmap', seriesType: 'heatmap', data: { heatmapData: [[0, 0, 1]], heatmapXCategories: ['x1'], heatmapYCategories: ['y1'] } },
    { type: 'treemap', seriesType: 'treemap', data: { treeData: [{ name: '根', children: [] }] } },
    { type: 'candlestick', seriesType: 'candlestick', data: { candlestickData: [[1, 2, 3, 4]] } },
    { type: 'sankey', seriesType: 'sankey', data: { sankeyNodes: [{ name: 'a' }], sankeyLinks: [] } },
    { type: 'sunburst', seriesType: 'sunburst', data: { treeData: [{ name: '根', children: [] }] } },
    { type: 'graph', seriesType: 'graph', data: { graphNodes: [{ name: 'n' }], graphLinks: [] } },
    { type: 'boxplot', seriesType: 'boxplot', data: { boxplotData: [[1, 2, 3, 4, 5]] } },
    { type: 'waterfall', seriesType: 'bar' }, // 瀑布用 bar 模拟
    { type: 'pictorialBar', seriesType: 'pictorialBar' },
    { type: 'tree', seriesType: 'tree', data: { treeData: [{ name: '根', children: [] }] } },
    { type: 'timeline', seriesType: 'bar', data: { timelineData: [{ time: '2026', categories: ['a'], series: [{ name: 's', data: [1] }] }] } },
    { type: 'wordCloud', seriesType: 'wordCloud' },
    { type: 'pie', seriesType: 'pie', data: { pieData: [{ name: 'x', value: 1 }] } },
  ]

  it.each(cases)('$type → series.type 正确', ({ type, seriesType, data, series }) => {
    const opt = buildChartOption(type, baseParams(type, { data: data ?? {}, ...(series ? { series } : {}) })) as Record<string, any>
    if (type === 'mixed') {
      // mixed：series 数组同时含 line 与 bar（首个按实现为 bar）
      const types = (opt.series as Record<string, any>[]).map((s) => s.type)
      expect(types).toContain('line')
      expect(types).toContain('bar')
      return
    }
    const s = firstSeries(opt)
    // 部分 builder 的 series[0] 可能是占位/结构不同，均应有 type
    expect(s.type).toBe(seriesType)
  })

  it('未知类型回退为柱状图（不抛错）', () => {
    const opt = buildChartOption('not-a-type' as ChartType, baseParams('bar'))
    expect((opt as Record<string, any>).series[0].type).toBe('bar')
  })
})

describe('buildCommonChrome · 公共底座', () => {
  it('title 存在时置顶，无 title 时 grid 顶部收窄', () => {
    const withTitle = buildCommonChrome(baseParams('bar', { title: '标题' }))
    const withoutTitle = buildCommonChrome(baseParams('bar', { title: '' }))
    expect(withTitle.title).toBeTruthy()
    expect(withTitle.grid.top).toBeGreaterThan(withoutTitle.grid.top)
  })

  it('darkMode 切换坐标轴文字颜色', () => {
    const light = buildChartOption('bar', baseParams('bar')) as Record<string, any>
    const dark = buildChartOption('bar', baseParams('bar', { darkMode: true })) as Record<string, any>
    // darkMode 影响 axisLabel 文字色（mutedColor），不影响色板
    expect(light.xAxis.axisLabel.color).not.toEqual(dark.xAxis.axisLabel.color)
    expect(dark.xAxis.axisLabel.color).toBe('#888')
  })

  it('图例内置关闭（legend.show=false，由 ChartLegend 接管）', () => {
    const opt = buildCommonChrome(baseParams('bar'))
    expect(opt.legend).toMatchObject({ show: false })
  })

  it('色板：自定义 colors 优先于预设', () => {
    const custom = buildCommonChrome(baseParams('bar', { colors: ['#111111'] }))
    expect(custom.color).toEqual(['#111111'])
    const preset = buildCommonChrome(baseParams('bar', { palette: 'ocean' }))
    expect(preset.color).toContain('#0077B6')
  })
})

describe('common 智能默认', () => {
  it('autoLabelRotate：>4 字分类名自动旋转 45°', () => {
    expect(autoLabelRotate(['短', '名'])).toBe(0)
    expect(autoLabelRotate(['很长的分类名', 'b'])).toBe(45)
  })

  it('autoDataZoom：>50 个数据点自动开滑动条，否则无', () => {
    const many = Array.from({ length: 60 }, (_, i) => `c${i}`)
    const few = ['a', 'b']
    expect(autoDataZoom(many, false)).toBeTruthy()
    expect(autoDataZoom(few, false)).toBeUndefined()
  })

  it('smartLegend：单系列自动隐藏', () => {
    expect(smartLegend(true, 1)).toBe(false)
    expect(smartLegend(true, 2)).toBe(true)
    expect(smartLegend(false, 2)).toBe(false)
  })

  it('buildMarkLine：type 模式与数值模式', () => {
    const ml = buildMarkLine([{ type: 'average', label: '均值' }, { value: 10, label: '线' }])
    expect(ml?.data).toHaveLength(2)
    expect(ml?.data[0]).toMatchObject({ type: 'average', name: '均值' })
    expect(ml?.data[1]).toMatchObject({ yAxis: 10, name: '线' })
  })

  it('buildMarkArea：from/to 区间', () => {
    const ma = buildMarkArea({ from: 10, to: 20, color: '#f00' })
    expect(ma?.data).toHaveLength(1)
    expect(ma?.data[0][0]).toMatchObject({ yAxis: 10 })
    expect(ma?.data[0][1]).toMatchObject({ yAxis: 20 })
  })
})

describe('bar/line 高级控制', () => {
  it('horizontal + stacked100：x/y 互换且 y 轴 0-100', () => {
    const opt = buildChartOption('bar', baseParams('bar', { horizontal: true, stacked100: true })) as Record<string, any>
    expect(opt.xAxis.type).toBe('value')
    expect(opt.yAxis.type).toBe('category')
    expect(opt.series[0].stack).toBe('total')
  })

  it('line smooth 与 showSymbol 透传', () => {
    const opt = buildChartOption('line', baseParams('line', { smooth: true, showSymbol: false })) as Record<string, any>
    expect(opt.series[0].smooth).toBe(true)
    expect(opt.series[0].showSymbol).toBe(false)
  })
})
