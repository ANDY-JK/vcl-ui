// ⛔ 保护 — 矩形树图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../utils/types'
import { textColor } from '../common'

export function buildTreemap(p: BuildParams): EChartsOption {
  const tData = p.data.treeData || p.series[0]?.data || []
  return {
    backgroundColor: 'transparent' as const,
    title: p.title
      ? { text: p.title, left: 'center', textStyle: { fontSize: 14, color: textColor(p), fontWeight: 600 } }
      : undefined,
    tooltip: p.showTooltip ? { formatter: '{b}: {c}' } : undefined,
    series: [
      {
        type: 'treemap' as const,
        data: tData as Record<string, unknown>[],
        top: p.title ? 40 : 8,
        bottom: 8,
        roam: true,
        drillDownIcon: '▸',
        label: {
          show: true,
          formatter: '{b}',
          color: textColor(p),
          overflow: 'truncate',
          hideOverlap: true,
          fontSize: 11,
        },
        levels: [
          {
            colorSaturation: [0.35, 0.5],
            itemStyle: { borderColor: '#fff', borderWidth: 2, gapWidth: 2 },
            colorMappingBy: 'value' as const,
          },
        ],
      },
    ] as Record<string, unknown>[],
  }
}
