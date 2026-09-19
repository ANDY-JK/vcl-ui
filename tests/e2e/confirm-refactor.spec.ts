import { test, expect } from '@playwright/test'

/**
 * ConfirmContent 拆层回归锁（打破 ConfirmModal ↔ ModalBox 值循环的当日验证）
 *
 * 覆盖两条 confirm 渲染路径，确认抽 ConfirmContent 单一来源后行为不变：
 *  1. ModalBox confirm 模式（原生渲染）：消息体 + 按钮区同现、取消关闭、初始焦点落确认按钮
 *  2. ConfirmModal 薄封装（ModalBox + ConfirmContent）：消息体渲染 + 取消关闭
 */

test('ModalBox confirm 模式原生渲染 ConfirmContent', async ({ page }) => {
  await page.goto('/#/modal')
  await page.getByRole('button', { name: '确认删除' }).click()

  // confirm 内容区（消息体 + 按钮区）都在 ModalBox 的 body 内
  const body = page.locator('.confirm-body')
  await expect(body).toBeVisible()
  await expect(body.locator('.confirm-msg')).toContainText('确定要删除此项吗')
  await expect(page.locator('.confirm-footer')).toBeVisible()

  // 焦点陷阱：初始焦点落 confirm-footer 的确认按钮（autofocus 选择器 .confirm-footer button:last-of-type）
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
