// ⛔ 保护 — 时间轴 builder
// 注意：ECharts 5.6.0 的 Timeline compound option 有内部 bug
// (ondraw/layoutInstance 错误)，改用多系列分组柱状图展示时间轴数据。
// 当 ECharts 修复后可恢复 compound option 结构。
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../utils/types'
import { buildBar } from '../core/bar'
import { textColor } from '../common'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：builder 生成的图表文案按当前语言 */
const t = useT()

export function buildTimeline(p: BuildParams): EChartsOption {
  const timePoints: Array<{ time: string; categories: string[]; series: Record<string, unknown>[] }> =
    (p.data.timelineData as { time: string; categories: string[]; series: Record<string, unknown>[] }[]) || []

  if (timePoints.length === 0) {
    // 降级：将当前数据作为普通柱状图
    return buildBar(p)
  }

  // 降级方案：将多个时间点的数据合并为多系列分组柱状图
  // 每个时间点作为一个系列，用不同颜色区分
  const allCategories = timePoints[0]?.categories || []
  const mergedSeries = timePoints.map((tp) => ({
    name: tp.time,
    type: 'bar' as const,
    data: (tp.series[0]?.data as (number | string)[]) || [],
    barGap: '10%' as const,
  }))

  // 使用 buildBar 的公共配置 + 自定义 series
  const baseParams: BuildParams = {
    ...p,
    categories: allCategories,
    series: mergedSeries as unknown as BuildParams['series'],
  }
  const base = buildBar(baseParams)

  return {
    ...base,
    // 覆盖 series 为合并后的多系列
    series: mergedSeries as unknown as EChartsOption['series'],
    legend: { show: false, data: timePoints.map((tp) => tp.time) },
    title: p.title
      ? {
          text: t('chart.timelineSuffix', { title: p.title }),
          left: 'center',
          top: 4,
          textStyle: { fontSize: 14, color: textColor(p), fontWeight: 600 },
        }
      : undefined,
  }
}
