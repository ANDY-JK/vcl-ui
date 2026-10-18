// RendererDisplayChart：图表展示元素（与明细表共用同一套数据源）
//
// 图表与表格的差别只在**数据形态的归一**：数据本身是 echarts option 就原样用（用户拿全控制权），
// 否则按行推导 categories/series。本文件锁这两条路径 + 三模式仍然同构。
//
// Chart 组件本身依赖 echarts，这里一律 stub——本文件测的是**喂给它的 option 对不对**，
// 不是 echarts 画得对不对（那是 chart 域自己的测试范围）。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import RendererDisplayChart from '@/components/form-builder/renderer/RendererDisplayChart.vue'
import type { FormField } from '@/components/form-builder/types'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const field = (over: Partial<FormField> = {}): FormField =>
  ({ key: 'k1', label: '趋势', type: 'chart', ...over }) as FormField

/** Chart 用 stub 替身，便于直接断言收到的 option */
const ChartStub = {
  name: 'Chart',
  props: ['option', 'height'],
  template: '<div class="chart-stub" />',
}

function mountChart(f: FormField, formData: Record<string, unknown> = {}, apiUrlPolicy?: Record<string, unknown>) {
  const w = mount(RendererDisplayChart, {
    props: { field: f, formData, apiUrlPolicy: apiUrlPolicy as never },
    global: { stubs: { Chart: ChartStub } },
  })
  const option = () => w.findComponent(ChartStub).props('option') as Record<string, unknown>
  return { w, option }
}

describe('数据形态归一', () => {
  it('行数据 → 第一个字符串列做类目轴，数值列各成一条 series', async () => {
    const { w, option } = mountChart(
      field({
        displaySource: {
          kind: 'static',
          staticData: [
            { month: '一月', sales: 10, cost: 4 },
            { month: '二月', sales: 20, cost: 9 },
          ],
        },
      }),
    )
    await vi.waitFor(() => expect(w.find('.chart-stub').exists()).toBe(true))
    expect(option().categories).toEqual(['一月', '二月'])
    const series = option().series as { name: string; data: number[] }[]
    expect(series.map((s) => s.name).sort()).toEqual(['cost', 'sales'])
    expect(series.find((s) => s.name === 'sales')?.data).toEqual([10, 20])
  })

  it('数据本身是完整 option（含 series）→ 原样交给 Chart，不擅自改写', async () => {
    const full = { xAxis: { type: 'category' }, series: [{ type: 'pie', data: [1, 2] }] }
    const { w, option } = mountChart(field({ displaySource: { kind: 'static', staticData: full } }))
    await vi.waitFor(() => expect(w.find('.chart-stub').exists()).toBe(true))
    expect(option()).toEqual(full)
  })

  it('列里没有数值列时仍能渲染（不崩，交给 echarts 决定怎么画）', async () => {
    const { w } = mountChart(
      field({ displaySource: { kind: 'static', staticData: [{ a: 'x', b: 'y' }] } }),
    )
    await new Promise((r) => setTimeout(r, 30))
    expect(w.findComponent(ChartStub).exists()).toBe(true)
  })
})

describe('三模式同构', () => {
  it('field 模式：绑定字段的值直接驱动图表', async () => {
    const { w, option } = mountChart(field({ displaySource: { kind: 'field', fieldKey: 'lines' } }), {
      lines: [{ label: 'A', v: 1 }, { label: 'B', v: 2 }],
    })
    await vi.waitFor(() => expect(w.find('.chart-stub').exists()).toBe(true))
    expect(option().categories).toEqual(['A', 'B'])
  })

  it('api 模式：走 dataPath 取数', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: { rows: [{ k: '一月', v: 5 }] } }),
      }) as unknown as Response),
    )
    const { w, option } = mountChart(
      field({ displaySource: { kind: 'api', apiUrl: '/api/rows', dataPath: 'data.rows' } }),
    )
    await vi.waitFor(() => expect(w.find('.chart-stub').exists()).toBe(true))
    expect(option().categories).toEqual(['一月'])
  })

  it('api 外域地址：显示拒绝原因且零请求（与表格、提交同一套守卫）', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const { w } = mountChart(field({ displaySource: { kind: 'api', apiUrl: 'https://attacker.example/x' } }))
    await vi.waitFor(() => expect(w.text()).toMatch(/安全策略拒绝/))
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('空与失败', () => {
  it('无数据 → 空态，不渲染图表', async () => {
    const { w } = mountChart(field({ displaySource: { kind: 'static', staticData: [] } }))
    await new Promise((r) => setTimeout(r, 30))
    expect(w.findComponent(ChartStub).exists()).toBe(false)
  })

  it('接口失败 → 把原因显示出来（而不是空白图表）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) }) as unknown as Response),
    )
    const { w } = mountChart(field({ displaySource: { kind: 'api', apiUrl: '/api/x' } }))
    await vi.waitFor(() => expect(w.text()).toContain('502'))
  })
})
