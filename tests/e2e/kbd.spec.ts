// Kbd 真实浏览器回归（e2e）
//
// 单测已经覆盖了「Mod 按平台展开」的 props 逻辑；这里验的是**渲染结果在真实字体/布局下成立**：
//   1. 每个键一个 <kbd>，分隔符数量 = 键数 − 1
//   2. 键帽不撑破所在行（密排核心验收：塞进列表行后行高不变）
import { test, expect, Page } from '@playwright/test'

const group = (page: Page) => page.locator('.kbd-group').first()

test.describe('Kbd 快捷键标记', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/kbd')
    await expect(page.locator('h1')).toContainText('Kbd', { timeout: 15_000 })
  })

  test('键数与分隔符：Ctrl+K 三个元素（2 键 + 1 分隔符）', async ({ page }) => {
    const first = group(page)
    await expect(first.locator('kbd.kbd-key')).toHaveCount(2)
    await expect(first.locator('.kbd-sep')).toHaveCount(1)
  })

  test('**Mod 在非 macOS 上渲染成 Ctrl**（本机是 Chromium/Linux-类 UA 之外的平台无关断言）', async ({ page }) => {
    // 用页面自己的 navigator 判定，断言 UI 与平台一致（mac 上是 ⌘，否则 Ctrl）
    const isMac = await page.evaluate(() => /mac|iphone|ipad|ipod/i.test(`${navigator.platform} ${navigator.userAgent}`))
    const modKeys = page.locator('.kbd-group', { has: page.locator('kbd', { hasText: isMac ? '⌘' : 'Ctrl' }) })
    await expect(modKeys.first()).toBeVisible()
  })

  test('**密排验收：键帽塞进列表行不改变行高**', async ({ page }) => {
    const rows = page.locator('.rows .row')
    await expect(rows.first()).toBeVisible()
    const heights = await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
    const keyHeight = await page.locator('.kbd-key').first().evaluate((e) => Math.round(e.getBoundingClientRect().height))
    const min = Math.min(...heights)
    // 密排验收：没有哪一行被键帽撑得比最矮那行高出一截（键帽应矮于行盒，而不是撑开它）
    for (const h of heights) expect(h - min).toBeLessThanOrEqual(2)
    // 且行高应小于「键帽高度 + 两倍内边距」的量级 —— 行由文字撑开，不是由键帽撑开
    expect(min).toBeLessThanOrEqual(keyHeight + 16)
  })

  test('sep="" 时不渲染分隔符', async ({ page }) => {
    // demo 里「分隔符可关」那段
    const noSep = page.locator('.kbd-group').filter({ hasNot: page.locator('.kbd-sep') })
    await expect(noSep.first()).toBeVisible()
  })
})
