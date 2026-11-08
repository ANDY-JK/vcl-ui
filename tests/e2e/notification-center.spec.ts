// NotificationCenter 真实浏览器回归（e2e）
//
// 单测（Vue Test Utils）验不了这一层：**面板是不是真的浮在触发按钮下方、Esc 能不能关、外部点能不能关**。
// 这些依赖 useFloating 的定位与 document 级监听，必须在真实布局里跑。
import { test, expect, Page } from '@playwright/test'

const root = (page: Page) => page.locator('.nc-root').first()
const trigger = (page: Page) => root(page).locator('.nc-trigger')
// 面板 Teleport 到 body（避免被父级 overflow 裁剪）→ 只能在 page 级定位
const panel = (page: Page) => page.locator('.nc-panel')

test.describe('NotificationCenter 通知中心', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/notification-center')
    await expect(page.locator('h1')).toContainText('NotificationCenter', { timeout: 15_000 })
  })

  test('点铃铛打开面板，且**面板真的落在触发按钮下方**', async ({ page }) => {
    await trigger(page).click()
    await expect(panel(page)).toBeVisible()

    const geo = await page.evaluate(() => {
      const btn = document.querySelector('.nc-trigger')!.getBoundingClientRect()
      const pan = document.querySelector('.nc-panel')!.getBoundingClientRect()
      return { btnBottom: Math.round(btn.bottom), panTop: Math.round(pan.top), btnLeft: Math.round(btn.left), panLeft: Math.round(pan.left) }
    })
    // 下方展开：面板顶边不高于按钮底边（允许 2px 取整误差）
    expect(geo.panTop).toBeGreaterThanOrEqual(geo.btnBottom - 2)
    // 左对齐（同一列）
    expect(Math.abs(geo.panLeft - geo.btnLeft)).toBeLessThanOrEqual(2)
  })

  test('未读角标随「全部已读」消失', async ({ page }) => {
    await expect(trigger(page).locator('.nc-badge')).toBeVisible()
    await trigger(page).click()
    await panel(page).locator('.nc-text-btn', { hasText: /全部已读/ }).click()
    await expect(trigger(page).locator('.nc-badge')).toHaveCount(0)
  })

  test('只看未读过滤后条数减少', async ({ page }) => {
    await trigger(page).click()
    const all = await panel(page).locator('.nc-item').count()
    await panel(page).locator('.nc-text-btn', { hasText: /只看未读|仅看未读/ }).click()
    await expect
      .poll(async () => await panel(page).locator('.nc-item').count())
      .toBeLessThan(all)
  })

  test('**Esc 关闭面板**', async ({ page }) => {
    await trigger(page).click()
    await expect(panel(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel(page)).toHaveCount(0)
  })

  test('点面板外部关闭', async ({ page }) => {
    await trigger(page).click()
    await expect(panel(page)).toBeVisible()
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await expect(panel(page)).toHaveCount(0)
  })
})
