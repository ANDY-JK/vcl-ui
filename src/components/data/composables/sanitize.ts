// DataTable 单元格 HTML 白名单消毒（col.cell 返回的富文本渲染前调用）

/** 允许的展示标签 */
const _allowedTags = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'CODE', 'PRE', 'BR', 'SPAN', 'DIV', 'P',
  'A', 'IMG', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
])
/** 允许的属性（事件属性一律剥离） */
const _allowedAttrs = new Set(['href', 'src', 'alt', 'title', 'target', 'colspan', 'rowspan', 'style', 'align', 'color'])
/** 危险标签整体移除（含内容） */
const _dangerTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'INPUT', 'BUTTON'])

/**
 * 白名单式 HTML 消毒：仅保留常用展示标签与安全属性，剥离脚本/事件/危险链接。
 * 非白名单普通标签被剥离但保留其文本内容；危险标签整体移除。
 */
export function sanitizeHTML(html: string): string {
  const el = document.createElement('div')
  el.innerHTML = html
  el.querySelectorAll('*').forEach(node => {
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
      if ((attr === 'href' || attr === 'src') && !/^(https?:|data:image\/|mailto:|#)/i.test(val)) {
        node.removeAttribute(attr)
      }
    }
  })
  return el.innerHTML
}
