// IconPicker 的 color 默认值是设计令牌 var(--vcl-color-primary)，原生 <input type="color"> 只认 #rrggbb，
// 直接绑过去会被 Chrome 拒收：demo 站 icon 页实测刷 18 条格式警告，取色块退成默认黑。
// 修法是在交给控件前把令牌解析成实际色 —— 这条解析依赖真实 CSS 引擎，
// happy-dom 不实现自定义属性继承（实测回空），单测只能锁「交出去的值永远合法」，
// 「锁进来的是不是主题色」必须由本用例在浏览器里取证。
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const HEX6 = /^#[0-9a-f]{6}$/i

/** 让浏览器自己算 --vcl-color-primary 的实际色，作为断言基线（不经过本库代码） */
const readThemeHex = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--vcl-color-primary)'
    document.documentElement.appendChild(probe)
    const computed = getComputedStyle(probe).color
    probe.remove()
    const nums = computed.match(/[\d.]+/g)
    if (!nums || nums.length < 3) throw new Error(`--vcl-color-primary 算不出 rgb：${computed}`)
    return `#${nums
      .slice(0, 3)
      .map((n) => Math.round(Number(n)).toString(16).padStart(2, '0'))
      .join('')}`
  })

test('取色器收到解析后的主题色，且不再刷格式警告', async ({ page }) => {
  const badFormat: string[] = []
  page.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && /does not conform to the required format/.test(m.text())) {
      badFormat.push(m.text())
    }
  })

  await page.goto('/#/icon')
  // 面板 Teleport 到 body 且用 v-show 常驻，取色器挂载即在文档里：demo 页三个 IconPicker × 前景/背景
  const pickers = page.locator('.picker-panel input.native-picker')
  await expect(pickers).toHaveCount(6)

  const themeHex = (await readThemeHex(page)).toLowerCase()
  const values: string[] = await pickers.evaluateAll((els) =>
    els.map((el) => (el as HTMLInputElement).value.toLowerCase()),
  )

  for (const v of values) expect(v).toMatch(HEX6)
  // 主题色本身不是黑：值为 #000000 说明令牌没解析出来（改动前浏览器拒收后就是这个值）
  expect(themeHex).not.toBe('#000000')
  expect(values).toContain(themeHex)
  expect(badFormat).toHaveLength(0)
})
