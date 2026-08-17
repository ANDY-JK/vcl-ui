// ⛔ 保护 — 仪表盘 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../types'
import { textColor, mutedColor } from '../common'

export function buildGauge(p: BuildParams): EChartsOption {
  const gData = p.data.gaugeData || [{ value: 50, name: '指标' }]
  return {
    backgroundColor: 'transparent' as const,
    title: p.title ? { text: p.title, left: 'center', textStyle: { fontSize: 14, color: textColor(p), fontWeight: 600 } } : undefined,
    series: gData.map((g, i) => ({
      type: 'gauge' as const,
      center: ['50%', p.title ? '58%' : '55%'],
      radius: `${90 - i * 10}%`,
      startAngle: 210,
      endAngle: -30,
      min: 0,
      max: 100,
      detail: { formatter: '{value}%', color: textColor(p), fontSize: 20, offsetCenter: [0, '60%'] },
      data: [{ value: g.value, name: g.name || '' }],
      axisLine: { lineStyle: { width: 18, color: [[0.3, '#22AD5F'], [0.7, '#F59E0B'], [1, '#E54545']] } },
      axisTick: { distance: -18, length: 6, lineStyle: { width: 1, color: mutedColor(p) } },
      splitLine: { distance: -22, length: 14, lineStyle: { width: 2, color: mutedColor(p) } },
      axisLabel: { distance: 30, color: mutedColor(p), fontSize: 10 },
    })) as Record<string, unknown>[],
  }
}
