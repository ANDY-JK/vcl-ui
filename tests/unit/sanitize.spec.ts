import { describe, it, expect, vi } from 'vitest'
import { sanitizeHTML } from '@/components/_internal/sanitize'

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

  it('拦截 CSS 外链资源（绝对地址/协议相对地址）', () => {
    expect(sanitizeHTML('<div style="background: url(https://evil.com/track.png)">x</div>')).toBe('<div>x</div>')
    expect(sanitizeHTML('<div style="background: url(&quot;https://evil.com/x.png&quot;)">x</div>')).toBe('<div>x</div>')
    expect(sanitizeHTML('<div style="background: url(//evil.com/track.png)">x</div>')).toBe('<div>x</div>')
    expect(sanitizeHTML('<div style="list-style: url(http://evil.com/b.gif)">x</div>')).toBe('<div>x</div>')
  })

  it('保留 CSS 相对路径与 data:image 资源', () => {
    expect(sanitizeHTML('<div style="background: url(img/bg.png)">x</div>')).toBe('<div style="background: url(img/bg.png)">x</div>')
    expect(sanitizeHTML('<div style="background: url(data:image/png;base64,iVBOR)">x</div>')).toBe(
      '<div style="background: url(data:image/png;base64,iVBOR)">x</div>',
    )
  })

  it('带 target 的链接强制补 rel=noopener（防 reverse tabnabbing）', () => {
    expect(sanitizeHTML('<a href="https://example.com" target="_blank">新窗口</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">新窗口</a>',
    )
    // 无 target 不加 rel；攻击者自带 rel 也会被覆写为安全值
    expect(sanitizeHTML('<a href="https://example.com" rel="opener" target="_blank">覆写</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">覆写</a>',
    )
    expect(sanitizeHTML('<a href="https://example.com">普通链接</a>')).toBe('<a href="https://example.com">普通链接</a>')
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

describe('sanitizeHTML · SSR（无 DOM 环境）', () => {
  it('无 document 时返回转义纯文本而非原样 HTML，并告警', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('document', undefined)
    try {
      const out = sanitizeHTML('<img src=x onerror=alert(1)>')
      // 关键：绝不能把未消毒的 HTML 原样吐回（否则 SSR 渲染即 XSS 注入点）
      expect(out).not.toContain('<img')
      expect(out).toBe('&lt;img src=x onerror=alert(1)&gt;')
      expect(warnSpy).toHaveBeenCalled()
      expect(String(warnSpy.mock.calls[0][0])).toContain('SSR')
    } finally {
      vi.unstubAllGlobals()
      warnSpy.mockRestore()
    }
  })

  it('SSR 下空串仍返回空串', () => {
    vi.stubGlobal('document', undefined)
    try {
      expect(sanitizeHTML('')).toBe('')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
