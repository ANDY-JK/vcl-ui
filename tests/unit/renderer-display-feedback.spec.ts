// 告知型展示：result（结果态）/ loading（加载态）
//
// 两者都属"不承载数据、不进提交数据"的元素，与 empty/skeleton 同族。
// 本文件锁三件事：注册与可见性、渲染参数的正确透传、以及**两条刻意的边界**：
//   · result 的 status 有 6 个取值（含 404/empty），不能硬塞进只有 5 档的 tone
//   · loading 不透传 fullscreen/overlay——展示元素把自己铺成全屏遮罩会挡住用户
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RendererDisplayResult from '@/components/form-builder/renderer/RendererDisplayResult.vue'
import RendererDisplayLoading from '@/components/form-builder/renderer/RendererDisplayLoading.vue'
import Result from '@/components/feedback/Result.vue'
import Loading from '@/components/feedback/Loading.vue'
import { getFieldRegistration, isLayoutField, getFieldMeta } from '@/components/form-builder/fieldRegistry'
import { FIELD_NODE_TYPES } from '@/components/form-builder/designer/types/domain'
import { createField, toFormSchema, type DesignerNode } from '@/components/form-builder/designer/types'
import { collectVisibleData } from '@/components/form-builder/useFormSchema'
import type { FormField } from '@/components/form-builder/types'

const TYPES = ['result', 'loading'] as const

describe('注册表 · 告知型展示已登记', () => {
  it.each(TYPES)('%s 已注册且为纯展示（isLayout=true）', (type) => {
    const reg = getFieldRegistration(type)
    expect(reg).toBeTruthy()
    expect(reg.isLayout, `${type} 不进提交数据`).toBe(true)
    expect(reg.group, '归入「展示」分组').toBe('fbGroup.display')
    expect(isLayoutField(type)).toBe(true)
  })

  it('对外枚举（FIELD_NODE_TYPES）与面板清单都包含它们', () => {
    const meta = getFieldMeta().map((x) => x.type)
    for (const t of TYPES) {
      expect(FIELD_NODE_TYPES).toContain(t)
      expect(meta).toContain(t)
    }
  })

  it.each(TYPES)('createField(%s) 产出可用默认值', (type) => {
    const f = createField(type as never, 1)
    expect(f.type).toBe(type)
    expect(f.span).toBe(24)
  })
})

describe('result · 渲染', () => {
  const mountResult = (over: Partial<FormField>) =>
    mount(RendererDisplayResult, {
      props: { field: { key: 'k', label: '提交成功', type: 'result', ...over } as FormField },
      global: { stubs: { Result: true } },
    })

  it('默认 success；标题取 label、描述取 hint', () => {
    const w = mountResult({ hint: '我们已收到你的提交' })
    const stub = w.findComponent(Result)
    expect(stub.props('status')).toBe('success')
    expect(stub.props('title')).toBe('提交成功')
    expect(stub.props('description')).toBe('我们已收到你的提交')
  })

  it('status 六种取值都原样透传（含 404/empty —— 这正是不能复用 tone 的原因）', () => {
    for (const s of ['success', 'error', 'info', 'warning', '404', 'empty'] as const) {
      const w = mountResult({ resultStatus: s })
      expect(w.findComponent(Result).props('status')).toBe(s)
    }
  })
})

describe('loading · 渲染与边界', () => {
  const mountLoading = (over: Partial<FormField>) =>
    mount(RendererDisplayLoading, {
      props: { field: { key: 'k', label: '加载', type: 'loading', ...over } as FormField },
      global: { stubs: { Loading: true } },
    })

  it('默认 spinner / md', () => {
    const w = mountLoading({})
    const stub = w.findComponent(Loading)
    expect(stub.props('variant')).toBe('spinner')
    expect(stub.props('size')).toBe('md')
  })

  it('**不透传 fullscreen / overlay**（展示元素不该把整页盖住、锁住滚动）', () => {
    const w = mountLoading({ loadingVariant: 'skeleton' })
    const stub = w.findComponent(Loading)
    expect(stub.props('fullscreen'), '必须显式关掉全屏').toBe(false)
    expect(stub.props('overlay'), '必须显式关掉遮罩').toBe(false)
    expect(stub.props('variant')).toBe('skeleton')
  })
})

describe('不进提交数据', () => {
  it('混排时 collectVisibleData 只留真实输入字段', () => {
    const nodes = [
      { id: 'n1', type: 'result', label: '提交成功', span: 24 },
      { id: 'n2', type: 'loading', label: '加载中', span: 24 },
      { id: 'n3', type: 'text', label: '姓名', span: 24, key: 'name' },
    ] as unknown as DesignerNode[]

    const schema = toFormSchema(nodes, {})
    const data: Record<string, unknown> = { n1: 'x', n2: 'y', name: '张三' }
    const submitted = collectVisibleData(schema.fields, data, () => true)
    expect(Object.keys(submitted)).toEqual(['name'])
  })
})
