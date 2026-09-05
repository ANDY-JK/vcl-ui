/**
 * api 型动态默认值 · 真实 Chromium 验证 + 截图留证（evidence/api-defaults/）
 *
 * 前置：npm run dev 已启动；BASE 可用环境变量覆盖
 * 运行：node scripts/evidence-api-defaults.cjs
 *
 * 链路：设计器添加字段 → 数据页配置「API 获取」默认值（接口地址+取值路径）
 *       → 切预览（FormBuilder 真实挂载）→ route 拦截 API 响应 → 断言字段自动回填
 */
const { chromium } = require('playwright')

const BASE = process.env.EVIDENCE_DEV_URL || 'https://localhost:3727/'
const OUT = 'evidence/api-defaults'

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const results = []
  const ok = (name, cond, detail = '') => {
    results.push({ name, pass: !!cond, detail })
    console.log((cond ? '  ✓ ' : '  ✗ ') + name + (detail ? ' — ' + detail : ''))
  }

  // 拦截默认值 API：返回 { data: { value: 'SKU-2026-001' } }
  await page.route('**/api/next-no', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { value: 'SKU-2026-001' } }) }),
  )

  await page.goto(BASE + '#/form-builder')
  await page.waitForSelector('.ld-toolbar', { timeout: 20000 })
  await page.waitForTimeout(800)

  // 1) 添加单行输入字段（点击面板按钮，自动选中 → 右侧属性面板出现）
  await page.locator('aside button', { hasText: '单行输入' }).first().click()
  await page.waitForSelector('.ldp-props')
  await page.waitForTimeout(300)

  // 2) 切到属性面板「数据」页签
  await page.locator('.ldp-prop-tab', { hasText: '数据' }).click()
  await page.waitForTimeout(300)

  // 3) 默认值类型 → API 获取
  const defaultTypeSelect = page.locator('.ldp-prop', { hasText: '默认值类型' }).first().locator('.trigger-input')
  await defaultTypeSelect.click()
  await page.locator('button.panel-item', { hasText: 'API 获取' }).first().click()
  await page.waitForTimeout(300)

  // 4) 出现 接口地址 / 取值路径 输入并填入
  const apiUrlInput = page.locator('.ldp-prop', { hasText: '接口地址' }).first().locator('input')
  ok('选择 API 获取后出现接口地址输入', (await apiUrlInput.count()) === 1)
  await apiUrlInput.fill(BASE.replace(/\/$/, '') + '/api/next-no')
  const pathInput = page.locator('.ldp-prop', { hasText: '取值路径' }).first().locator('input')
  ok('出现取值路径输入', (await pathInput.count()) === 1)
  await pathInput.fill('data.value')
  await page.screenshot({ path: `${OUT}/01-designer-api-default.png` })

  // 5) 代码页验证 schema 已带 defaultMeta
  await page.locator('.ld-toolbar-actions button', { hasText: '代码' }).click()
  await page.waitForTimeout(300)
  const codeJson = await page.locator('.ld-code-body pre').innerText()
  ok('设计 JSON 含 api 型默认值配置', codeJson.includes('"defaultType": "api"') && codeJson.includes('defaultApiUrl') && codeJson.includes('data.value'))

  // 6) 切预览：FormBuilder 真实挂载 → route 拦截的 API 响应自动回填
  await page.locator('.ld-toolbar-actions button', { hasText: '预览' }).click()
  await page.waitForSelector('.fb-form', { timeout: 10000 })
  await page.waitForTimeout(1200)
  const previewValue = await page.locator('.fb-form input[type="text"], .fb-form input:not([type])').first().inputValue()
  ok('预览中字段被 API 默认值自动回填', previewValue === 'SKU-2026-001', previewValue || '(空)')
  await page.screenshot({ path: `${OUT}/02-preview-filled.png` })

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
