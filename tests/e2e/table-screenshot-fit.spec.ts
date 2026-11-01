// 表格截图修复 e2e：内容自适应列宽 + 虚拟占位行不计入（用户反馈「截断/很空」）
import { test, expect } from '@playwright/test'

test.describe('DataTable 截图尺寸口径（R5-用户反馈）', () => {
  test('截图图片内容完整：被 ellipsis 截断的文本在图里是全文（列宽自适应）', async ({ page }) => {
    await page.goto('/#/data-table')
    await page.waitForTimeout(2500)

    // ⚠️ 关键改动（#284）：**主动制造 ellipsis 条件**，而不是等 demo 恰好有被截断的单元格。
    //
    // 旧写法遍历页面找 `textOverflow: ellipsis` 的格子，找不到就 `test.skip` ——
    // 于是 demo 数据一变（列变宽、文案变短），这条"用户反馈：截图内容被截断"的
    // 回归用例就**静默不跑了**，日志里只多一个 skipped，谁也不会注意。
    // 现在：取表里最长的文本，把那一列压窄到 80px，制造真实的溢出；
    // 制造不出来就**失败**（说明 demo 结构变了，需要人看），而不是跳过。
    const probe = await page.evaluate(() => {
      const table = document.querySelector('.table-scroll table.data-table') as HTMLTableElement | null
      if (!table) return { err: '找不到数据表' }

      // 找最长的单元格文本
      let best: { cell: HTMLTableCellElement; text: string } | null = null
      for (const cell of [...table.querySelectorAll('td')] as HTMLTableCellElement[]) {
        const text = (cell.innerText || '').trim()
        if (!best || text.length > best.text.length) best = { cell, text }
      }
      if (!best) return { err: '表里没有单元格' }
      if (best.text.length < 12) return { err: `最长文本只有 ${best.text.length} 字，不足以制造截断` }

      // 压窄该列：同一列的 td 全部限制宽度，触发 text-overflow: ellipsis
      const colIdx = best.cell.cellIndex
      for (const tr of [...table.querySelectorAll('tr')] as HTMLTableRowElement[]) {
        const td = tr.children[colIdx] as HTMLTableCellElement | undefined
        if (!td) continue
        td.style.maxWidth = '60px'
        td.style.overflow = 'hidden'
        td.style.textOverflow = 'ellipsis'
        td.style.whiteSpace = 'nowrap'
      }

      const cs = getComputedStyle(best.cell)
      // 用 canvas 量「全文自然宽」：截图的自适应口径就是按这个宽度扩列
      const cv = document.createElement('canvas')
      const ctx = cv.getContext('2d')!
      ctx.font = `${cs.fontSize} ${cs.fontFamily}`
      const naturalTextW = Math.ceil(ctx.measureText(best.text).width)

      return {
        textLen: best.text.length,
        cellW: Math.round(best.cell.getBoundingClientRect().width),
        scrollW: best.cell.scrollWidth,
        clientW: best.cell.clientWidth,
        naturalTextW,
        tableW: Math.round(table.getBoundingClientRect().width),
      }
    })
    expect((probe as { err?: string }).err, '必须能制造出截断条件（不能靠 skip 混过去）').toBeUndefined()
    const p = probe as { textLen: number; cellW: number; scrollW: number; clientW: number; naturalTextW: number; tableW: number }
    // 截断判据用「全文自然宽 > 单元格呈现宽」：td 上的 overflow:hidden 会让
    // scrollWidth 等于 clientWidth（内容被裁剪时不计入滚动宽），拿它判溢出会假阴性。
    expect(p.naturalTextW, `全文需 ${p.naturalTextW}px，单元格仅 ${p.clientW}px —— 应已截断`).toBeGreaterThan(
      p.clientW + 2,
    )

    // 触发截图预览
    await page.getByRole('button', { name: /截图/ }).first().click()
    await page.waitForTimeout(4000)
    const img = page.locator('img[src^="data:image/png"]').first()
    await expect(img).toBeVisible()

    const nat = await img.evaluate((el: HTMLImageElement) => ({ nw: el.naturalWidth, nh: el.naturalHeight }))
    const cssW = nat.nw / 2 // 截图按 scale=2 输出
    // 承诺①：自适应**只扩不缩** —— 图宽必须明显大于页面呈现宽（该列被扩宽了）
    expect(cssW, `图宽 ${Math.round(cssW)} 应大于页面表格宽 ${p.tableW}（列被自适应扩宽）`).toBeGreaterThan(p.tableW)
    // 承诺②：扩宽幅度够装下全文（图宽至少容得下这条长文本的自然宽）
    expect(cssW, `图宽应至少容纳最长文本的自然宽 ${p.naturalTextW}`).toBeGreaterThan(p.naturalTextW)
    // 承诺③：长宽比合理（旧缺陷：图里 97% 是空白）
    expect(nat.nh / nat.nw).toBeLessThan(3)
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