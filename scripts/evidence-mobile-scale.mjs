/**
 * 移动端缩放取证：量 390/414/480/768 下 --vcl-scale 实值与代表元素字号，截图存证
 * 用法：dev server 3721，node scripts/evidence-mobile-scale.mjs
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = 'reports/style-details-audit'
fs.mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:3721'

const MEASURE = () => {
  const cs = (sel, prop) => {
    const el = document.querySelector(sel)
    return el ? getComputedStyle(el)[prop] : null
  }
  const fsOf = (sel) => {
    const el = document.querySelector(sel)
    return el ? parseFloat(getComputedStyle(el).fontSize) : null
  }
  const round = (x) => (x == null ? null : Math.round(x * 1000) / 1000)
  return {
    scaleVar: getComputedStyle(document.documentElement).getPropertyValue('--vcl-scale').trim(),
    bodyFs: round(fsOf('body')),
    navText: round(fsOf('.vcl-nav-item .vcl-nav-label, .vcl-nav-item')),
    topbarTitle: round(fsOf('.vcl-topbar-title')),
    demoToolbar: round(fsOf('.demo-toolbar')),
    demoRowLabel: round(fsOf('.demo-row-label, .demo-row')),
    smallest10: [...document.querySelectorAll('#app *')]
      .filter((el) => el.children.length === 0 && (el.textContent || '').trim().length > 2 && el.getBoundingClientRect().height > 0)
      .map((el) => ({ fs: parseFloat(getComputedStyle(el).fontSize), t: (el.textContent || '').trim().slice(0, 12) }))
      .filter((x) => x.fs > 0 && x.fs < 6)
      .slice(0, 6),
    docH: document.documentElement.scrollHeight,
    contentTop: round(document.querySelector('.vcl-content-body, main')?.getBoundingClientRect().top),
  }
}

const main = async () => {
  const browser = await chromium.launch()
  for (const [w, h] of [[390, 844], [414, 896], [480, 800], [768, 900], [1280, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/#/data-table`, { waitUntil: 'load', timeout: 20000 })
    await page.waitForTimeout(900)
    const data = await page.evaluate(MEASURE)
    data.width = w
    console.log(JSON.stringify(data, null, 1))
    fs.writeFileSync(`${OUT}/scale-evidence-${w}.json`, JSON.stringify(data, null, 1))
    await page.screenshot({ path: `${OUT}/scale-evidence-${w}.png`, fullPage: false })
    await ctx.close()
  }
  await browser.close()
  console.log('done →', OUT)
}
main()
