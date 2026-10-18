// RendererDisplayTable：明细表展示元素的三个数据源（业务方：静态 / 绑定字段 / 接口 都要）
//
// 这是 `useDisplayData` 的第一个真实消费方。三类断言：
//   ① 三种数据源在同一组件里完全同构（组件不关心数据从哪来）
//   ② 列与行键的处理（配置优先 / 自动推导；行键缺失时补内部键）
//   ③ 失败与空态**说得出原因**（展示区空白最容易被当成"没数据"）
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import RendererDisplayTable from '@/components/form-builder/renderer/RendererDisplayTable.vue'
import type { FormField } from '@/components/form-builder/types'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const field = (over: Partial<FormField> = {}): FormField =>
  ({ key: 'k1', label: '明细', type: 'data-table', ...over }) as FormField

function mountTable(f: FormField, formData: Record<string, unknown> = {}, apiUrlPolicy?: Record<string, unknown>) {
  return mount(RendererDisplayTable, {
    props: { field: f, formData, apiUrlPolicy: apiUrlPolicy as never },
    global: { stubs: { DataTable: false } },
  })
}

describe('static 静态配置', () => {
  it('用配置的数据渲染表格行', async () => {
    const w = mountTable(
      field({ displaySource: { kind: 'static', staticData: [{ name: '甲', qty: 1 }, { name: '乙', qty: 2 }] } }),
    )
    await vi.waitFor(() => expect(w.text()).toContain('甲'))
    expect(w.text()).toContain('乙')
  })

  it('自定义列：表头用配置的 label', async () => {
    const w = mountTable(
      field({
        displaySource: { kind: 'static', staticData: [{ n: '甲' }] },
        columns: [{ key: 'n', label: '名称' }],
      }),
    )
    await vi.waitFor(() => expect(w.text()).toContain('名称'))
  })

  it('未配列时按数据首行的键自动推导表头', async () => {
    const w = mountTable(field({ displaySource: { kind: 'static', staticData: [{ sku: 'A1' }] } }))
    await vi.waitFor(() => expect(w.text()).toContain('sku'))
  })

  it('空数据 → 空态（不渲染空表格）', async () => {
    const w = mountTable(field({ displaySource: { kind: 'static', staticData: [] } }))
    await new Promise((r) => setTimeout(r, 20))
    expect(w.findComponent({ name: 'DataTable' }).exists()).toBe(false)
  })
})

describe('field 绑定字段', () => {
  it('取被绑定字段的值作为行', async () => {
    const w = mountTable(field({ displaySource: { kind: 'field', fieldKey: 'lines' } }), {
      lines: [{ item: '苹果' }],
    })
    await vi.waitFor(() => expect(w.text()).toContain('苹果'))
  })

  it('绑定值变化时表格跟着变（随填随变）', async () => {
    const data = ref<Record<string, unknown>>({ lines: [{ item: '苹果' }] })
    const w = mount(RendererDisplayTable, {
      props: { field: field({ displaySource: { kind: 'field', fieldKey: 'lines' } }), formData: data.value },
    })
    await vi.waitFor(() => expect(w.text()).toContain('苹果'))

    // 注意：真实链路里 formData 是响应式的（FormBuilder 的 formData），这里用 setProps 模拟其变化
    await w.setProps({ formData: { lines: [{ item: '苹果' }, { item: '香蕉' }] } })
    await vi.waitFor(() => expect(w.text()).toContain('香蕉'))
  })
})

describe('api 接口拉取', () => {
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response

  it('按 dataPath 取数并渲染', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ data: { rows: [{ no: 'R-1' }] } })))
    const w = mountTable(field({ displaySource: { kind: 'api', apiUrl: '/api/rows', dataPath: 'data.rows' } }))
    await vi.waitFor(() => expect(w.text()).toContain('R-1'))
  })

  it('跨域地址默认被拦：显示拒绝原因，且**不发请求**', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const w = mountTable(field({ displaySource: { kind: 'api', apiUrl: 'https://attacker.example/x' } }))
    await vi.waitFor(() => expect(w.text()).toMatch(/安全策略拒绝/))
    expect(fetcher, '被策略拒绝就不能发出去').not.toHaveBeenCalled()
  })

  it('接口失败 → 把原因显示出来（而不是一片空白）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as unknown as Response))
    const w = mountTable(field({ displaySource: { kind: 'api', apiUrl: '/api/rows' } }))
    await vi.waitFor(() => expect(w.text()).toContain('503'))
  })
})

describe('列与行键的健壮性', () => {
  it('行里没有 rowKey 字段时补内部键（否则 DataTable 的行定位会静默失效）', async () => {
    const w = mountTable(
      field({ displaySource: { kind: 'static', staticData: [{ a: 1 }, { a: 2 }] }, rowKey: 'id' }),
    )
    await vi.waitFor(() => expect(w.text()).toContain('1'))
    const table = w.findComponent({ name: 'DataTable' })
    const rows = table.props('data') as Record<string, unknown>[]
    expect(rows).toHaveLength(2)
    // 补了内部键：(rowKey 指定为 id，数据里没有 → 走内部键)
    expect(rows.every((r) => r.__vcl_row_key !== undefined)).toBe(true)
    // 且不改动原始字段
    expect(rows[0].a).toBe(1)
  })

  it('数据自带 rowKey 字段时原样使用，不补内部键', async () => {
    const w = mountTable(
      field({ displaySource: { kind: 'static', staticData: [{ id: 'x1', a: 1 }] }, rowKey: 'id' }),
    )
    await vi.waitFor(() => expect(w.text()).toContain('x1'))
    const rows = w.findComponent({ name: 'DataTable' }).props('data') as Record<string, unknown>[]
    expect(rows[0].__vcl_row_key).toBeUndefined()
  })

  it('原始值数组（如字符串）也包成单列表格，而不是整片空白', async () => {
    const w = mountTable(field({ displaySource: { kind: 'static', staticData: ['甲', '乙'] } }))
    await vi.waitFor(() => expect(w.text()).toContain('甲'))
    expect(w.text()).toContain('乙')
  })
})
