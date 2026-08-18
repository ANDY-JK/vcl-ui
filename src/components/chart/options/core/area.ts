// ⛔ 保护 — 面积图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../utils/types'
import { buildCommonChrome, buildXAxis, buildYAxis } from '../common'

export function buildArea(p: BuildParams): EChartsOption {
  const common = buildCommonChrome(p)
  return {
    ...common,
    xAxis: buildXAxis(p, { boundaryGap: false }),
    yAxis: buildYAxis(p),
    series: p.series.map((s, i) => ({
      type: 'line' as const,
      name: s.name || `系列${i + 1}`,
      data: (s.data ?? []) as (number | string)[],
      smooth: s.smooth ?? p.smooth,
      showSymbol: false,
      areaStyle: typeof s.areaStyle === 'object' ? s.areaStyle : { opacity: 0.25 },
      lineStyle: s.color ? { color: s.color } : undefined,
      itemStyle: s.color ? { color: s.color } : undefined,
    })),
  }
}
