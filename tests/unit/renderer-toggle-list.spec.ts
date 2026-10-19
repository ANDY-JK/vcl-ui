// RendererToggleList：开关列表（输入型字段）
//
// 组件（ToggleList）是"就地改行"模型：onToggle 里直接 item[toggleField] = newValue。
// 与低代码"受控值"语义对接时，有两条**必须守住**的约束：
//   ① 渲染器必须传**本地副本**——否则用户拨一下开关就把共享数据源改了
//      （静态配置被改、或缓存被污染，下次打开表单看到的已不是原始数据）
//   ② 字段值是**被打开行的 id 数组**，不是整行对象数组
//      （后者会把标题、描述等展示信息一起塞进提交数据）
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import RendererToggleList from '@/components/form-builder/renderer/RendererToggleList.vue'
import ToggleList from '@/components/data/ToggleList.vue'
import { getFieldRegistration, isLayoutField, getFieldMeta } from '@/components/form-builder/fieldRegistry'
import { FIELD_NODE_TYPES } from '@/components/form-builder/designer/types/domain'
import { createField, toFormSchema, type DesignerNode } from '@/components/form-builder/designer/types'
import { collectVisibleData } from '@/components/form-builder/useFormSchema'
import type { FormField } from '@/components/form-builder/types'

afterEach(() => {
  vi.restoreAllMocks()
})

const ROWS = [
  { id: 'a', display_name: '门店 A', is_enabled: false },
  { id: 'b', display_name: '门店 B', is_enabled: false },
]

const field = (over: Partial<FormField> = {}): FormField =>
  ({
    key: 'enabled',
    label: '启用门店',
    type: 'toggle-list',
    displaySource: { kind: 'static', staticData: ROWS },
    rowKey: 'id',
    toggleField: 'is_enabled',
    ...over,
  }) as FormField

async function mountTL(modelValue: unknown = [], over: Partial<FormField> = {}) {
  const w = mount(RendererToggleList, {
    props: { field: field(over), modelValue },
    global: { stubs: { ToggleList: true, Empty: true, Skeleton: true } },
  })
  await nextTick()
  await new Promise((r) => setTimeout(r, 20))
  return w
}

describe('注册与语义', () => {
  it('toggle-list 已注册，且 isLayout=false（它产出一个值）', () => {
    const reg = getFieldRegistration('toggle-list')
    expect(reg).toBeTruthy()
    expect(reg.isLayout).toBe(false)
    expect(isLayoutField('toggle-list')).toBe(false)
  })

  it('对外枚举与面板清单都包含它', () => {
    expect(FIELD_NODE_TYPES).toContain('toggle-list')
    expect(getFieldMeta().map((x) => x.type)).toContain('toggle-list')
  })

  it('默认值带 displaySource（列表没有数据源就没内容）', () => {
    const f = createField('toggle-list' as never, 1)
    expect((f as { displaySource?: unknown }).displaySource).toBeTruthy()
  })
})

describe('受控值 ↔ 组件模型', () => {
  it('传入的 id 数组回显为"已打开"', async () => {
    const w = await mountTL(['b'])
    const items = w.findComponent(ToggleList).props('items') as Record<string, unknown>[]
    expect(items.find((r) => r.id === 'a')?.is_enabled).toBe(false)
    expect(items.find((r) => r.id === 'b')?.is_enabled).toBe(true)
  })

  it('开关变化后 emit 出**被打开行的 id 数组**（不是整行对象）', async () => {
    const w = await mountTL([])
    const items = w.findComponent(ToggleList).props('items') as Record<string, unknown>[]
    // 模拟组件就地改行（这正是 ToggleList 的真实行为）
    const target = items.find((r) => r.id === 'a')!
    target.is_enabled = true
    w.findComponent(ToggleList).vm.$emit('toggle', target, true)
    await nextTick()
    const emitted = w.emitted('update:modelValue') as unknown[][] | undefined
    expect(emitted?.[emitted.length - 1][0]).toEqual(['a'])
  })

  it('**传的是本地副本**：改副本不能污染数据源（否则拨一下开关就把静态配置改了）', async () => {
    const w = await mountTL([])
    const items = w.findComponent(ToggleList).props('items') as Record<string, unknown>[]
    items[0].is_enabled = true
    items[0].display_name = '被改了'
    await nextTick()
    // 原始数据源对象必须原样不动
    expect(ROWS[0].is_enabled).toBe(false)
    expect(ROWS[0].display_name).toBe('门店 A')
  })

  it('值不是数组时当空（不猜）', async () => {
    for (const bad of ['a,b', 1, null, { a: 1 }]) {
      const w = await mountTL(bad)
      const items = w.findComponent(ToggleList).props('items') as Record<string, unknown>[]
      expect(items.every((r) => r.is_enabled === false), `${JSON.stringify(bad)} 不应回显为已打开`).toBe(true)
    }
  })
})

describe('数据源三模式（复用展示类那一套）', () => {
  it('field 模式：绑定字段的值作为列表', async () => {
    const w = mount(RendererToggleList, {
      props: {
        field: field({ displaySource: { kind: 'field', fieldKey: 'stores' } }),
        modelValue: [],
        formData: { stores: ROWS },
      },
      global: { stubs: { ToggleList: true, Empty: true, Skeleton: true } },
    })
    await new Promise((r) => setTimeout(r, 30))
    expect((w.findComponent(ToggleList).props('items') as unknown[]).length).toBe(2)
  })

  it('api 外域地址：零请求并显示拒绝原因', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const w = mount(RendererToggleList, {
      props: {
        field: field({ displaySource: { kind: 'api', apiUrl: 'https://attacker.example/x' } }),
        modelValue: [],
      },
      // Empty 用真实组件（不 stub）：拒绝原因正是经它渲染出来的
      global: { stubs: { ToggleList: true, Skeleton: true } },
    })
    await vi.waitFor(() => expect(w.text()).toMatch(/安全策略拒绝/))
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('进提交数据（输入型）', () => {
  it('collectVisibleData 会带上它的值', () => {
    const nodes = [
      { id: 'n1', type: 'toggle-list', label: '启用门店', span: 24, key: 'enabled' },
      { id: 'n2', type: 'text', label: '姓名', span: 24, key: 'name' },
    ] as unknown as DesignerNode[]

    const schema = toFormSchema(nodes, {})
    const data: Record<string, unknown> = { enabled: ['a', 'c'], name: '张三' }
    const submitted = collectVisibleData(schema.fields, data, () => true)
    expect(Object.keys(submitted).sort()).toEqual(['enabled', 'name'])
    expect(submitted.enabled).toEqual(['a', 'c'])
  })
})
