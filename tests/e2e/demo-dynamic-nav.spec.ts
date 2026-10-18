// 示例站外壳的动态导航（2026-10-18）
//
// 锁的是「宿主只搭外壳 + 一个低代码入口，用户自建的表单自动成为导航项」这条产品形态的**粘合层**：
// 逻辑本身由 tests/unit/form-nav.spec.ts（11 例）覆盖，但「外壳有没有把它接上」只有真浏览器能证明——
// 例如有人删掉 App.vue 里的 refresh watch，单测全绿而用户再也看不到自己建的表单。
import { test, expect } from '@playwright/test'

test.describe('示例站外壳：动态导航', () => {
  test('侧栏存在「我创建的表单」分组；库为空时给出引导而不是空分组', async ({ page }) => {
    await page.goto('/#/select')

    const aside = page.locator('aside').first()
    await expect(aside).toBeVisible()

    const group = aside.getByText('我创建的表单').first()
    await expect(group, '外壳必须接上 useFormNav，否则用户看不到自己建的表单').toBeVisible({ timeout: 15_000 })

    // 展开分组（已展开时点击无害）
    await group.click()

    // 每个 Playwright 用例都是全新 context → 本地库必为空 → 应看到引导项。
    // 断言「引导」而非「空」，是因为空分组会让用户以为功能坏了。
    await expect(aside.getByText(/还没有表单/)).toBeVisible({ timeout: 5_000 })
  })
})
