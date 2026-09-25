// 主题可视化配置层（#/theme-editor）行为基线：
// 分组面板渲染 → 覆盖记录到当前主题块 → 切暗色换记录面 → 动态 style 实时预览 → 导出 JSON/CSS → 重置
import { test, expect } from '@playwright/test'

const BASE = process.env.E2E_BASE || 'http://localhost:3721'

test('theme-editor：覆盖记录/双主题块/实时预览/导出/重置全链路', async ({ page }) => {
  // 草稿走 localStorage——清空保证确定性
  await page.addInitScript(() => localStorage.removeItem('vcl-theme-editor-overrides'))
  await page.goto(`${BASE}/#/theme-editor`)

  const editor = page.locator('.theme-editor')
  await expect(editor).toBeVisible()
  // 分组面板：主色组里有 --color-primary（text-is 精确匹配——--color-primary 是 9 个派生令牌的前缀），只读组带「只读」标
  const primaryRow = editor.locator('.te-row:has(code.te-name:text-is("--color-primary"))')
  await expect(primaryRow).toBeVisible()
  await expect(editor.locator('.te-readonly').first()).toBeVisible()

  // 覆盖亮色块 --color-primary → 行内出现「已覆盖」，动态 style 出 :root 段
  await primaryRow.locator('.te-text').fill('#0f766e')
  await expect(primaryRow.locator('.te-override')).toBeVisible()
  // <style> 的 CSS 源码不是文本节点——textContent 走 evaluate 读
  const liveCss = async () => (await page.locator('#vcl-theme-live-preview').evaluate((el) => el.textContent)) || ''
  await expect.poll(liveCss).toContain('--color-primary: #0f766e')

  // 切暗色：覆盖记录面换到 dark 块（亮色块保留）
  await editor.getByRole('group', { name: '主题切换' }).getByRole('button', { name: '暗色' }).click()
  const dangerRow = editor.locator('.te-row:has(code.te-name:text-is("--color-danger"))')
  await dangerRow.locator('.te-text').fill('#f04444')
  await expect.poll(liveCss).toContain(":root[data-theme='dark']")
  await expect.poll(liveCss).toContain('--color-danger: #f04444')

  // 导出区：JSON 双块齐全（textarea 读 value）；CSS 双段齐全（pre 读 innerText）
  await expect(editor.locator('.te-cfg')).toHaveValue(/"light"/)
  await expect(editor.locator('.te-cfg')).toHaveValue(/"dark"/)
  await expect(editor.locator('.te-css')).toContainText(':root {')
  await expect(editor.locator('.te-css')).toContainText("data-theme='dark'")

  // 只读组（断点/z-index）无输入框
  const roGroup = editor.locator('.te-group', { has: page.locator('.te-readonly') }).first()
  await expect(roGroup.locator('.te-text')).toHaveCount(0)

  // 重置全部 → 无覆盖提示，live style 只剩占位
  await editor.getByRole('button', { name: '重置全部' }).click()
  await expect(editor.locator('.te-clean')).toBeVisible()
  await expect.poll(liveCss).toContain('空主题')
})

test('theme-editor：App 顶栏月亮按钮跳进本页（入口可达）', async ({ page }) => {
  await page.goto(`${BASE}/#/basic`)
  await page.locator('.topbar-tool-btn[title="主题定制"]').click()
  await expect(page.locator('.theme-editor')).toBeVisible()
})
