// FormFieldGroup 转发契约（2026-10-21，审查 FormBuilder 第十三刀）
//
// ## 这个组件存在的唯一理由
//
// FormBuilder 里 4 处 `<FieldList>` 传的 8 个 props + 2 个事件**完全相同**，
// 只有 `:fields` 表达式不同（tabs / collapse / steps / 普通分组）。
//
// 价值不是行数（抽子组件本身要占位，净收益约 0），而是：
// **FieldList 契约变化从"改 4 处"降到"改 1 处"**——
// 此前给 FieldList 加一个 prop，容易只加在一两个分支，于是
// "tabs 里的必填红框不显示"这类 bug 只在某个布局下出现。
//
// 所以测试要锁的正是这层**透传**：props 原样下去、事件原样上来。
// 一旦有人把某个 prop 漏掉，这条测试立刻红 —— 那正是它要防的缺陷形态。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FormFieldGroup from '@/components/form-builder/FormFieldGroup.vue'
import FieldList from '@/components/form-builder/FieldList.vue'
import type { FormField, RenderSection } from '@/components/form-builder/types'

const section = { id: 's1', fields: [], defaultSpan: 24 } as unknown as RenderSection
const fields = [{ key: 'a', type: 'input', label: 'A' }] as unknown as FormField[]
const errors = { a: '必填' }
// 桩必须返回**非 undefined 的特定值** —— 若写成 `() => undefined`，
// "漏传 getOptions" 与 "传了但返回 undefined" 无法区分，负向对照会失效
const OPTIONS = [{ label: '选项A', value: 'a' }]
const getOptions = () => OPTIONS

function mountGroup(overrides: Record<string, unknown> = {}) {
  return mount(FormFieldGroup, {
    props: {
      fields,
      section,
      formData: { a: 1 },
      errors,
      disabled: true,
      getOptions,
      ...overrides,
    },
    global: { stubs: {} },
  })
}

describe('FormFieldGroup 透传', () => {
  it('8 个 props 全部原样传给 FieldList（漏一个就会让某布局下行为不一致）', () => {
    const w = mountGroup()
    const child = w.findComponent(FieldList)
    expect(child.exists(), '应渲染 FieldList').toBe(true)

    const p = child.props()
    expect(p.fields, 'fields').toEqual(fields)
    expect(p.section, 'section').toEqual(section)
    expect(p.formData, 'formData').toEqual({ a: 1 })
    expect(p.errors, 'errors').toEqual(errors)
    expect(p.disabled, 'disabled').toBe(true)
    // 函数会被 Vue 包装，断言行为而非引用
    expect(typeof p.getOptions, 'getOptions').toBe('function')
    expect(p.getOptions(), 'getOptions 应原样透传（返回桩的 OPTIONS）').toBe(OPTIONS)
  })

  it('disabled 传 false 时不会变成 true（不能写成 :disabled="true" 硬编码）', () => {
    const w = mountGroup({ disabled: false })
    expect(w.findComponent(FieldList).props().disabled).toBe(false)
  })

  it('props 变化会传导下去（不是只在挂载时读一次）', async () => {
    const w = mountGroup({ disabled: false })
    expect(w.findComponent(FieldList).props().disabled).toBe(false)

    await w.setProps({ disabled: true })
    expect(w.findComponent(FieldList).props().disabled, 'props 更新应传给子组件').toBe(true)
  })
})

describe('FormFieldGroup 事件转发', () => {
  it('子组件 update:field → 父组件收到同参数', async () => {
    const w = mountGroup()
    const child = w.findComponent(FieldList)
    child.vm.$emit('update:field', 'a', 42)
    await w.vm.$nextTick()

    const emitted = w.emitted('update:field')
    expect(emitted, '应转发 update:field').toBeTruthy()
    expect(emitted![0], '参数应是 [key, value]').toEqual(['a', 42])
  })

  it('子组件 change → 父组件收到同一个 field 对象', async () => {
    const w = mountGroup()
    const child = w.findComponent(FieldList)
    const field = fields[0]
    child.vm.$emit('change', field)
    await w.vm.$nextTick()

    const emitted = w.emitted('change')
    expect(emitted, '应转发 change').toBeTruthy()
    expect(emitted![0][0], '应是同一个 field 对象（不是拷贝）').toBe(field)
  })
})

describe('FormFieldGroup 不越权', () => {
  it('不渲染 Card（Card 留在这四个分支各自的容器结构里）', () => {
    const w = mountGroup()
    // 下沉时一度把 Card 也吸收进来（能省 18 行），但 tabs/collapse/steps 分支的
    // Card 本来包住「容器组件 + 字段列表」整体，吸收后结构就坏了（测试 36→25）。
    // 这条断言锁住"不吸收 Card"这个决定，防止后来者再犯。
    expect(w.find('.fb-group-card').exists(), '不应自带 Card 包装').toBe(false)
  })
})

describe('FormFieldGroup focus/blur 转发（2026-10-31，TD-35 收口）', () => {
  it('子组件 focus → 父组件收到同一个 field 对象', async () => {
    const w = mountGroup()
    const child = w.findComponent(FieldList)
    const field = fields[0]
    child.vm.$emit('focus', field)
    await w.vm.$nextTick()
    const emitted = w.emitted('focus')
    expect(emitted, '应转发 focus').toBeTruthy()
    expect(emitted![0][0], '应是同一个 field 对象').toBe(field)
  })

  it('子组件 blur → 父组件收到同一个 field 对象', async () => {
    const w = mountGroup()
    const child = w.findComponent(FieldList)
    const field = fields[0]
    child.vm.$emit('blur', field)
    await w.vm.$nextTick()
    const emitted = w.emitted('blur')
    expect(emitted, '应转发 blur').toBeTruthy()
    expect(emitted![0][0], '应是同一个 field 对象').toBe(field)
  })
})

describe('FieldList 原生焦点冒泡（focusin/focusout 会冒泡，focus/blur 不会）', () => {
  it('内部输入框 focusin → 组件发 focus(field)', async () => {
    const w = mount(FieldList, {
      props: {
        fields,
        section,
        formData: { a: 1 },
        errors,
        disabled: false,
        getOptions,
      },
    })
    // 真实 focusin 事件从包裹 div 冒出（FormRenderer 内部元素 focus 时发生的事）
    await w.find('.fb-field').trigger('focusin')
    const emitted = w.emitted('focus')
    expect(emitted, 'focusin 应转成 focus 事件').toBeTruthy()
    expect(emitted![0][0].key).toBe('a')
  })

  it('内部输入框 focusout → 组件发 blur(field)', async () => {
    const w = mount(FieldList, {
      props: {
        fields,
        section,
        formData: { a: 1 },
        errors,
        disabled: false,
        getOptions,
      },
    })
    await w.find('.fb-field').trigger('focusout')
    const emitted = w.emitted('blur')
    expect(emitted, 'focusout 应转成 blur 事件').toBeTruthy()
    expect(emitted![0][0].key).toBe('a')
  })
})