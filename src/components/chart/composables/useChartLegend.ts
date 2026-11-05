/**
 * useChartLegend — Chart 的 HTML 图例（#458 从 Chart.vue 下沉）
 *
 * 背景：ECharts 内置图例被 showLegend:false 关掉（视觉由 HTML 图例接管），
 * 因此 ECharts 的 legendToggleSelect 对 series 是空操作；显隐改为「隐藏系列数据后重新 setOption」实现。
 *
 * 本 composable 管：
 *   1. 隐藏集合（hiddenSeries）与图例项（legendItems，含兜底名规则）；
 *   2. 由隐藏集合推导出的最终 option（applyHiddenSeries）；
 *   3. 点击切换 / 全部切换 / 与 ECharts 事件的双向同步。
 *
 * 兜底名一致性是本模块的硬约束：chartOption 过滤用的名字必须与 legendItems 展示用的名字
 * 同源（itemFallback / seriesFallback），否则"点图例藏不住"。
 */
import { ref, computed, type ComputedRef } from 'vue'
import type { EChartsOption } from 'echarts'

export interface ChartLegendDeps {
  /** 图例开关（false 时 HTML 图例不渲染） */
  showLegend: boolean
  /** 图表类型（饼/漏斗走数据项图例，其余走系列图例） */
  type: string
  /** 应用图例前的 option */
  resolvedOption: ComputedRef<EChartsOption | null>
  /** 翻译（兜底名与 tooltip 走当前语言） */
  t: (key: string, params?: Record<string, unknown>) => string
  /** 默认色板（图例色块） */
  colors: string[]
  /** 向外抛 legendselectchanged（宿主与 ECharts 事件同源） */
  emitLegendSelectChanged: (selected: Record<string, boolean>) => void
}

export interface LegendItem {
  name: string
  color: string
  visible: boolean
}

export function useChartLegend(d: ChartLegendDeps) {
  const hiddenSeries = ref<Set<string>>(new Set())

  const legendItems = computed<LegendItem[]>(() => {
    if (!d.showLegend || !d.resolvedOption.value) return []
    const opt = d.resolvedOption.value as Record<string, unknown>
    const colors: string[] = (opt.color as string[]) || d.colors
    const seriesArr = (opt.series as Record<string, unknown>[]) || []

    // 饼图 / 漏斗：从 series[0].data 提取各数据项名
    if ((d.type === 'pie' || d.type === 'funnel') && Array.isArray(seriesArr[0]?.data)) {
      return (seriesArr[0].data as Record<string, unknown>[]).map((item, i: number) => {
        const name = String(
          typeof item === 'object'
            ? (item.name ?? d.t('chart.itemFallback', { n: i + 1 }))
            : d.t('chart.itemFallback', { n: i + 1 }),
        )
        return {
          name,
          color: colors[i % colors.length] || '#999',
          visible: !hiddenSeries.value.has(name),
        }
      })
    }

    // 雷达 / 常规：每个 series 是一条图例项
    return seriesArr.map((s: Record<string, unknown>, i: number) => {
      const name = String(s.name ?? d.t('chart.seriesFallback', { n: i + 1 }))
      return {
        name,
        color: colors[i % colors.length] || '#999',
        visible: !hiddenSeries.value.has(name),
      }
    })
  })

  /**
   * 最终渲染 option：应用隐藏状态。
   * 浅拷贝 series 项即可 —— option 含函数字段（如 tooltip.position），不能 structuredClone。
   */
  const chartOption = computed<EChartsOption | null>(() => {
    const opt = d.resolvedOption.value
    const hidden = hiddenSeries.value
    if (!opt || hidden.size === 0) return opt
    const rawSeries = opt.series
    if (!Array.isArray(rawSeries)) return opt
    const seriesArr = rawSeries.map((s) => ({ ...s })) as Array<Record<string, unknown>>
    const isItemLegend = d.type === 'pie' || d.type === 'funnel'
    for (let i = 0; i < seriesArr.length; i++) {
      const s = seriesArr[i]
      const data = s.data
      if (!Array.isArray(data)) continue
      if (isItemLegend) {
        // 饼图/漏斗：图例项对应 series[0].data 数据项 → 过滤掉隐藏项
        // 兜底名必须与 legendItems 同源（itemFallback），否则点图例藏不住
        s.data = data.filter((item, di) => {
          const name = String(
            typeof item === 'object' && item !== null
              ? ((item as { name?: string }).name ?? d.t('chart.itemFallback', { n: di + 1 }))
              : d.t('chart.itemFallback', { n: di + 1 }),
          )
          return !hidden.has(name)
        })
      } else if (hidden.has(String(s.name ?? d.t('chart.seriesFallback', { n: i + 1 })))) {
        // 常规系列：按名称置空数据实现隐藏
        s.data = []
      }
    }
    return { ...opt, series: seriesArr } as unknown as EChartsOption
  })

  function onLegendToggle(name: string): void {
    const s = new Set(hiddenSeries.value)
    if (s.has(name)) s.delete(name)
    else s.add(name)
    hiddenSeries.value = s
    emitSelectChanged()
  }

  function onLegendToggleAll(visible: boolean): void {
    if (visible) hiddenSeries.value = new Set()
    else hiddenSeries.value = new Set(legendItems.value.map((i) => i.name))
    emitSelectChanged()
  }

  /** ECharts 自身的 legendselectchanged（例如编程式 API 触发）→ 反向同步隐藏集合 */
  function syncFromEcharts(selected: Record<string, boolean>): void {
    const h = new Set<string>()
    for (const [key, val] of Object.entries(selected)) {
      if (!val) h.add(key)
    }
    hiddenSeries.value = h
  }

  function emitSelectChanged(): void {
    const selected: Record<string, boolean> = {}
    for (const item of legendItems.value) selected[item.name] = item.visible
    d.emitLegendSelectChanged(selected)
  }

  return { hiddenSeries, legendItems, chartOption, onLegendToggle, onLegendToggleAll, syncFromEcharts }
}
