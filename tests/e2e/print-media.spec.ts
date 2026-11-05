// 打印场景 e2e（2026-10-21，审查 6.3 第 3 项 / R5-A19）
//
// 为什么需要：`@media print` 全库此前只有 1 处（data-table 隐藏浮层），而打印/另存 PDF
// 是中后台的高频真实需求。本轮在 `tokens.css` 加了打印块，但**样式规则最容易"写了等于没写"** ——
// 选择器写错、被更高优先级覆盖、令牌名不存在，全都不报错，只是打印出来还是老样子。
//
// 所以这里用 Playwright 的 `emulateMedia({ media: 'print' })` 做**真实渲染断言**，
// 不用 `readFileSync` + 正则（那只能证明"文字在文件里"，不能证明"浏览器采纳了它"）。
import { test, expect } from '@playwright/test'

const BASE = process.env.E2E_BASE || 'http://localhost:3721'

/** 读取某元素的计算样式 */
async function css(page: import('@playwright/test').Page, selector: string, prop: string) {
  return page.$eval(
    selector,
    (el, p) => getComputedStyle(el).getPropertyValue(p).trim(),
    prop,
  )
}

test.describe('打印介质', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/#/data-table`, { waitUntil: 'networkidle' })
  })

  test('打印时缩放归位为 1（屏幕等比缩放在纸上无意义）', async ({ page }) => {
    await page.emulateMedia({ media: 'screen' })
    const screenScale = await css(page, ':root', '--vcl-scale')
    expect(screenScale, '屏幕下应有缩放值').not.toBe('')

    await page.emulateMedia({ media: 'print' })
    // #442（TD-32）：媒体切换后的样式重算不是同步可见的 —— 旧版切完立刻读计算样式，
    // 偶发拿到上一帧的屏幕值（--vcl-scale 曾读到 -1）。轮询等**值本身**归位。
    await expect
      .poll(() => css(page, ':root', '--vcl-scale'), { message: '打印介质切换后 --vcl-scale 应归位', timeout: 10_000 })
      .toBe('1')
    const printScale = await css(page, ':root', '--vcl-scale')
    expect(printScale.trim(), '打印时 --vcl-scale 必须归位为 1').toBe('1')
  })

  test('打印时强制白底黑字（即使当前是暗色主题）', async ({ page }) => {
    // 先切暗色，确认屏幕下确实是深色
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    await page.emulateMedia({ media: 'screen' })
    const screenBg = await css(page, ':root', '--vcl-color-bg')
    expect(screenBg, '暗色下背景应非白').not.toBe('#fff')

    // 切到打印：必须变成白底（同样轮询等样式重算落定，见上）
    await page.emulateMedia({ media: 'print' })
    await expect
      .poll(() => css(page, ':root', '--vcl-color-bg'), { message: '打印介质切换后背景应变白', timeout: 10_000 })
      .toMatch(/^#fff|rgb\(255,\s*255,\s*255\)/i)
    const printBg = await css(page, ':root', '--vcl-color-bg')
    const printText = await css(page, ':root', '--vcl-color-text')
    expect(printBg.toLowerCase(), '打印必须白底').toMatch(/^#fff|rgb\(255,\s*255,\s*255\)/)
    expect(printText.toLowerCase(), '打印必须黑字').toMatch(/^#000|rgb\(0,\s*0,\s*0\)/)
  })

  test('打印时阴影与玻璃模糊被清零（纸上会变脏灰块）', async ({ page }) => {
    await page.emulateMedia({ media: 'print' })
    await expect
      .poll(() => css(page, ':root', '--vcl-shadow-md'), { message: '打印介质切换后阴影应清零', timeout: 10_000 })
      .toMatch(/^(none|)$/)
    const shadow = await css(page, ':root', '--vcl-shadow-md')
    const blur = await css(page, ':root', '--vcl-glass-blur')
    expect(shadow === 'none' || shadow === '', '打印时阴影应为 none').toBe(true)
    expect(blur === '0' || blur === '0px', '打印时玻璃模糊应为 0').toBe(true)
  })

  test('.vcl-print-hide 在打印时被隐藏，屏幕下可见', async ({ page }) => {
    // 造一个宿主会用的标记元素
    await page.evaluate(() => {
      const el = document.createElement('div')
      el.className = 'vcl-print-hide'
      el.id = 'print-hide-probe'
      el.textContent = '不该出现在纸上'
      document.body.appendChild(el)
    })
    await page.emulateMedia({ media: 'screen' })
    expect(await page.locator('#print-hide-probe').isVisible()).toBe(true)

    await page.emulateMedia({ media: 'print' })
    // 隐藏也是样式重算的结果，同样不能切完立刻读
    await expect
      .poll(async () => page.locator('#print-hide-probe').isVisible(), {
        message: '打印介质切换后 .vcl-print-hide 应隐藏',
        timeout: 10_000,
      })
      .toBe(false)
  })

  test('打印时链接追加 URL（纸面可追溯）', async ({ page }) => {
    await page.emulateMedia({ media: 'print' })
    const content = await page.evaluate(() => {
      const box = document.createElement('div')
      box.className = 'vcl-prose'
      const a = document.createElement('a')
      a.href = 'https://example.test/doc'
      a.textContent = '文档'
      box.appendChild(a)
      document.body.appendChild(box)
      const after = getComputedStyle(a, '::after')
      return { content: after.content, color: after.color }
    })
    expect(content.content, '打印时链接后应追加 URL').toContain('example.test/doc')
  })
})

test.describe('打印介质 · 表格', () => {
  test('打印时斑马纹去掉、表头跨页重复、行不跨页断开', async ({ page }) => {
    // 路由是 `data-table`（不是 `data`）——demoMap 里 `'data-table'` 才挂 DataTableDemo
    await page.goto(`${BASE}/#/data-table`, { waitUntil: 'networkidle' })
    await expect(page.locator('.data-table').first()).toBeVisible({ timeout: 15000 })

    await page.emulateMedia({ media: 'print' })
    const styles = await page.evaluate(() => {
      const t = document.querySelector('.data-table')
      if (!t) return null
      const thead = t.querySelector('thead')
      const row = t.querySelector('tbody tr')
      const evenCell = t.querySelector('tbody tr:nth-child(even) > td')
      return {
        theadDisplay: thead ? getComputedStyle(thead).display : null,
        rowBreak: row ? getComputedStyle(row).breakInside : null,
        evenBg: evenCell ? getComputedStyle(evenCell).backgroundColor : null,
      }
    })
    expect(styles, '页面上应有表格').not.toBeNull()
    expect(styles!.theadDisplay, '表头应 table-header-group 以跨页重复').toBe('table-header-group')
    expect(styles!.rowBreak, '行应 break-inside: avoid').toBe('avoid')
    // 斑马纹：偶数行背景应为透明或白（不再是浅灰/主题色）
    expect(
      ['rgba(0, 0, 0, 0)', 'transparent', 'rgb(255, 255, 255)'].includes(styles!.evenBg ?? ''),
      `偶数行背景应为白/透明，实测 ${styles!.evenBg}`,
    ).toBe(true)
  })
})
