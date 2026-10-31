// 示例站「未找到」态（R5-A9）—— 未知路由不再静默回落成 Select 演示页。
//
// 此前 ComponentDemo 的兜底是 `demoMap[category] || demoMap['select']`：路由永不空，
// 代价是丢掉 404 语义 —— 用户输错地址看到的是 Select 演示页，分不清"页面存在"还是"地址打错了"。
// 现在未匹配的 category 渲染 Result status="404" + 返回按钮。
// 静态锁（demo 层无单测挂载点）+ 真浏览器行为各锁一半：
// 本文件锁行为（地址栏、返回按钮真的能回导航）；ComponentDemo.vue 源码里的兜底删除由 review 把关。
import { test, expect } from '@playwright/test'

test.describe('示例站：未知路由 404 态', () => {
  test('未知 category 显示 404 结果页，而不是回落成 Select 演示页', async ({ page }) => {
    await page.goto('/#/no-such-page')

    // 404 结果页出现
    await expect(page.getByText('未找到该示例页')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/不是有效的组件地址/)).toBeVisible()

    // 关键反证：不能是 Select 演示页（旧兜底行为）。SelectDemo 有「选择器」字样的 demo 标题，
    // 且 URL 仍是用户输入的错误地址。
    expect(page.url()).toContain('/no-such-page')
  })

  test('已知 category 仍正常渲染对应演示页（回归）', async ({ page }) => {
    await page.goto('/#/button')

    await expect(page.locator('.demo-wrap')).toBeVisible({ timeout: 15_000 })
    // button demo 有可交互按钮（demo 内容态由各自 demo 文件保证，这里只验"不是 404"）
    await expect(page.getByText('未找到该示例页')).toHaveCount(0)
  })

  test('404 页的「返回组件列表」按钮能回到导航', async ({ page }) => {
    await page.goto('/#/no-such-page')
    await expect(page.getByText('未找到该示例页')).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: '返回组件列表' }).click()
    await expect(page).toHaveURL(/#\/select/, { timeout: 10_000 })
    // 回到 select 后 404 文案消失
    await expect(page.getByText('未找到该示例页')).toHaveCount(0)
  })
})
