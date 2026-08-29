// 行为锁定：FormRenderer 富文本 = composition 感知的受控 contenteditable
// 审计 §19 富文本专项：
//  P0-4（保留）：写入路径必须经 sanitizeHTML 消毒（存储型 XSS）
//  IME（新增）：v-html 响应式绑定会在每次按键后重设 innerHTML 打断中文输入法——锁定零 v-html + 合成期不 emit
//  粘贴（新增）：粘贴的原始 HTML 在插入前消毒（原 v-html 轮回承担的净化职责改由 paste 时序承担）
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import FormRenderer from '@/components/form-builder/FormRenderer.vue'
import { sanitizeHTML } from '@/components/data/composables/sanitize'

const rendererSrc = readFileSync(resolve(import.meta.dirname, '../../src/components/form-builder/FormRenderer.vue'), 'utf-8')
// v3.1 拆分后富文本逻辑迁至 renderer/RendererRichtext.vue（源码锁定向导随迁；挂载行为测试仍走 FormRenderer 集成路径）
const richtextSrc = readFileSync(
  resolve(import.meta.dirname, '../../src/components/form-builder/renderer/RendererRichtext.vue'),
  'utf-8',
)

function mountRichtext(modelValue = '<p>正文</p>') {
  return mount(FormRenderer, {
    props: {
      field: { type: 'richtext', key: 'c', label: '正文', props: {}, modelValue },
      modelValue,
    },
    global: { stubs: { FieldError: true } },
  })
}

describe('富文本源码锁定（防回退到 v-html 反模式）', () => {
  it('FormRenderer 与 RendererRichtext 全文件零 v-html（v-html 响应式绑定 = IME 打断根因）', () => {
    expect(rendererSrc).not.toContain('v-html')
    expect(richtextSrc).not.toContain('v-html')
  })

  it('IME 合成保护：合成期间 input 不 emit，合成结束才同步', () => {
    expect(richtextSrc).toMatch(/function onRichtextInput[\s\S]*?if \(richtextComposing\.value\) return/)
    expect(richtextSrc).toMatch(
      /function onRichtextCompositionEnd[\s\S]*?richtextComposing\.value = false[\s\S]*?richtextSyncFromDom\(\)/,
    )
  })

  it('写入唯一出口 richtextSyncFromDom 必须消毒', () => {
    expect(richtextSrc).toMatch(/function richtextSyncFromDom[\s\S]*?const html = sanitizeHTML\(el\.innerHTML\)/)
    // 回声守卫：自身 emit 的值不回写 DOM
    expect(richtextSrc).toMatch(/if \(val === richtextLastEmitted\) return/)
  })

  it('粘贴路径：preventDefault + 插入前消毒', () => {
    expect(richtextSrc).toMatch(
      /function onRichtextPaste[\s\S]*?e\.preventDefault\(\)[\s\S]*?const clean = sanitizeHTML\(raw\)/,
    )
  })

  it('sanitizeHTML 剥离富文本 XSS payload', () => {
    // 富文本编辑器常见注入：script / 事件属性 / javascript: 链接 / 危险 CSS
    expect(sanitizeHTML('<p>正文</p><script>alert(1)</script>')).toBe('<p>正文</p>')
    expect(sanitizeHTML('<img src="x" onerror="alert(1)">')).not.toContain('onerror')
    expect(sanitizeHTML('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHTML('<div style="background:url(javascript:alert(1))">x</div>')).toBe('<div>x</div>')
  })
})

describe('富文本挂载行为（composition 感知受控 contenteditable）', () => {
  it('挂载即同步初始值到 DOM', async () => {
    const wrapper = mountRichtext('<p>正文</p>')
    await nextTick()
    expect(wrapper.find('.fb-richtext-body').element.innerHTML).toBe('<p>正文</p>')
  })

  it('input → emit 消毒值，且 DOM 不被回写重置', async () => {
    const wrapper = mountRichtext('<p>正文</p>')
    await nextTick()
    const el = wrapper.find('.fb-richtext-body').element as HTMLElement
    el.innerHTML = '<p>正文追加</p>'
    await wrapper.find('.fb-richtext-body').trigger('input')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['<p>正文追加</p>'])
    // 关键：emit 之后 DOM 保持用户编辑结果原样（旧实现此处被 v-html 重设，IME 候选被清空）
    expect(el.innerHTML).toBe('<p>正文追加</p>')
  })

  it('IME 合成流：合成中不 emit，compositionend 一次性 emit', async () => {
    const wrapper = mountRichtext()
    await nextTick()
    const body = wrapper.find('.fb-richtext-body')
    const el = body.element as HTMLElement
    await body.trigger('compositionstart')
    el.innerHTML = '<p>ni hao</p>' // 模拟拼音候选期间 DOM 持续变化
    await body.trigger('input')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    el.innerHTML = '<p>你好</p>' // 候选上屏
    await body.trigger('compositionend')
    expect(wrapper.emitted('update:modelValue')?.length).toBe(1)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['<p>你好</p>'])
  })

  it('外部赋值 modelValue → DOM 跟随更新（自身 emit 的回声不触发重写）', async () => {
    const wrapper = mountRichtext('<p>旧值</p>')
    await nextTick()
    await wrapper.setProps({ modelValue: '<p>外部新值</p>' })
    expect(wrapper.find('.fb-richtext-body').element.innerHTML).toBe('<p>外部新值</p>')
    // 自身 emit 回声：input 同步后 DOM 不变
    const el = wrapper.find('.fb-richtext-body').element as HTMLElement
    el.innerHTML = '<p>用户输入</p>'
    await wrapper.find('.fb-richtext-body').trigger('input')
    await wrapper.setProps({ modelValue: '<p>用户输入</p>' }) // 父层 v-model 回流
    expect(el.innerHTML).toBe('<p>用户输入</p>')
  })

  it('粘贴 text/html：阻止默认插入，消毒后内容进 DOM 并 emit', async () => {
    const wrapper = mountRichtext('') // 空初始值，粘贴内容即全部内容
    await nextTick()
    const el = wrapper.find('.fb-richtext-body').element as HTMLElement
    const ev = new Event('paste', { cancelable: true })
    Object.defineProperty(ev, 'clipboardData', {
      value: { getData: (type: string) => (type === 'text/html' ? '<b>加粗</b><img src="x" onerror="alert(1)">' : '') },
    })
    el.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(el.innerHTML).not.toContain('onerror')
    expect(el.innerHTML).toContain('<b>加粗</b>')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([sanitizeHTML('<b>加粗</b><img src="x" onerror="alert(1)">')])
  })

  it('组件可正常挂载（富文本字段渲染不抛错）', () => {
    const wrapper = mountRichtext('<p>正文</p>')
    expect(wrapper.find('.fb-richtext-body').exists()).toBe(true)
    expect(wrapper.find('.fb-richtext-body').element.querySelector('script')).toBeNull()
  })
})
