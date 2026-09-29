// 分页脚注 · 真实浏览器取证
// 本轮把总页数公式从 DataTable 两处内联收进 calcTableTotalPages()。单测只能证明公式逐点等价，
// "翻页在真浏览器里还翻得动、末页按钮会禁用、行数跟着页码变"必须在浏览器看一眼。
// 锚点用 25 行 / page-size 8 那张「全功能」表（共 4 页），按脚注文案定位，避免抓错同页其他表格。
import { test, expect, type Locator } from '@playwright/test'

const BASE = process.env.E2E_BASE || 'http://localhost:3721'

test('分页脚注：翻页生效、页码文案跟着走、末页禁用下一页', async ({ page }) => {
  await page.goto(`${BASE}/#/data-table`)
  // 锚点必须按**结构**选，且要限定到那张表所在的卡片：
  // 用 hasText:'第 1 / 4 页' 定位的话，翻到第 3 页后这个过滤条件自己就不成立了（实测 element(s) not found）；
  // 只按「有 4 个页码按钮」过滤也不行 —— 演示页后来加了服务端模式那张 5 页的表，同样带 4 号按钮，实测抓到 2 个。
  // 所以先按卡片标题圈定，再在圈内用稳定锚。
  // 标题层级注意：Q12 无障碍整改把演示卡片统一成 h2（title-as="h2"），这里曾是 h4 —— 改过 demo 标题层级
  // 要同步本 spec，否则 locator 静默失配（09-20 全链真红过一次）。
  const hostCard = page
    .locator('.grid-card')
    .filter({ has: page.locator('h2.grid-title', { hasText: '全功能' }) })
    .first()
  const bar = hostCard
    .locator('.table-pagination')
    .filter({ has: page.getByRole('button', { name: '4', exact: true }) })
  await expect(bar, '锚点表应当正好有一个带 4 个页码按钮的脚注').toHaveCount(1)
  await expect(bar).toContainText('第 1 / 4 页') // 前提：起始在第 1 页
  const host: Locator = bar.locator('xpath=..')
  await expect(host.locator('tbody tr')).toHaveCount(8) // 前提：这一页确实渲染 8 行（25 行 / 8）

  // 整行文本，不是第一个 td：这张表 selectable，首列是勾选框，每页第一行都长一样（实测拿它比对永远"没变"）
  const firstRow = () => host.locator('tbody tr').first().innerText()
  const before = await firstRow()

  await host.locator('.page-btn').filter({ hasText: /^3$/ }).click()
  await expect(bar).toContainText('第 3 / 4 页')
  await expect.poll(async () => (await firstRow()) !== before).toBe(true)

  // 末页：下一页禁用，上一页可用
  await host.locator('.page-btn').filter({ hasText: /^4$/ }).click()
  await expect(bar).toContainText('第 4 / 4 页')
  await expect(host.locator('.page-btn').last()).toBeDisabled()
  await expect(host.locator('.page-btn').first()).toBeEnabled()

  // 回到第 1 页：下一页可用，首行内容与最初一致（分页没把数据顺序搅乱）
  await host.locator('.page-btn').filter({ hasText: /^1$/ }).click()
  await expect(bar).toContainText('第 1 / 4 页')
  await expect(host.locator('.page-btn').first()).toBeDisabled() // 首页时上一页禁用
  await expect(host.locator('.page-btn').last()).toBeEnabled()
  await expect(firstRow()).resolves.toBe(before)
})
