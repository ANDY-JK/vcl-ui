// 扫码多码自测 — 虚拟摄像头喂含两个二维码的视频：多码定格 → 箭头图标 → 点选识别 → 恢复实时
// 注意：浏览器启动（launch args 引用 y4m 路径）早于测试体执行 → 视频必须在模块顶层生成
import { test, expect } from '@playwright/test'
import { makeY4m, openScanModal, SCAN_BUDGET, SCAN_TEST_TIMEOUT } from './helpers/scan-harness'

// 路径由 makeY4m 按 worker 分岔后返回，不能再自己拼固定名（并发覆写会喂出残缺视频）
// 两个码都必须完整落在取景区域内（region: x 224–1056, y 252–468；码高约 190px → cy 只能在 347–373）
const y4m = await makeY4m('scan-multi.y4m', [
  { text: 'S11111111111', cx: 360, cy: 360 },
  { text: 'S22222222222', cx: 880, cy: 360 },
])

test.use({
  channel: 'msedge', // Playwright 自带 headless shell 的媒体栈被裁剪，getUserMedia NotSupported — 用完整版 Edge
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`],
  },
  contextOptions: { permissions: ['camera'] },
})

test('两码同屏：动态变静态定格 → 每码一个箭头图标 → 点图标识别该码 → 恢复实时', async ({ page }) => {
  test.setTimeout(SCAN_TEST_TIMEOUT)
  await page.emulateMedia({ reducedMotion: 'reduce' }) // 箭头动画静止，元素可稳定点击
  await openScanModal(page)
  // 多码 → 动态变静态定格：箭头图标 ×2 出现（徽章+码文本牌），实时扫描光束消失
  const markers = page.locator('.code-marker')
  await expect(markers).toHaveCount(2, { timeout: SCAN_BUDGET })
  await expect(page.locator('.beam')).toBeHidden()
  await expect(page.locator('.frozen-bar')).toContainText('已定格 2 个码')

  // 点 S222 的箭头图标 → 识别该码入列
  await markers.filter({ hasText: 'S22222222222' }).click()
  const listItems = page.locator('.code-list li')
  await expect(listItems.first()).toContainText('S22222222222', { timeout: SCAN_BUDGET })

  // 恢复实时后静态画面里两码仍在 → 再次自动定格（剩余码仍待处理或按「重新扫描」退出）；
  // 无论定格与否，未被点选的 S111 绝不自动入列
  await page.waitForTimeout(4500)
  await expect(page.locator('.code-list li').filter({ hasText: 'S11111111111' })).toHaveCount(0)
})
