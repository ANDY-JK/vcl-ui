// Drawer 方位布局取证 —— 顶部/底部方位面板必须占满视口宽（回归守护）
// 背景：.drawer-panel 有 max-width:90vw（给左右方位的显式 width 兜底），上下方位靠
// left:0/right:0 拉伸占满；max-width 生效后退化「贴左 + 右边空 10vw」，用户报「顶部和
// 底部位置不对」。修复 = .drawer-top/.drawer-bottom { max-width: none }。
// scoped CSS 单测加载不到，只有真实浏览器量几何才守得住：
//   上/下面板 x=0 且右缘到视口右（误差容差 2px，旧缺陷是 144px 缝，容差挡得住回归）
//   左/右面板贴对应边（对照：全宽放开没碰侧方位）
import { test, expect } from '@playwright/test'

const BASE = process.env.E2E_BASE || 'http://localhost:3721'
const W = 1440
const H = 900
const SETTLE_MS = 400 // 滑入动画 200ms，留一倍余量

async function openDrawer(page: import('@playwright/test').Page, buttonName: string) {
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await page.waitForTimeout(SETTLE_MS)
}

test('顶部/底部方位抽屉占满视口宽（左右缘到边，无右缝）', async ({ page }) => {
  await page.setViewportSize({ width: W, height: H })
  await page.goto(`${BASE}/#/drawer`)

  for (const [btn, cls] of [
    ['顶部抽屉', 'drawer-top'],
    ['底部抽屉', 'drawer-bottom'],
  ] as const) {
    await openDrawer(page, btn)
    const r = await page.locator(`.${cls}`).boundingBox()
    expect(r, btn).not.toBeNull()
    expect(r!.x, `${btn} 左缘`).toBe(0)
    expect(r!.x + r!.width, `${btn} 右缘到视口右`).toBeGreaterThanOrEqual(W - 2)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(SETTLE_MS)
  }
})

test('左/右方位抽屉贴对应边（对照：全宽放开未影响侧方位）', async ({ page }) => {
  await page.setViewportSize({ width: W, height: H })
  await page.goto(`${BASE}/#/drawer`)

  await openDrawer(page, '打开右侧抽屉')
  let r = await page.locator('.drawer-right').boundingBox()
  expect(r!.x + r!.width, '右抽屉贴右缘').toBeGreaterThanOrEqual(W - 2)
  expect(r!.height, '右抽屉满高').toBe(H)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(SETTLE_MS)

  await openDrawer(page, '打开左侧抽屉')
  r = await page.locator('.drawer-left').boundingBox()
  expect(r!.x, '左抽屉贴左缘').toBe(0)
  expect(r!.height, '左抽屉满高').toBe(H)
})
