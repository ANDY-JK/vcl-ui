import { test, expect } from '@playwright/test'

/**
 * ConfirmContent 拆层回归锁（打破 ConfirmModal ↔ ModalBox 值循环的最终架构验证）
 *
 * 最终依赖（2026-09-11 ModalShell 下沉 + 2026-09-20 ConfirmContent 收口合并后）：
 *   ModalBox(confirm 垫片) → ConfirmModal → ModalShell + ConfirmContent
 * 覆盖两条 confirm 渲染路径，确认内容区单一来源后行为不变：
 *  1. ModalBox confirm 垫片（旧 API）：消息体 + 按钮区同现、取消关闭
 *  2. ConfirmModal 直用（ModalShell + ConfirmContent）：消息体渲染 + 取消关闭
 */

test('ModalBox confirm 垫片渲染 ConfirmContent（旧 API 不变）', async ({ page }) => {
  await page.goto('/#/modal')
  await page.getByRole('button', { name: '确认删除' }).click()

  // confirm 内容区（消息体 + 按钮区）经 ConfirmModal 输出到 body
  const body = page.locator('.confirm-body')
  await expect(body).toBeVisible()
  await expect(body.locator('.confirm-msg')).toContainText('确定要删除此项吗')
  await expect(page.locator('.confirm-footer')).toBeVisible()

  // 焦点陷阱（ModalShell）：容器内首个可聚焦元素获得焦点
  const active = await page.evaluate(() => document.activeElement?.className ?? '')
  expect(active).toContain('confirm-btn')

  // 取消 → 关闭
  await page.locator('.confirm-footer .confirm-btn.cancel').click()
  await expect(page.locator('.confirm-body')).toHaveCount(0)
})

test('ConfirmModal 薄封装渲染 ConfirmContent', async ({ page }) => {
  await page.goto('/#/confirm-modal')
  await page.getByRole('button', { name: 'danger 危险删除' }).click()

  const body = page.locator('.confirm-body')
  await expect(body).toBeVisible()
  await expect(page.locator('.confirm-footer .confirm-btn.btn-danger')).toBeVisible()

  await page.locator('.confirm-footer .confirm-btn.cancel').click()
  await expect(page.locator('.confirm-body')).toHaveCount(0)
})

test('ModalBox confirm 模式其它模式不受影响', async ({ page }) => {
  await page.goto('/#/modal')
  await page.getByRole('button', { name: '查看详情' }).click()
  await expect(page.locator('.detail-wrap')).toBeVisible()
  await expect(page.locator('.detail-row').first()).toBeVisible()
  await expect(page.locator('.confirm-body')).toHaveCount(0)

  // 关闭详情 → 开 confirm，两种内容区互不串
  await page.locator('.modal-close').click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await expect(page.locator('.confirm-body')).toBeVisible()
})
