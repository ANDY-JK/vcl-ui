// ⛔ 保护 — K 线图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../types'
import { buildCommonChrome, buildXAxis, buildYAxis } from '../common'

export function buildCandlestick(p: BuildParams): EChartsOption {
  const common = buildCommonChrome(p)
  return {
    ...common,
    tooltip: p.showTooltip ? { trigger: 'axis' as const, axisPointer: { type: 'cross' as const } } : undefined,
    xAxis: buildXAxis(p),
    yAxis: buildYAxis(p, { scale: true }),
    series: [{ type: 'candlestick' as const, data: (p.data.candlestickData || p.series[0]?.data || []) as [number, number, number, number][], itemStyle: { color: '#22AD5F', color0: '#E54545', borderColor: '#22AD5F', borderColor0: '#E54545' } }],
  }
}