/* useChartLegend 编排层 · HTML 图例与隐藏系列（#458）
 *
 * 从 Chart.vue 下沉：ECharts 内置图例被 showLegend:false 关闭，显隐改为「隐藏系列数据后重新 setOption」。
 * 硬约束：图例项名与过滤名同源（itemFallback / seriesFallback），否则点图例藏不住。
 */
import { describe, it, expect } from 'vitest'
import { computed } from 'vue'
import { useChartLegend } from '@/components/chart/composables/useChartLegend'
import type { EChartsOption } from 'echarts'

function harness(option: EChartsOption | null, type = 'bar', showLegend = true) {
  const emitted: Record<string, boolean>[] = []
  const h = useChartLegend({
    showLegend,
    type,
    resolvedOption: computed(() => option),
    t: (k, p) => (p ? `${k}:${p.n}` : k),
    colors: ['#1', '#2', '#3'],
    emitLegendSelectChanged: (s) => emitted.push(s),
  })
  return { ...h, emitted, option }
}

const barOption = {
  color: ['#a', '#b'],
  series: [
    { name: 'S1', type: 'bar', data: [1, 2] },
    { name: 'S2', type: 'bar', data: [3, 4] },
  ],
} as unknown as EChartsOption

describe('useChartLegend · 图例项', () => {
  it('常规系列：图例项来自 series.name，色块取色板轮转', () => {
    const h = harness(barOption)
    expect(h.legendItems.value.map((i) => i.name)).toEqual(['S1', 'S2'])
    expect(h.legendItems.value[0].color).toBe('#a')
    expect(h.legendItems.value.every((i) => i.visible)).toBe(true)
  })

  it('showLegend=false → 图例项为空，但 option 仍透传', () => {
    const h = harness(barOption, 'bar', false)
    expect(h.legendItems.value).toEqual([])
    expect(h.chartOption.value).toBe(barOption)
  })

  it('饼图：图例项来自 series[0].data 的 name，兜底名走 itemFallback', () => {
    const pie = {
      color: ['#a', '#b'],
      series: [{ type: 'pie', data: [{ name: '甲' }, { value: 2 }] }],
    } as unknown as EChartsOption
    const h = harness(pie, 'pie')
    expect(h.legendItems.value.map((i) => i.name)).toEqual(['甲', 'chart.itemFallback:2'])
  })

  it('反向保护：option 为 null 时图例项为空、chartOption 为 null', () => {
    const h = harness(null)
    expect(h.legendItems.value).toEqual([])
    expect(h.chartOption.value).toBe(null)
  })
})

describe('useChartLegend · 显隐与同步', () => {
  it('点击切换：隐藏集合变化 → chartOption 把对应 series.data 置空 + 抛 legendselectchanged', () => {
    const h = harness(barOption)
    // #489：隐藏集合按**项身份**（key）记，不是按展示名 —— 同名系列要能各自独立显隐。
    // 这里用图例项给出的 key，而不是硬编 'S1'。
    const key = h.legendItems.value[0].key
    h.onLegendToggle(key)
    expect(h.hiddenSeries.value.has(key)).toBe(true)
    expect(h.legendItems.value[0].visible).toBe(false)
    const opt = h.chartOption.value as unknown as { series: Array<{ name: string; data: number[] }> }
    expect(opt.series[0].data).toEqual([])
    expect(opt.series[1].data).toEqual([3, 4]) // 未隐藏的系列原样
    expect(h.emitted.at(-1)).toEqual({ S1: false, S2: true })
  })

  it('全部隐藏/全部显示：集合与图例项同步翻转', () => {
    const h = harness(barOption)
    h.onLegendToggleAll(false)
    expect(h.legendItems.value.every((i) => !i.visible)).toBe(true)
    h.onLegendToggleAll(true)
    expect(h.legendItems.value.every((i) => i.visible)).toBe(true)
  })

  it('饼图隐藏：按数据项过滤（藏的是项，不是整个 series）', () => {
    const pie = {
      color: ['#a', '#b'],
      series: [{ type: 'pie', data: [{ name: '甲', value: 1 }, { name: '乙', value: 2 }] }],
    } as unknown as EChartsOption
    const h = harness(pie, 'pie')
    h.onLegendToggle(h.legendItems.value[0].key)
    const opt = h.chartOption.value as unknown as { series: Array<{ data: Array<{ name: string }> }> }
    expect(opt.series[0].data.map((d) => d.name)).toEqual(['乙'])
  })

  it('ECharts 事件反向同步：selected=false 的项进入隐藏集合', () => {
    const h = harness(barOption)
    h.syncFromEcharts({ S1: false, S2: true })
    // #489：ECharts 报的是系列名，隐藏集合按身份记 → 名字要映射回身份
    expect([...h.hiddenSeries.value]).toEqual([h.legendItems.value[0].key])
    expect(h.legendItems.value[0].visible).toBe(false)
  })

  it('不产生新对象污染：隐藏为空时 chartOption 与 resolvedOption 同引用', () => {
    const h = harness(barOption)
    expect(h.chartOption.value).toBe(barOption)
  })
})
