// InputOTP 真实浏览器回归（e2e）
//
// 单测（happy-dom）能验"决策"，验不了两件只有真浏览器才成立的事：
//   1. **聚焦真的会移动**（自动前进 / 退格回退 都靠 focus）
//   2. **粘贴事件真的带 clipboardData**（单测里是手搓的桩）
// 本 spec 覆盖这两条 + 输满回调。
import { test, expect, Page } from '@playwright/test'

const otp = (page: Page, label: string) =>
  page.locator(`.otp-group[aria-label="${label}"]`)

const cells = (page: Page, label: string) => otp(page, label).locator('input.otp-cell')

test.describe('InputOTP 分格输入', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/input-otp')
    // dev server 首访要现编译该路由的模块图，5s 默认断言超时不够（整链负载下更不够）
    await expect(page.locator('h1')).toContainText('InputOTP', { timeout: 15_000 })
  })

  test('逐位输入：焦点自动前进，整串值实时反映在页面上', async ({ page }) => {
    const box = otp(page, '短信验证码')
    await expect(cells(page, '短信验证码')).toHaveCount(6)

    await cells(page, '短信验证码').nth(0).click()
    await page.keyboard.type('123456')

    // 6 位都应落在各自格子里
    for (let i = 0; i < 6; i++) {
      await expect(cells(page, '短信验证码').nth(i)).toHaveValue(String(i + 1))
    }
    // 页面上的"当前值"应等于整串
    await expect(box.locator('xpath=following-sibling::p[1]')).toContainText('123456')
  })

  test('**回填粘贴整串**：从当前格开始铺开（真实 clipboardData 路径）', async ({ page }) => {
    const first = cells(page, '短信验证码').nth(0)
    await first.click()
    // 用 DataTransfer 构造真实 paste 事件（Playwright 无 clipboard 写权限时的标准做法）
    await first.evaluate((el) => {
      const dt = new DataTransfer()
      dt.setData('text/plain', '987654')
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }))
    })
    for (const [i, ch] of ['9', '8', '7', '6', '5', '4'].entries()) {
      await expect(cells(page, '短信验证码').nth(i)).toHaveValue(ch)
    }
  })

  test('**退格跨格回退**：先清当前格，再清前一格', async ({ page }) => {
    await cells(page, '短信验证码').nth(0).click()
    await page.keyboard.type('123')
    // 焦点此时在第 4 格（空）；退格应清掉第 3 格的 "3"
    await page.keyboard.press('Backspace')
    await expect(cells(page, '短信验证码').nth(2)).toHaveValue('')
    // 再退格：焦点已回退，清掉第 2 格的 "2"
    await page.keyboard.press('Backspace')
    await expect(cells(page, '短信验证码').nth(1)).toHaveValue('')
  })

  test('方向键在格子间移动', async ({ page }) => {
    await cells(page, '短信验证码').nth(0).click()
    await page.keyboard.type('12')
    await page.keyboard.press('ArrowLeft')
    await expect(cells(page, '短信验证码').nth(1)).toBeFocused()
  })

  test('输满触发 complete（页面显示的回调值）', async ({ page }) => {
    await cells(page, '短信验证码').nth(0).click()
    await page.keyboard.type('246810')
    await expect(otp(page, '短信验证码').locator('xpath=following-sibling::p[1]')).toContainText('246810')
  })

  test('disabled 整组不可输入', async ({ page }) => {
    const disabledBox = otp(page, '禁用的验证码')
    await expect(disabledBox.locator('input.otp-cell').first()).toBeDisabled()
  })
})
