// E2E：页面级错误边界的「崩溃后自愈」守卫
// 为什么要有：这类行为（崩一次 → 切页恢复、query 导航不重建内容、重新加载两段式升级）
// 在真实浏览器里才会暴露，纯人工点极易回归。靶子是 ComponentDemo 的崩溃夹具 `#/tag?crash=1`。
import { test, expect, type Page } from '@playwright/test'

const CRASH = '/#/tag?crash=1'

/** 在 window 上打标记：文档一旦整页重载就消失，用来区分「实例重建」与「整页刷新」 */
const markAlive = (page: Page) =>
  page.evaluate(() => {
    ;(window as unknown as Record<string, unknown>).__probe = 'alive'
  })
const readAlive = (page: Page) => page.evaluate(() => (window as unknown as Record<string, unknown>).__probe)

test.describe('页面级错误边界 · 崩溃后自愈', () => {
  test('某页崩溃后切到其他导航项，降级 UI 消失且新页正常渲染（不整页刷新）', async ({ page }) => {
    await page.goto(CRASH)
    const fallback = page.locator('.error-boundary-fallback')
    await expect(fallback).toBeVisible()
    // 默认标题 = AppLayout 那层页面级边界捕获的（demo 内部边界会显示「xx」组件异常）
    await expect(page.locator('.eb-title')).toHaveText('页面加载异常')
    await expect(page.locator('.eb-desc')).toContainText('E2E 崩溃夹具')
    await markAlive(page)

    // 站内切页：只改 hash，不重载文档 —— 曾经的 bug 是这一步永远停在错误页
    await page.evaluate(() => (location.hash = '#/button'))
    await expect(fallback).toHaveCount(0)
    await expect(page.locator('.demo-wrap')).toBeVisible()
    // 标记还在 = 恢复靠边界复位，不是整页刷新
    expect(await readAlive(page)).toBe('alive')
  })

  test('同页只换 query 不重建内容（筛选/滚动/已加载数据不被冲掉）', async ({ page }) => {
    await page.goto('/#/button')
    await expect(page.locator('.demo-wrap')).toBeVisible()
    await page.evaluate(() => {
      document.querySelector<HTMLElement>('.demo-wrap')!.dataset.probe = 'alive'
    })

    await page.evaluate(() => (location.hash = '#/button?page=2'))
    await page.waitForTimeout(400)

    // 边界未出错时不得重挂插槽：DOM 节点被换掉即说明页面状态被冲了
    const probe = await page.evaluate(() => document.querySelector('.demo-wrap')?.getAttribute('data-probe'))
    expect(probe).toBe('alive')
    await expect(page.locator('.error-boundary-fallback')).toHaveCount(0)
  })

  test('「重新加载」两段式：首次重挂不刷新，原地复发后升级整页重载', async ({ page }) => {
    await page.goto(CRASH)
    await expect(page.locator('.error-boundary-fallback')).toBeVisible()
    await markAlive(page)

    await page.locator('.eb-btn').click()
    await page.waitForTimeout(600)
    await expect(page.locator('.error-boundary-fallback')).toBeVisible()
    expect(await readAlive(page)).toBe('alive')

    await page.locator('.eb-btn').click()
    await page.waitForTimeout(2500)
    expect(await readAlive(page)).toBeUndefined()
    await expect(page.locator('.error-boundary-fallback')).toBeVisible()
  })

  test('绕过边界的异步错误被记进 __errorGuard 现场快照（含堆栈）', async ({ page }) => {
    await page.goto('/#/button')
    await expect(page.locator('.demo-wrap')).toBeVisible()
    // setTimeout 里抛错不经过任何边界，只有全局兜底能收到
    await page.evaluate(() => {
      setTimeout(() => {
        void (undefined as unknown as { boom: string }).boom
      }, 40)
    })

    await expect.poll(async () => guardLog(page).then((l) => l?.length ?? 0), { timeout: 5000 }).toBeGreaterThan(0)
    const [latest] = await guardLog(page)
    expect(latest?.source).toBe('window')
    expect(latest?.message).toContain('boom')
    expect(latest?.stack).toBeTruthy()
  })
})

/** main.ts 里 report 钩子缓存的逃逸错误现场 */
function guardLog(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as Record<string, Array<{ source: string; message: string; stack?: string }> | undefined>)
        .__errorGuard,
  )
}
