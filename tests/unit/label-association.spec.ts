import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'

describe('Input · 无障碍标签关联', () => {
  it('标准 text 模式：label for 关联 input id', () => {
    const wrapper = mount(Input, { props: { modelValue: '', label: '用户名' } })
    const input = wrapper.find('input.f-input')
    const label = wrapper.find('label.fl-label')
    expect(input.attributes('id')).toBeTruthy()
    expect(label.attributes('for')).toBe(input.attributes('id'))
  })

  it('textarea 模式：label for 关联 textarea id', () => {
    const wrapper = mount(Input, { props: { modelValue: '', label: '备注', type: 'textarea' } })
    const textarea = wrapper.find('textarea.f-textarea')
    const label = wrapper.find('label.fl-label')
    expect(textarea.attributes('id')).toBeTruthy()
    expect(label.attributes('for')).toBe(textarea.attributes('id'))
  })

  it('number 模式：label for 关联 input id', () => {
    const wrapper = mount(Input, { props: { modelValue: null, label: '数量', type: 'number' } })
    const input = wrapper.find('input.f-input')
    const label = wrapper.find('label.fl-label')
    expect(input.attributes('id')).toBeTruthy()
    expect(label.attributes('for')).toBe(input.attributes('id'))
  })

  it('无 label 时不渲染关联 label', () => {
    const wrapper = mount(Input, { props: { modelValue: '' } })
    expect(wrapper.find('label.fl-label').exists()).toBe(false)
  })
})

describe('Select · 无障碍标签关联', () => {
  it('label for 关联 trigger input id（combobox）', () => {
    const wrapper = mount(Select, {
      props: {
        modelValue: '',
        label: '城市',
        type: 'combobox',
        options: [{ label: '北京', value: 'bj' }],
      },
    })
    const input = wrapper.find('input.trigger-input')
    const label = wrapper.find('label.fl-label')
    expect(input.attributes('id')).toBeTruthy()
    expect(label.attributes('for')).toBe(input.attributes('id'))
    expect(input.attributes('role')).toBe('combobox')
  })
})
