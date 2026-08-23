import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Group from '@/components/form/Group.vue'

describe('Group · radio/checkbox 真实 input 语义', () => {
  it('radio 模式渲染真实 <input type="radio">', () => {
    const wrapper = mount(Group, {
      props: {
        type: 'radio',
        modelValue: 'a',
        options: [
          { label: '甲', value: 'a' },
          { label: '乙', value: 'b' },
        ],
      },
    })
    const inputs = wrapper.findAll('input[type="radio"]')
    expect(inputs).toHaveLength(2)
    // 选中的项 checked=true
    expect(inputs[0].attributes('checked')).toBeDefined()
    expect(inputs[1].attributes('checked')).toBeUndefined()
    // 同一分组 name 一致（互斥）
    expect(inputs[0].attributes('name')).toBe(inputs[1].attributes('name'))
  })

  it('checkbox 模式渲染真实 <input type="checkbox">', () => {
    const wrapper = mount(Group, {
      props: {
        type: 'checkbox',
        modelValue: ['a'],
        options: [
          { label: '甲', value: 'a' },
          { label: '乙', value: 'b' },
        ],
      },
    })
    const inputs = wrapper.findAll('input[type="checkbox"]')
    expect(inputs).toHaveLength(2)
    expect(inputs[0].attributes('checked')).toBeDefined()
    expect(inputs[1].attributes('checked')).toBeUndefined()
  })

  it('disabled 项 input 带 disabled', () => {
    const wrapper = mount(Group, {
      props: {
        type: 'radio',
        modelValue: 'a',
        options: [
          { label: '甲', value: 'a' },
          { label: '乙', value: 'b', disabled: true },
        ],
      },
    })
    const inputs = wrapper.findAll('input[type="radio"]')
    expect(inputs[1].attributes('disabled')).toBeDefined()
  })

  it('点击 radio 触发 update:modelValue 单选值', async () => {
    const wrapper = mount(Group, {
      props: {
        type: 'radio',
        modelValue: 'a',
        options: [
          { label: '甲', value: 'a' },
          { label: '乙', value: 'b' },
        ],
      },
    })
    const inputs = wrapper.findAll('input[type="radio"]')
    await inputs[1].setValue()
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![emitted!.length - 1]).toEqual(['b'])
  })
})
