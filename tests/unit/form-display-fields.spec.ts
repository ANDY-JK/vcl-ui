// 展示类字段（image / avatar / progress / tag，2026-10-18）
//
// 背景：低代码域原先只覆盖表单输入，组件库的**展示能力没有接进来**。
// 这批把 Image / Avatar / ProgressBar / Tag 注册为「展示类」字段。
//
// 关键设计：它们与 divider/title/paragraph 同属 **isLayout: true** —— 纯展示、不进提交数据。
// 因此本文件既验证「渲染对不对」，也验证「不污染收集数据」这条更容易被写坏的约束。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FormRenderer from '@/components/form-builder/FormRenderer.vue'
import {
  getFieldRegistration,
  isLayoutField,
  getFieldMeta,
} from '@/components/form-builder/fieldRegistry'
import { FIELD_NODE_TYPES } from '@/components/form-builder/designer/types/domain'
import { createField } from '@/components/form-builder/designer/types'
import { toFormSchema } from '@/components/form-builder/designer/types'
import { collectVisibleData } from '@/components/form-builder/useFormSchema'
import Image from '@/components/data/Image.vue'
import type { DesignerNode } from '@/components/form-builder/designer/types'

const DISPLAY = ['image', 'avatar', 'progress', 'tag']

function mountField(type: string, over: Record<string, unknown> = {}, modelValue: unknown = undefined) {
  return mount(FormRenderer, {
    props: { field: { type, key: `k_${type}`, label: `标签-${type}`, ...over }, modelValue },
    global: { stubs: { FieldError: true } },
  })
}

describe('注册表 · 展示类已登记', () => {
  it.each(DISPLAY)('%s 已注册且为纯展示（isLayout=true）', (type) => {
    const reg = getFieldRegistration(type)
    expect(reg, `${type} 必须在注册表里，否则设计器面板不会出现它`).toBeTruthy()
    expect(reg.isLayout, `${type} 是纯展示，不应进提交数据`).toBe(true)
    expect(isLayoutField(type)).toBe(true)
    expect(reg.group, '应归入独立的「展示」分组，而不是混进布局').toBe('fbGroup.display')
  })

  it('FIELD_NODE_TYPES（对外枚举）包含展示类', () => {
    for (const t of DISPLAY) expect(FIELD_NODE_TYPES).toContain(t)
  })

  it('getFieldTypes() 面板清单包含展示类（设计器里点得到）', () => {
    const names = getFieldMeta().map((x) => x.type)
    for (const t of DISPLAY) expect(names).toContain(t)
  })

  it.each(DISPLAY)('createField(%s) 产出可用默认值', (type) => {
    const f = createField(type as never, 1)
    expect(f.type).toBe(type)
    expect(f.span).toBe(24)
  })
})

describe('渲染 · 各类型走对应组件', () => {
  it('image：渲染 Image 组件（role=img 包裹层），src 透传', () => {
    const w = mountField('image', { src: '/a.png', alt: '示例图' })
    // Image 的根是 div.v-image[role=img]；真实 <img> 要等图片加载完成才出现（happy-dom 里不会），
    // 所以 src 不能靠 DOM 断言——直接看组件收到的 prop。
    const box = w.find('.v-image')
    expect(box.exists(), 'image 字段应渲染 Image 组件').toBe(true)
    expect(box.attributes('role')).toBe('img')
    expect(w.findComponent(Image).props('src'), 'src 必须透传到 Image').toBe('/a.png')
    expect(w.findComponent(Image).props('alt')).toBe('示例图')
  })

  it('image：未填 alt 时回落字段 label（无障碍不该指望用户自己想起来）', () => {
    const w = mountField('image', { src: '/a.png', label: '门店照片' })
    expect(w.find('.v-image').attributes('aria-label')).toBe('门店照片')
  })

  it('progress：percent 透传', () => {
    const w = mountField('progress', { percent: 72 })
    expect(w.text()).toContain('72')
  })

  it('tag：文本渲染，tone 映射到组件的 variant', () => {
    const w = mountField('tag', { text: '已通过', tone: 'success' })
    expect(w.text()).toContain('已通过')
    // Tag 的语义色属性叫 variant；映射错了会退成默认灰，是运行时看不出来的静默错
    expect(w.html(), 'tone 应映射成 variant=success').toMatch(/success/)
  })

  it('tag：lg 档收窄成 md（Tag 只有 sm/md，不透传不支持的档位）', () => {
    const w = mountField('tag', { text: 'x', size: 'lg' })
    expect(w.html(), '不应把 Tag 不支持的 lg 档透传下去').not.toMatch(/(^|["\s-])lg(["\s-]|$)/)
  })

  it('avatar：name 透传作为占位首字来源', () => {
    const w = mountField('avatar', { name: '张三' })
    expect(w.text()).toContain('张')
  })
})

describe('不进提交数据（isLayout 的核心语义）', () => {
  it('toFormSchema：展示类节点被标为 isLayout（这是后续排除的依据）', () => {
    const nodes = DISPLAY.map((t, i) => ({
      id: `n${i}`,
      type: t,
      label: t,
      span: 24,
      src: '/x.png',
      text: '标签',
      percent: 50,
      name: '张三',
    })) as unknown as DesignerNode[]

    const schema = toFormSchema(nodes, {})
    // 注意：布局/展示元素**仍会出现在 schema.fields 里**（既有设计如此，divider 也一样），
    // 真正保证"不进提交数据"的是收集阶段的排除——见下一条。
    for (const f of schema.fields) expect(isLayoutField(f.type)).toBe(true)
  })

  it('collectVisibleData：展示类字段不进提交数据（这才是用户可感知的保证）', () => {
    const nodes = [
      { id: 'n1', type: 'image', label: '图', span: 24, src: '/x.png' },
      { id: 'n2', type: 'text', label: '姓名', span: 24, key: 'name' },
      { id: 'n3', type: 'tag', label: '标签', span: 24, text: 'A' },
      { id: 'n4', type: 'progress', label: '进度', span: 24, percent: 50 },
    ] as unknown as DesignerNode[]

    const schema = toFormSchema(nodes, {})
    const data: Record<string, unknown> = { n1: 'x', name: '张三', n3: 'A', n4: 50 }
    const submitted = collectVisibleData(schema.fields, data, () => true)

    expect(Object.keys(submitted), '只应有真实的输入字段').toEqual(['name'])
    expect(submitted.name).toBe('张三')
  })
})

describe('to-schema · 展示属性透传', () => {
  it('展示属性原样带到渲染层（否则渲染器读不到内容）', () => {
    const nodes = [
      { id: 'n1', type: 'image', label: '图', span: 24, src: '/p.png', alt: '替代' },
      { id: 'n2', type: 'progress', label: '进度', span: 24, percent: 33 },
      { id: 'n3', type: 'tag', label: '标', span: 24, text: 'T', tone: 'warning', size: 'sm' },
    ] as unknown as DesignerNode[]
    const schema = toFormSchema(nodes, {})
    // 展示类 isLayout=true，fields 为空 —— 这里直接从 layout 元素上核对透传
    const all = JSON.stringify(schema)
    expect(all).toContain('/p.png')
    expect(all).toContain('替代')
  })
})
