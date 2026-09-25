// ImagePreview 变换/手势回归（e2e）——锁定 M3 第七刀（变换子系统下沉）前的行为基线
// 断言面：.ip-img 的 style.transform 是纯公式（translate × scale [× rotate] [× scaleX(-1)]），
// 确定性可断言，不依赖图片是否真正加载（img 元素恒在 DOM，加载态只影响 class）。
// 打开路径：demo 按钮 → 多图预览（:src 数组）；工具条按钮按 title（i18n zh-CN 默认）定位。
import { test, expect, Page } from '@playwright/test'

const img = (page: Page) => page.locator('.ip-img')
const toolBtn = (page: Page, title: string) => page.locator(`.ip-toolbar button[title="${title}"]`)

async function openMulti(page: Page) {
  await page.goto('/#/image')
  await page.getByRole('button', { name: '风景照 — 宽幅' }).click()
  await expect(page.locator('.ip-overlay')).toBeVisible()
}

test.describe('ImagePreview 变换/手势语义', () => {
  test('初始态：translate(0,0) scale(1)，无旋转/翻转', async ({ page }) => {
    await openMulti(page)
    await expect(img(page)).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  })

  test('放大按钮：scale 步进 0.25（1 → 1.25 → 1.5）', async ({ page }) => {
    await openMulti(page)
    const zoomIn = toolBtn(page, '放大')
    await zoomIn.click()
    await expect(img(page)).toHaveCSS('transform', 'matrix(1.25, 0, 0, 1.25, 0, 0)')
    await zoomIn.click()
    await expect(img(page)).toHaveCSS('transform', 'matrix(1.5, 0, 0, 1.5, 0, 0)')
  })

  test('缩小回 1：scale<=1 时平移归零', async ({ page }) => {
    await openMulti(page)
    await toolBtn(page, '放大').click() // 1.25
    await toolBtn(page, '放大').click() // 1.5
    const zoomOut = toolBtn(page, '缩小')
    await zoomOut.click() // 1.25
    await zoomOut.click() // 1.0 → pos 归零
    await expect(img(page)).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  })

  test('顺时针旋转：90° 追加公式；逆时针回 0', async ({ page }) => {
    await openMulti(page)
    await toolBtn(page, '顺时针旋转 90°').click()
    await expect(img(page)).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)')
    await toolBtn(page, '逆时针旋转 90°').click()
    await expect(img(page)).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  })

  test('水平翻转：追加 scaleX(-1)，再点撤销', async ({ page }) => {
    await openMulti(page)
    const flip = toolBtn(page, '水平翻转')
    await flip.click()
    await expect(img(page)).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)')
    await flip.click()
    await expect(img(page)).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  })

  test('双击图片：1 → 2 → 1 切换', async ({ page }) => {
    await openMulti(page)
    const image = img(page)
    await image.dblclick()
    await expect(image).toHaveCSS('transform', 'matrix(2, 0, 0, 2, 0, 0)')
    await image.dblclick()
    await expect(image).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  })

  test('滚轮缩放：正 delta 连续缩小，下限 0.25 截断', async ({ page }) => {
    await openMulti(page)
    // 轮盘监听在 .ip-stage（主视图容器）；直接派发 WheelEvent
    const stage = page.locator('.ip-stage')
    for (let i = 0; i < 30; i++) {
      await stage.evaluate((el) =>
        el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })),
      )
    }
    // 30 × 0.15 = 4.5 步 → 1 - 4.5 被下限 0.25 截断
    await expect(img(page)).toHaveCSS('transform', 'matrix(0.25, 0, 0, 0.25, 0, 0)')
  })

  test('多图切换：计数 1/4 → 2/4，图片 src 换第二张', async ({ page }) => {
    await openMulti(page)
    await expect(page.locator('.ip-counter')).toHaveText('1 / 4')
    await page.locator('.ip-arrow-right').click()
    await expect(page.locator('.ip-counter')).toHaveText('2 / 4')
    const src2 = await page.locator('.ip-img').getAttribute('src')
    expect(src2).toContain('seed/b2')
  })
})
