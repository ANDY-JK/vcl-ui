// ⛔ 保护 — 雷达图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../utils/types'
import { textColor, resolvePalette } from '../common'

export function buildRadar(p: BuildParams): EChartsOption {
  const indicators = p.data.radarIndicators || []
  return {
    backgroundColor: 'transparent' as const,
    color: resolvePalette(p.palette, p.colors),
    title: p.title
      ? { text: p.title, left: 'center', textStyle: { fontSize: 14, color: textColor(p), fontWeight: 600 } }
      : undefined,
    tooltip: p.showTooltip ? { appendToBody: true } : undefined,
    legend: { show: false, data: p.series.map((s) => ({ name: s.name, value: (s.data?.[0] ?? s.data) as number[] })) },
    radar: {
      indicator: indicators as { name: string; max: number }[],
      center: ['50%', '52%'],
      radius: '65%',
      axisName: { color: textColor(p) },
      splitArea: { areaStyle: { color: [p.darkMode ? '#1a1a2e' : '#fafafa', p.darkMode ? '#1a1a2e' : '#fafafa'] } },
    },
    series: [
      {
        type: 'radar' as const,
        data: p.series.map((s) => ({ name: s.name, value: (s.data?.[0] ?? s.data) as number[] })),
      },
    ],
  }
}
