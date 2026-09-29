// full 工具栏档（文章场景扩展）：设计器 richtextToolbar=full → 渲染器消费
// 覆盖：full 按钮集 / execCommand 透传 / 字数统计（最小字数警示）/ 预览 / 全屏 / 链接·图片面板 / simple 档不受影响
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { nextTick } from 'vue'
import FormRenderer from '@/components/form-builder/FormRenderer.vue'

enableAutoUnmount(afterEach)

function mountRichtext(fieldProps: Record<string, unknown>, modelValue = '<p>你好世界</p>') {
  return mount(FormRenderer, {
    props: {
      field: { type: 'richtext', key: 'c', label: '正文', props: fieldProps, modelValue },
      modelValue,
    },
    global: { stubs: { FieldError: true } },
  })
}

const execMock = vi.fn(() => true)

beforeEach(() => {
  document.execCommand = execMock as unknown as typeof document.execCommand
  execMock.mockClear()
})
afterEach(() => {
  delete (document as unknown as Record<string, unknown>).execCommand
})

type RichtextWrapper = ReturnType<typeof mountRichtext>

function btn(wrapper: RichtextWrapper, label: string) {
  return wrapper.find(`button[aria-label="${label}"]`)
}

describe('richtext full 工具栏（文章场景）', () => {
  it('simple 档保持原命令集：无 H1/链接/图片/字数条/预览', () => {
    const wrapper = mountRichtext({})
    expect(btn(wrapper, '加粗').exists()).toBe(true)
    expect(btn(wrapper, '一级标题').exists()).toBe(false)
    expect(btn(wrapper, '插入链接').exists()).toBe(false)
    expect(wrapper.find('.fb-rt-status').exists()).toBe(false)
    expect(btn(wrapper, '预览').exists()).toBe(false)
  })

  it('full 档渲染文章命令集与字数条', () => {
    const wrapper = mountRichtext({ richtextToolbar: 'full' })
    for (const label of [
      '一级标题',
      '引用',
      '插入链接',
      '插入图片',
      '插入表格',
      '撤销',
      '清除格式',
      '预览',
      '全屏编辑',
    ]) {
      expect(btn(wrapper, label).exists(), label).toBe(true)
    }
    expect(wrapper.find('.fb-rt-status').text()).toBe('4 字')
  })

  it('execCommand 透传：加粗/H1/表格/取消链接', async () => {
    const wrapper = mountRichtext({ richtextToolbar: 'full' })
    await btn(wrapper, '加粗').trigger('click')
    expect(execMock).toHaveBeenCalledWith('bold', false, undefined)
    await btn(wrapper, '一级标题').trigger('click')
    expect(execMock).toHaveBeenCalledWith('formatBlock', false, '<h1>')
    await btn(wrapper, '插入表格').trigger('click')
    const tableCall = execMock.mock.calls.find((c) => c[0] === 'insertHTML' && String(c[2]).includes('<table'))
    expect(tableCall, 'insertHTML 应插入空白表格').toBeTruthy()
    await btn(wrapper, '取消链接').trigger('click')
    expect(execMock).toHaveBeenCalledWith('unlink', false, undefined)
  })

  it('颜色面板：swatch 点击走 styleWithCSS + foreColor', async () => {
    const wrapper = mountRichtext({ richtextToolbar: 'full' })
    await btn(wrapper, '文字颜色 / 背景高亮').trigger('click')
    await nextTick()
    expect(wrapper.find('.fb-rt-panel').exists()).toBe(true)
    await wrapper.find('.fb-rt-panel .fb-rt-swatch').trigger('click')
    expect(execMock).toHaveBeenCalledWith('styleWithCSS', false, 'true')
    expect(execMock).toHaveBeenCalledWith('foreColor', false, '#111827')
    expect(execMock).toHaveBeenCalledWith('styleWithCSS', false, 'false')
  })

  it('链接面板：URL 确认后 insertHTML 插入链接（默认新窗口）', async () => {
    const wrapper = mountRichtext({ richtextToolbar: 'full' })
    await btn(wrapper, '插入链接').trigger('click')
    await nextTick()
    const input = wrapper.find('.fb-rt-panel input[type="text"]')
    expect(input.exists()).toBe(true)
    await input.setValue('https://example.com')
    await wrapper.find('.fb-rt-panel-actions button.is-primary').trigger('click')
    const linkCall = execMock.mock.calls.find((c) => c[0] === 'insertHTML')
    expect(String(linkCall?.[2])).toContain('href="https://example.com"')
    expect(String(linkCall?.[2])).toContain('target="_blank"')
    await nextTick()
    expect(wrapper.find('.fb-rt-panel').exists()).toBe(false)
  })

  it('图片面板：URL 确认后 insertHTML 插入 img', async () => {
    const wrapper = mountRichtext({ richtextToolbar: 'full' })
    await btn(wrapper, '插入图片').trigger('click')
    await nextTick()
    await wrapper.find('.fb-rt-panel input[type="text"]').setValue('https://cdn.example.com/a.png')
    await wrapper.find('.fb-rt-panel-actions button.is-primary').trigger('click')
    const imgCall = execMock.mock.calls.find((c) => c[0] === 'insertHTML')
    expect(String(imgCall?.[2])).toContain('<img src="https://cdn.example.com/a.png"')
  })

  it('面板外点击收起面板', async () => {
    const wrapper = mountRichtext({ richtextToolbar: 'full' })
    await btn(wrapper, '插入链接').trigger('click')
    await nextTick()
    expect(wrapper.find('.fb-rt-panel').exists()).toBe(true)
    // VTU 默认挂载到游离 DOM，元素冒泡到不了 document 监听器——用 document.body 模拟点击页面其他位置
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await nextTick()
    expect(wrapper.find('.fb-rt-panel').exists()).toBe(false)
  })

  it('字数条联动最小字数：低于阈值警示', () => {
    const wrapper = mountRichtext({ richtextToolbar: 'full', richtextMinChars: 10 })
    const status = wrapper.find('.fb-rt-status')
    expect(status.text()).toBe('4/10 字')
    expect(status.classes()).toContain('fb-rt-status--warn')
  })

  it('预览切换：预览区渲染消毒内容，编辑区隐藏；再点返回编辑', async () => {
    const wrapper = mountRichtext({ richtextToolbar: 'full' }, '<p>你好世界</p><script>alert(1)</script>')
    await nextTick()
    await btn(wrapper, '预览').trigger('click')
    await nextTick()
    expect(wrapper.find('.fb-richtext-preview').element.innerHTML).toBe('<p>你好世界</p>')
    expect(wrapper.find('.fb-richtext-body').element.style.display).toBe('none')
    await btn(wrapper, '预览').trigger('click')
    await nextTick()
    expect(wrapper.find('.fb-richtext-body').element.style.display).not.toBe('none')
  })

  it('全屏切换 + Esc 退出 + body 滚动锁恢复', async () => {
    const wrapper = mountRichtext({ richtextToolbar: 'full' })
    await btn(wrapper, '全屏编辑').trigger('click')
    await nextTick()
    expect(wrapper.find('.fb-richtext').classes()).toContain('fb-richtext--fullscreen')
    expect(document.body.style.overflow).toBe('hidden')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.find('.fb-richtext').classes()).not.toContain('fb-richtext--fullscreen')
    expect(document.body.style.overflow).toBe('')
  })

  it('全屏态卸载组件后 body 滚动锁恢复（防路由切换残留）', async () => {
    const wrapper = mountRichtext({ richtextToolbar: 'full' })
    await btn(wrapper, '全屏编辑').trigger('click')
    await nextTick()
    expect(document.body.style.overflow).toBe('hidden')
    wrapper.unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('链接 URL 含引号时 insertHTML 前转义（属性逃逸防护）', async () => {
    const wrapper = mountRichtext({ richtextToolbar: 'full' })
    await btn(wrapper, '插入链接').trigger('click')
    await nextTick()
    await wrapper.find('.fb-rt-panel input[type="text"]').setValue('https://x.com/" onmouseover="alert(1)')
    await wrapper.find('.fb-rt-panel-actions button.is-primary').trigger('click')
    const linkCall = execMock.mock.calls.find((c) => c[0] === 'insertHTML')
    const html = String(linkCall?.[2])
    expect(html).not.toContain('" onmouseover=')
    expect(html).toContain('&quot;')
  })
})
