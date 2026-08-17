// ⛔ 保护 — 象形柱状图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../types'
import { buildCommonChrome, buildXAxis, buildYAxis } from '../common'

export function buildPictorialBar(p: BuildParams): EChartsOption {
  const common = buildCommonChrome(p)
  const isHorizontal = p.horizontal ?? false
  const x = buildXAxis(p)
  const y = buildYAxis(p)

  return {
    ...common,
    xAxis: isHorizontal ? { ...y, type:'value' as const, data:undefined } : x,
    yAxis: isHorizontal ? { ...x, type:'category' as const, data:isHorizontal ? (p.categories as (string | number)[]) : undefined } : y,
    series: p.series.map((s, i) => ({
      type: 'pictorialBar' as const,
      name: s.name || `系列${i+1}`,
      data: ((s.data as number[])?.map((v) => ({ value: v, symbol: 'diamond', symbolSize: [20,10] as [number,number], symbolRepeat: true, symbolMargin: 4 })) || []),
      barMaxWidth: s.barMaxWidth ?? 40,
      itemStyle: s.color ? { color: s.color } : undefined,
    })),
  }
}