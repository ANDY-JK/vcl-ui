// ⛔ 保护 — 饼图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../types'
import { textColor, resolvePalette } from '../common'

export function buildPie(p: BuildParams): EChartsOption {
  const pieItems = p.data.pieData || (p.series[0]?.data as ({ value: number; name?: string })[]) || []
  const names = pieItems.map((d) => (typeof d === 'object' ? d.name : ''))
  return {
    backgroundColor: 'transparent' as const,
    color: resolvePalette(p.palette, p.colors),
    title: p.title ? { text: p.title, left: 'center', textStyle: { fontSize: 14, color: textColor(p), fontWeight: 600 } } : undefined,
    tooltip: p.showTooltip ? { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)', appendToBody: true } : undefined,
    legend: { show: false, data: names as string[] },
    series: [{
      type: 'pie' as const,
      radius: ['30%', '58%'],
      center: ['50%', '50%'],
      data: pieItems as ({ value: number; name?: string })[],
      label: { color: textColor(p), formatter: '{b}\n{d}%', overflow: 'truncate' },
      emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.3)' } },
    }],
  }
}
