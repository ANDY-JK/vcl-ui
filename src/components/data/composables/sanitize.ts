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
]
/** href 与 src 分开白名单：data:image 仅对图片 src 有意义，链接 href 不放行 */
const _hrefRe = /^(https?:|mailto:|#)/i
const _srcRe = /^(https?:|data:image\/|mailto:|#)/i
/** 危险标签整体移除（含内容） */
const _dangerTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'INPUT', 'BUTTON'])

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
      if (attr === 'href' && !_hrefRe.test(val)) {
        node.removeAttribute(attr)
      }
      if (attr === 'src' && !_srcRe.test(val)) {
        node.removeAttribute(attr)
      }
      // style 属性过滤危险 CSS 值（expression()/javascript:/url(javascript:)等）
      if (attr === 'style' && _dangerousCss.some((re) => re.test(val))) {
        node.removeAttribute('style')
      }
    }
    // 带 target 的链接强制补 rel，防 reverse tabnabbing（rel 不在白名单，须在属性循环后覆写）
    if (node.tagName === 'A' && node.hasAttribute('target')) {
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
  return el.innerHTML
}
