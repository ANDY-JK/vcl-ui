/**
 * 桌面 1440 命中项取证：双 chevron 组对中、topbar 分组间距、主题编辑器高输入、group/input 家族离群
 * 用法：dev server 3721，node scripts/evidence-style-hits.mjs
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = 'reports/style-details-audit'
fs.mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:3721'

/** 量 DataTable 卡片视图里排序双 chevron 组与文本的 Y 中心差 */
const CHEVRON = () => {
  const label = document.querySelector('.card-field-label')
  if (!label) return null
  const group = label.querySelector('.card-sort-arrows')
  const range = document.createRange()
  range.selectNodeContents(label)
  const rects = []
  for (const n of label.childNodes) {
    if (n.nodeType === 3 && n.textContent.trim()) {
      range.selectNodeContents(n)
      for (const r of range.getClientRects()) rects.push(r)
    }
  }
  const tr = rects.length ? { top: Math.min(...rects.map((r) => r.top)), bottom: Math.max(...rects.map((r) => r.bottom)) } : null
  const gr = group.getBoundingClientRect()
  const svgs = [...group.querySelectorAll('svg')].map((s) => s.getBoundingClientRect())
  return {
    textCenter: tr ? (tr.top + tr.bottom) / 2 : null,
    groupCenter: (gr.top + gr.bottom) / 2,
    groupH: gr.height,
    svgCount: svgs.length,
    firstSvgCenter: svgs.length ? svgs[0].top + svgs[0].height / 2 : null,
    resFirstSvg: svgs.length ? Math.round((svgs[0].top + svgs[0].height / 2 - (tr.top + tr.bottom) / 2) * 100) / 100 : null,
    resGroup: tr ? Math.round(((gr.top + gr.bottom) / 2 - (tr.top + tr.bottom) / 2) * 100) / 100 : null,
  }
}

/** 顶栏工具区分组间距序列 */
const TOPBAR = () => {
  const el = document.querySelector('.topbar-tools')
  if (!el) return null
  const kids = [...el.children].filter((c) => c.getBoundingClientRect().width > 0)
  const rs = kids.map((k) => k.getBoundingClientRect())
  const gaps = []
  for (let i = 1; i < rs.length; i++) gaps.push(Math.round((rs[i].left - rs[i - 1].right) * 10) / 10)
  return { gaps, jc: getComputedStyle(el).justifyContent, display: getComputedStyle(el).display }
}

/** 量主题编辑器里 te-inputs 家族 99px 的几个实例上下文 */
const TE_INPUTS = () => {
  const big = [...document.querySelectorAll('.te-inputs')].filter((el) => Math.abs(el.getBoundingClientRect().height - 99) < 4)
  return big.slice(0, 4).map((el) => ({
    text: (el.textContent || '').trim().slice(0, 30),
    rows: el.querySelectorAll('input,select').length,
    h: Math.round(el.getBoundingClientRect().height * 10) / 10,
  }))
}

/** 量 input 页 fl-container 80.8px 那个的内容构成 */
const FL_CONTAINER = () => {
  const all = [...document.querySelectorAll('.fl-container')].map((el) => ({
    h: Math.round(el.getBoundingClientRect().height * 10) / 10,
    text: (el.textContent || '').trim().slice(0, 24),
  }))
  return all
}

const GROUP_ON = () => {
  const all = [...document.querySelectorAll('span.on, .on')].map((el) => ({
    h: Math.round(el.getBoundingClientRect().height * 10) / 10,
    text: (el.textContent || '').trim().slice(0, 12),
    tag: el.tagName,
  }))
  return all
}

const open = async (ctx, route, wait = 900) => {
  const page = await ctx.newPage()
  await page.goto(`${BASE}/#/${route}`, { waitUntil: 'load', timeout: 20000 })
  await page.waitForTimeout(wait)
  return page
}

const clipShot = async (page, sel, file, pad = 20, w = 420, h = 220) => {
  await page.locator(sel).first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  const b = await page.locator(sel).first().boundingBox()
  if (!b) return
  await page.screenshot({ path: `${OUT}/${file}`, clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: w, height: h } })
}

const runDataTable = async (ctx) => {
  const p1 = await open(ctx, 'data-table')
  const needCardView = await p1.evaluate(() => !!document.querySelector('.card-field-label'))
  if (!needCardView) {
    const btn = p1.locator('text=/卡片/').first()
    if (await btn.count()) {
      await btn.click()
      await p1.waitForTimeout(800)
    }
  }
  console.log('chevron:', JSON.stringify(await p1.evaluate(CHEVRON)))
  await clipShot(p1, '.card-field-label', 'hit-data-table-card-label.png')
  await p1.close()
}

const runTopbar = async (ctx) => {
  const p2 = await open(ctx, 'tag', 700)
  console.log('topbar:', JSON.stringify(await p2.evaluate(TOPBAR)))
  const tb = await p2.locator('.topbar-tools').first().boundingBox()
  if (tb) await p2.screenshot({ path: `${OUT}/hit-topbar-tools.png`, clip: { x: tb.x - 10, y: tb.y - 10, width: Math.min(tb.width + 20, 900), height: tb.height + 20 } })
  await p2.close()
}

const runThemeEditor = async (ctx) => {
  const p3 = await open(ctx, 'theme-editor', 1200)
  console.log('te-inputs big:', JSON.stringify(await p3.evaluate(TE_INPUTS)))
  await p3.screenshot({ path: `${OUT}/hit-theme-editor.png` })
  await p3.close()
}

const runInput = async (ctx) => {
  const p4 = await open(ctx, 'input', 700)
  console.log('fl-container:', JSON.stringify(await p4.evaluate(FL_CONTAINER)))
  await clipShot(p4, '.fl-container', 'hit-input-fl-container.png', 20, 500, 320)
  await p4.close()
}

const runGroup = async (ctx) => {
  const p5 = await open(ctx, 'group', 700)
  console.log('group on:', JSON.stringify(await p5.evaluate(GROUP_ON).then((r) => r.slice(0, 8))))
  await p5.screenshot({ path: `${OUT}/hit-group.png` })
  await p5.close()
}

const main = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await runDataTable(ctx)
  await runTopbar(ctx)
  await runThemeEditor(ctx)
  await runInput(ctx)
  await runGroup(ctx)
  await ctx.close()
  await browser.close()
  console.log('done →', OUT)
}
main()
