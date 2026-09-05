// Select 统一格式浏览器留证：tag / 直接输入 / 选中后下拉展示全部（单选多选 select+combobox）
// 运行：node scripts/evidence-select-unified.cjs（需 dev server，地址取 EVIDENCE_URL 或默认 https://localhost:3726）
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.EVIDENCE_URL || 'https://localhost:3726'

const OUT = path.join(__dirname, 'shots-select-unified')
fs.mkdirSync(OUT, { recursive: true })

const results = []
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
  await page.goto(`${BASE}/#/select`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)

  const roots = page.locator('.select-dropdown-root')
  // demo 顺序：0 单选框架 / 1 多选框架 / 2 城市拼音 / 3 角色 / 4 全国城市 / 5 combobox 单选 / 6 combobox 多选
  const single = roots.nth(0)
  const multi = roots.nth(1)
  const comboSingle = roots.nth(5)
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png'), fullPage: false })

  /* ── 1. select 单选 ── */
  const sInput = single.locator('input.trigger-input')
  await sInput.click()
  await page.waitForTimeout(300)
  check('单选打开面板：6 个选项全量展示', (await page.locator('.dropdown-panel .panel-item').count()) === 6)
  await shot('01-select-单选-打开面板全量')

  await page.locator('.dropdown-panel .panel-item', { hasText: 'Vue' }).first().click()
  await page.waitForTimeout(300)
  const sTags = single.locator('.combobox-tag')
  check('单选选中后：trigger 渲染 1 个 tag', (await sTags.count()) === 1, await sTags.first().textContent().catch(() => ''))
  await shot('02-select-单选-tag展示')

  await sInput.click()
  await page.waitForTimeout(300)
  const itemsReopen = page.locator('.dropdown-panel .panel-item')
  check('单选已选后再开：仍展示全部 6 项', (await itemsReopen.count()) === 6)
  check(
    '单选已选项高亮',
    (await page.locator('.dropdown-panel .panel-item.selected').count()) === 1 &&
      (await page.locator('.dropdown-panel .panel-item.selected').first().textContent()).includes('Vue'),
  )
  await shot('03-select-单选-选中后再开全量')
  await page.keyboard.press('Escape')

  // tag × 移除
  await sTags.locator('.tag-close').click()
  await page.waitForTimeout(150)
  check('单选 tag × 移除 → tag 消失', (await single.locator('.combobox-tag').count()) === 0)

  /* ── 2. select 单选直接输入 ── */
  await sInput.click()
  await page.waitForTimeout(250)
  await sInput.fill('自研框架X')
  await sInput.press('Enter')
  await page.waitForTimeout(250)
  const sTags2 = single.locator('.combobox-tag')
  check('单选直接输入+回车：自定义值渲染为 tag', (await sTags2.count()) === 1 && (await sTags2.first().textContent()).includes('自研框架X'))
  await shot('04-select-单选-直接输入创建')
  await sTags2.locator('.tag-close').click()

  /* ── 3. select 多选 ── */
  const mInput = multi.locator('input.trigger-input')
  await mInput.click()
  await page.waitForTimeout(300)
  await page.locator('.dropdown-panel .panel-item', { hasText: 'React' }).first().click()
  await page.waitForTimeout(150)
  await page.locator('.dropdown-panel .panel-item', { hasText: 'Angular' }).first().click()
  await page.waitForTimeout(300)
  check('多选勾选两项：面板保持打开、渲染 2 个 tag', (await multi.locator('.combobox-tag').count()) === 2)
  check('多选勾选后再开：面板仍全量 6 项', (await page.locator('.dropdown-panel .panel-item').count()) === 6)
  await shot('05-select-多选-tag与全量面板')

  // 多选直接输入追加（含防抖竞态修复验证：输入后立即回车）
  await mInput.fill('自研Y')
  await mInput.press('Enter')
  await page.waitForTimeout(250)
  check('多选直接输入+立即回车：追加第 3 个 tag（防抖竞态修复）', (await multi.locator('.combobox-tag').count()) === 3)
  await shot('06-select-多选-直接输入追加')
  await page.keyboard.press('Escape')

  /* ── 4. combobox 单选 ── */
  const cInput = comboSingle.locator('input.trigger-input')
  await cInput.click()
  await page.waitForTimeout(300)
  await page.locator('.dropdown-panel .panel-item', { hasText: 'Vue 3' }).first().click()
  await page.waitForTimeout(300)
  const cTags = comboSingle.locator('.combobox-tag')
  check('combobox 单选：选中后同样渲染 1 个 tag', (await cTags.count()) === 1 && (await cTags.first().textContent()).includes('Vue 3'))
  await shot('07-combobox-单选-tag展示')

  await cInput.click()
  await page.waitForTimeout(300)
  check('combobox 单选已选后再开：全量 6 项', (await page.locator('.dropdown-panel .panel-item').count()) === 6)
  await page.keyboard.press('Escape')

  await browser.close()

  const failed = results.filter((r) => !r.pass)
  console.log(`\n==== 结果：${results.length - failed.length}/${results.length} 通过 ====`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error('EVIDENCE SCRIPT ERROR:', e)
  process.exit(2)
})
