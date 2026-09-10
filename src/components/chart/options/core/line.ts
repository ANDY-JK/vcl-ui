// ⛔ 保护 — 折线图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../utils/types'
import { buildCommonChrome, mutedColor, buildMarkLine, buildMarkArea, buildXAxis, buildYAxis } from '../common'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：图表文案按当前语言 */
const t = useT()

/** 单系列点数超过该值自动启用 LTTB 降采样（移动端上万点全量绘制明显掉帧） */
const SAMPLING_THRESHOLD = 1000

export function buildLine(p: BuildParams): EChartsOption {
  const common = buildCommonChrome(p)
  const ml = buildMarkLine(p.markLine)
  const ma = buildMarkArea(p.markArea)
  // sampling：null = 强制关闭；显式值优先；未配置按点数自动降采样
  const maxPoints = Math.max(...p.series.map((s) => (s.data ?? []).length), 0)
  const sampling =
    p.sampling === null ? undefined : (p.sampling ?? (maxPoints > SAMPLING_THRESHOLD ? 'lttb' : undefined))

  return {
    ...common,
    xAxis: buildXAxis(p),
    yAxis: buildYAxis(p),
    series: p.series.map((s, i) => ({
      type: 'line' as const,
      name: s.name || t('chart.seriesFallback', { n: i + 1 }),
      data: (s.data ?? []) as (number | string)[],
      smooth: s.smooth ?? p.smooth,
      showSymbol: s.showSymbol ?? p.showSymbol,
      lineStyle: s.color ? { color: s.color } : undefined,
      itemStyle: s.color ? { color: s.color } : undefined,
      stack: p.stacked || p.stacked100 ? 'total' : undefined,
      areaStyle: p.stacked100 ? {} : undefined,
      sampling,
      markLine: ml,
      markArea: ma,
      ...(p.showDataLabel ? { label: { show: true, position: 'top', color: mutedColor(p) } } : {}),
    })),
    ...(p.stacked100 ? { yAxis: buildYAxis(p, { min: 0, max: 100 }) } : {}),
  }
}
