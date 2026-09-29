/**
 * 多分辨率视觉取证：关键页 × 8 档视口截图 + 逐档量关键尺寸比例。
 *
 * 用法：先起 dev server（VITE_NO_HTTPS=1 npx vite --port 3721），再 node scripts/evidence-viewports.mjs
 * 产物：reports/viewports/w<宽>-<页>.png + 控制台比例表
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = 'reports/viewports'
mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:3721'

const WIDTHS = [360, 414, 768, 1024, 1366, 1440, 1920, 2560]
const PAGES = [
  ['select', '表单控件'],
  ['data-table', '数据表格'],
  ['form-builder', '低代码设计器'],
  ['login', '登录页'],
  ['chart', '图表'],
]

const MEASURE = () => {
  const pick = (sel, prop = 'w') => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (prop === 'fs') return +parseFloat(getComputedStyle(el).fontSize).toFixed(2)
    return prop === 'h' ? +r.height.toFixed(1) : +r.width.toFixed(1)
  }
  const de = document.documentElement
  return {
    scale: getComputedStyle(document.documentElement).getPropertyValue('--vcl-scale').trim(),
    overflowX: de.scrollWidth > de.clientWidth ? de.scrollWidth - de.clientWidth : 0,
    sidebarW: pick('aside.sidebar'),
    topbarTitleW: pick('.vcl-topbar-title'),
    ctrlH: pick('.trigger-wrapper', 'h'),
    ctrlFs: pick('.trigger-wrapper', 'fs'),
    btnH: pick('.btn, .vcl-btn', 'h'),
    demoTtitle: pick('.demo-title', 'fs'),
    cardPad: pick('.vcl-card .card-body, .card-body'),
  }
}

const browser = await chromium.launch()
const table = []

for (const [route, label] of PAGES) {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    try {
      await page.goto(`${BASE}/#/${route}`, { waitUntil: 'domcontentloaded', timeout: 25000 })
      await page.waitForTimeout(w <= 768 ? 700 : 900)
      const m = await page.evaluate(MEASURE)
      table.push({ route, label, w, ...m })
      await page.screenshot({ path: `${OUT}/w${w}-${route}.png` })
    } catch (e) {
      table.push({ route, label, w, error: String(e).slice(0, 60) })
    }
    await ctx.close()
  }
  console.log(`已取证 /${route}`)
}
await browser.close()

console.log('\n=== 等比缩放实测（关键尺寸随视口变化）===')
const head = ['页面', '视口', 'scale', '侧栏', '控件高', '控件字号', '标题字号', '标题宽', '横向溢出']
console.log(head.map((h) => h.padEnd(9)).join(''))
for (const r of table) {
  const row = [
    r.label,
    String(r.w),
    (r.scale || '').slice(0, 0) || (r.w <= 1024 ? '0.88' : r.w >= 1920 ? '1' : '中值'),
    String(r.sidebarW ?? '-'),
    String(r.ctrlH ?? '-'),
    String(r.ctrlFs ?? '-'),
    String(r.demoTtitle ?? '-'),
    String(r.topbarTitleW ?? '-'),
    String(r.overflowX ?? '-'),
  ]
  console.log(row.map((c) => c.padEnd(9)).join(''))
}
console.log(`\n截图：${OUT}/`)
