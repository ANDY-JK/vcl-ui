// ImagePreview 标注绘制引擎回归（e2e）——锁定 M3 第八刀（useImageAnnotation 下沉）前的行为基线
// 断言面：标注画布 .ip-anno-canvas 的像素内容（getImageData 非全透明计数）——
// 绘制成功/删除/工具切换/切图清空均有确定性可观察结果，不依赖图片是否加载。
// 打开路径：demo 按钮 → 多图预览；工具按钮按 title（i18n zh-CN 默认）定位。
import { test, expect, Page } from '@playwright/test'

async function openMulti(page: Page) {
  await page.goto('/#/image')
  await page.getByRole('button', { name: '风景照 — 宽幅' }).click()
  await expect(page.locator('.ip-overlay')).toBeVisible()
}

/** 标注画布非透明像素占比（>0 = 画布上有内容） */
async function nonEmptyRatio(page: Page): Promise<number> {
  return page.locator('.ip-anno-canvas').evaluate((cvs) => {
    const c = cvs.getContext('2d')!
    const { width, height } = cvs
    if (!width || !height) return 0
    const data = c.getImageData(0, 0, width, height).data
    let n = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n++
    return n / (width * height)
  })
}

/** 在 stage 中心区域拖出一个矩形标注（相对 stage 左上 30%→60% 位置） */
async function dragRectOnStage(page: Page) {
  const stage = page.locator('.ip-stage')
  const box = await stage.boundingBox()
  if (!box) throw new Error('stage 无可见区域')
  const x0 = box.x + box.width * 0.3
  const y0 = box.y + box.height * 0.3
  const x1 = box.x + box.width * 0.6
  const y1 = box.y + box.height * 0.6
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
}

test.describe('ImagePreview 标注绘制语义', () => {
  test('默认无标注：画布全透明', async ({ page }) => {
    await openMulti(page)
    await expect.poll(() => nonEmptyRatio(page)).toBe(0)
  })

  test('激活矩形工具 + 拖拽 → 画布出现标注（非透明像素 > 0）', async ({ page }) => {
    await openMulti(page)
    await page.locator('.ip-hdr-btn[title="矩形 (R)"]').click()
    await expect(page.locator('.ip-hdr-btn[title="矩形 (R)"]')).toHaveClass(/active/)
    await dragRectOnStage(page)
    await expect.poll(() => nonEmptyRatio(page)).toBeGreaterThan(0.0005)
  })

  test('再点同一工具按钮 = 取消（按钮 active 类移除）', async ({ page }) => {
    await openMulti(page)
    const btn = page.locator('.ip-hdr-btn[title="矩形 (R)"]')
    await btn.click()
    await expect(btn).toHaveClass(/active/)
    await btn.click()
    await expect(btn).not.toHaveClass(/active/)
  })

  test('Delete 键删除选中/当前标注：画布恢复全透明', async ({ page }) => {
    await openMulti(page)
    await page.locator('.ip-hdr-btn[title="矩形 (R)"]').click()
    await dragRectOnStage(page)
    // 此时刚画完矩形；取消工具（Escape），再点该矩形选中（无工具时命中=选中）
    await page.keyboard.press('Escape')
    // 选中后按 Delete 删除
    const stage = page.locator('.ip-stage')
    const box = await stage.boundingBox()
    // 点矩形中心（37.5%, 37.5% 到 47.5% 区域中心 ≈ 45% 位置）
    await page.mouse.click(box!.x + box!.width * 0.42, box!.y + box!.height * 0.42)
    await page.keyboard.press('Delete')
    await expect.poll(() => nonEmptyRatio(page)).toBe(0)
  })

  test('切换图片清空标注（多图轻扫/箭头切图 → 画布复位全透明）', async ({ page }) => {
    await openMulti(page)
    await page.locator('.ip-hdr-btn[title="矩形 (R)"]').click()
    await dragRectOnStage(page)
    await expect.poll(() => nonEmptyRatio(page)).toBeGreaterThan(0.0005)
    // 切到下一张（→）：切图即清空标注
    await page.locator('.ip-arrow-right').click()
    await expect.poll(() => nonEmptyRatio(page)).toBe(0)
    await expect(page.locator('.ip-counter')).toHaveText('2 / 4')
  })

  test('画笔工具（title=画笔）+ R 快捷键互斥切换', async ({ page }) => {
    await openMulti(page)
    await page.locator('.ip-hdr-btn[title="画笔 (P)"]').click()
    await expect(page.locator('.ip-hdr-btn[title="画笔 (P)"]')).toHaveClass(/active/)
    // 按 R（矩形快捷键）→ 矩形激活、画笔取消（互斥）
    await page.keyboard.press('r')
    await expect(page.locator('.ip-hdr-btn[title="矩形 (R)"]')).toHaveClass(/active/)
    await expect(page.locator('.ip-hdr-btn[title="画笔 (P)"]')).not.toHaveClass(/active/)
  })
})
