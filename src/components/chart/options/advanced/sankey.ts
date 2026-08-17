// ⛔ 保护 — 桑基图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../types'
import { textColor } from '../common'

export function buildSankey(p: BuildParams): EChartsOption {
  const nodes = p.data.sankeyNodes || []
  const links = p.data.sankeyLinks || []
  return {
    backgroundColor: 'transparent' as const,
    title: p.title ? { text: p.title, left: 'center', textStyle: { fontSize: 14, color: textColor(p), fontWeight: 600 } } : undefined,
    tooltip: p.showTooltip ? { trigger: 'item' as const, triggerOn: 'mousemove' } : undefined,
    series: [{
      type: 'sankey',
      layout: 'none',
      emphasis: { focus: 'adjacency' },
      data: nodes,
      links: links,
      lineStyle: { curveness: 0.5 },
      label: { color: textColor(p), fontSize: 11, overflow: 'truncate' },
    }] as Record<string, unknown>[],
  }
}
