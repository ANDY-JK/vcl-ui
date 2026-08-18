// ⛔ 保护 — 时间轴 builder（timeline 组件包裹任意基础图表）
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../utils/types'
import { buildBar } from '../core/bar'
import { textColor } from '../common'

export function buildTimeline(p: BuildParams): EChartsOption {
  // 将 series 按时间点分组：期望 data.treeData 为 [{time, categories, series}]
  const timePoints: Array<{ time: string; categories: string[]; series: Record<string, unknown>[] }> =
    (p.data.timelineData as { time: string; categories: string[]; series: Record<string, unknown>[] }[]) || []

  if (timePoints.length === 0) {
    // 降级：将当前数据作为单一时间点展示
    const base = buildBar(p)
    return {
      ...base,
      timeline: {
        data: [p.title || ''],
        axisType: 'category' as const,
        autoPlay: true,
        playInterval: 2000,
        label: { color: textColor(p) },
      },
      options: [base],
    }
  }

  const baseOptions = timePoints.map((tp) => {
    const childParams: BuildParams = { ...p, categories: tp.categories, series: tp.series }
    return buildBar(childParams)
  })

  return {
    baseOption: {
      timeline: {
        data: timePoints.map((tp) => tp.time),
        axisType: 'category' as const,
        autoPlay: true,
        playInterval: 2000,
        label: { color: textColor(p) },
      },
      title: p.title
        ? { text: p.title, left: 'center', textStyle: { fontSize: 14, color: textColor(p), fontWeight: 600 } }
        : undefined,
      tooltip: p.showTooltip ? { trigger: 'axis' as const } : undefined,
      backgroundColor: 'transparent' as const,
    },
    options: baseOptions,
  }
}
