// ⛔ 保护 — 散点图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../utils/types'
import { buildCommonChrome, buildXAxis, buildYAxis } from '../common'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：图表文案按当前语言 */
const t = useT()

export function buildScatter(p: BuildParams): EChartsOption {
  const common = buildCommonChrome(p)
  return {
    ...common,
    tooltip: p.showTooltip
      ? {
          trigger: 'item' as const,
          formatter: (params: any) => `${params.seriesName}<br/>(${params.value[0]}, ${params.value[1]})`,
        }
      : undefined,
    xAxis: { ...buildXAxis(p), type: 'value' as const, data: undefined },
    yAxis: buildYAxis(p),
    series: p.series.map((s, i) => ({
      type: 'scatter' as const,
      name: s.name || t('chart.seriesFallback', { n: i + 1 }),
      data: (s.data ?? []) as (number | string)[],
      symbolSize: s.symbolSize || 10,
      itemStyle: s.color ? { color: s.color } : undefined,
    })),
  }
}
