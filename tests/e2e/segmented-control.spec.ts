// SegmentedControl 真实浏览器回归（e2e）
//
// 单测能验 emit 与 roving 决策，验不了真浏览器里的两件事：
//   1. 点击后**视觉选中态**真的迁移（aria-checked 与样式同步）
//   2. 方向键在**禁用项上会跳过**（roving 的跳过逻辑依赖真实 keydown 与 focus）
import { test, expect, Page } from '@playwright/test'

// 同一个 aria-label 在页面上出现两次（第二个是"整组禁用"示例）→ 默认取第一个，禁用段单独用 disabledGroup()
const group = (page: Page, label: string) => page.locator(`.seg[role="radiogroup"][aria-label="${label}"]`).first()
const disabledGroup = (page: Page, label: string) => page.locator(`.seg[role="radiogroup"][aria-label="${label}"]`).last()
const result = (page: Page, label: string) =>
  group(page, label).locator('xpath=following-sibling::p[1]')

test.describe('SegmentedControl 分段控制器', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/segmented-control')
    await expect(page.locator('h1')).toContainText('SegmentedControl', { timeout: 15_000 })
  })

  test('值语义：点击切换 radiogroup 的选中项，页面回显跟着变', async ({ page }) => {
    const g = group(page, '时间粒度')
    const radios = g.locator('[role="radio"]')
    await expect(radios).toHaveCount(5) // demo：日 / 周 / 月 / 季 / 年

    await radios.nth(2).click()
    await expect(radios.nth(2)).toHaveAttribute('aria-checked', 'true')
    await expect(radios.nth(0)).toHaveAttribute('aria-checked', 'false')
    await expect(result(page, '时间粒度')).toContainText('当前值')
  })

  test('**方向键移动选中项**（roving tabindex：整组只一个 Tab 停靠点）', async ({ page }) => {
    const radios = group(page, '时间粒度').locator('[role="radio"]')
    await radios.nth(0).focus()
    const tabindexes = await radios.evaluateAll((els) => els.map((e) => e.getAttribute('tabindex')))
    expect(tabindexes.filter((t) => t === '0').length).toBe(1)

    await page.keyboard.press('ArrowRight')
    await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true')
  })

  test('**禁用项被方向键跳过**', async ({ page }) => {
    const radios = group(page, '粒度').locator('[role="radio"]')
    // demo：该项里「月」是禁用 —— disabled 属性就在 radio 自身，不是子元素
    const disabled = group(page, '粒度').locator('[role="radio"][disabled]')
    await expect(disabled.first()).toBeVisible()
    await radios.nth(0).focus()
    // 从第一项按右键两次，禁用的那一项不应变成 aria-checked=true
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    const checkedAcrossDisabled = await disabled.first().getAttribute('aria-checked')
    expect(checkedAcrossDisabled).not.toBe('true')
  })

  test('整组 disabled 时不可点击', async ({ page }) => {
    const g = disabledGroup(page, '时间粒度')
    await expect(g).toHaveAttribute('aria-disabled', 'true')
    const radios = g.locator('[role="radio"]')
    // 整组禁用时每个按钮都是原生 disabled（不是只有 aria-disabled）
    for (const r of await radios.all()) {
      await expect(r).toBeDisabled()
    }
  })
})
