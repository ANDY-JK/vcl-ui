// Select 面板过滤/虚拟滚动回归（e2e）——锁定 M3 第九刀（过滤/虚拟化块下沉 useSelectFiltering）前的行为基线
// 语义依据：
//   1. 输入过滤走 200ms 防抖（千级选项打字不卡顿）；清空立即生效
//   2. pinyinEnabled=true（默认）：全拼/首字母可命中中文选项（sh→上海，全拼 shanghai）
//   3. 虚拟化：有界 .panel-list 只渲染可视窗口 ± OVERSCAN（8×2），首尾占位撑滚动区
// 选择器口径（实测踩过）：面板 Teleport 到 body 且每实例 id 独立（useIdSafe），
// 而同一时刻只有「当前打开的那个」实例面板可见 → 用 .dropdown-panel:visible 取当前面板，
// 不能全局 .panel-item（会抓到其它实例的渲染面板）。
import { test, expect, Page } from '@playwright/test'

/** 按 label 文本定位目标实例的触发器输入框 */
function combobox(page: Page, label: string) {
  return page.locator(`div.trigger-wrapper:has(label.fl-label[title="${label}"]) [role=combobox]`)
}

/** 当前打开的那一个下拉面板（Teleport 到 body，同时只有一个可见） */
const panel = (page: Page) => page.locator('.dropdown-panel:visible')

async function openPage(page: Page) {
  await page.goto('/#/select')
}

test.describe('Select 面板过滤/虚拟滚动', () => {
  test('输入过滤：防抖后面板只剩匹配项；清空立即恢复全量', async ({ page }) => {
    await openPage(page)
    const trigger = combobox(page, '城市（拼音搜索）')
    await trigger.click()
    const fullCount = await panel(page).locator('.panel-item').count()
    expect(fullCount).toBeGreaterThanOrEqual(8)
    // 输入「上」→ 防抖后面板只剩含「上」的选项（上海）
    await trigger.fill('上')
    await expect(panel(page).locator('.panel-item')).toHaveCount(1)
    await expect(panel(page).locator('.panel-item').first()).toContainText('上海')
    // 清空 → 立即恢复全量
    await trigger.fill('')
    await expect(panel(page).locator('.panel-item')).toHaveCount(fullCount)
  })

  test('拼音匹配：sh 命中「上海」（全拼子串匹配——"市"=shi 故 sh 也命中各城市，为既有语义）', async ({ page }) => {
    await openPage(page)
    const trigger = combobox(page, '城市（拼音搜索）')
    await trigger.click()
    const fullCount = await panel(page).locator('.panel-item').count()
    await trigger.fill('sh')
    // 全拼子串匹配：所有 value 含「市」(shi→含 sh) 的选项都命中；断言上海在结果中 + 过滤确实生效
    await expect(panel(page).locator('.panel-item').filter({ hasText: '上海' })).toBeVisible()
    // 精确汉字「上」过滤到唯一（上海），证明过滤非空转
    await trigger.fill('上')
    await expect(panel(page).locator('.panel-item')).toHaveCount(1)
    await expect(panel(page).locator('.panel-item').first()).toContainText('上海')
    expect(fullCount).toBeGreaterThanOrEqual(8)
  })

  test('无匹配显示空态文案（面板内 0 选项）', async ({ page }) => {
    await openPage(page)
    const trigger = combobox(page, '城市（拼音搜索）')
    await trigger.click()
    await trigger.fill('zzz不存在的城市')
    await expect(panel(page).locator('.panel-item')).toHaveCount(0)
    await expect(panel(page).locator('.panel-status').first()).toBeVisible()
  })

  test('虚拟滚动：全国城市 32 项只渲染可视窗口（全量 32 → 窗口 ~22，少建节点）', async ({ page }) => {
    await openPage(page)
    const trigger = combobox(page, '全国城市（多选）')
    await trigger.click()
    await page.waitForTimeout(400) // 等行高测量后虚拟滚动生效
    // 窗口化后只渲染可视窗口（全量 32 → 窗口 ~22）
    const rendered = await panel(page).locator('.panel-item').count()
    expect(rendered).toBeLessThan(30)
    expect(rendered).toBeGreaterThan(14)
  })

  test('虚拟滚动：滚到中部后首占位高度 > 0（topPad 撑滚动区）', async ({ page }) => {
    await openPage(page)
    const trigger = combobox(page, '全国城市（多选）')
    await trigger.click()
    await page.waitForTimeout(400) // 等行高测量（measureOptionRow）完成后虚拟滚动才生效
    const list = panel(page).locator('.panel-list')
    // 等虚拟启用（首尾两个 aria-hidden 占位 div 渲染出来）
    await expect.poll(async () => list.locator('[aria-hidden]').count()).toBe(2)
    await list.evaluate((el) => {
      el.scrollTop = el.scrollHeight / 2
      el.dispatchEvent(new Event('scroll')) // 编程式 scrollTop 不派发 scroll，onScroll 靠事件回读
    })
    // 滚到中部后首占位（topPad）应变为正值像素串（非 "0px"/非空）；onScroll 走 rAF 异步回读，需轮询。
    // 直接读 style.height 字符串（Number("288px")=NaN 且 Playwright 序列化会失真，不用数值断言）
    await expect
      .poll(async () =>
        list.evaluate((el) => (el.querySelector('[aria-hidden]') as HTMLElement | null)?.style.height ?? ''),
      )
      .not.toMatch(/^(0px)?$/)
  })
})
