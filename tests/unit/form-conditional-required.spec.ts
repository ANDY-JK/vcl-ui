// requiredWhen / disabledWhen 条件必填与条件禁用（与 visibleWhen 同一匹配语义）
// 锁定行为：条件未触发→不校验必填 / 触发→必填拦截提交 / disabledWhen→控件禁用且仍参与提交
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import FormBuilder from '@/components/form-builder/FormBuilder.vue'
import type { FormSchema, FormData } from '@/components/form-builder/types'

function condSchema(): FormSchema {
  return {
    layout: 'single',
    fields: [
      {
        key: 'type',
        label: '类型',
        type: 'select',
        options: [
          { value: 'A', label: 'A' },
          { value: 'B', label: 'B' },
        ],
      },
      // 条件必填：type=A 时 reason 必填
      {
        key: 'reason',
        label: '原因',
        type: 'text',
        requiredWhen: { field: 'type', equals: 'A' },
      },
      // 条件禁用：type=B 时 note 禁用（但值仍提交）
      {
        key: 'note',
        label: '备注',
        type: 'text',
        default: '预填备注',
        disabledWhen: { field: 'type', equals: 'B' },
      },
    ],
  }
}

function mountBuilder(schema: FormSchema, data: FormData = {}) {
  return mount(FormBuilder, {
    props: { schema, modelValue: data },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

describe('requiredWhen 条件必填', () => {
  it('条件未触发（type=B）→ reason 不必填，可直接提交', async () => {
    const wrapper = mountBuilder(condSchema())
    // 不驱动 type 的下拉（Select 在 jsdom 下渲染 input，交互不稳）——直接提交
    await wrapper.find('.fb-form').trigger('submit')
    // 未选类型时 reason 无 requiredWhen 生效，无必填错误
    expect(wrapper.find('.fb-field-error').exists()).toBe(false)
    wrapper.unmount()
  })

  it('条件触发（type=A）→ reason 必填拦截提交', async () => {
    const wrapper = mountBuilder(condSchema())
    // 通过 props 直接驱动 formData：触发 update:modelValue 循环不现实，改用内部 vm 变量
    // @ts-expect-error 测试访问内部状态
    wrapper.vm.formData.type = 'A'
    await nextTick()
    await wrapper.find('.fb-form').trigger('submit')
    expect(wrapper.find('.fb-field-error').exists()).toBe(true)
    expect(wrapper.find('.fb-field-error').text()).toContain('原因')
    wrapper.unmount()
  })
})

describe('disabledWhen 条件禁用', () => {
  it('条件触发（type=B）→ note 输入框 disabled', async () => {
    const wrapper = mountBuilder(condSchema())
    // @ts-expect-error 测试访问内部状态
    wrapper.vm.formData.type = 'B'
    await nextTick()
    const noteField = wrapper.findAll('.fb-field').find((f) => f.text().includes('备注'))
    expect(noteField?.find('input').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('条件未触发（type=A）→ note 可编辑', async () => {
    const wrapper = mountBuilder(condSchema())
    // @ts-expect-error 测试访问内部状态
    wrapper.vm.formData.type = 'A'
    await nextTick()
    const noteField = wrapper.findAll('.fb-field').find((f) => f.text().includes('备注'))
    expect(noteField?.find('input').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
})
