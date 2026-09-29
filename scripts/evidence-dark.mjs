/**
 * 暗色模式对比度与可见性取证。
 *
 * 判据（真问题，非理论洁癖）：
 *   D1 正文对比度 < 4.5:1（WCAG AA）
 *   D2 大字/次要文字 < 3:1
 *   D3 表单控件「不可见」：背景与页面背景几乎同色（差 < 3%）且无边框
 *   D4 可见性：文字色与背景色几乎相同（对比 < 1.5:1）
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = 'reports/dark-audit'
mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:3721'

const PROBE = () => {
  const parse = (c) => {
    const m = /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec(c)
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null
  }
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const ratio = (a, b) => {
    const l1 = lum(a)
    const l2 = lum(b)
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  }
  /** 逐层向上找到第一个不透明背景 */
  const bgOf = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor)
      if (c && c.a > 0.5) return c
    }
    return parse(getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 }
  }

  const out = { lowContrast: [], invisible: [], controls: [] }
  const nm = (el) => {
    const cls = typeof el.className === 'string' ? el.className : (el.getAttribute?.('class') ?? '')
    return `${el.tagName.toLowerCase()}${cls.trim() ? '.' + cls.trim().split(/\s+/).slice(0, 2).join('.') : ''}`.slice(
      0,
      46,
    )
  }

  // 文字对比度
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length) continue
    const txt = el.textContent.trim()
    if (txt.length < 2) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue
    const fg = parse(cs.color)
    if (!fg || fg.a < 0.3) continue
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    const bg = bgOf(el)
    // 前景半透明时按与背景混合后的实际色算
    const eff =
      fg.a < 1
        ? { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) }
        : fg
    const cr = ratio(eff, bg)
    const fs = parseFloat(cs.fontSize)
    const bold = +cs.fontWeight >= 700
    const large = fs >= 24 || (fs >= 18.66 && bold)
    const need = large ? 3 : 4.5
    if (cr < need) {
      out.lowContrast.push({
        at: nm(el),
        ratio: +cr.toFixed(2),
        need,
        fs: +fs.toFixed(1),
        txt: txt.slice(0, 16),
        color: cs.color,
        bg: `rgb(${bg.r},${bg.g},${bg.b})`,
      })
    }
  }

  // 表单控件可见性（暗色下最常见的「控件消失」）
  for (const el of document.querySelectorAll('input, textarea, select, .trigger-wrapper, .vcl-card, button')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    if (r.width < 20 || r.height < 12) continue
    const own = parse(cs.backgroundColor)
    const page = bgOf(el.parentElement ?? el)
    const hasBorder = parseFloat(cs.borderTopWidth) > 0 && parse(getComputedStyle(el).borderTopColor)?.a > 0.2
    if (own && own.a > 0.5) {
      const cr = ratio(own, page)
      if (cr < 1.06 && !hasBorder)
        out.invisible.push({
          at: nm(el),
          bgCr: +cr.toFixed(3),
          own: cs.backgroundColor,
          page: `rgb(${page.r},${page.g},${page.b})`,
        })
    } else if (!hasBorder && !own) {
      out.invisible.push({ at: nm(el), bgCr: 1, own: 'transparent', page: '-' })
    }
  }
  return out
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()
// 手动切暗色（避免依赖系统偏好）
await page.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () => document.documentElement.setAttribute('data-theme', 'dark'))
})

const ROUTES = ['select', 'input', 'group', 'data-table', 'form-builder', 'chart', 'login', 'card', 'toast', 'result']
const agg = { lowContrast: [], invisible: [] }
for (const route of ROUTES) {
  await page.goto(`${BASE}/#/${route}`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.waitForTimeout(900)
  let r
  try {
    r = await page.evaluate(PROBE)
  } catch {
    continue
  }
  for (const x of r.lowContrast) agg.lowContrast.push({ route, ...x })
  for (const x of r.invisible) agg.invisible.push({ route, ...x })
  await page.screenshot({ path: `${OUT}/dark-${route}.png` })
}
await browser.close()

const dedupe = (arr, kf) => {
  const m = new Map()
  for (const x of arr) {
    const k = kf(x)
    if (!m.has(k)) m.set(k, { ...x, n: 1, routes: new Set([x.route]) })
    else {
      m.get(k).n++
      m.get(k).routes.add(x.route)
    }
  }
  return [...m.values()].sort((a, b) => b.n - a.n)
}

console.log(`=== D1/D2 暗色对比度不足：${agg.lowContrast.length} 条 ===`)
for (const x of dedupe(agg.lowContrast, (x) => `${x.at}|${x.ratio}|${x.color}`).slice(0, 25)) {
  console.log(
    `  ${x.ratio} : 需${x.need}  ${x.at.padEnd(46)} fs=${x.fs} 色=${x.color} 底=${x.bg} 「${x.txt}」 ×${x.n} [${[...x.routes].slice(0, 3).join(',')}]`,
  )
}
console.log(`\n=== D3 暗色控件/容器「不可见」：${agg.invisible.length} 条 ===`)
for (const x of dedupe(agg.invisible, (x) => `${x.at}|${x.bgCr}`).slice(0, 20)) {
  console.log(
    `  对比${x.bgCr}  ${x.at.padEnd(46)} 自身=${x.own} 底=${x.page} ×${x.n} [${[...x.routes].slice(0, 3).join(',')}]`,
  )
}
console.log(`\n截图：${OUT}/`)
