// ⛔ 保护 — 旭日图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../types'
import { textColor } from '../common'

export function buildSunburst(p: BuildParams): EChartsOption {
  const sData = p.data.treeData || p.series[0]?.data || []
  return {
    backgroundColor: 'transparent' as const,
    title: p.title ? { text: p.title, left: 'center', textStyle: { fontSize: 14, color: textColor(p), fontWeight: 600 } } : undefined,
    tooltip: p.showTooltip ? { trigger: 'item' as const } : undefined,
    series: [{
      type: 'sunburst' as const,
      data: sData as Record<string, unknown>[],
      radius: ['15%', '85%'],
      emphasis: { focus: 'ancestor' as const },
      label: { rotate: 'radial' as const, color: textColor(p), overflow: 'truncate', hideOverlap: true, fontSize: 10 },
      itemStyle: { borderRadius: 2, borderColor: '#fff', borderWidth: 1 },
    }] as Record<string, unknown>[],
  }
}
