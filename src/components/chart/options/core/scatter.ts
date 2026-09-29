// ⛔ 保护 — 散点图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../utils/types'
import { buildCommonChrome, buildXAxis, buildYAxis } from '../common'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：图表文案按当前语言 */
const t = useT()

/**
 * tooltip formatter 参数：echarts 主入口不导出 formatter 参数类型（CallbackDataParams /
 * TopLevelFormatterParams 都在 dist/shared 内部），且不同 trigger 形态还不一样。
 * 这里只取 seriesName + value[0]/value[1]，用窄接口 + 守卫表达，比 any 自描述且不会
 * 掩盖真实形状（触发形状不符时静默降级成空串，不会抛）。
 */
interface ScatterTooltipParam {
  seriesName?: string
  value?: unknown
}
function scatterTip(p: ScatterTooltipParam): string {
  const v = Array.isArray(p.value) ? (p.value as unknown[]) : []
  const x = v[0] ?? ''
  const y = v[1] ?? ''
  return `${p.seriesName ?? ''}<br/>(${x}, ${y})`
}

export function buildScatter(p: BuildParams): EChartsOption {
  const common = buildCommonChrome(p)
  return {
    ...common,
    tooltip: p.showTooltip
      ? { trigger: 'item' as const, formatter: (params: unknown) => scatterTip(params as ScatterTooltipParam) }
      : undefined,
    // 散点图是 value 轴：覆盖 buildXAxis 的 category 默认（axis data 本就只对 category 有意义，
    // 原本写 data: undefined 是 any 时代的冗余字段，收窄后已删）
    xAxis: { ...buildXAxis(p), type: 'value' as const },
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
