/**
 * ChartLegend · 图例项身份（#489）
 *
 * 症状：**两个系列同名**（`[{name:'销售'}, {name:'销售'}]`，或饼图两个数据项同名）
 * 时，图例会渲染出两个一模一样的条目，但：
 *   · `:key="item.name"` 重复 → Vue 报 "Duplicate keys found"；
 *   · 隐藏集合是**按名字**记的（`hiddenSeries: Set<string>`）→ 点其中一个，
 *     **两个一起消失**，用户以为只藏了一条。
 *
 * 这不是理论：饼图数据项同名（两个门店都叫"旗舰店"）与多系列图里
 * 两个 series 用同一个 name（"本年"/"本年（调整后）"写成了同一个）都很常见。
 *
 * 身份必须唯一：图例项需要一个**独立于展示名**的稳定 key，隐藏集合按 key 记，
 * 过滤时也按同一个 key —— 但**展示名仍然要保持原样**（用户在图例上看到的就是系列名）。
 */
import { describe, it, expect } from 'vitest'
import { computed } from 'vue'
import { mount } from '@vue/test-utils'
import { useChartLegend } from '@/components/chart/composables/useChartLegend'
import ChartLegend from '@/components/chart/ChartLegend.vue'
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
  return { ...h, emitted }
}

const dupSeries = {
  color: ['#a', '#b'],
  series: [
    { name: '销售', type: 'bar', data: [1, 2] },
    { name: '销售', type: 'bar', data: [3, 4] },
  ],
} as unknown as EChartsOption

describe('useChartLegend · 同名系列的身份（#489）', () => {
  it('同名系列：图例项仍按 series 逐条给出（不能因为同名就少一条）', () => {
    const h = harness(dupSeries)
    expect(h.legendItems.value).toHaveLength(2)
  })

  it('**同名系列：隐藏其中一个，另一个必须还留着**（旧实现两个一起消失）', () => {
    const h = harness(dupSeries)
    const key = h.legendItems.value[0].key
    h.onLegendToggle(key)
    const opt = h.chartOption.value as unknown as { series: Array<{ data: number[] }> }
    expect(opt.series[0].data, '被点的那条被藏').toEqual([])
    expect(opt.series[1].data, '同名但没被点的那条必须还在').toEqual([3, 4])
  })

  it('同名系列：图例项的 visible 状态各自独立', () => {
    const h = harness(dupSeries)
    const key = h.legendItems.value[0].key
    h.onLegendToggle(key)
    expect(h.legendItems.value[0].visible).toBe(false)
    expect(h.legendItems.value[1].visible).toBe(true)
  })

  it('同名系列：全部隐藏时两条都藏（toggle-all 语义不受影响）', () => {
    const h = harness(dupSeries)
    h.onLegendToggleAll(false)
    expect(h.legendItems.value.every((i) => !i.visible)).toBe(true)
    const opt = h.chartOption.value as unknown as { series: Array<{ data: number[] }> }
    expect(opt.series[0].data).toEqual([])
    expect(opt.series[1].data).toEqual([])
  })

  it('饼图同名数据项：同样按项独立隐藏', () => {
    const pie = {
      color: ['#a', '#b'],
      series: [{ type: 'pie', data: [{ name: '旗舰店', value: 1 }, { name: '旗舰店', value: 2 }] }],
    } as unknown as EChartsOption
    const h = harness(pie, 'pie')
    const key = h.legendItems.value[0].key
    h.onLegendToggle(key)
    const opt = h.chartOption.value as unknown as { series: Array<{ data: Array<{ name: string }> }> }
    expect(opt.series[0].data.map((d) => d.name)).toEqual(['旗舰店'])
  })

  it('不同名系列：key 唯一、行为不变（回归护栏）', () => {
    const h = harness({
      color: ['#a', '#b'],
      series: [
        { name: 'S1', type: 'bar', data: [1] },
        { name: 'S2', type: 'bar', data: [2] },
      ],
    } as unknown as EChartsOption)
    const keys = h.legendItems.value.map((i) => i.key)
    expect(new Set(keys).size).toBe(2)
    h.onLegendToggle(keys[0])
    const opt = h.chartOption.value as unknown as { series: Array<{ data: number[] }> }
    expect(opt.series[0].data).toEqual([])
    expect(opt.series[1].data).toEqual([2])
  })
})

describe('ChartLegend · 组件契约', () => {
  const items = [
    { key: 'k1', name: 'S1', color: '#a', visible: true },
    { key: 'k2', name: 'S2', color: '#b', visible: false },
  ]

  it('items 为空 → 不渲染任何东西', () => {
    const w = mount(ChartLegend, { props: { items: [] } })
    expect(w.find('.cl-root').exists()).toBe(false)
    w.unmount()
  })

  it('每项一个按钮，隐藏项带 off 类', () => {
    const w = mount(ChartLegend, { props: { items } })
    expect(w.findAll('.cl-item')).toHaveLength(2)
    expect(w.findAll('.cl-item')[1].classes()).toContain('off')
    w.unmount()
  })

  it('点某项 → emit toggle 带该项的 key（不是展示名）', async () => {
    const w = mount(ChartLegend, { props: { items } })
    await w.findAll('.cl-item')[0].trigger('click')
    expect(w.emitted('toggle')?.[0]).toEqual(['k1'])
    w.unmount()
  })

  it('全不选按钮：全部可见时发 visible=false（隐藏全部）', async () => {
    const w = mount(ChartLegend, { props: { items: items.map((i) => ({ ...i, visible: true })) } })
    await w.find('.cl-toggle-all').trigger('click')
    expect(w.emitted('toggle-all')?.[0]).toEqual([false])
    w.unmount()
  })

  it('全不选按钮：部分可见时发 visible=true（显示全部）', async () => {
    const w = mount(ChartLegend, { props: { items } })
    await w.find('.cl-toggle-all').trigger('click')
    expect(w.emitted('toggle-all')?.[0]).toEqual([true])
    w.unmount()
  })

  it('**同名项：key 不重复 → 不产生 Vue 的 Duplicate keys 警告**', async () => {
    const dup = [
      { key: 'k1', name: '销售', color: '#a', visible: true },
      { key: 'k2', name: '销售', color: '#b', visible: true },
    ]
    const w = mount(ChartLegend, { props: { items: dup } })
    expect(w.findAll('.cl-item')).toHaveLength(2)
    w.unmount()
  })
})