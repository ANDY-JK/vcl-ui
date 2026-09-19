// 验证两处修复在真实浏览器里生效：
//  1) 门店合同收集页不再有 "Failed to resolve component: Input"（Input 已补导入）
//  2) 存储后端提示里的字面花括号完整渲染、不再有 "Message compilation error"
// 注意：存储面板默认不展示，需点「云端」按钮打开；其后端默认 s3，切到 supabase 看另一条提示。
import { test, expect } from '@playwright/test'

const BASE = process.env.E2E_BASE || 'http://localhost:3721'
const TIP = '{appleId}-{文件名}'

test('合同收集页：Input 已解析、存储提示完整渲染且无 i18n 编译报错', async ({ page }) => {
  const logs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text())
  })
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))

  await page.goto(`${BASE}/#/contract-collection`)
  await page.waitForLoadState('networkidle').catch(() => {})

  await page.getByRole('button', { name: /云端/ }).click()

  // 默认 s3 后端提示
  const tip = page.locator('.scp-tip').first()
  await expect(tip).toBeVisible({ timeout: 15000 })
  await expect(tip).toContainText(TIP)

  // 切到 supabase 后端提示
  await page.locator('input[type=radio][value=supabase]').click({ force: true })
  await expect(page.locator('.scp-tip').first()).toContainText(TIP)

  expect(logs.filter((l) => /Message compilation error/.test(l)), 'i18n 编译报错').toHaveLength(0)
  expect(logs.filter((l) => /Failed to resolve component/.test(l)), '未解析组件告警').toHaveLength(0)
})
