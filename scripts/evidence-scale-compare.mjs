/**
 * 移动端微缩对比图：同一 demo 页在 1440/768/390 三档并排 + 标注（scale/正文字号）
 * 用法：dev server 3721，node scripts/evidence-scale-compare.mjs [route]
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = 'reports/style-details-audit'
const BASE = 'http://localhost:3721'
const ROUTE = (process.argv[2] || 'select').replace(/[^a-z0-9-]/gi, '')

const shot = async (browser, w, h, file) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/#/${ROUTE}`, { waitUntil: 'load', timeout: 20000 })
  await page.waitForTimeout(1000)
  const stat = await page.evaluate(() => {
    const body = document.querySelector('.vcl-content-body')
    const el = body || document.body
    return { fs: getComputedStyle(el).fontSize, scale: getComputedStyle(document.documentElement).getPropertyValue('--vcl-scale').trim() }
  })
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: false })
  await ctx.close()
  return stat
}

/** 纯 DOM 构造（textContent 承载文案，src 走属性，不拼 HTML） */
const COMPOSE = (parts) => {
  const root = document.createElement('div')
  root.style.cssText = "display:flex;align-items:flex-start;gap:16px;padding:16px;background:#f4f5f7;font:14px/1.6 'Segoe UI',sans-serif"
  for (const p of parts) {
    const cell = document.createElement('div')
    const head = document.createElement('div')
    head.textContent = p.label
    head.style.cssText = 'font-weight:600;margin-bottom:6px'
    const img = document.createElement('img')
    img.src = p.src
    img.style.cssText = `border:1px solid #d5d8de;max-width:${p.maxw}px;height:auto`
    const note = document.createElement('div')
    note.textContent = p.note
    note.style.cssText = 'color:#505560;font-size:12px;margin-top:6px'
    cell.append(head, img, note)
    root.append(cell)
  }
  document.body.appendChild(root)
  // 等全部截图加载完再返回（file:// 页面引相对路径图是同源放行）
  return Promise.all([...document.querySelectorAll('img')].map((im) => (im.complete ? Promise.resolve() : new Promise((res) => { im.onload = im.onerror = res }))))
}

const main = async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const a = await shot(browser, 1440, 900, `cmp-${ROUTE}-1440.png`)
  const b = await shot(browser, 768, 900, `cmp-${ROUTE}-768.png`)
  const c = await shot(browser, 390, 844, `cmp-${ROUTE}-390.png`)

  // about:blank（setContent）引 file:// 图会被跨源拦截 → 落盘 HTML 再用相对路径打开
  const srcHtml = path.join(process.cwd(), OUT, `cmp-${ROUTE}-src.html`)
  fs.writeFileSync(
    srcHtml,
    '<!doctype html><html><head><meta charset="utf-8"><title>x</title></head><body style="margin:0"></body></html>',
    'utf8',
  )
  const parts = [
    { label: `1440 × 900（scale 1.125）`, src: `cmp-${ROUTE}-1440.png`, maxw: 720, note: `正文 ${a.fs} —— 正常观感（笔记本基准 1280=1.0，1440 略放大）` },
    { label: `768 × 900（scale 0.6）`, src: `cmp-${ROUTE}-768.png`, maxw: 384, note: `正文 ${b.fs} —— 平板档已偏小` },
    { label: `390 × 844（scale 0.305）`, src: `cmp-${ROUTE}-390.png`, maxw: 585, note: `正文 ${c.fs}、最小文字 3.05px —— 此格按 1.5 倍于手机实际渲染的尺寸展示；真机上就是 390px 宽里塞下整个界面` },
  ]
  const page = await browser.newPage()
  await page.goto(pathToFileURL(srcHtml).href, { waitUntil: 'load' })
  await page.evaluate(COMPOSE, parts)
  await page.waitForTimeout(300)
  const file = path.join(OUT, `compare-${ROUTE}.png`)
  await page.screenshot({ path: file, fullPage: true })
  fs.unlinkSync(srcHtml)
  await browser.close()
  console.log('done →', file)
}
main()
