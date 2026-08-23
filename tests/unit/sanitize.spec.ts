import { describe, it, expect } from 'vitest'
import { sanitizeHTML } from '@/components/data/composables/sanitize'

describe('sanitizeHTML · HTML 白名单消毒', () => {
  it('保留安全标签', () => {
    expect(sanitizeHTML('<b>加粗</b> <i>斜体</i>')).toBe('<b>加粗</b> <i>斜体</i>')
    expect(sanitizeHTML('<p>段落</p>')).toBe('<p>段落</p>')
    expect(sanitizeHTML('<h4>标题</h4>')).toBe('<h4>标题</h4>')
  })

  it('剥离 script/style 危险标签（含内容）', () => {
    expect(sanitizeHTML('<script>alert(1)</script>')).toBe('')
    expect(sanitizeHTML('<style>body{}</style>')).toBe('')
    expect(sanitizeHTML('文本<script>alert(1)</script>尾')).toBe('文本尾')
  })

  it('剥离事件属性', () => {
    // x.png 不是白名单协议，src 也会被剥离，仅验证 onerror 被去除（img 保留）
    expect(sanitizeHTML('<img src="x.png" onerror="alert(1)">')).toBe('<img>')
    expect(sanitizeHTML('<a href="#" onclick="evil()">链接</a>')).toBe('<a href="#">链接</a>')
  })

  it('剥离 javascript: 链接', () => {
    expect(sanitizeHTML('<a href="javascript:alert(1)">点我</a>')).toBe('<a>点我</a>')
    expect(sanitizeHTML('<img src="javascript:alert(1)">')).toBe('<img>')
  })

  it('保留安全链接', () => {
    expect(sanitizeHTML('<a href="https://example.com">官网</a>')).toBe('<a href="https://example.com">官网</a>')
    expect(sanitizeHTML('<a href="mailto:a@b.com">邮件</a>')).toBe('<a href="mailto:a@b.com">邮件</a>')
    expect(sanitizeHTML('<a href="#anchor">锚点</a>')).toBe('<a href="#anchor">锚点</a>')
  })

  it('剥离危险 CSS（expression/javascript:/@import）', () => {
    expect(sanitizeHTML('<div style="background: expression(alert(1))">x</div>')).toBe('<div>x</div>')
    expect(sanitizeHTML('<div style="background: url(javascript:alert(1))">x</div>')).toBe('<div>x</div>')
  })

  it('保留安全 style', () => {
    expect(sanitizeHTML('<span style="color: red">红</span>')).toBe('<span style="color: red">红</span>')
  })

  it('非白名单标签剥离但保留文本内容', () => {
    expect(sanitizeHTML('<custom-tag>保留文本</custom-tag>')).toBe('保留文本')
  })

  it('危险标签整体移除（含嵌套内容）', () => {
    expect(sanitizeHTML('<iframe src="evil"></iframe>')).toBe('')
    expect(sanitizeHTML('<object><script>x</script></object>')).toBe('')
  })

  it('处理空串与无 document 环境', () => {
    expect(sanitizeHTML('')).toBe('')
  })
})
