import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Button from '@/components/basic/Button.vue'

describe('Button', () => {
  it('renders text prop', () => {
    const wrapper = mount(Button, { props: { text: '测试按钮' } })
    expect(wrapper.text()).toContain('测试按钮')
  })

  it('applies variant class', () => {
    const wrapper = mount(Button, { props: { variant: 'danger' } })
    expect(wrapper.find('button').classes()).toContain('btn-danger')
  })

  it('applies size class', () => {
    const wrapper = mount(Button, { props: { size: 'lg' } })
    expect(wrapper.find('button').classes()).toContain('btn-lg')
  })

  it('defaults to primary variant and md size', () => {
    const wrapper = mount(Button)
    const btn = wrapper.find('button')
    expect(btn.classes()).toContain('btn-primary')
    expect(btn.classes()).toContain('btn-md')
  })

  it('emits click event', async () => {
    const wrapper = mount(Button, { props: { text: '点击' } })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('is disabled when disabled prop is true', () => {
    const wrapper = mount(Button, { props: { disabled: true } })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('is disabled when loading is true', () => {
    const wrapper = mount(Button, { props: { loading: true } })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button').classes()).toContain('loading')
  })

  it('renders block class when block prop is true', () => {
    const wrapper = mount(Button, { props: { block: true } })
    expect(wrapper.find('button').classes()).toContain('block')
  })

  it('renders default slot content', () => {
    const wrapper = mount(Button, { slots: { default: '自定义内容' } })
    expect(wrapper.text()).toContain('自定义内容')
  })

  it('renders arrow when showArrow is true', () => {
    const wrapper = mount(Button, { props: { showArrow: true, text: '展开' } })
    expect(wrapper.find('.btn-arrow').exists()).toBe(true)
  })

  it('sets aria-label when only icon is provided', () => {
    const wrapper = mount(Button, { props: { icon: 'settings' } })
    expect(wrapper.find('button').attributes('aria-label')).toBe('settings')
  })

  it('sets aria-busy when loading', () => {
    const wrapper = mount(Button, { props: { loading: true } })
    expect(wrapper.find('button').attributes('aria-busy')).toBe('true')
  })
})
