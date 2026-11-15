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
  /**
   * 项的**唯一身份**（#489）。与展示名 `name` 分开：
   * 两个系列可以同名（饼图里两个门店都叫"旗舰店"、多系列里两个 series 写了同一个 name），
   * 而隐藏集合/过滤/DOM key 都必须按身份走 —— 否则点其中一个会**两个一起消失**，
   * `:key` 还会撞出 Vue 的 Duplicate keys 警告。
   */
  key: string
  /** 展示名（原样，用户在图例上看到的就是它） */
  name: string
  color: string
  visible: boolean
}

/**
 * 项身份：由「类型前缀 + 展示名 + 该名出现序号」组成。
 *
 * 为什么带序号：同名项靠序号区分（两个系列都叫"销售"时它们是两条不同的数据）。
 * 为什么带展示名而不是纯序号：数据顺序变化时（前面插一个系列）纯序号会让后面所有项的
 * 身份漂移，用户之前的显隐状态就错位了；带上名字后，只有**同名项之间**的序号会变，
 * 别的项不受影响。
 */
function itemKey(prefix: string, name: string, seen: Map<string, number>): string {
  const n = seen.get(name) ?? 0
  seen.set(name, n + 1)
  return `${prefix}:${name}#${n}`
}

export function useChartLegend(d: ChartLegendDeps) {
  // 隐藏集合按**项身份**（key）记，不是按展示名（#489）：同名项必须能各自独立显隐。
  const hiddenSeries = ref<Set<string>>(new Set())

  const legendItems = computed<LegendItem[]>(() => {
    if (!d.showLegend || !d.resolvedOption.value) return []
    const opt = d.resolvedOption.value as Record<string, unknown>
    const colors: string[] = (opt.color as string[]) || d.colors
    const seriesArr = (opt.series as Record<string, unknown>[]) || []
    const seen = new Map<string, number>()

    // 饼图 / 漏斗：从 series[0].data 提取各数据项名
    if ((d.type === 'pie' || d.type === 'funnel') && Array.isArray(seriesArr[0]?.data)) {
      return (seriesArr[0].data as Record<string, unknown>[]).map((item, i: number) => {
        const name = String(
          typeof item === 'object'
            ? (item.name ?? d.t('chart.itemFallback', { n: i + 1 }))
            : d.t('chart.itemFallback', { n: i + 1 }),
        )
        const key = itemKey('item', name, seen)
        return {
          key,
          name,
          color: colors[i % colors.length] || '#999',
          visible: !hiddenSeries.value.has(key),
        }
      })
    }

    // 雷达 / 常规：每个 series 是一条图例项
    return seriesArr.map((s: Record<string, unknown>, i: number) => {
      const name = String(s.name ?? d.t('chart.seriesFallback', { n: i + 1 }))
      const key = itemKey('series', name, seen)
      return {
        key,
        name,
        color: colors[i % colors.length] || '#999',
        visible: !hiddenSeries.value.has(key),
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
    // 身份算法必须与 legendItems 完全一致（同样的 seen 计数、同样的前缀），
    // 否则过滤用的 key 与图例项的 key 对不上 → 点图例藏不住（#489）。
    const seen = new Map<string, number>()
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
          const key = itemKey('item', name, seen)
          return !hidden.has(key)
        })
      } else {
        const name = String(s.name ?? d.t('chart.seriesFallback', { n: i + 1 }))
        const key = itemKey('series', name, seen)
        if (hidden.has(key)) {
          // 常规系列：按名称置空数据实现隐藏
          s.data = []
        }
      }
    }
    return { ...opt, series: seriesArr } as unknown as EChartsOption
  })

  function onLegendToggle(key: string): void {
    const s = new Set(hiddenSeries.value)
    if (s.has(key)) s.delete(key)
    else s.add(key)
    hiddenSeries.value = s
    emitSelectChanged()
  }

  function onLegendToggleAll(visible: boolean): void {
    if (visible) hiddenSeries.value = new Set()
    else hiddenSeries.value = new Set(legendItems.value.map((i) => i.key))
    emitSelectChanged()
  }

  /** ECharts 自身的 legendselectchanged（例如编程式 API 触发）→ 反向同步隐藏集合 */
  function syncFromEcharts(selected: Record<string, boolean>): void {
    const h = new Set<string>()
    // ECharts 报的是**系列名**，而隐藏集合按身份（key）记 —— 这里把名字映射回身份。
    // 同名系列在 ECharts 侧本来就分不开（它的 selected 也是按名），所以同名时无法逐条还原：
    // 保守做法是「同名系列里只要有一个被 ECharts 隐藏，就都标记为隐藏」，不制造假可见。
    const byName = new Map<string, string[]>()
    for (const item of legendItems.value) {
      const arr = byName.get(item.name) ?? []
      arr.push(item.key)
      byName.set(item.name, arr)
    }
    for (const [name, val] of Object.entries(selected)) {
      if (val) continue
      const keys = byName.get(name)
      if (!keys) continue
      for (const k of keys) h.add(k)
    }
    hiddenSeries.value = h
  }

  function emitSelectChanged(): void {
    const selected: Record<string, boolean> = {}
    // 对外仍报**系列名**（ECharts 的 legendselectchanged 契约就是按名），
    // 同名项在对外事件里天然合并成一条 —— 这是 ECharts 侧的既有语义，不改。
    for (const item of legendItems.value) selected[item.name] = item.visible
    d.emitLegendSelectChanged(selected)
  }

  return { hiddenSeries, legendItems, chartOption, onLegendToggle, onLegendToggleAll, syncFromEcharts }
}
