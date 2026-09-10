// ⛔ 保护 — 面积图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../utils/types'
import { buildCommonChrome, buildXAxis, buildYAxis } from '../common'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：图表文案按当前语言 */
const t = useT()

/** 单系列点数超过该值自动启用 LTTB 降采样（与 line.ts 同阈值） */
const SAMPLING_THRESHOLD = 1000

export function buildArea(p: BuildParams): EChartsOption {
  const common = buildCommonChrome(p)
  const maxPoints = Math.max(...p.series.map((s) => (s.data ?? []).length), 0)
  // null = 强制关闭；显式值优先；未配置按点数自动降采样
  const sampling =
    p.sampling === null ? undefined : (p.sampling ?? (maxPoints > SAMPLING_THRESHOLD ? 'lttb' : undefined))
  return {
    ...common,
    xAxis: buildXAxis(p, { boundaryGap: false }),
    yAxis: buildYAxis(p),
    series: p.series.map((s, i) => ({
      type: 'line' as const,
      name: s.name || t('chart.seriesFallback', { n: i + 1 }),
      data: (s.data ?? []) as (number | string)[],
      smooth: s.smooth ?? p.smooth,
      showSymbol: false,
      areaStyle: typeof s.areaStyle === 'object' ? s.areaStyle : { opacity: 0.25 },
      lineStyle: s.color ? { color: s.color } : undefined,
      itemStyle: s.color ? { color: s.color } : undefined,
      sampling,
    })),
  }
}
