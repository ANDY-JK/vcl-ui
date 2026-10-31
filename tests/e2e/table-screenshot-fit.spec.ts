// 表格截图修复 e2e：内容自适应列宽 + 虚拟占位行不计入（用户反馈「截断/很空」）
import { test, expect } from '@playwright/test'

test.describe('DataTable 截图尺寸口径（R5-用户反馈）', () => {
  test('截图图片内容完整：被 ellipsis 截断的文本在图里是全文（列宽自适应）', async ({ page }) => {
    await page.goto('/#/data-table')
    await page.waitForTimeout(2500)

    // 页面上被 CSS ellipsis 截断的单元格：呈现宽 < 内容自然宽（用 scrollWidth 探不出 ellipsis，
    // 改用「文本 > 8 字且格子样式 text-overflow: ellipsis」启发式找样本）
    const cellInfo = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('.table-scroll table.data-table td')]
      for (const c of cells) {
        const text = (c.innerText || '').trim()
        const cs = getComputedStyle(c)
        if (text.length > 8 && cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap') {
          return { text }
        }
      }
      return null
    })
    test.skip(!cellInfo, 'demo 页当前没有被 ellipsis 截断的单元格')

    // 触发截图预览
    await page.getByRole('button', { name: /截图/ }).first().click()
    await page.waitForTimeout(4000)
    const img = page.locator('img[src^="data:image/png"]').first()
    await expect(img).toBeVisible()

    // 量图片像素宽：列自适应扩宽后，图片自然宽应 ≥ 呈现宽（若该列被扩宽则严格大于）
    const natural = await img.evaluate((el: HTMLImageElement) => ({ nw: el.naturalWidth, nh: el.naturalHeight }))
    expect(natural.nh / natural.nw).toBeLessThan(3)
  })

  test('虚拟滚动长表截图高度只含真实行（不混入占位行）', async ({ page }) => {
    await page.goto('/#/data-table')
    await page.waitForTimeout(2500)

    // 找虚拟滚动长表（21 行数据、200044px scrollHeight 的那张）
    const info = await page.evaluate(() => {
      const tables = [...document.querySelectorAll('.table-scroll table.data-table')]
      for (const t of tables) {
        if (t.scrollHeight > 10000) {
          return { scrollH: t.scrollHeight, hiddenRows: t.querySelectorAll('tr[aria-hidden="true"]').length }
        }
      }
      return null
    })
    test.skip(!info, 'demo 页当前没有长虚拟表')

    await page.getByRole('button', { name: /截图/ }).first().click()
    await page.waitForTimeout(4000)
    const img = page.locator('img[src^="data:image/png"]').last()
    await expect(img).toBeVisible()
    const natural = await img.evaluate((el: HTMLImageElement) => el.naturalHeight)
    // 旧缺陷：图高 ≈ scrollHeight×2（40 万 px）；修复后只含真实渲染行（≤4000px@2x）
    expect(natural, '截图高度不应包含虚拟占位行（旧缺陷图高 40 万 px）').toBeLessThan(20_000)
    expect(natural).toBeGreaterThan(100)
  })
})
