// ⛔ 保护 — 热力图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../utils/types'
import { textColor, mutedColor } from '../common'

export function buildHeatmap(p: BuildParams): EChartsOption {
  const hd = p.data.heatmapData || []
  const xCats = p.data.heatmapXCategories || p.categories || []
  const yCats = p.data.heatmapYCategories || []
  const vals = hd.map((d) => d[2])
  const min = Math.min(...vals, 0)
  const max = Math.max(...vals, 1)
  return {
    backgroundColor: 'transparent' as const,
    title: p.title
      ? { text: p.title, left: 'center', textStyle: { fontSize: 14, color: textColor(p), fontWeight: 600 } }
      : undefined,
    tooltip: p.showTooltip ? { position: 'top' } : undefined,
    grid: { left: 60, right: 20, bottom: 60, top: p.title ? 40 : 16 },
    xAxis: {
      type: 'category',
      data: xCats as (string | number)[],
      splitArea: { show: true },
      axisLabel: { color: mutedColor(p) },
    },
    yAxis: {
      type: 'category',
      data: yCats as (string | number)[],
      splitArea: { show: true },
      axisLabel: { color: mutedColor(p) },
    },
    visualMap: {
      min,
      max,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: { color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#fee090', '#f46d43', '#a50026'] },
      textStyle: { color: textColor(p) },
    },
    series: [
      {
        type: 'heatmap' as const,
        data: hd as [number, number, number][],
        label: { show: true, color: textColor(p), overflow: 'truncate' },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
      },
    ],
  }
}
