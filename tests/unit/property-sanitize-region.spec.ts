// 属性测试（F9，fast-check 起手）——sanitizeHTML 与 parseRegion 的不变式。
// 与示例型用例互补：示例锁已知形态，属性锁未知形态（混淆绕过/构造输入）。
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { sanitizeHTML } from '@/components/_internal/sanitize'
import { parseRegion } from '@/components/_internal/utils'

const DANGER_TAGS = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'STYLE', 'LINK', 'META', 'FORM', 'INPUT', 'BUTTON'])
const arbitraryHtml = fc.string({ minLength: 0, maxLength: 60 })

describe('sanitizeHTML 属性（任意字符串输入）', () => {
  it('P1 不抛异常：任何字符串输入都产出字符串', () => {
    fc.assert(
      fc.property(arbitraryHtml, (html) => {
        expect(typeof sanitizeHTML(html)).toBe('string')
      }),
      { numRuns: 300 },
    )
  })

  it('P2 再解析不变式：输出重进 DOM 后无危险标签、无 on* 事件属性', () => {
    fc.assert(
      fc.property(arbitraryHtml, (html) => {
        const out = sanitizeHTML(html)
        const doc = new DOMParser().parseFromString(out, 'text/html')
        for (const el of Array.from(doc.querySelectorAll('*'))) {
          expect(DANGER_TAGS, `危险标签存活: ${out}`).not.toContain(el.tagName)
          for (const attr of el.getAttributeNames()) {
            expect(attr.startsWith('on'), `事件属性存活: ${out}`).toBe(false)
          }
        }
      }),
      { numRuns: 300 },
    )
  })

  it('P3 scheme 白名单：存活 href/src 必落在正源白名单内', () => {
    fc.assert(
      fc.property(arbitraryHtml, (html) => {
        const doc = new DOMParser().parseFromString(sanitizeHTML(html), 'text/html')
        for (const a of Array.from(doc.querySelectorAll('[href]'))) {
          expect(/^(https?:|mailto:|#)/i.test(a.getAttribute('href') || ''), `href 越白名单: ${a.outerHTML}`).toBe(true)
        }
        for (const img of Array.from(doc.querySelectorAll('[src]'))) {
          expect(
            /^(https?:|data:image\/|mailto:|#)/i.test(img.getAttribute('src') || ''),
            `src 越白名单: ${img.outerHTML}`,
          ).toBe(true)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('P4 幂等：sanitize(sanitize(x)) === sanitize(x)', () => {
    fc.assert(
      fc.property(arbitraryHtml, (html) => {
        const once = sanitizeHTML(html)
        expect(sanitizeHTML(once)).toBe(once)
      }),
      { numRuns: 300 },
    )
  })
})

describe('parseRegion 属性（后缀剥取不变式）', () => {
  const arbAddr = fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.replace(/\s+/g, '').length > 0)

  it('P5 重建不变式：五段拼接 === 去空白原文（纯剥取不吞字）', () => {
    fc.assert(
      fc.property(arbAddr, (input) => {
        const r = parseRegion(input)
        const raw = input.replace(/\s+/g, '')
        expect(r.province + r.city + r.district + r.town + r.detail).toBe(raw)
      }),
      { numRuns: 300 },
    )
  })

  it('P6 后缀正确性：非空 province/town 必以对应行政后缀结尾', () => {
    fc.assert(
      fc.property(arbAddr, (input) => {
        const r = parseRegion(input)
        if (r.province) expect(/(省|自治区|特别行政区)$/.test(r.province)).toBe(true)
        if (r.town) expect(/(街道|民族乡|苏木|镇|乡)$/.test(r.town)).toBe(true)
      }),
      { numRuns: 300 },
    )
  })
})
