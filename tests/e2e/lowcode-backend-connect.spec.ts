import { test, expect } from '@playwright/test'

/**
 * 「连接你自己的后端」面板（第 114 轮）
 *
 * 两条断言回答两个问题：
 *   ① **真连接**能不能成？（dev server 里就有参考后端：`/api/lowcode-demo/store`）
 *   ② **坏地址**会不会被拦住、而且**真的没发请求**？（"拦住"如果只是界面报错、请求照发，
 *      那令牌就已经送出去了 —— 必须用 network 事件证明它没发出）
 */
const PAGE = '/#/lowcode-nav'

test('连上参考后端：状态行报出后端自报的两份数，出现"断开"；断开后状态消失', async ({ page }) => {
  await page.goto(PAGE)
  const panel = page.locator('[data-test="backend-connect"]')
  await expect(panel, '面板在页面上').toBeVisible()

  // 默认预填的是内置参考后端（同源 → 默认策略放行）
  await expect(page.locator('[data-test="backend-url"]')).toHaveValue('/api/lowcode-demo/store')
  await expect(page.locator('[data-test="backend-status"]'), '还没连之前不该有状态行').toHaveCount(0)

  await page.locator('[data-test="backend-connect-btn"]').click()
  const status = page.locator('[data-test="backend-status"]')
  await expect(status, '连上了要显示后端自报的份数/条数').toContainText('已连接', { timeout: 15_000 })
  await expect(status).toContainText('份表单')
  await expect(page.locator('[data-test="backend-disconnect-btn"]'), '连上后出现"断开"').toBeVisible()

  await page.locator('[data-test="backend-disconnect-btn"]').click()
  await expect(page.locator('[data-test="backend-status"]'), '断开后状态行消失').toHaveCount(0)
  await expect(page.locator('[data-test="backend-disconnect-btn"]')).toHaveCount(0)
})

test('坏地址被**前置**拦住：界面报原因，且 __stats 请求一次都没发出', async ({ page }) => {
  const statsCalls: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('__stats')) statsCalls.push(req.url())
  })

  await page.goto(PAGE)
  await page.locator('[data-test="backend-url"]').fill('javascript:alert(1)')
  await page.locator('[data-test="backend-connect-btn"]').click()

  const status = page.locator('[data-test="backend-status"]')
  await expect(status, '要说清为什么不行').toContainText('不被允许')
  await expect(page.locator('[data-test="backend-disconnect-btn"]'), '没连上就不该有断开按钮').toHaveCount(0)
  expect(statsCalls, '非法地址不该产生任何请求（否则牌子就跟着令牌送出去了）').toHaveLength(0)
})
