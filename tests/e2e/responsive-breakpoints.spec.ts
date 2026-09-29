// 响应式断点取证 —— 断点值经 tokens.css `--bp-*` → `_internal/breakpoints.ts` 单源接进 JS，
// 本 spec 在真实浏览器里证明三档判定没因接线而漂移：
//   <  BP_MD        移动端（顶栏汉堡按钮出现，侧栏改抽屉）
//   MD..LG           侧栏自动收起
//   >= BP_LG         侧栏完整展开
// DataTable 的卡片视图默认跟随同一个 BP_MD（cardBreakpoint 默认值），一并取证。
// 宽度全部由断点值推导（不写死数字）：以后改令牌，探针会跟着走而不是默默失效。
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.E2E_BASE || 'http://localhost:3721'

const bpSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'components', '_internal', 'breakpoints.ts'), 'utf8')
const bp = (name: string) => {
  const v = Number(new RegExp(`export const ${name}\\s*=\\s*(\\d+)`).exec(bpSrc)?.[1])
  if (!Number.isFinite(v) || v <= 0) throw new Error(`breakpoints.ts 里读不到 ${name}`)
  return v
}
const MD = bp('BP_MD')
const LG = bp('BP_LG')

const setWidth = (page: import('@playwright/test').Page, width: number) => page.setViewportSize({ width, height: 820 })

test('侧栏三档判定跟随 BP_MD / BP_LG（从宽到窄，避开"从移动端回来不自动收起"的既有分支）', async ({ page }) => {
  await page.goto(`${BASE}/#/`)
  const sidebar = page.locator('aside.sidebar')
  await expect(sidebar).toBeVisible()

  await setWidth(page, LG + 200)
  await expect(sidebar).not.toHaveClass(/collapsed/)
  await expect(page.locator('.vcl-topbar-hamburger')).toHaveCount(0)

  await setWidth(page, Math.round((MD + LG) / 2))
  await expect(sidebar).toHaveClass(/collapsed/)
  await expect(page.locator('.vcl-topbar-hamburger')).toHaveCount(0)

  await setWidth(page, MD - 40)
  await expect(page.locator('.vcl-topbar-hamburger')).toBeVisible()
})

test('表格卡片视图与侧栏共用同一断点（cardBreakpoint 默认 = BP_MD）', async ({ page }) => {
  await page.goto(`${BASE}/#/data-table`)
  // 页面上第一张表未覆写 cardBreakpoint，走默认值；.table-hscroll 上的 card-view-hidden
  // 就是该表「当前是不是卡片视图」的标记。后面还有一张 :card-breakpoint="9999" 的强制卡表演示，
  // 因此只断言这一张，不用全局计数。
  const hscroll = page.locator('.table-hscroll').first()
  await expect(hscroll).toBeVisible()

  await setWidth(page, MD - 40)
  await expect(hscroll).toHaveClass(/card-view-hidden/)

  await setWidth(page, MD + 200)
  await expect(hscroll).not.toHaveClass(/card-view-hidden/)
})
