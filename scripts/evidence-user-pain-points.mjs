/**
 * 用户点名疑点实测：徽标居中 / Popover 图标与居中 / 标题与间距 / 缩放对比
 * 用法：dev server 3721，node scripts/evidence-user-pain-points.mjs
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = 'reports/style-details-audit'
fs.mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:3721'

/** tag 页：每个徽标胶囊的文本盒 vs 胶囊盒 Y 中心差 + 内联标签分布 */
const TAGS = () => {
  const r1 = (x) => Math.round(x * 100) / 100
  const out = []
  for (const sup of document.querySelectorAll('.tag-sup')) {
    const box = sup.getBoundingClientRect()
    if (box.width < 2) continue
    const txt = (sup.textContent || '').trim()
    const rg = document.createRange()
    rg.selectNodeContents(sup)
    const rects = [...rg.getClientRects()].filter((x) => x.height > 2)
    const tC = rects.length ? (Math.min(...rects.map((x) => x.top)) + Math.max(...rects.map((x) => x.bottom))) / 2 : null
    out.push({ txt, boxH: r1(box.height), boxW: r1(box.width), fs: getComputedStyle(sup).fontSize, res: tC ? r1(tC - (box.top + box.bottom) / 2) : null })
  }
  return out
}

/** popover 页：触发器与气泡卡片的几何 */
const POPOVER = async (page) => {
  const trig = await page.evaluate(() => {
    const r1 = (x) => Math.round(x * 100) / 100
    const out = []
    for (const h of document.querySelectorAll('.popover-host')) {
      const r = h.getBoundingClientRect()
      const txt = (h.textContent || '').trim().slice(0, 12)
      const kids = [...h.children].map((c) => ({ tag: c.tagName, cls: (typeof c.className === 'string' ? c.className : '').slice(0, 30) }))
      // 文本行盒中心 vs 宿主盒中心
      const rg = document.createRange()
      rg.selectNodeContents(h)
      const rects = [...rg.getClientRects()].filter((x) => x.height > 2)
      const tC = rects.length ? (Math.min(...rects.map((x) => x.top)) + Math.max(...rects.map((x) => x.bottom))) / 2 : null
      out.push({ txt, tag: h.tagName, w: r1(r.width), h: r1(r.height), res: tC ? r1(tC - (r.top + r.bottom) / 2) : null, kids: kids.slice(0, 2) })
    }
    return out
  })
  // 打开点击式气泡卡片，量标题行
  const btn = page.locator('.popover-host', { hasText: '点击看卡片' }).first()
  let card = null
  if (await btn.count()) {
    await btn.click()
    await page.waitForTimeout(500)
    card = await page.evaluate(() => {
      const c = document.querySelector('.popover-card')
      const r1 = (x) => Math.round(x * 100) / 100
      if (!c) return null
      const t = c.querySelector('.popover-title')
      const cr = c.getBoundingClientRect()
      const tr = t ? t.getBoundingClientRect() : null
      return {
        cardW: r1(cr.width),
        titleText: t ? t.textContent : null,
        titleFs: t ? getComputedStyle(t).fontSize : null,
        titlePad: t ? getComputedStyle(t).padding : null,
        titleLeftGap: tr ? r1(tr.left - cr.left) : null,
        hasIcon: !!c.querySelector('svg'),
      }
    })
    await page.screenshot({ path: `${OUT}/pain-popover-open.png` })
  }
  await page.screenshot({ path: `${OUT}/pain-popover-page.png` })
  return { trig, card }
}

/** 标题/间距：demo 页 h1、顶栏标题、卡片标题字号与主间距 */
const TITLES = () => {
  const pick = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r1 = (x) => Math.round(x * 100) / 100
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return { fs: cs.fontSize, fw: cs.fontWeight, lh: cs.lineHeight, pad: cs.padding, mb: cs.marginBottom, h: r1(r.height) }
  }
  return {
    demoTitle: pick('.demo-title'),
    demoDesc: pick('.demo-desc'),
    topbarTitle: pick('.vcl-topbar-title'),
    cardTitle: pick('.vcl-card-head .vcl-card-title, .card-title, [class*=card-title]'),
    demoRowGap: (() => {
      const row = document.querySelector('.demo-row')
      return row ? getComputedStyle(row).gap : null
    })(),
  }
}

/** 弹窗标题：打开 confirm-modal 页的弹窗量标题 */
const MODAL = async (page) => {
  const openBtn = page.locator('button:has-text("确认弹窗"), button:has-text("打开"), button:has-text("显示")').first()
  let info = null
  if (await openBtn.count()) {
    await openBtn.click()
    await page.waitForTimeout(600)
    info = await page.evaluate(() => {
      const r1 = (x) => Math.round(x * 100) / 100
      const m = document.querySelector('.vcl-modal, .modal, [role=dialog]')
      if (!m) return null
      const t = m.querySelector('[class*=title]')
      const mr = m.getBoundingClientRect()
      return {
        dialogW: r1(mr.width),
        titleText: t ? t.textContent.trim().slice(0, 12) : null,
        titleFs: t ? getComputedStyle(t).fontSize : null,
        titlePad: t ? getComputedStyle(t).padding : null,
        titleClass: t ? (typeof t.className === 'string' ? t.className : '').slice(0, 40) : null,
      }
    })
    await page.screenshot({ path: `${OUT}/pain-modal-open.png` })
  }
  return info
}

const main = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })

  const p1 = await ctx.newPage()
  await p1.goto(`${BASE}/#/tag`, { waitUntil: 'load', timeout: 20000 })
  await p1.waitForTimeout(900)
  const tags = await p1.evaluate(TAGS)
  console.log('TAG 页（scale', await p1.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--vcl-scale').trim()), '）：')
  console.log(JSON.stringify(tags, null, 1))
  await p1.screenshot({ path: `${OUT}/pain-tag-page.png`, fullPage: true })
  await p1.close()

  const p2 = await ctx.newPage()
  await p2.goto(`${BASE}/#/popover`, { waitUntil: 'load', timeout: 20000 })
  await p2.waitForTimeout(900)
  console.log('POPOVER 页：')
  console.log(JSON.stringify(await POPOVER(p2), null, 1))
  await p2.close()

  const p3 = await ctx.newPage()
  await p3.goto(`${BASE}/#/select`, { waitUntil: 'load', timeout: 20000 })
  await p3.waitForTimeout(900)
  console.log('TITLE/间距（select 页）：')
  console.log(JSON.stringify(await p3.evaluate(TITLES), null, 1))
  await p3.close()

  const p4 = await ctx.newPage()
  await p4.goto(`${BASE}/#/confirm-modal`, { waitUntil: 'load', timeout: 20000 })
  await p4.waitForTimeout(900)
  console.log('MODAL：')
  console.log(JSON.stringify(await MODAL(p4), null, 1))
  await p4.close()

  await ctx.close()
  await browser.close()
  console.log('done →', OUT)
}
main()
