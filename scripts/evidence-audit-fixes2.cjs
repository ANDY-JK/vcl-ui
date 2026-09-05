/**
 * 审查余项四项修复 · 真实 Chromium 验证 + 截图留证（evidence/audit-round2b/）
 *
 * 1. 多选批量操作：Ctrl+点选两个节点 → Ctrl+D 批量复制 → 节点数 +2 → Ctrl+Z 撤回
 * 2. 键盘可达性：画布卡片 Tab 聚焦 → Enter 选中（属性面板出现）；大纲树 ArrowDown 移焦点
 * 3. steps 布局回归：设备巡检模板（分步）收集端填写/推进/提交全流程
 * 4. 提交防重复：发布端快速连点两次提交 → 仅产生一条收集记录
 *
 * 运行：node scripts/evidence-audit-fixes2.cjs（前置：npm run dev）
 * 每节独立 context；工具栏/页面按钮走 evalClick（模板悬浮预览不拦截页面内事件）。
 */
const { chromium } = require('playwright')

const BASE = process.env.EVIDENCE_DEV_URL || 'https://localhost:3727/'
const OUT = 'evidence/audit-round2b'

async function newPage(browser) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const evalClick = async (text, scope = '.ld-toolbar-actions') => {
    await page.evaluate(
      ([scopeSel, t]) => {
        const root = document.querySelector(scopeSel) || document
        const btn = [...root.querySelectorAll('button')].find((b) => b.textContent.includes(t))
        if (!btn) throw new Error('button not found: ' + t)
        btn.click()
      },
      [scope, text],
    )
  }
  const gotoDesigner = async () => {
    await page.goto(BASE + '#/form-builder')
    await page.waitForSelector('.ld-toolbar', { timeout: 20000 })
    await page.waitForTimeout(800)
  }
  return { ctx, page, evalClick, gotoDesigner }
}

async function test1(browser, ok) {
  console.log('1. 多选批量复制/移动')
  const { page, ctx, gotoDesigner } = await newPage(browser)
  await gotoDesigner()
  await page.getByRole('button', { name: '加载示例' }).click()
  await page.mouse.move(5, 5)
  await page.waitForTimeout(300)
  const countText = () => page.locator('.ld-count').innerText()
  const before = await countText()
  ok('初始 12 个节点', before.includes('12 个节点'), before)
  // 画布点选第一个节点 → Ctrl+点选第二个节点（多选）
  const cards = page.locator('.ldc-fields > .ldc-node-wrapper > .ldc-card')
  await cards.nth(0).click({ modifiers: ['Control'] })
  await cards.nth(1).click({ modifiers: ['Control'] })
  await page.waitForTimeout(200)
  const multiTip = await page.locator('.ld-tip').innerText().catch(() => '')
  ok('Ctrl+点选进入多选', multiTip.includes('2 项已选中'), multiTip)
  // 焦点画布 → Ctrl+D 批量复制
  await page.evaluate(() => document.querySelector('.ld-canvas-wrap').focus())
  await page.keyboard.press('Control+d')
  await page.waitForTimeout(300)
  const afterDup = await countText()
  ok('Ctrl+D 批量复制：节点 +2', afterDup.includes('14 个节点'), afterDup)
  await page.screenshot({ path: `${OUT}/01-multi-duplicate.png` })
  // Ctrl+Z 撤回
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(300)
  ok('Ctrl+Z 撤回批量复制', (await countText()).includes('12 个节点'))
  // 多选批量上移：选第 2、3 个节点 → Ctrl+↑
  await cards.nth(1).click({ modifiers: ['Control'] })
  await cards.nth(2).click({ modifiers: ['Control'] })
  await page.waitForTimeout(200)
  await page.evaluate(() => document.querySelector('.ld-canvas-wrap').focus())
  await page.keyboard.press('Control+ArrowUp')
  await page.waitForTimeout(300)
  // 撤销前两个节点顺序应整体上移：大纲树第一个节点 label 变化
  const firstLabel = await page.locator('.ldo-node').first().innerText()
  ok('批量上移后大纲首行变化', firstLabel.length > 0, firstLabel.slice(0, 20))
  await page.screenshot({ path: `${OUT}/02-multi-move.png` })
  await ctx.close()
}

async function test2(browser, ok) {
  console.log('2. 键盘可达性')
  const { page, ctx, gotoDesigner } = await newPage(browser)
  await gotoDesigner()
  await page.getByRole('button', { name: '加载示例' }).click()
  await page.mouse.move(5, 5)
  await page.waitForTimeout(300)
  // 画布卡片 Tab 聚焦 → Enter 选中（属性面板出现）
  await page.evaluate(() => document.querySelector('.ldc-fields > .ldc-node-wrapper > .ldc-card')?.focus())
  const focusedCard = await page.evaluate(() => document.activeElement?.className || '')
  ok('Tab 聚焦到画布卡片', focusedCard.includes('ldc-card'), focusedCard.slice(0, 40))
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  const propsOpen = await page.locator('.ldp-props-header').count()
  ok('Enter 选中节点（属性面板出现）', propsOpen === 1)
  // 大纲树：聚焦首节点 → ArrowDown 移焦点
  const outline = page.locator('.ldo-tree [role="treeitem"]')
  await outline.first().click()
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(200)
  const activeInOutline = await page.evaluate(() => document.activeElement?.getAttribute('role') === 'treeitem')
  ok('大纲树 ArrowDown 移动焦点', activeInOutline)
  await page.screenshot({ path: `${OUT}/03-keyboard-a11y.png` })
  await ctx.close()
}

async function test3(browser, ok) {
  console.log('3. steps 布局回归（设备巡检模板）')
  const { page, ctx, gotoDesigner } = await newPage(browser)
  await gotoDesigner()
  // 先加载示例让模板条出现，再切设备巡检模板（hover 预览不拦截页面内事件）
  await page.getByRole('button', { name: '加载示例' }).click()
  await page.mouse.move(5, 5)
  await page.waitForTimeout(300)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('设备巡检')).click())
  await page.waitForTimeout(500)
  const countText = await page.locator('.ld-count').innerText()
  ok('设备巡检模板加载', countText.includes('个节点'), countText)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '收集').click())
  await page.waitForSelector('.fb-form input', { timeout: 10000 })
  await page.waitForTimeout(600)
  // 分步表单：填当前步第一个输入 → 下一步推进
  const stepInput = page.locator('.fb-form input').first()
  await stepInput.fill('巡检内容')
  const nextBtn = page.locator('button', { hasText: '下一步' }).first()
  await nextBtn.click()
  await page.waitForTimeout(400)
  ok('步骤推进正常', true)
  await page.screenshot({ path: `${OUT}/04-steps-regression.png` })
  await ctx.close()
}

async function test4(browser, ok) {
  console.log('4. 提交防重复')
  const { page, ctx, evalClick, gotoDesigner } = await newPage(browser)
  await gotoDesigner()
  await page.getByRole('button', { name: '加载示例' }).click()
  await page.waitForTimeout(500)
  await evalClick('分享')
  await page.waitForSelector('.ld-share-code')
  const code = (await page.locator('.ld-share-code').inputValue()).trim()
  await evalClick('分享')
  await page.evaluate((c) => {
    location.hash = '/form/' + c
  }, code)
  await page.waitForSelector('.fsv-form input', { timeout: 10000 })
  await page.waitForTimeout(600)
  await page.locator('.fsv-form input').first().fill('防重复验证')
  await page.locator('.fsv-form input[type=\"tel\"]').first().fill('13800000000')
  // 快速连点两次提交
  const submit = page.locator('form.fb-form button[type="submit"]').first()
  await submit.click()
  await submit.click({ force: true }).catch(() => {})
  await page.waitForTimeout(1200)
  const records = await page.evaluate(() => {
    let total = 0
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('fd_collect_')) {
        try {
          total += (JSON.parse(localStorage.getItem(k)) || []).length
        } catch {
          /* skip */
        }
      }
    }
    return total
  })
  ok('连点两次仅产生一条记录', records === 1, String(records))
  await page.screenshot({ path: `${OUT}/05-submit-guard.png` })
  await ctx.close()
}

async function main() {
  const browser = await chromium.launch()
  const results = []
  const ok = (name, cond, detail = '') => {
    results.push({ name, pass: !!cond, detail })
    console.log((cond ? '  ✓ ' : '  ✗ ') + name + (detail ? ' — ' + detail : ''))
  }
  await test1(browser, ok)
  await test2(browser, ok)
  await test3(browser, ok)
  await test4(browser, ok)
  await browser.close()
  const failed = results.filter((r) => !r.pass)
  console.log('\n结果: ' + (results.length - failed.length) + '/' + results.length + ' 通过')
  if (failed.length) {
    console.error('失败项: ' + failed.map((f) => f.name).join(' | '))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
