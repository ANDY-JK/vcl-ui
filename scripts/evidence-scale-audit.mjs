/**
 * 等比缩放取证：多视口实测 + 比例一致性检查
 *
 * 用法：先起 dev server（VITE_NO_HTTPS=1 npx vite --port 3721），再
 *   node scripts/evidence-scale-audit.mjs
 *
 * 输出：reports/scale-audit/ 各视口截图 + 控制台表格（尺寸与比例）
 * 判据：同一元素在 1024 / 1440 / 1920 三档下的尺寸应随视口单调变化，
 *       且「元素尺寸 ÷ 同页基准元素尺寸」的比值应近似恒定——那才是「成比例」；
 *       比值随视口漂移即为头大身子小。
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = 'reports/scale-audit'
mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:3721'
const VIEWPORTS = [1024, 1440, 1920]

/** 量一组元素；missing 名单用于确认选择器是否命中 */
const MEASURE = () => {
  const pick = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return { w: +r.width.toFixed(2), h: +r.height.toFixed(2), fs: +parseFloat(cs.fontSize).toFixed(2) }
  }
  return {
    scaleVar: getComputedStyle(document.documentElement).getPropertyValue('--vcl-scale').trim(),
    scaleApplied: pick('.demo-title')
      ? parseFloat(getComputedStyle(document.querySelector('.demo-title')).fontSize)
      : null,
    sidebar: pick('aside.sidebar'),
    demoTitle: pick('.demo-title'),
    demoDesc: pick('.demo-desc'),
    rowBtn: pick('.demo-row button'),
    sidebarItem: pick('aside.sidebar .nav-level'),
  }
}

const browser = await chromium.launch()
const result = {}

for (const vw of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: 900 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/#/basic`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  result[vw] = await page.evaluate(MEASURE)
  await page.screenshot({ path: `${OUT}/basic-${vw}.png` })
  await ctx.close()
}
await browser.close()

console.log('\n=== 原始测量 ===')
for (const vw of VIEWPORTS) console.log(vw, JSON.stringify(result[vw]))

const ref = result[1920]
const get = (m, k, f = 'w') => m?.[k]?.[f] ?? null

console.log('\n=== 相对 1920 的缩放比（期望三档一致：同一条曲线）===')
const keys = [
  ['demoTitle', 'fs', 'demo 标题字号'],
  ['demoDesc', 'fs', 'demo 描述字号'],
  ['sidebar', 'w', '侧栏宽'],
  ['rowBtn', 'h', '示例按钮高'],
  ['sidebarItem', 'h', '侧栏导航项高'],
]
for (const [k, f, label] of keys) {
  const base = get(ref, k, f)
  const parts = VIEWPORTS.map((vw) => {
    const v = get(result[vw], k, f)
    return v == null || base == null ? `${vw}:n/a` : `${vw}:${(v / base).toFixed(3)}`
  })
  console.log(`${label.padEnd(16)} ${parts.join('   ')}`)
}

console.log('\n=== --vcl-scale 变量读值 ===')
for (const vw of VIEWPORTS) console.log(vw, JSON.stringify(result[vw].scaleVar))
console.log(`\n截图：${OUT}/`)
