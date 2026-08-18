// ⛔ 保护 — 折线图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../utils/types'
import { buildCommonChrome, mutedColor, buildMarkLine, buildMarkArea, buildXAxis, buildYAxis } from '../common'

export function buildLine(p: BuildParams): EChartsOption {
  const common = buildCommonChrome(p)
  const ml = buildMarkLine(p.markLine)
  const ma = buildMarkArea(p.markArea)

  return {
    ...common,
    xAxis: buildXAxis(p),
    yAxis: buildYAxis(p),
    series: p.series.map((s, i) => ({
      type: 'line' as const,
      name: s.name || `系列${i + 1}`,
      data: (s.data ?? []) as (number | string)[],
      smooth: s.smooth ?? p.smooth,
      showSymbol: s.showSymbol ?? p.showSymbol,
      lineStyle: s.color ? { color: s.color } : undefined,
      itemStyle: s.color ? { color: s.color } : undefined,
      stack: p.stacked || p.stacked100 ? 'total' : undefined,
      areaStyle: p.stacked100 ? {} : undefined,
      markLine: ml,
      markArea: ma,
      ...(p.showDataLabel ? { label: { show: true, position: 'top', color: mutedColor(p) } } : {}),
    })),
    ...(p.stacked100 ? { yAxis: buildYAxis(p, { min: 0, max: 100 }) } : {}),
  }
}
