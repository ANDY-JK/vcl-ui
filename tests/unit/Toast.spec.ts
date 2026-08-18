import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Toast from '@/components/feedback/Toast.vue'

describe('Toast', () => {
  it('renders inline variant with message', () => {
    const wrapper = mount(Toast, {
      props: { variant: 'inline', message: '操作成功' },
    })
    expect(wrapper.text()).toContain('操作成功')
  })

  it('renders title in inline mode', () => {
    const wrapper = mount(Toast, {
      props: { variant: 'inline', title: '提示', message: '内容' },
    })
    expect(wrapper.text()).toContain('提示')
  })

  it('defaults to toast variant', () => {
    const wrapper = mount(Toast)
    expect(wrapper.props('variant')).toBe('toast')
  })

  it('defaults to circle-alert type', () => {
    const wrapper = mount(Toast)
    expect(wrapper.props('type')).toBe('circle-alert')
  })

  it('shows icon by default', () => {
    const wrapper = mount(Toast, {
      props: { variant: 'inline', message: 'test' },
    })
    expect(wrapper.props('showIcon')).toBe(true)
  })

  it('shows close button when closable is true in inline mode', () => {
    const wrapper = mount(Toast, {
      props: { variant: 'inline', message: 'test', closable: true },
    })
    expect(wrapper.find('.toast-inline-close').exists()).toBe(true)
  })

  it('hides close button when closable is false', () => {
    const wrapper = mount(Toast, {
      props: { variant: 'inline', message: 'test', closable: false },
    })
    expect(wrapper.find('.toast-inline-close').exists()).toBe(false)
  })

  it('hides inline toast when close button clicked', async () => {
    const wrapper = mount(Toast, {
      props: { variant: 'inline', message: 'test', closable: true },
    })
    const closeBtn = wrapper.find('.toast-inline-close')
    expect(closeBtn.exists()).toBe(true)
    await closeBtn.trigger('click')
    // After clicking close, inline toast should be hidden
    expect(wrapper.find('.toast-inline-close').exists()).toBe(false)
  })

  it('renders inline toast with warning type styling', () => {
    const wrapper = mount(Toast, {
      props: { variant: 'inline', type: 'warning', message: '警告消息' },
    })
    expect(wrapper.text()).toContain('警告消息')
    expect(wrapper.props('type')).toBe('warning')
  })

  it('renders inline toast with error type styling', () => {
    const wrapper = mount(Toast, {
      props: { variant: 'inline', type: 'error', message: '错误消息' },
    })
    expect(wrapper.text()).toContain('错误消息')
    expect(wrapper.props('type')).toBe('error')
  })

  it('renders inline toast with success type', () => {
    const wrapper = mount(Toast, {
      props: { variant: 'inline', type: 'success', message: '成功' },
    })
    expect(wrapper.text()).toContain('成功')
    expect(wrapper.props('type')).toBe('success')
  })
})
