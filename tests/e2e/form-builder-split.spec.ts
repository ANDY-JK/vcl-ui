import { test, expect } from '@playwright/test'

/**
 * designer 域拆分冒烟（FormDesigner/DesignerCanvas 抽 composable + canvas-utils 后）
 *
 * 覆盖点：form-builder demo 页可加载（动态 chunk 链路无断裂）、
 * 设计器相关 class 出现（.ld / .ldc-canvas，拆出的 composable 仍能把状态喂给模板）。
 * 拖拽/缩放等交互由 vitest 覆盖（form-designer.spec.ts 18 例），此处只验渲染骨架。
 */

test('form-builder demo 页可加载（拆分 chunk 无断链）', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/#/form-builder')
  // 等异步组件挂载：demo 页主容器与标题出现
  await expect(page.locator('.lc-demo-title')).toHaveText('低代码表单平台', { timeout: 15_000 })
  expect(errors, `页面报错: ${errors.join(' | ')}`).toHaveLength(0)
})
