// ⛔ 保护 — 柱状图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../utils/types'
import { buildCommonChrome, mutedColor, buildMarkLine, buildMarkArea, buildXAxis, buildYAxis } from '../common'

export function buildBar(p: BuildParams): EChartsOption {
  const common = buildCommonChrome(p)
  const isHorizontal = p.horizontal ?? false

  const x = buildXAxis(p)
  const y = buildYAxis(p)

  const ml = buildMarkLine(p.markLine)
  const ma = buildMarkArea(p.markArea)

  return {
    ...common,
    xAxis: isHorizontal ? { ...y, type: 'value', name: p.xAxis?.title } : x,
    yAxis: isHorizontal ? { ...x, type: 'value', name: p.yAxis?.title } : y,
    series: p.series.map((s, i) => ({
      type: 'bar' as const,
      name: s.name || `系列${i + 1}`,
      data: (s.data ?? []) as (number | string)[],
      barMaxWidth: s.barMaxWidth ?? 48,
      itemStyle: s.color ? { color: s.color } : undefined,
      stack: p.stacked || p.stacked100 ? 'total' : undefined,
      markLine: ml,
      markArea: ma,
      ...(p.showDataLabel
        ? { label: { show: true, position: isHorizontal ? 'right' : 'top', color: mutedColor(p) } }
        : {}),
    })),
    ...(p.stacked100
      ? {
          // stacked100 的 0-100 上限必须设在数值轴上：水平时数值轴是 xAxis（此前误设到类目轴）
          xAxis: isHorizontal ? { ...y, min: 0, max: 100, name: p.xAxis?.title } : x,
          yAxis: isHorizontal ? x : { ...y, min: 0, max: 100 },
        }
      : {}),
  }
}
