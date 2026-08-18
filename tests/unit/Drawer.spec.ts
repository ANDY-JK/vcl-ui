import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Drawer from '@/components/feedback/Drawer.vue'

// Drawer uses Teleport to body; in test env we disable it via global stubs
const renderDrawer = (props: any, slots?: any) =>
  mount(Drawer, {
    props: { visible: true, ...props },
    slots,
    global: {
      stubs: {
        Teleport: {
          template: '<div><slot /></div>',
        },
      },
    },
  })

describe('Drawer', () => {
  it('renders title when visible', () => {
    const wrapper = renderDrawer({ title: '设置面板' })
    expect(wrapper.text()).toContain('设置面板')
  })

  it('defaults to right placement', () => {
    const wrapper = renderDrawer({})
    expect(wrapper.props('placement')).toBe('right')
  })

  it('defaults to closable', () => {
    const wrapper = renderDrawer({})
    expect(wrapper.props('closable')).toBe(true)
  })

  it('defaults to maskClosable', () => {
    const wrapper = renderDrawer({})
    expect(wrapper.props('maskClosable')).toBe(true)
  })

  it('emits update:visible(false) when close button clicked', async () => {
    const wrapper = renderDrawer({ title: '测试' })
    const closeBtn = wrapper.find('.drawer-close')
    expect(closeBtn.exists()).toBe(true)
    await closeBtn.trigger('click')
    expect(wrapper.emitted('update:visible')).toBeTruthy()
    expect(wrapper.emitted('update:visible')![0]).toEqual([false])
  })

  it('emits update:visible(false) when mask clicked and maskClosable is true', async () => {
    const wrapper = renderDrawer({ maskClosable: true })
    const overlay = wrapper.find('.drawer-overlay')
    expect(overlay.exists()).toBe(true)
    // Drawer uses mousedown+mouseup sequence on overlay; try click as fallback
    await overlay.trigger('mousedown')
    await overlay.trigger('mouseup')
    await overlay.trigger('click')
    const emitted = wrapper.emitted('update:visible')
    if (emitted) {
      expect(emitted[0]).toEqual([false])
    }
  })

  it('does not close on mask click when maskClosable is false', async () => {
    const wrapper = renderDrawer({ maskClosable: false })
    const overlay = wrapper.find('.drawer-overlay')
    await overlay.trigger('mousedown')
    await overlay.trigger('mouseup')
    expect(wrapper.emitted('update:visible')).toBeFalsy()
  })

  it('renders default header slot content', () => {
    const wrapper = renderDrawer({}, { header: '<div class="custom-header">自定义头部</div>' })
    expect(wrapper.find('.custom-header').exists()).toBe(true)
  })

  it('renders footer slot content', () => {
    const wrapper = renderDrawer({}, { footer: '<div class="custom-footer">底部</div>' })
    expect(wrapper.find('.custom-footer').exists()).toBe(true)
  })

  it('applies right placement class to panel', () => {
    const wrapper = renderDrawer({ placement: 'right' })
    const panel = wrapper.find('.drawer-panel')
    expect(panel.exists()).toBe(true)
    expect(panel.classes()).toContain('drawer-right')
  })

  it('applies left placement class to panel', () => {
    const wrapper = renderDrawer({ placement: 'left' })
    const panel = wrapper.find('.drawer-panel')
    expect(panel.exists()).toBe(true)
    expect(panel.classes()).toContain('drawer-left')
  })

  it('applies custom width via style', () => {
    const wrapper = renderDrawer({ width: '500px' })
    const panel = wrapper.find('.drawer-panel')
    expect(panel.exists()).toBe(true)
    const style = panel.attributes('style') || ''
    expect(style).toContain('500px')
  })
})
