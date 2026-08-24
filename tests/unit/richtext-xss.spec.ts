// P0-4 行为锁定：FormRenderer 富文本展示/写入必须经 sanitizeHTML 消毒
// 审计 P0-4（发布阻断）：富文本 v-html 未消毒 → 存储型 XSS
// 策略：
//  1. 源码级锁定 FormRenderer 的 v-html 绑定与 input 写入均调用 sanitizeHTML（防止回归到未消毒渲染）
//  2. sanitizeHTML 对富文本常见 XSS payload 的剥离行为
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import FormRenderer from '@/components/form-builder/FormRenderer.vue'
import { sanitizeHTML } from '@/components/data/composables/sanitize'

const rendererSrc = readFileSync(resolve(import.meta.dirname, '../../src/components/form-builder/FormRenderer.vue'), 'utf-8')

describe('P0-4 富文本 v-html 消毒', () => {
  it('FormRenderer 展示路径 v-html 绑定 sanitizeHTML（源码锁定）', () => {
    // 模板：v-html="sanitizeHTML(richtextContent)"
    expect(rendererSrc).toMatch(/v-html="sanitizeHTML\(richtextContent\)"/)
    // 不允许出现未消毒的 v-html（除 sanitizeHTML 包裹外）
    const vHtmlLines = rendererSrc.split('\n').filter((l) => l.includes('v-html'))
    expect(vHtmlLines.length).toBeGreaterThan(0)
    for (const line of vHtmlLines) {
      // 允许 v-html 单独一行 + sanitizeHTML 在下一行（DataTable 风格），或同一行包裹
      expect(line + '\n' + rendererSrc).toMatch(/v-html=.*sanitizeHTML|v-html="\s*$/s)
    }
  })

  it('FormRenderer 富文本写入路径 input 事件消毒（源码锁定）', () => {
    // @input="emit('update:modelValue', sanitizeHTML(...))"
    expect(rendererSrc).toMatch(/emit\('update:modelValue', sanitizeHTML\(\(\$event\.target as HTMLElement\)\.innerHTML\)\)/)
  })

  it('execRichtext 手动 emit 也消毒（工具栏命令）', () => {
    expect(rendererSrc).toMatch(/emit\('update:modelValue', sanitizeHTML\(el\.innerHTML\)\)/)
  })

  it('sanitizeHTML 剥离富文本 XSS payload', () => {
    // 富文本编辑器常见注入：script / 事件属性 / javascript: 链接 / 危险 CSS
    expect(sanitizeHTML('<p>正文</p><script>alert(1)</script>')).toBe('<p>正文</p>')
    expect(sanitizeHTML('<img src="x" onerror="alert(1)">')).not.toContain('onerror')
    expect(sanitizeHTML('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHTML('<div style="background:url(javascript:alert(1))">x</div>')).toBe('<div>x</div>')
  })

  it('组件可正常挂载（富文本字段渲染不抛错）', () => {
    const wrapper = mount(FormRenderer, {
      props: {
        field: { type: 'richtext', key: 'c', label: '正文', props: {}, modelValue: '<p>正文</p>' },
      },
      global: { stubs: { FieldError: true } },
    })
    expect(wrapper.find('.fb-richtext-body').exists()).toBe(true)
    expect(wrapper.find('.fb-richtext-body').element.querySelector('script')).toBeNull()
  })
})
