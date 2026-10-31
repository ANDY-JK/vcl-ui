// 路线规划 demo：不再请求不存在的默认数据文件（R5-A10）
//
// 审计取证：/default-stores.xlsx 从未入库，Vite SPA fallback 会把它返回成
// index.html（200 + text/html）。旧代码的 content-type 守卫拦掉了导入，但 fetch
// 本身是死代码 —— 每次进入页面（stores 为空时）都发一次永远不可能成功的请求。
// 本用例锁两件事：请求不再发出；空态提示仍然渲染（回归护栏）。
import { test, expect } from '@playwright/test'

test.describe('route-planner：默认数据请求收敛（R5-A10）', () => {
  test('进入页面（无缓存门店）不发出 /default-stores.xlsx 请求', async ({ page }) => {
    const deadRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('default-stores.xlsx')) deadRequests.push(req.url())
    })

    await page.goto('/#/route-planner')
    // 等过 onMounted 的 500ms 定位延时 + 余量
    await page.waitForTimeout(2500)

    expect(deadRequests, `不应再请求 /default-stores.xlsx（命中：${deadRequests.join(', ')}）`).toEqual([])
  })

  test('空数据时可见空态提示仍在（回归护栏）', async ({ page }) => {
    await page.goto('/#/route-planner')
    await page.waitForTimeout(1500)

    // 左栏空态（StorePanel noData/noDataHint）
    await expect(page.getByText('暂无门店数据').first()).toBeVisible()
    await expect(page.getByText(/导入 Excel 或手动添加门店开始规划路线/).first()).toBeVisible()
    // 右栏结果区空态
    await expect(page.getByText('暂无路线方案')).toBeVisible()
  })
})
