// 卡片角标几何守护 —— 两层锚点结构（节点 64）的回归防线
// scoped CSS 单测加载不到，只有真实浏览器量几何才守得住：
//   ribbon：mark 包围盒中心 = 卡片角顶点（角平分线对称，旧百分比 translate 缺陷偏离 ~26px，容差挡得住）
//   pill/dot：角标盒完整落在卡内 8px 内贴区（不越界、不遮挡标题区）
import { test, expect } from '@playwright/test'

const BASE = process.env.E2E_BASE || 'http://localhost:3721'

test('ribbon 中线过卡片角顶点（角平分线对称）', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE}/#/card`)

  const card = page.locator('.grid-card').filter({ hasText: '热卖商品' })
  const cr = await card.boundingBox()
  const mark = await card.locator('.grid-corner-mark').first().boundingBox()
  expect(cr, '卡片').not.toBeNull()
  expect(mark, 'ribbon mark').not.toBeNull()
  // mark 旋转 45° 的包围盒中心 = 锚点（卡片右上角顶点）
  expect(Math.abs(mark!.x + mark!.width / 2 - (cr!.x + cr!.width)), '中线 x 过角顶点').toBeLessThan(3)
  expect(Math.abs(mark!.y + mark!.height / 2 - cr!.y), '中线 y 过角顶点').toBeLessThan(3)
})

test('pill/dot 角标悬浮卡内（8px 内贴，不越界不遮挡内容外）', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE}/#/card`)

  // 「运行中」pill 在嵌套卡 top-left（8px 内贴）
  // 用卡片**正文**定位而不是"含某词的最后一个卡"：Props 表里也有这些词
  // （如 corner 的说明含「异常」），全页 hasText 会匹配到 Props 卡导致角标永远找不到
  // —— #368 批量补演示页 props 表后实测踩中，教训记在附录。
  const host = page.locator('.grid-card').filter({ hasText: 'top-left · info' }).last()
  const hr = await host.boundingBox()
  const pill = await host.locator('.grid-corner--pill .grid-corner-mark').first().boundingBox()
  expect(pill, 'pill').not.toBeNull()
  expect(pill!.x, 'pill 在卡内（8px 内贴 ≥ 5px 容忍）').toBeGreaterThanOrEqual(hr!.x + 5)
  expect(pill!.y).toBeGreaterThanOrEqual(hr!.y + 5)

  // 「异常」dot 在嵌套卡 bottom-left
  const host2 = page.locator('.grid-card').filter({ hasText: 'bottom-left · danger' }).last()
  const hr2 = await host2.boundingBox()
  const dot = await host2.locator('.grid-corner--dot .grid-corner-mark').first().boundingBox()
  expect(dot, 'dot').not.toBeNull()
  expect(dot!.width, 'dot 尺寸 ~9px*scale').toBeGreaterThan(5)
  expect(dot!.width).toBeLessThan(13)
  expect(dot!.x, 'dot 不越卡左缘').toBeGreaterThanOrEqual(hr2!.x)
  expect(dot!.y + dot!.height, 'dot 不越卡下缘').toBeLessThanOrEqual(hr2!.y + hr2!.height)
})
