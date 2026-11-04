// HTML 白名单消毒（DataTable 单元格 col.cell、FormRenderer 富文本字段共用）
import { warnOnce } from '@/components/_internal/warnOnce'

/** 允许的展示标签 */
const _allowedTags = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'S',
  'DEL',
  'STRIKE',
  'SUB',
  'SUP',
  'CODE',
  'PRE',
  'BR',
  'HR',
  'SPAN',
  'DIV',
  'BLOCKQUOTE',
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'A',
  'IMG',
  'UL',
  'OL',
  'LI',
  'TABLE',
  'THEAD',
  'TBODY',
  'TR',
  'TH',
  'TD',
])
/** 允许的属性（事件属性一律剥离） */
const _allowedAttrs = new Set([
  'href',
  'src',
  'alt',
  'title',
  'target',
  'colspan',
  'rowspan',
  'style',
  'align',
  'color',
])
/** style 属性中危险 CSS 模式（expression/url javascript: 等） */
const _dangerousCss = [
  /expression\s*\(/i,
  /javascript:/i,
  /url\s*\(\s*['"]?\s*javascript:/i,
  /url\s*\(\s*['"]?\s*data:\s*text\/html/i,
  // 外链资源（追踪像素/CSS 数据外泄/远程加载）：绝对地址与协议相对地址一律拦截，data:image 与相对路径放行
  /url\s*\(\s*['"]?\s*(?:https?:)?\/\//i,
  /-moz-binding/i,
  /behavior\s*:/i,
  /@import/i,
  /vbscript:/i,
  // 覆盖式钓鱼（2026-11-01 #281）：本库展示的是**表单收集来的用户数据**，
  // 单元格/富文本允许 `style` 时，一段
  //   <span style="position:fixed;inset:0;background:#fff;z-index:9999">登录已过期…</span>
  // 就能盖住整个应用，伪造登录框骗取密码。这不是"样式跑偏"，是可利用的攻击面。
  // 定位与层级属性对"展示一段文本"没有任何必要，一律拦掉（不是只有 fixed ——
  // absolute + inset:0 在 relative 祖先内同样能盖住可视区）。
  /position\s*:/i,
  /z-index\s*:/i,
  /inset\s*:/i,
]
/**
 * href 与 src 分开白名单：data:image 仅对图片 src 有意义，链接 href 不放行。
 *
 * **相对链接放行（#422）**：`/docs/intro`、`./img.png`、`img.png` 不带 scheme，
 * 不匹配 `^https?:` —— 此前被整条剥掉。这是**功能损失**而不是"更安全"：
 * 本消毒器的场景是"宿主渲染用户粘贴的富文本"，相对链接是粘贴内容里最常见的形态
 * （站内文章互链、同一 CDN 的相对图片），静默消失和 #411 修的"前导空白被误杀"同病。
 * 相对 URL 的 scheme 段为空 → 不可能承载 `javascript:`，放行不引入新攻击面；
 * 但**协议相对** `//host` 必须继续拦 —— 它等价于 `https://host` 且指向当前协议下
 * 任意主机，白名单放它等于放开任意域。`#fragment` 也非相对（页内锚点，原有放行保留）。
 */
const _hrefRe = /^(https?:|mailto:|#|\/(?!\/)[^/]|[./][^/]|[A-Za-z0-9._~-]+[/.])/i
const _srcRe = /^(https?:|data:image\/|mailto:|#|\/(?!\/)[^/]|[./][^/]|[A-Za-z0-9._~-]+[/.])/i
/** 危险标签整体移除（含内容） */
const _dangerTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'INPUT', 'BUTTON'])

/**
 * 归一化 CSS 值后再做危险模式匹配（#396）。
 *
 * 为什么：CSS 支持**转义**——`style="z-\69 ndex:9999"`、`"in\73 et:0"` 在浏览器里
 * 会被还原成 `z-index:9999` / `inset:0`，而裸正则看到的是转义后的字面量。
 * 于是 #281 挡住的"覆盖式钓鱼"（position:fixed + inset:0 + z-index）能用转义原样复发：
 *
 *     <div style="pos\69 tion\3a fixed;in\73 et\3a 0;z-\69 ndex\3a 9999">登录已过期…</div>
 *
 * 同类手法还有注释拆词（浏览器先剥注释再分词，所以 `pos` + CSS 注释 + `ition` 等于
 * `position`）。所以匹配前先把注释与转义都归一掉。
 */
function normalizeCssForMatch(css: string): string {
  return (
    css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // 十六进制转义：\69 / \000069 / \3a ，后面可跟一个空格作分隔
      .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex: string) => {
        const cp = parseInt(hex, 16)
        return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '\uFFFD'
      })
      // 其余单字符转义（\: 、\" 等）
      .replace(/\\(.)/g, '$1')
  )
}

/** HTML 转义：无 DOM 环境（SSR/Node）下把原始 HTML 当纯文本输出，避免未消毒内容被当作标记注入 */
function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 白名单式 HTML 消毒：仅保留常用展示标签与安全属性，剥离脚本/事件/危险链接。
 * 非白名单普通标签被剥离但保留其文本内容；危险标签整体移除。
 * 无 DOM 环境（SSR）无法消毒，降级为转义纯文本并告警——绝不原样返回。
 */
export function sanitizeHTML(html: string): string {
  if (typeof document === 'undefined') {
    warnOnce('sanitize', '[sanitizeHTML] 无 DOM 环境（SSR），已降级为转义纯文本输出')
    return escapeHTML(html)
  }
  const el = document.createElement('div')
  el.innerHTML = html
  el.querySelectorAll('*').forEach((node) => {
    if (_dangerTags.has(node.tagName)) {
      node.remove()
      return
    }
    if (!_allowedTags.has(node.tagName)) {
      node.replaceWith(...Array.from(node.childNodes))
      return
    }
    for (const attr of [...node.getAttributeNames()]) {
      if (!_allowedAttrs.has(attr) || attr.startsWith('on')) {
        node.removeAttribute(attr)
        continue
      }
      const val = node.getAttribute(attr) || ''
      // 先去掉首尾空白再判白名单（#411）。旧实现直接拿原值测 `^https?:`，
      // 于是用户粘贴进来的 ` https://example.com` 会被整条丢掉 —— 这不是"更安全"，
      // 是**功能损失**：链接无声消失，用户以为数据丢了。放行时写回归一化后的值。
      if (attr === 'href' || attr === 'src') {
        const trimmed = val.trim()
        // **控制字符归一（#422）**：浏览器解析 URL 时会剥掉 tab/LF/CR 与字符引用解码后的
        // 等价物，所以 `jav\tascript:` 在 `<a>` 里**就是** `javascript:`；而裸正则看到的
        // 还是带缝的原文，`^(https?:|mailto:|#)` 匹配不上 → 按"未知 scheme"剥掉。
        // 挡住它确实是"安全"的结果，但机制错了 —— 正确机制是**按浏览器将看到的值判断**：
        // 把 URL 里的 tab/LF/CR/NUL 全部剥掉再测白名单（WHATWG URL 规范正是这么剥的）。
        // 这样 `jav\tascript:` 归一后变成 `javascript:` → 命中白名单失败 → 剥除，
        // 与浏览器的实际行为一致，而不是碰巧靠"格式不认识"挡住。
        const resolved = trimmed.replace(/[\t\n\r\0]/g, '')
        const allowed = attr === 'href' ? _hrefRe.test(resolved) : _srcRe.test(resolved)
        // data: URI 里出现字面量 `<` = 内容没被编码（#411）：`data:image/svg+xml,<svg onload=…>`
        // 在 `<img>` 上下文里确实不执行，但这段标记会被**原样存进业务数据**，一旦宿主把它
        // 放进 `<object>` / 预览 iframe / 服务端渲染管线就是 XSS。本库自己的 mapMarkerIcon
        // 走 `%3C` 编码，不受影响 —— 判据是"有没有编码"，而不是"是不是 svg"。
        const rawMarkup = attr === 'src' && /^data:/i.test(resolved) && resolved.includes('<')
        if (!allowed || rawMarkup) node.removeAttribute(attr)
        else if (resolved !== val) node.setAttribute(attr, resolved)
      }
      // style 属性过滤危险 CSS 值（expression()/javascript:/url(javascript:) 等）。
      // **归一化后再匹配**（#396）：剥注释 + 解 CSS 转义，否则 `z-\69 ndex` / `in\73 et`
      // 这类转义写法能绕过 #281 那条覆盖式钓鱼防护。原始值也一并测（双保险）。
      if (attr === 'style') {
        const normalized = normalizeCssForMatch(val)
        if (_dangerousCss.some((re) => re.test(normalized) || re.test(val))) node.removeAttribute('style')
      }
    }
    // 带 target 的链接强制补 rel，防 reverse tabnabbing（rel 不在白名单，须在属性循环后覆写）
    if (node.tagName === 'A' && node.hasAttribute('target')) {
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
  return el.innerHTML
}
