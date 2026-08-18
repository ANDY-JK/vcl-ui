// ⛔ 保护 — 混合图表 builder（柱状 + 折线叠加）
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../utils/types'
import { buildCommonChrome, buildXAxis, buildYAxis } from '../common'

export function buildMixed(p: BuildParams): EChartsOption {
  const common = buildCommonChrome(p)
  return {
    ...common,
    tooltip: p.showTooltip ? { trigger: 'axis' as const } : undefined,
    xAxis: buildXAxis(p),
    yAxis: [buildYAxis(p), { ...buildYAxis(p), splitLine: { show: false } }],
    series: p.series.map((s, i) => {
      const isLine = (s.type || 'bar') === 'line' || (s.type || 'bar') === 'area'
      return {
        type: (isLine ? 'line' : 'bar') as 'line' | 'bar',
        name: s.name || `系列${i + 1}`,
        data: (s.data ?? []) as (number | string)[],
        yAxisIndex: isLine ? 1 : 0,
        smooth: p.smooth,
        barMaxWidth: s.barMaxWidth ?? 48,
        itemStyle: s.color ? { color: s.color } : undefined,
      }
    }),
  }
}
