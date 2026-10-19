// RendererDisplayChartTable：图表+表格上下组合（同一份 rows 喂两处）
//
// 关键约束：**图表与表格两处的推导必须各自与单组件版本完全同构**——
// 图表按 RendererDisplayChart 的 option 推导，表格按 RendererDisplayTable 的列/行键约定。
// 若这里出现第三种写法，同一个数据源在"图表页"和"明细页"就会显示得不一样，
// 用户无从判断哪边是对的。本文件用 stub 直接断言两处收到的 props。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import RendererDisplayChartTable from '@/components/form-builder/renderer/RendererDisplayChartTable.vue'
import type { FormField } from '@/components/form-builder/types'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const field = (over: Partial<FormField> = {}): FormField =>
  ({ key: 'k1', label: '月度看板', type: 'chart-table', ...over }) as FormField

const ROWS = [
  { month: '一月', sales: 10, cost: 4 },
  { month: '二月', sales: 20, cost: 9 },
]

const ChartTableStub = {
  name: 'ChartTable',
  props: ['option', 'columns', 'tableData', 'tableTitle', 'height'],
  template: '<div class="ct-stub" />',
}

function mountCT(f: FormField, formData: Record<string, unknown> = {}, apiUrlPolicy?: Record<string, unknown>) {
  const w = mount(RendererDisplayChartTable, {
    props: { field: f, formData, apiUrlPolicy: apiUrlPolicy as never },
    global: { stubs: { ChartTable: ChartTableStub } },
  })
  const ct = () => w.findComponent(ChartTableStub)
  return { w, ct }
}

describe('同一份 rows 喂两处', () => {
  it('图表侧：按行推导 categories/series（与单图表同构）', async () => {
    const { ct } = mountCT(field({ displaySource: { kind: 'static', staticData: ROWS } }))
    await vi.waitFor(() => expect(ct().exists()).toBe(true))
    const option = ct().props('option') as { categories: string[]; series: { name: string; data: number[] }[] }
    expect(option.categories).toEqual(['一月', '二月'])
    expect(option.series.find((s) => s.name === 'sales')?.data).toEqual([10, 20])
  })

  it('表格侧：列自动推导 + 行键补内部键（与单表格同构）', async () => {
    const { ct } = mountCT(field({ displaySource: { kind: 'static', staticData: ROWS } }))
    await vi.waitFor(() => expect(ct().exists()).toBe(true))
    const cols = ct().props('columns') as { key: string; title: string }[]
    expect(cols.map((c) => c.key)).toEqual(['month', 'sales', 'cost'])
    expect(cols.map((c) => c.title)).toEqual(['month', 'sales', 'cost'])
    const rows = ct().props('tableData') as Record<string, unknown>[]
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.__vcl_row_key !== undefined)).toBe(true)
  })

  it('数据本身是完整 option → 图表侧原样用（不擅自改写）', async () => {
    const full = { series: [{ type: 'pie', data: [1] }] }
    const { ct } = mountCT(field({ displaySource: { kind: 'static', staticData: full } }))
    await vi.waitFor(() => expect(ct().exists()).toBe(true))
    expect(ct().props('option')).toEqual(full)
  })

  it('配置的 columns 优先（表头用 label）', async () => {
    const { ct } = mountCT(
      field({
        displaySource: { kind: 'static', staticData: ROWS },
        columns: [{ key: 'month', label: '月份' }],
      }),
    )
    await vi.waitFor(() => expect(ct().exists()).toBe(true))
    expect((ct().props('columns') as { key: string; title: string }[]).map((c) => c.title)).toEqual(['月份'])
  })

  it('空数据 → 空态，不渲染组合件', async () => {
    const { w } = mountCT(field({ displaySource: { kind: 'static', staticData: [] } }))
    await new Promise((r) => setTimeout(r, 30))
    expect(w.findComponent(ChartTableStub).exists()).toBe(false)
  })
})

describe('三模式同构', () => {
  it('field 模式：绑定字段的值喂两处', async () => {
    const { ct } = mountCT(field({ displaySource: { kind: 'field', fieldKey: 'lines' } }), {
      lines: ROWS,
    })
    await vi.waitFor(() => expect(ct().exists()).toBe(true))
    expect((ct().props('tableData') as unknown[])).toHaveLength(2)
    expect((ct().props('option') as { categories: string[] }).categories).toEqual(['一月', '二月'])
  })

  it('api 模式：走 dataPath 取数', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: { rows: ROWS } }),
      }) as unknown as Response),
    )
    const { ct } = mountCT(
      field({ displaySource: { kind: 'api', apiUrl: '/api/rows', dataPath: 'data.rows' } }),
    )
    await vi.waitFor(() => expect(ct().exists()).toBe(true))
    expect((ct().props('tableData') as unknown[])).toHaveLength(2)
  })

  it('api 外域地址：零请求并显示拒绝原因', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const { w } = mountCT(field({ displaySource: { kind: 'api', apiUrl: 'https://attacker.example/x' } }))
    await vi.waitFor(() => expect(w.text()).toMatch(/安全策略拒绝/))
    expect(fetcher).not.toHaveBeenCalled()
  })
})
