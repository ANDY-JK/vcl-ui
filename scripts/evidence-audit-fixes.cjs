/**
 * 真实使用审查修复四项 · 真实 Chromium 验证 + 截图留证（evidence/audit-round2/）
 *
 * 1. 撤销覆盖 meta：改表单标题 → 撤销 → 恢复
 * 2. 发布端草稿：#/form/<code> 填写 → 刷新 → 自动恢复
 * 3. 收集端单条删除确认：垃圾桶 → ConfirmModal → 确认后删除
 * 4. 汇总弹窗分页：45 条记录渲染首页 20 行 + 翻页
 *
 * 运行：node scripts/evidence-audit-fixes.cjs（前置：npm run dev）
 * 说明：
 * - 每节独立 browser context（存储隔离，避免设计器草稿自动保存跨节串扰）
 * - demo 模板条悬浮预览会拦截指针点击——工具栏/页面按钮一律走 evalClick
 *   （页面内派发真实 click 事件，无指针路径）
 */
const { chromium } = require('playwright')

const BASE = process.env.EVIDENCE_DEV_URL || 'https://localhost:3727/'
const OUT = 'evidence/audit-round2'

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
  console.log('1. 撤销栈覆盖表单设置')
  const { page, ctx, evalClick, gotoDesigner } = await newPage(browser)
  await gotoDesigner()
  await evalClick('表单设置')
  await page.waitForTimeout(300)
  const titleInput = page.locator('input.ld-settings-textarea').first()
  const originalTitle = await titleInput.inputValue()
  await titleInput.fill('审计改标题')
  await evalClick('表单设置') // 收起
  await page.waitForTimeout(200)
  await evalClick('撤销')
  await page.waitForTimeout(300)
  await evalClick('表单设置')
  await page.waitForTimeout(300)
  const restoredTitle = await page.locator('input.ld-settings-textarea').first().inputValue()
  ok('改标题后撤销 → 恢复原标题', restoredTitle === originalTitle, `${restoredTitle}（期望 ${originalTitle}）`)
  await page.screenshot({ path: `${OUT}/01-undo-meta.png` })
  await ctx.close()
}

async function test2(browser, ok) {
  console.log('2. 发布填写端草稿保护')
  const { page, ctx, evalClick, gotoDesigner } = await newPage(browser)
  await gotoDesigner()
  await page.getByRole('button', { name: '加载示例' }).click()
  await page.waitForTimeout(500)
  await evalClick('分享')
  await page.waitForSelector('.ld-share-code')
  const code = (await page.locator('.ld-share-code').inputValue()).trim()
  ok('分享弹窗生成分享码', code.length > 10, code.slice(0, 24) + '…')
  await evalClick('分享')
  // SPA hash 路由：改 hash 即导航
  await page.evaluate((c) => {
    location.hash = '/form/' + c
  }, code)
  await page.waitForSelector('.fsv-form input', { timeout: 10000 })
  await page.waitForTimeout(600)
  await page.locator('.fsv-form input').first().fill('草稿内容ABC')
  await page.waitForTimeout(1400) // 草稿防抖 1s 落盘
  await page.reload()
  await page.waitForSelector('.fsv-form input', { timeout: 10000 })
  await page.waitForTimeout(800)
  const restored = await page.locator('.fsv-form input').first().inputValue()
  ok('刷新后填写内容自动恢复', restored === '草稿内容ABC', restored || '(空)')
  await page.screenshot({ path: `${OUT}/02-share-draft-restored.png` })
  await ctx.close()
}

async function test3(browser, ok) {
  console.log('3. 收集端单条删除确认')
  const { page, ctx, evalClick, gotoDesigner } = await newPage(browser)
  await gotoDesigner()
  await page.getByRole('button', { name: '加载示例' }).click()
  // 加载示例后按钮位置被模板条替换，静止鼠标会悬停到模板上弹出可交互预览——移开
  await page.mouse.move(5, 5)
  await page.waitForTimeout(300)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '收集').click())
  await page.waitForSelector('.fb-form input', { timeout: 10000 })
  await page.waitForTimeout(600) // 等 Vue 事件绑定完成（否则 fill 不进 formData）
  await page.locator('.fb-form input').first().fill('张三丰')
  await page.locator('.fb-form input[type="tel"]').first().fill('13800000000')
  await page.locator('form.fb-form button[type="submit"]').first().click()
  try {
    await page.waitForSelector('.ldc-ok', { timeout: 5000 })
  } catch {
    const dbg = await page.evaluate(() => ({
      errors: [...document.querySelectorAll('.fb-field-error, .fb-error, [class*="error"]')].map((e) => e.textContent.trim()).filter(Boolean).slice(0, 6),
      values: [...document.querySelectorAll('.fb-form input')].map((i) => i.value),
      toasts: [...document.querySelectorAll('[class*="toast"]')].map((e) => e.textContent.trim()).slice(0, 3),
    }))
    console.log('  [debug]', JSON.stringify(dbg))
    throw new Error('submit did not succeed')
  }
  const submitOk = await page.locator('.ldc-ok').count()
  ok('提交一条记录成功', submitOk === 1)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('已收集')).click())
  await page.waitForTimeout(600)
  const before = await page.locator('.ldc-record').count()
  ok('记录列表展开且含 1 条', before === 1, String(before))
  // 点垃圾桶
  await page.locator('.ldc-del-btn').first().click()
  await page.waitForTimeout(300)
  const confirmCount = await page.locator('.confirm-btn').count()
  ok('点删除弹出确认弹窗', confirmCount > 0)
  const stillThere = await page.locator('.ldc-record').count()
  ok('未确认前记录未被删除', stillThere === before)
  await page.locator('.confirm-btn').last().click()
  await page.waitForTimeout(500)
  const after = await page.locator('.ldc-record').count()
  ok('确认后记录被删除', after === before - 1, `${before} → ${after}`)
  await page.screenshot({ path: `${OUT}/03-delete-confirm.png` })
  await ctx.close()
}

async function test4(browser, ok) {
  console.log('4. 汇总弹窗大数据量分页')
  const { page, ctx, evalClick, gotoDesigner } = await newPage(browser)
  await gotoDesigner()
  await page.getByRole('button', { name: '加载示例' }).click()
  await page.waitForTimeout(400)
  await evalClick('保存')
  await page.waitForTimeout(300)
  await page.locator('.ld-save-input').fill('审计分页表单')
  await page.locator('button', { hasText: '保存' }).last().click()
  await page.waitForTimeout(600)
  // 直接向该表单的 collectKey 灌 45 条记录
  const seeded = await page.evaluate((n) => {
    const index = JSON.parse(localStorage.getItem('fd_forms_index') || '[]')
    if (!index.length) return 0
    const key = index[0].collectKey
    const records = []
    for (let i = 0; i < n; i++) {
      records.push({
        id: 'seed' + i,
        time: `2026-09-05 10:${String(i % 60).padStart(2, '0')}:00`,
        data: { 姓名: '用户' + i, 备注: '备注' + i },
      })
    }
    localStorage.setItem(key, JSON.stringify(records))
    return records.length
  }, 45)
  ok('预置 45 条记录', seeded === 45)
  await evalClick('我的表单')
  await page.waitForTimeout(400)
  await page.evaluate(() => document.querySelector('.ld-table-act[data-act="view"]').click())
  await page.waitForSelector('.ld-data-table', { timeout: 10000 })
  await page.waitForTimeout(400)
  const rows = await page.locator('.ld-data-table tbody tr').count()
  ok('45 条只渲染首页 20 行', rows === 20, String(rows))
  const hasPager = await page.locator('.ld-data-page').count()
  ok('出现分页控件', hasPager === 1)
  await page.locator('.ld-data-page-btn', { hasText: '2' }).click()
  await page.waitForTimeout(300)
  const rows2 = await page.locator('.ld-data-table tbody tr').count()
  const firstTime2 = await page.locator('.ld-data-table tbody tr .ld-data-time').first().innerText()
  ok('翻页后渲染第二页', rows2 === 20 && !firstTime2.includes('10:00'), firstTime2)
  await page.screenshot({ path: `${OUT}/04-summary-pagination.png` })
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
