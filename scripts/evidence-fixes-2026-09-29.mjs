/**
 * 本轮两项修复的取证（可复跑）：
 *   A. lucide 图标选择器——面板内每个格子都能渲染出真图标（兜底 0）
 *   B. Select 选中后的垂直居中——触发器内容盒中心 vs 值/箭头/tag 中心
 *
 * 用法：先起 dev server（VITE_NO_HTTPS=1 npx vite --port 3721），再 node scripts/evidence-fixes-2026-09-29.mjs
 * 产物：reports/fixes-2026-09-29/*.png + 控制台结论（偏差 > 1px 即判失败，退出码 1）
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = 'reports/fixes-2026-09-29'
mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:3721'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
let failed = false

/* ---------- A. 图标选择器 ---------- */
await page.goto(`${BASE}/#/icon`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await page.locator('.picker-trigger').first().scrollIntoViewIfNeeded()
await page.locator('.picker-trigger').first().click()
await page.waitForTimeout(1200)

const icons = await page.evaluate(() => {
  const panel = document.querySelector('.picker-panel')
  let real = 0
  let fallback = 0
  for (const s of panel.querySelectorAll('svg')) {
    const cls = s.getAttribute('class') || ''
    if (/lucide-/.test(cls)) {
      real++
      continue
    }
    // 兜底占位图特征：4 个 rect 且无其它图元
    const r = s.querySelectorAll('rect').length
    const others = s.querySelectorAll('path,circle,line,polyline,polygon,ellipse').length
    if (r === 4 && others === 0) fallback++
    else real++
  }
  return {
    real,
    fallback,
    listed: document.querySelectorAll('.picker-panel .picker-item, .picker-panel [role=option]').length,
  }
})
console.log(`A. 图标选择器面板：真图标 ${icons.real} / 兜底 ${icons.fallback}`)
if (icons.fallback > 0) {
  console.error(`   ✗ 仍有 ${icons.fallback} 个格子渲染兜底占位图`)
  failed = true
} else {
  console.log('   ✓ 面板内全部可渲染（无兜底占位图）')
}
await page.screenshot({ path: `${OUT}/A-icon-picker.png`, clip: { x: 270, y: 0, width: 640, height: 620 } })
await page.keyboard.press('Escape')

/* ---------- B. Select 垂直居中 ---------- */
await page.goto(`${BASE}/#/select`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await page.locator('.trigger-wrapper').first().click()
await page.waitForTimeout(600)
await page.locator('.panel-item').first().click()
await page.waitForTimeout(600)

const sel = await page.evaluate(() => {
  const w = document.querySelector('.trigger-wrapper')
  const cs = getComputedStyle(w)
  const box = w.getBoundingClientRect()
  const outerTop = box.top + parseFloat(cs.borderTopWidth)
  const outerBottom = box.bottom - parseFloat(cs.borderBottomWidth)
  const outerC = (outerTop + outerBottom) / 2
  const tag = w.querySelector('.combobox-tag')
  const arrow = w.querySelector('.trigger-arrow')
  const r = (el) => (el ? el.getBoundingClientRect() : null)
  const dc = (el) => {
    const b = r(el)
    return b ? +(b.top + b.height / 2 - outerC).toFixed(2) : null
  }
  const tagTextEl = tag?.querySelector('.tag-text')
  const rg = tagTextEl ? document.createRange() : null
  if (rg) rg.selectNodeContents(tagTextEl)
  const tr = rg ? rg.getBoundingClientRect() : null
  return {
    triggerH: +box.height.toFixed(2),
    tagDelta: dc(tag),
    arrowDelta: dc(arrow),
    tagTextDelta: tr ? +(tr.top + tr.height / 2 - outerC).toFixed(2) : null,
    alignItems: cs.alignItems,
  }
})
console.log(`B. Select 触发器：高 ${sel.triggerH}  align-items=${sel.alignItems}`)
console.log(`   tag Δ${sel.tagDelta}  arrow Δ${sel.arrowDelta}  tag 内文字 Δ${sel.tagTextDelta}`)
const worst = [sel.tagDelta, sel.arrowDelta, sel.tagTextDelta].filter((v) => v != null).map(Math.abs)
if (Math.max(...worst) > 1) {
  console.error(`   ✗ 最大偏差 ${Math.max(...worst)}px > 1px`)
  failed = true
} else {
  console.log(`   ✓ 全部居中（最大偏差 ${Math.max(...worst)}px）`)
}

const el = page.locator('.trigger-wrapper').first()
const bb = await el.boundingBox()
await page.screenshot({
  path: `${OUT}/B-select-center.png`,
  clip: { x: bb.x - 24, y: bb.y - 16, width: 380, height: bb.height + 30 },
})

await browser.close()
console.log(failed ? '\n❌ 取证未通过' : '\n✅ 取证通过')
process.exit(failed ? 1 : 0)
