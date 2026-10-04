// Popover 指向三角（arrow）几何守护 —— 外壳 .pop-floating 挂定位与箭头、内层 .pop-skin 挂皮肤裁切
// 回归防线：①箭头贴 flip 边且对准触发器中心（--vcl-arrow-offset）②arrow 默认关不破「无箭头定案」
import { test, expect } from '@playwright/test'

const BASE = process.env.E2E_BASE || 'http://localhost:3721'

test('arrow 开：三角贴浮层 flip 边并对准触发器中心', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE}/#/popover`)

  const btn = page.locator('button[aria-label="通知中心"]')
  await btn.click()
  await page.waitForTimeout(300)

  const pop = page.locator('.pop-floating').filter({ hasText: '通知中心' })
  const arrow = pop.locator('.pop-arrow')
  const ar = await arrow.boundingBox()
  const card = await pop.locator('.popover-card').boundingBox()
  const br = await btn.boundingBox()
  expect(ar, '箭头渲染（未被子层裁切）').not.toBeNull()

  // flip-right：箭头在浮层左缘（中心压边线，容差 3px）
  expect(Math.abs(ar!.x + ar!.width / 2 - card!.x), '箭头中心压浮层左缘').toBeLessThan(3)
  // 沿 Y 对准触发器中心（--vcl-arrow-offset 值域，容差 4px）
  expect(Math.abs(ar!.y + ar!.height / 2 - (br!.y + br!.height / 2)), '箭头对准触发器中心').toBeLessThan(4)
  // 变量确实写入外壳（供 .pop-arrow 定位消费）
  const style = (await pop.getAttribute('style')) || ''
  expect(style, '外壳携带 --vcl-arrow-offset').toContain('--vcl-arrow-offset')
})

test('arrow 默认关：未开 arrow 的浮层无 .pop-arrow（无箭头定案不被默认值破坏）', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE}/#/popover`)
  // 浮层用 Transition+v-show：闭合时子树被移出 DOM，须先打开再断言
  await page.locator('button[aria-label="通知中心"]').click()
  await page.waitForTimeout(300)

  // 页面上两个 popover：通知中心（arrow 开）+ 帮助信息（arrow 默认关，hover 未触发）
  const on = page.locator('.pop-floating').filter({ hasText: '通知中心' })
  const help = page.locator('.pop-floating').filter({ hasText: '帮助信息' })
  expect(await on.locator('.pop-arrow').count(), 'arrow 开者渲染三角').toBe(1)
  expect(await help.locator('.pop-arrow').count(), '默认关者无三角').toBe(0)
})
