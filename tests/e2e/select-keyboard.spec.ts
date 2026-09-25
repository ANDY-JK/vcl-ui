// Select 键盘提交语义回归（e2e）——锁定 M3 第六刀（选项提交块下沉）前的行为基线
// 语义依据（docs 定案，勿回退）：
//   1. 精确命中（label/value 全等）不受 allowCreate 限制：意图明确=选它
//   2. disabled 选项键盘 Enter 一律拒绝（与面板点击守卫对齐：点不动的键盘也不得选）
//   3. allowCreate=true 时精确命中优先，否则创建输入文本为 tag
// 选择器：Select 的 label 渲染为 label.fl-label[title=标签文本]，据此定位各实例
import { test, expect, Page } from '@playwright/test'

const FRAMEWORKS = ['React', 'Vue', 'Angular', 'Svelte', 'SolidJS', 'Qwik']

/** 按 label 文本定位 Select 实例的触发器输入框（.fl-label[title] → 同 trigger-wrapper 内 [role=combobox]） */
function combobox(page: Page, label: string) {
  return page.locator(`div.trigger-wrapper:has(label.fl-label[title="${label}"]) [role=combobox]`)
}

test.describe('Select 键盘提交语义', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/select')
  })

  test('单选：精确命中（无 allowCreate）回车选中并清空输入', async ({ page }) => {
    const trigger = combobox(page, '单选框架')
    await trigger.click()
    await trigger.fill('Vue') // 输入过滤，面板只剩 Vue
    await trigger.press('Enter')
    // 精确命中 → 选中，tag 展示 Vue；输入框清空
    const tag = trigger.locator('..').locator('.combobox-tag').first()
    await expect(tag).toContainText('Vue')
    await expect(trigger).toHaveValue('')
  })

  test('单选 disabled：输入命中 Svelte 回车被拒绝（键盘与面板守卫对齐）', async ({ page }) => {
    const trigger = combobox(page, '单选框架')
    await trigger.click()
    await trigger.fill('Svelte')
    await trigger.press('Enter')
    // disabled 命中被 commitComboValue 拒绝：不产生 tag，输入不提交
    await expect(trigger.locator('..').locator('.combobox-tag')).toHaveCount(0)
  })

  test('多选：精确命中优先追加为新 tag', async ({ page }) => {
    const trigger = combobox(page, '多选框架（tag 显示）')
    await trigger.click()
    await trigger.fill('React')
    await trigger.press('Enter')
    const tags = trigger.locator('..').locator('.combobox-tag')
    await expect(tags).toHaveCount(1)
    await expect(tags.first()).toContainText('React')
  })

  test('可输入多选 + allowCreate：无匹配输入回车创建新 tag', async ({ page }) => {
    const trigger = combobox(page, '技术栈（多选 tag）')
    await trigger.click()
    // Rust 不在 comboTechs 选项里 → allowCreate 创建
    await trigger.fill('Rust')
    await trigger.press('Enter')
    const tag = trigger.locator('..').locator('.combobox-tag').first()
    await expect(tag).toContainText('Rust')
  })

  test('面板选项键盘导航：ArrowDown + Enter 选中高亮项', async ({ page }) => {
    const trigger = combobox(page, '单选框架')
    await trigger.click() // 空输入打开 → 面板全量，highlightIdx 从 -1 起
    await trigger.press('ArrowDown') // → 高亮位 0 = React
    await trigger.press('Enter')
    await expect(trigger.locator('..').locator('.combobox-tag').first()).toContainText(FRAMEWORKS[0])
  })

  test('Escape 关闭面板并丢弃未提交输入', async ({ page }) => {
    const trigger = combobox(page, '单选框架')
    await trigger.click()
    await trigger.fill('An')
    const panelBefore = await page.locator('.panel-item:visible').count()
    expect(panelBefore).toBeGreaterThan(0)
    await trigger.press('Escape')
    await expect(trigger).toHaveValue('')
    await expect(page.locator('.panel-item:visible')).toHaveCount(0)
  })
})
