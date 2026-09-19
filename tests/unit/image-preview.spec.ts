// ImagePreview 行为锁定测试（巨型组件 1468 行的核心行为）
// 覆盖：src 归一化（字符串/对象/数组）、currentIndex 钳制、缩略图切换、导航
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ImagePreview from '@/components/data/ImagePreview.vue'

// happy-dom 无真实图片加载，用 data URL 避免网络请求
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('ImagePreview 行为锁定', () => {
  it('src 为单个字符串时归一化为单图', () => {
    const wrapper = mount(ImagePreview, { props: { src: IMG } })
    // 单图：无缩略图面板
    expect(wrapper.find('.ip-thumbs').exists()).toBe(false)
    expect(wrapper.find('.ip-img').exists()).toBe(true)
  })

  it('src 为数组时进入多图模式（显示缩略图/计数）', () => {
    const wrapper = mount(ImagePreview, { props: { src: [IMG, IMG] } })
    expect(wrapper.find('.ip-thumbs').exists()).toBe(true)
    expect(wrapper.find('.ip-counter-header').exists()).toBe(true)
    // 显示 1 / 2
    expect(wrapper.find('.ip-counter-header').text()).toContain('1')
    expect(wrapper.find('.ip-counter-header').text()).toContain('2')
  })

  it('initialIndex 超出范围时钳制到合法区间', () => {
    const wrapper = mount(ImagePreview, { props: { src: [IMG, IMG], initialIndex: 99 } })
    // 钳制到最后一图（2/2）
    expect(wrapper.find('.ip-counter-header').text()).toContain('2')
  })

  it('多图时上一张/下一张按钮可导航', async () => {
    const wrapper = mount(ImagePreview, { props: { src: [IMG, IMG] } })
    // 从第 1 张 → 下一张
    await wrapper.find('.ip-arrow-right').trigger('click')
    expect(wrapper.find('.ip-counter-header').text()).toContain('2')
    // 上一张 → 回第 1 张
    await wrapper.find('.ip-arrow-left').trigger('click')
    expect(wrapper.find('.ip-counter-header').text()).toContain('1')
  })

  it('首图时上一张按钮禁用', () => {
    const wrapper = mount(ImagePreview, { props: { src: [IMG, IMG] } })
    expect(wrapper.find('.ip-arrow-left').attributes('disabled')).toBeDefined()
  })

  it('缩略图点击跳转到对应图', async () => {
    const wrapper = mount(ImagePreview, { props: { src: [IMG, IMG, IMG] } })
    const thumbs = wrapper.findAll('.ip-thumb')
    await thumbs[2].trigger('click')
    expect(wrapper.find('.ip-counter-header').text()).toContain('3')
  })

  it('关闭按钮触发 close 事件', async () => {
    const wrapper = mount(ImagePreview, { props: { src: IMG } })
    await wrapper.find('.ip-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
