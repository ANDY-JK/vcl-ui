// ⛔ 保护 — 箱线图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../types'
import { buildCommonChrome, buildXAxis, buildYAxis } from '../common'

export function buildBoxplot(p: BuildParams): EChartsOption {
  const common = buildCommonChrome(p)
  return {
    ...common,
    tooltip: p.showTooltip ? { trigger: 'item' as const, axisPointer: { type: 'shadow' as const } } : undefined,
    xAxis: buildXAxis(p),
    yAxis: buildYAxis(p),
    series: [{ type: 'boxplot' as const, data: (p.data.boxplotData || (p.series[0]?.data as number[][]) || []) as number[][], itemStyle: { color: '#4F6EF7', borderColor: '#3B56E0' } }],
  }
}