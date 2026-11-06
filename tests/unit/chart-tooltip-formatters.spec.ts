// 图表 builder 的 tooltip formatter 契约（#476）
//
// `scatterTip` / `graphTip` 是**模块内私有**的 formatter（未导出），但会通过
// `buildScatter` / `buildGraph` 返回的 `option.tooltip.formatter` 暴露给 ECharts 调用。
// 此前它们 0 覆盖（coverage 里 scatterTip/graphTip 两个函数是 0）——
// 触发形状不符时会静默降级成空串，正是最该锁住的一类行为。
import { describe, it, expect } from 'vitest'
import { buildScatter } from '@/components/chart/options/core/scatter'
import { buildGraph } from '@/components/chart/options/advanced/graph'
import type { BuildParams } from '@/components/chart/utils/types'

function params(over: Partial<BuildParams> = {}): BuildParams {
  return {
    type: 'scatter',
    categories: [],
    series: [],
    data: {},
    title: '',
    showLegend: false,
    showTooltip: true,
    smooth: false,
    showSymbol: true,
    colors: [],
    darkMode: false,
    ...over,
  }
}

type Formatter = (p: unknown) => string

function formatterOf(opt: unknown): Formatter {
  const tooltip = (opt as { tooltip?: { formatter?: Formatter } }).tooltip
  expect(tooltip, 'showTooltip=true 时该有 tooltip').toBeTruthy()
  return tooltip!.formatter!
}

describe('buildScatter · tooltip formatter', () => {
  it('数组 value → `seriesName<br/>(x, y)`', () => {
    const f = formatterOf(buildScatter(params()))
    expect(f({ seriesName: '销量', value: [12, 34] })).toBe('销量<br/>(12, 34)')
  })

  it('value 非数组（触发形状不符）→ 静默降级成空串，不抛', () => {
    const f = formatterOf(buildScatter(params()))
    expect(f({ seriesName: '销量', value: 'not-array' })).toBe('销量<br/>(, )')
    expect(() => f({ seriesName: '销量', value: 'not-array' })).not.toThrow()
  })

  it('seriesName / value 缺省 → 各自退化成空串', () => {
    const f = formatterOf(buildScatter(params()))
    expect(f({})).toBe('<br/>(, )')
  })

  it('showTooltip=false → 整个 tooltip 为 undefined（不是 formatter 空转）', () => {
    expect((buildScatter(params({ showTooltip: false })) as { tooltip?: unknown }).tooltip).toBeUndefined()
  })
})

describe('buildGraph · tooltip formatter', () => {
  it('data.name 优先，缺省回退 name，再缺省空串', () => {
    const f = formatterOf(buildGraph(params()))
    expect(f({ data: { name: '节点A' }, name: 'x' })).toBe('节点A')
    expect(f({ data: {}, name: '节点B' })).toBe('节点B')
    expect(f({})).toBe('')
  })

  it('showTooltip=false → tooltip 为 undefined', () => {
    expect((buildGraph(params({ showTooltip: false })) as { tooltip?: unknown }).tooltip).toBeUndefined()
  })
})
