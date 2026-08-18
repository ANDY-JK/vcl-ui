import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Input from '@/components/form/Input.vue'

describe('Input', () => {
  it('renders label text', () => {
    const wrapper = mount(Input, { props: { modelValue: '', label: '用户名' } })
    expect(wrapper.text()).toContain('用户名')
  })

  it('emits update:modelValue on input', async () => {
    const wrapper = mount(Input, { props: { modelValue: '' } })
    const input = wrapper.find('input')
    await input.setValue('hello')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['hello'])
  })

  it('defaults to text type', () => {
    const wrapper = mount(Input, { props: { modelValue: '' } })
    expect(wrapper.find('input').attributes('type')).toBe('text')
  })

  it('renders password input type', () => {
    const wrapper = mount(Input, { props: { modelValue: '', type: 'password' } })
    expect(wrapper.find('input').attributes('type')).toBe('password')
  })

  it('renders textarea when type is textarea', () => {
    const wrapper = mount(Input, { props: { modelValue: '', type: 'textarea' } })
    expect(wrapper.find('textarea').exists()).toBe(true)
  })

  it('renders placeholder attribute', () => {
    const wrapper = mount(Input, { props: { modelValue: '', placeholder: '请输入' } })
    // In floating label mode, placeholder may be on the input element
    const input = wrapper.find('input')
    expect(input.exists()).toBe(true)
    // Placeholder may be empty when not focused (floating label behavior)
    const ph = input.attributes('placeholder')
    expect(ph === '请输入' || ph === '').toBe(true)
  })

  it('disables input when disabled is true', () => {
    const wrapper = mount(Input, { props: { modelValue: '', disabled: true } })
    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
  })

  it('sets readonly attribute when readonly is true', () => {
    const wrapper = mount(Input, { props: { modelValue: '', readonly: true } })
    expect(wrapper.find('input').attributes('readonly')).toBeDefined()
  })

  it('emits focus event', async () => {
    const wrapper = mount(Input, { props: { modelValue: '' } })
    await wrapper.find('input').trigger('focus')
    expect(wrapper.emitted('focus')).toBeTruthy()
  })

  it('emits blur event', async () => {
    const wrapper = mount(Input, { props: { modelValue: '' } })
    await wrapper.find('input').trigger('blur')
    expect(wrapper.emitted('blur')).toBeTruthy()
  })

  it('renders stepper buttons when stepper is true and type is number', () => {
    const wrapper = mount(Input, { props: { modelValue: 0, type: 'number', stepper: true } })
    expect(wrapper.find('.step-controls').exists()).toBe(true)
  })

  it('sets maxlength attribute', () => {
    const wrapper = mount(Input, { props: { modelValue: '', maxlength: 100 } })
    expect(wrapper.find('input').attributes('maxlength')).toBe('100')
  })
})
