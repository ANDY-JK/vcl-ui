/**
 * P2 体验完善四项 · 真实 Chromium 验证 + 截图留证（evidence/p2-experience-polish/）
 *
 * 前置：npm run dev 已启动（默认探 3721/3727，可用 EVIDENCE_DEV_URL 覆盖）
 * 运行：node scripts/evidence-p2.cjs
 *
 * 覆盖：
 * - P2-10 快捷键面板：按钮开合 + 画布 ? 键开合 + 面板内容
 * - P2-12 表单设置分组：五分组/默认开合/点击切换
 * - P2-11 card 容器设计期卡片视觉（加载示例 + 拖字段入卡）
 * - P2-13 草稿自动保存：改动后刷新恢复（IndexedDB 真实读写）
 */
const { chromium } = require('playwright')

const BASE = process.env.EVIDENCE_DEV_URL || 'https://localhost:3727/'
const OUT = 'evidence/p2-experience-polish'

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const results = []
  const ok = (name, cond, detail = '') => {
    results.push({ name, pass: !!cond, detail })
    if (!cond) console.error('  ✗ ' + name + ' ' + detail)
    else console.log('  ✓ ' + name + (detail ? ' — ' + detail : ''))
  }

  await page.goto(BASE + '#/form-builder')
  await page.waitForSelector('.ld-toolbar', { timeout: 20000 })
  await page.waitForTimeout(800)

  // ═══ P2-10 快捷键面板 ═══
  console.log('P2-10 快捷键帮助面板')
  await page.getByRole('button', { name: '快捷键' }).click()
  await page.waitForSelector('.ld-shortcuts')
  const panelText = await page.locator('.ld-shortcuts').innerText()
  ok('面板打开且含核心快捷键', panelText.includes('Ctrl + Z') && panelText.includes('Ctrl + D') && panelText.includes('Delete'), '8 行快捷键 + 聚焦提示')
  await page.screenshot({ path: `${OUT}/01-shortcuts-panel.png` })
  // 画布 ? 键关闭
  await page.focus('.ld-canvas-wrap')
  await page.keyboard.press('?')
  await page.waitForTimeout(200)
  ok('? 键关闭面板', (await page.locator('.ld-shortcuts').count()) === 0)
  await page.keyboard.press('?')
  await page.waitForTimeout(200)
  ok('? 键再开面板', (await page.locator('.ld-shortcuts').count()) === 1)
  await page.getByRole('button', { name: '快捷键' }).click() // 收起，给后续步骤干净的界面
  await page.waitForTimeout(200)

  // ═══ P2-12 表单设置分组 ═══
  console.log('P2-12 表单设置分组折叠')
  await page.getByRole('button', { name: '表单设置' }).click()
  await page.waitForSelector('.ld-set-group-head')
  const labels = await page.locator('.ld-set-group-head').allInnerTexts()
  ok('五分组齐全', ['基础', '布局', '校验', '提交', '存储'].every((l) => labels.some((x) => x.includes(l))), labels.join('/'))
  const disp = async (label) =>
    page.evaluate((l) => {
      const g = [...document.querySelectorAll('.ld-set-group')].find((g) => g.querySelector('.ld-set-group-head').textContent.includes(l))
      return getComputedStyle(g.querySelector('.ld-set-group-body')).display
    }, label)
  ok('默认展开 基础/布局/提交', (await disp('基础')) === 'block' && (await disp('布局')) === 'block' && (await disp('提交')) === 'block')
  ok('默认折叠 校验/存储', (await disp('校验')) === 'none' && (await disp('存储')) === 'none')
  await page.locator('.ld-set-group-head', { hasText: '校验' }).click()
  await page.waitForTimeout(200)
  ok('点击「校验」头展开', (await disp('校验')) === 'block')
  await page.screenshot({ path: `${OUT}/02-settings-groups.png` })
  await page.getByRole('button', { name: '表单设置' }).click() // 收起设置面板
  await page.waitForTimeout(200)

  // ═══ P2-11 card 容器设计期视觉 ═══
  console.log('P2-11 card 容器设计期卡片视觉')
  await page.getByRole('button', { name: '加载示例' }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: '分组卡片' }).first().click()
  await page.waitForTimeout(400)
  const cardContainer = page.locator('.ldc-container--card')
  ok('card 容器出现专属 class', (await cardContainer.count()) === 1)
  // 拖一个字段进卡片容器（dragTo 走原生 HTML5 dnd：dragstart 携带 application/x-field-type）
  await cardContainer.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(300)
  const panelField = page.locator('aside .ldp-cat-items button, aside button', { hasText: '单行输入' }).first()
  await panelField.dragTo(cardContainer, { targetPosition: { x: 200, y: 60 } })
  await page.waitForTimeout(500)
  const childrenInCard = await cardContainer.evaluate((el) => el.querySelectorAll('.ldc-card').length)
  ok('拖拽字段进入卡片容器', childrenInCard === 1, '容器内 ' + childrenInCard + ' 个子字段')
  const countText = await page.locator('.ld-count').innerText()
  console.log('  画布状态：' + countText)
  await page.screenshot({ path: `${OUT}/03-card-container-design.png` })

  // ═══ P2-13 草稿自动保存 + 刷新恢复 ═══
  console.log('P2-13 设计器草稿自动保存')
  // 改标题（在示例加载与拖拽之后改，确保其进入最终草稿）+ 关面板触发 meta 变更
  await page.getByRole('button', { name: '表单设置' }).click()
  await page.waitForTimeout(200)
  await page.locator('input.ld-settings-textarea').first().fill('P2 验证表单')
  await page.getByRole('button', { name: '表单设置' }).click()
  await page.waitForTimeout(1300) // 防抖 800ms + 余量 → IndexedDB 落盘
  await page.reload()
  await page.waitForSelector('.ld-toolbar', { timeout: 20000 })
  await page.waitForTimeout(1200)
  const tipCount = await page.getByText('已恢复上次未保存的设计草稿').count()
  ok('刷新后出现「已恢复草稿」提示', tipCount === 1)
  const restoredCount = await page.locator('.ld-count').innerText()
  ok('节点与容器完整恢复', restoredCount.includes('14 个节点') && restoredCount.includes('1 个容器'), restoredCount)
  const restoredCard = await page.locator('.ldc-container--card').count()
  const restoredChild = await page.locator('.ldc-container--card .ldc-card').count()
  ok('卡片容器及其子字段恢复', restoredCard === 1 && restoredChild === 1)
  const titleBack = await page.getByRole('button', { name: '表单设置' }).click()
  await page.waitForTimeout(300)
  const titleVal = await page.locator('input.ld-settings-textarea').first().inputValue()
  ok('表单标题随草稿恢复', titleVal === 'P2 验证表单', titleVal)
  await page.screenshot({ path: `${OUT}/04-draft-restored.png` })

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
