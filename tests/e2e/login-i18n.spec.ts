// E2E：验证最近 i18n 改动（register/forgot-password）在真实浏览器渲染
import { test, expect, type Page } from '@playwright/test'

async function gotoLoginDemo(page: Page) {
  await page.goto('/#/login')
  // 进入 LoginDemo（侧边栏导航按钮）
  await page.getByRole('button', { name: 'Login 登录系列' }).click()
  // 等待 LoginDemo 内容渲染（当前组件切换按钮出现）
  await page.getByRole('button', { name: 'LoginPage' }).waitFor()
}

test.describe('login 页 i18n（register/forgot-password）', () => {
  test('register 页渲染 i18n 文案 + 校验提示', async ({ page }) => {
    await gotoLoginDemo(page)
    // 切到 RegisterPage
    await page.getByRole('button', { name: 'RegisterPage' }).click()
    // 注册页标题（i18n：login.registerTitle）
    await expect(page.getByRole('heading', { name: '创建账户' })).toBeVisible()
    // 表单 label（i18n：login.displayName / login.cardKey）
    await expect(page.getByText('昵称 / 公司名称', { exact: true })).toBeVisible()
    await expect(page.getByText('卡密', { exact: true })).toBeVisible()
    // 卡密 hint（i18n：login.cardKeyHint）
    await expect(page.getByText('请联系管理员获取注册卡密')).toBeVisible()
    // 提交空表单 → 校验提示（i18n：login.fillAllRequired）
    await page.getByRole('button', { name: '注 册' }).click()
    await expect(page.getByText('请完整填写所有必填项')).toBeVisible()
  })

  test('forgot-password 页渲染 i18n 文案', async ({ page }) => {
    await gotoLoginDemo(page)
    // 切到 ForgotPassword
    await page.getByRole('button', { name: 'ForgotPassword' }).click()
    // 重置页标题（i18n：login.resetHeroTitle）
    await expect(page.getByRole('heading', { name: '忘记密码？' })).toBeVisible()
    // 表单 label（i18n：login.resetCardKey / login.newPassword）
    await expect(page.getByText('注册卡密', { exact: true })).toBeVisible()
    await expect(page.getByText('新密码', { exact: true })).toBeVisible()
  })
})

test.describe('AppLayout a11y label i18n', () => {
  test('侧边栏收起按钮 title 走 i18n（common.collapse）', async ({ page }) => {
    await page.goto('/#/login')
    // 侧边栏收起按钮：i18n 词条渲染为「收起」
    const collapseBtn = page.getByRole('button', { name: '收起' })
    await expect(collapseBtn).toBeVisible()
    // 点击收起 → 变为「展开」（i18n 词条切换）
    await collapseBtn.click()
    await expect(page.getByRole('button', { name: '展开' })).toBeVisible()
  })
})
