// ⛔ 保护 — 漏斗图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../utils/types'
import { textColor, resolvePalette } from '../common'

export function buildFunnel(p: BuildParams): EChartsOption {
  const fData = p.series[0]?.data || []
  return {
    backgroundColor: 'transparent' as const,
    color: resolvePalette(p.palette, p.colors),
    title: p.title
      ? { text: p.title, left: 'center', textStyle: { fontSize: 14, color: textColor(p), fontWeight: 600 } }
      : undefined,
    tooltip: p.showTooltip ? { trigger: 'item' as const, formatter: '{b}: {c}', appendToBody: true } : undefined,
    legend: {
      show: false,
      data: fData
        .map((d) => (typeof d === 'object' ? (d as Record<string, unknown>).name : d))
        .filter(Boolean) as string[],
    },
    series: [
      {
        type: 'funnel' as const,
        left: '15%',
        right: '15%',
        top: p.title ? 40 : 16,
        bottom: 16,
        minSize: '15%',
        maxSize: '100%',
        sort: 'descending' as const,
        gap: 2,
        label: {
          show: true,
          position: 'right' as const,
          color: textColor(p),
          formatter: '{b}: {c}',
          overflow: 'truncate',
        },
        data: fData as Record<string, unknown>[],
      },
    ],
  }
}
