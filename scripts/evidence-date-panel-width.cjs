// 日期/时间面板宽度固定取证：面板保持固有宽度(264-300px)，不随宽触发器拉伸；窄触发器/移动端不出界
// 运行：node scripts/evidence-date-panel-width.cjs（需 dev server，地址取 EVIDENCE_URL 或默认 https://localhost:3721）
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.EVIDENCE_URL || 'https://localhost:3721'

const OUT = path.join(__dirname, 'shots-date-panel-width')
fs.mkdirSync(OUT, { recursive: true })

const results = []
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

/** 打开某触发器的面板并返回 {panel, trigger} 边界信息 */
async function openAndMeasure(page, input) {
  await input.click()
  await page.waitForTimeout(400)
  const panel = await page.locator('.dropdown-panel').boundingBox()
  const trigger = await input.locator('xpath=..').boundingBox()
  return { panel, trigger }
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
  await page.goto(`${BASE}/#/select`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)

  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') })
  const dateInputs = page.locator('input[aria-haspopup="dialog"]') // 0=单日期 1=范围 2=时间

  /* ── A. 宽触发器（660px）：面板不被拉伸 ── */
  const grid = page.locator('.grid-3-col').filter({ has: dateInputs.first() })
  await grid.evaluate((el) => {
    el.style.gridTemplateColumns = '1fr'
    el.style.width = '660px'
  })
  await page.waitForTimeout(200)

  const cases = [
    { idx: 0, label: '单日期', shotName: '01-宽触发器-单日期' },
    { idx: 1, label: '日期范围', shotName: '02-宽触发器-日期范围' },
    { idx: 2, label: '时间', shotName: '03-宽触发器-时间' },
  ]
  for (const c of cases) {
    const { panel, trigger } = await openAndMeasure(page, dateInputs.nth(c.idx))
    check(`${c.label}：面板宽 264-300px（未跟随 660px 触发器）`, panel && panel.width >= 264 && panel.width <= 302, `面板 ${panel?.width.toFixed(1)}px`)
    check(`${c.label}：面板明显窄于触发器`, panel && trigger && panel.width < trigger.width - 100, `触发器 ${trigger?.width.toFixed(1)}px`)
    check(`${c.label}：左对齐触发器（±3px）`, panel && trigger && Math.abs(panel.x - trigger.x) <= 3, `panel.x=${panel?.x.toFixed(1)} trigger.x=${trigger?.x.toFixed(1)}`)
    check(`${c.label}：右缘不出视口`, panel && panel.x + panel.width <= 1280 - 7, `右缘 ${(panel ? panel.x + panel.width : 0).toFixed(1)}`)
    await shot(c.shotName)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  }

  /* ── B. 点选功能回归（定位改动不影响交互） ── */
  const { panel: dp } = await openAndMeasure(page, dateInputs.nth(0))
  await page.locator('.dropdown-panel .dp-cell:not(.disabled)').first().click()
  await page.waitForTimeout(250)
  const dateValText = await dateInputs.nth(0).locator('xpath=ancestor::div[3]/following-sibling::p[1]').textContent()
  check('单日期点选：值写入 trigger 下方', /选中: \d{4}-/.test(dateValText || ''), (dateValText || '').trim())

  await openAndMeasure(page, dateInputs.nth(1))
  const cells = page.locator('.dropdown-panel .dp-cell:not(.disabled)')
  await cells.nth(0).click()
  await cells.nth(8).click()
  await page.waitForTimeout(150)
  await page.locator('.dropdown-panel .dd-btn-primary').click()
  await page.waitForTimeout(250)
  const rangeValText = await dateInputs.nth(1).locator('xpath=ancestor::div[3]/following-sibling::p[1]').textContent()
  check('日期范围点选+确认：区间值写入', /~/.test(rangeValText || ''), (rangeValText || '').trim())

  await openAndMeasure(page, dateInputs.nth(2))
  await page.locator('.dropdown-panel .tp-column').first().locator('.tp-cell', { hasText: '08' }).click()
  await page.waitForTimeout(150)
  await page.locator('.dropdown-panel .dd-btn-primary').click()
  await page.waitForTimeout(250)
  const timeValText = await dateInputs.nth(2).locator('xpath=ancestor::div[3]/following-sibling::p[1]').textContent()
  check('时间点选+确认：时间值写入', /08:/.test(timeValText || ''), (timeValText || '').trim())
  await shot('04-功能回归-三项已选')

  /* ── C. 窄触发器（200px）：面板不被挤压、不脱锚 ── */
  await grid.evaluate((el) => {
    el.style.width = '200px'
  })
  await page.waitForTimeout(200)
  const narrow = await openAndMeasure(page, dateInputs.nth(0))
  check('窄触发器：面板保持 ≥264px 固有宽', narrow.panel && narrow.panel.width >= 264 && narrow.panel.width <= 302, `面板 ${narrow.panel?.width.toFixed(1)}px`)
  check('窄触发器：左对齐触发器（±3px）', narrow.panel && narrow.trigger && Math.abs(narrow.panel.x - narrow.trigger.x) <= 3, `panel.x=${narrow.panel?.x.toFixed(1)}`)
  await shot('05-窄触发器-单日期')

  /* ── D. 列表型面板回归：仍与触发器同宽 ── */
  const listInput = page.locator('.select-dropdown-root input.trigger-input').first()
  const list = await openAndMeasure(page, listInput)
  check('列表型（select 单选）：面板仍与触发器同宽', list.panel && list.trigger && Math.abs(list.panel.width - list.trigger.width) <= 3, `面板 ${list.panel?.width.toFixed(1)} vs 触发器 ${list.trigger?.width.toFixed(1)}`)
  await shot('06-回归-列表面板同宽')
  await page.keyboard.press('Escape')

  /* ── E. 移动端视口（375px）：不出界 ── */
  const mobile = await browser.newPage({ viewport: { width: 375, height: 720 }, ignoreHTTPSErrors: true })
  await mobile.goto(`${BASE}/#/select`, { waitUntil: 'networkidle' })
  await mobile.waitForTimeout(600)
  const mGrid = mobile.locator('.grid-3-col').filter({ has: mobile.locator('input[aria-haspopup="dialog"]').first() })
  await mGrid.evaluate((el) => {
    el.style.gridTemplateColumns = '1fr'
    el.style.width = '660px'
  })
  await mobile.waitForTimeout(200)
  const m = await openAndMeasure(mobile, mobile.locator('input[aria-haspopup="dialog"]').first())
  check('移动端：面板宽 264px（clamp 下限）', m.panel && m.panel.width >= 262 && m.panel.width <= 266, `面板 ${m.panel?.width.toFixed(1)}px`)
  check('移动端：左缘 ≥8px 且右缘 ≤367px', m.panel && m.panel.x >= 8 && m.panel.x + m.panel.width <= 367.5, `x=${m.panel?.x.toFixed(1)} 右缘 ${(m.panel ? m.panel.x + m.panel.width : 0).toFixed(1)}`)
  await mobile.screenshot({ path: path.join(OUT, '07-移动端-单日期.png') })

  await browser.close()

  const failed = results.filter((r) => !r.pass)
  console.log(`\n==== 结果：${results.length - failed.length}/${results.length} 通过 ====`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error('EVIDENCE SCRIPT ERROR:', e)
  process.exit(2)
})
