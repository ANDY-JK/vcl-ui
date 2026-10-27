/**
 * Chart 的「只给 data 就推断」这条路（`inferChartData`）此前**零覆盖**。
 *
 * `ChartProps.data` 文档列了四种形状（`types.ts` L164-165）：
 *   单序列数值数组 / 多序列二维数组 / 饼图 {name,value} 列表 / **ChartData 完整结构**
 * 而实现只认前三种 —— 第四种（`{ categories, series }`）静默不渲染。
 * 另外 `data: []` 会"猜出"一个空 series，于是 BaseChart 判定"有 series"→ 不显示空态，
 * 用户看到的是一块空画布而不是"暂无数据"。
 *
 * 这里把 BaseChart 打桩，直接观察 Chart 交给它的 option：
 *   `option === null` → BaseChart 会显示空态遮罩（它的判据是 `!props.option` 或 series 为空）
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'

vi.mock('@/components/chart/BaseChart.vue', () => ({
  // 不用 defineComponent：避免 vue/one-component-per-file（单测里造桩的既有约定）
  default: {
    name: 'BaseChart',
    props: { option: { type: Object, default: null } },
    setup(props: { option: Record<string, unknown> | null }) {
      return () =>
        h('div', {
          class: 'bc-stub',
          'data-has-option': props.option ? '1' : '0',
          'data-series': JSON.stringify(
            ((props.option?.series as Record<string, unknown>[]) ?? []).map((s) => ({
              type: s.type,
              name: s.name,
              len: Array.isArray(s.data) ? s.data.length : -1,
              // bar builder 专属：用它能证明"跑的是哪个 builder"（line builder 不设它）
              barMaxWidth: s.barMaxWidth,
            })),
          ),
          'data-categories': JSON.stringify((props.option?.xAxis as Record<string, unknown>)?.data ?? null),
        })
    },
  },
}))

// vi.mock 会被提升到 import 之上，所以这里 import 顺序不影响打桩生效
import Chart from '@/components/chart/Chart.vue'

function seriesOf(w: ReturnType<typeof mount>): { type?: string; name?: string; len: number }[] {
  return JSON.parse(w.find('.bc-stub').attributes('data-series') ?? '[]')
}

function mountChart(props: Record<string, unknown>) {
  return mount(Chart, { props, attachTo: document.body })
}

describe('Chart · 只给 data 时的推断（inferChartData）', () => {
  it('一维数值数组 → 一条 bar 序列（既有行为，别改坏）', () => {
    const w = mountChart({ data: [5, 6, 7] })
    expect(w.find('.bc-stub').attributes('data-has-option'), '应组装出 option').toBe('1')
    const s = seriesOf(w)
    expect(s.length).toBe(1)
    expect(s[0].type).toBe('bar')
    expect(s[0].len, '三个点都要进 series').toBe(3)
    w.unmount()
  })

  it('二维数组 → 多序列 + 自动类目（既有行为）', () => {
    const w = mountChart({
      data: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    })
    const s = seriesOf(w)
    expect(s.length, '两行 = 两条序列').toBe(2)
    expect(s[0].len).toBe(3)
    w.unmount()
  })

  it('{name,value}[] → 饼图数据进 series（既有行为）', () => {
    const w = mountChart({
      data: [
        { name: 'A', value: 3 },
        { name: 'B', value: 5 },
      ],
    })
    const s = seriesOf(w)
    expect(s.length).toBe(1)
    expect(s[0].len, '两个数据项').toBe(2)
    w.unmount()
  })

  /* ── 第 154 轮：文档列了 `ChartData` 形状，实现不认 ── */

  it('**ChartData 完整结构（{categories, series}）省略 type → 必须渲染**（文档列的第四种形状）', () => {
    const w = mountChart({
      data: { categories: ['一月', '二月'], series: [{ name: '销量', data: [1, 2] }] },
    })
    expect(w.find('.bc-stub').attributes('data-has-option'), '文档说 ChartData 是合法 data 形状，不能静默不画').toBe('1')
    const s = seriesOf(w)
    expect(s.length).toBe(1)
    expect(s[0].name, '名字要带过来').toBe('销量')
    expect(s[0].len).toBe(2)
    expect(
      JSON.parse(w.find('.bc-stub').attributes('data-categories') ?? 'null'),
      '类目要带过来（不能凭空生成 1/2/3）',
    ).toEqual(['一月', '二月'])
    w.unmount()
  })

  it('**series 自带 type 时按它画**（选 builder 而非硬编码 bar）', () => {
    const w = mountChart({
      data: { categories: ['a', 'b'], series: [{ type: 'line', name: '趋势', data: [1, 2] }] },
    })
    const s = seriesOf(w)[0] as { type?: string; barMaxWidth?: unknown }
    expect(s.type, 'series[0].type 应被尊重').toBe('line')
    // bar builder 会给 series 加 barMaxWidth，line builder 不会 —— 用它证明**选对了 builder**
    expect(s.barMaxWidth, '不应残留 bar builder 专属字段（说明跑的是 line builder）').toBeUndefined()
    w.unmount()
  })

  it('**空数组 data → 不造空 series，交给空态**（否则用户看到一块空画布）', () => {
    const w = mountChart({ data: [] })
    expect(
      w.find('.bc-stub').attributes('data-has-option'),
      '空数据应返回 null，让 BaseChart 显示"暂无数据"',
    ).toBe('0')
    w.unmount()
  })

  it('无法识别的 data（对象但不是 ChartData / 空对象）→ null，不抛错也不硬画', () => {
    const a = mountChart({ data: {} })
    expect(a.find('.bc-stub').attributes('data-has-option')).toBe('0')
    a.unmount()

    const b = mountChart({ data: { foo: 1 } })
    expect(b.find('.bc-stub').attributes('data-has-option')).toBe('0')
    b.unmount()

    // ChartData 形状但 series 为空 → 也交给空态
    const c = mountChart({ data: { categories: ['a'], series: [] } })
    expect(c.find('.bc-stub').attributes('data-has-option')).toBe('0')
    c.unmount()
  })
})