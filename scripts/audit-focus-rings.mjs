// 键盘焦点环可见性审计：Tab 遍历每个可聚焦控件，量聚焦时是否出现可见环（outline/box-shadow/border 变化）
// 用法：dev server 3721 后  node scripts/audit-focus-rings.mjs [--routes a,b]
import { chromium } from 'playwright'

const BASE = 'http://localhost:3721'
const routes = process.argv.includes('--routes')
  ? process.argv[process.argv.indexOf('--routes') + 1].split(',')
  : ['button', 'data-table', 'form', 'select', 'menu', 'tabs']

// 页面函数：取某可聚焦元素 聚焦前 / 聚焦后 的可观察差异（outline / box-shadow / border 颜色）
const browser = await chromium.launch()
const results = []
for (const route of routes) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  await page.goto(`${BASE}/#/${route}`, { waitUntil: 'load', timeout: 20000 })
  await page.waitForTimeout(1200)
  const d = await page.evaluate(() => {
    const sig = (el) => {
      const cs = getComputedStyle(el)
      return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.borderColor].join('|')
    }
    const els = [...document.querySelectorAll('button:not([disabled]), a[href], input:not([type=hidden]), [tabindex]')]
      .filter((e) => e.offsetParent !== null)
      .slice(0, 40)
    const out = []
    for (const el of els) {
      const text = (el.textContent || '').trim().slice(0, 12) || el.tagName.toLowerCase()
      const before = sig(el)
      el.focus()
      const after = sig(el)
      out.push({ tag: el.tagName.toLowerCase(), text, ring: before !== after })
      el.blur()
    }
    return out
  })
  const noRing = d.filter((x) => !x.ring)
  results.push({ route, total: d.length, noRing: noRing.length, noRingSamples: noRing.slice(0, 8) })
  await page.close()
}
await browser.close()

for (const r of results) {
  const flag = r.noRing ? ` ✗ 无焦点环 ${r.noRing}/${r.total}: ${r.noRingSamples.map((s) => s.tag + '·' + s.text).join(', ')}` : ' ✓'
  console.log(`${r.route} 可聚焦 ${r.total} 个${flag}`)
}
const totalNoRing = results.reduce((a, r) => a + r.noRing, 0)
console.log(`\n汇总：${results.length} 路由，共 ${totalNoRing} 个可聚焦控件无可见焦点环`)
