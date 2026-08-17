// ⛔ 保护 — 关系图/力导向图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../types'
import { textColor } from '../common'

export function buildGraph(p: BuildParams): EChartsOption {
  const gNodes = p.data.graphNodes || []
  const gLinks = p.data.graphLinks || []
  const cats = [...new Set(gNodes.map(n => n.category).filter((c): c is number => c !== undefined))]
  return {
    backgroundColor: 'transparent' as const,
    title: p.title ? { text: p.title, left: 'center', textStyle: { fontSize: 14, color: textColor(p), fontWeight: 600 } } : undefined,
    tooltip: p.showTooltip ? { trigger: 'item' as const, formatter: (params: any) => params.data?.name || params.name } : undefined,
    series: [{
      type: 'graph' as const,
      layout: 'force' as const,
      roam: true,
      draggable: true,
      symbolSize: 40,
      label: { show: true, position: 'right' as const, color: textColor(p), fontSize: 11, overflow: 'truncate' },
      edgeSymbol: ['circle', 'arrow'] as const,
      edgeLabel: { show: false },
      force: { repulsion: 300, edgeLength: [100, 300], gravity: 0.08 },
      data: gNodes as unknown as Record<string, unknown>[],
      links: gLinks as unknown as Record<string, unknown>[],
      categories: cats.map(id => ({ name: `分组${id + 1}` })),
    }],
  }
}
