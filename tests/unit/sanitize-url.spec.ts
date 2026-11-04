/**
 * sanitizeHTML 的 URL scheme 白名单（#422）
 *
 * 两类缺陷一次钉死：
 * ① **相对链接被误杀**：`/docs/intro`、`./img.png`、`img.png` 不带 scheme，旧白名单
 *    `^(https?:|mailto:|#)` 匹配不上 → 整条剥掉。粘贴的富文本里站内互链/同 CDN 相对图
 *    是最常见的形态，无声消失与 #411"前导空白误杀"同病。
 * ② **带控制字符的 `javascript:` 挡住方式不对**：浏览器按 URL 规范剥掉 tab/LF/CR，
 *    `jav\tascript:` 在 `<a>` 里**就是** `javascript:`。旧实现靠"格式不认识"碰巧挡住 ——
 *    正确机制是把 URL 归一（剥控制字符）后**按浏览器将看到的值**测白名单。
 *
 * 归一口径（与 WHATWG URL 解析一致）：剥 tab/LF/CR/NUL，**不**大小写折叠
 * （白名单本身 `i` 标志，折叠反而会把 `%4A` 类实体搞混）。
 */
import { describe, it, expect } from 'vitest'
import { sanitizeHTML } from '@/components/_internal/sanitize'

describe('sanitizeHTML · URL 白名单（#422）', () => {
  /* ── 相对链接放行 ─────────────────────────────────────────────── */
  it('**站内相对链接放行**（旧实现整条剥掉）', () => {
    expect(sanitizeHTML('<a href="/docs/intro">文档</a>')).toBe('<a href="/docs/intro">文档</a>')
    expect(sanitizeHTML('<img src="/static/logo.png">')).toBe('<img src="/static/logo.png">')
  })

  it('**./ 与裸文件名放行**', () => {
    expect(sanitizeHTML('<a href="./spec.md">规格</a>')).toBe('<a href="./spec.md">规格</a>')
    expect(sanitizeHTML('<img src="img.png">')).toBe('<img src="img.png">')
    expect(sanitizeHTML('<img src="../up.png">')).toBe('<img src="../up.png">')
  })

  it('**协议相对 `//host` 仍拦**（等价任意域的绝对地址）', () => {
    expect(sanitizeHTML('<a href="//evil.example/x">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHTML('<img src="//evil.example/x.png">')).toBe('<img>')
  })

  it('页内锚点照旧放行（#311 的既有行为不回退）', () => {
    expect(sanitizeHTML('<a href="#sec-2">跳转</a>')).toBe('<a href="#sec-2">跳转</a>')
  })

  it('绝对 https 与 mailto 照旧放行（既有用例口径不变）', () => {
    expect(sanitizeHTML('<a href="https://example.com">官网</a>')).toBe(
      '<a href="https://example.com">官网</a>',
    )
    expect(sanitizeHTML('<a href="mailto:a@b.c">邮件</a>')).toBe('<a href="mailto:a@b.c">邮件</a>')
  })

  /* ── 控制字符归一（浏览器视角）──────────────────────────────────── */
  it('**tab/LF/CR 嵌入的 javascript: 按"剥缝后的值"判**（挡住，且不再依赖运气）', () => {
    // 浏览器剥掉缝 → 实际是 javascript: → 必须剥
    expect(sanitizeHTML('<a href="java\tscript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHTML('<a href="java\nscript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHTML('<a href="java\rscript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHTML('<img src="java\tscript:alert(1)">')).toBe('<img>')
  })

  it('**大小写混合照旧剥**（i 标志既有行为）', () => {
    expect(sanitizeHTML('<a href="JaVaScRiPt:alert(1)">x</a>')).toBe('<a>x</a>')
  })

  it('**https 里的 tab 也归一后放行**（归一对合法值同样生效，不是只对坏值）', () => {
    // 浏览器剥缝后是合法 https → 必须放行，不能因为"带了缝"而误杀
    expect(sanitizeHTML('<a href="ht\ttps://example.com">x</a>')).toBe(
      '<a href="https://example.com">x</a>',
    )
  })

  it('字符引用（&#x09;）解码后的缝也被处理', () => {
    // HTML 解析器先解码实体 → 属性值里已是真 tab → 同上归一
    expect(sanitizeHTML('<a href="jav&#x09;ascript:alert(1)">x</a>')).toBe('<a>x</a>')
  })

  it('vbscript / data:text/html href 照旧剥（不在白名单）', () => {
    expect(sanitizeHTML('<a href="vbscript:msgbox(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHTML('<a href="data:text/html,<script>alert(1)</script>">x</a>')).toBe('<a>x</a>')
  })

  it('**URL 查询参数里的 javascript: 不归本条管**（是数据不是 scheme）', () => {
    expect(sanitizeHTML('<a href="https://example.com/ok?url=javascript:alert(1)">x</a>')).toBe(
      '<a href="https://example.com/ok?url=javascript:alert(1)">x</a>',
    )
  })
})
