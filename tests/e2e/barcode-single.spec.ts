// 扫码单码自测 — 虚拟摄像头喂含一个二维码的视频，真开演示弹窗解码
// 注意：浏览器启动（launch args 引用 y4m 路径）早于测试体执行 → 视频必须在模块顶层生成
import { test, expect } from '@playwright/test'
import { makeY4m, openScanModal, SCAN_BUDGET, SCAN_TEST_TIMEOUT } from './helpers/scan-harness'

// 路径由 makeY4m 按 worker 分岔后返回，不能再自己拼固定名（并发覆写会喂出残缺视频）
const y4m = await makeY4m('scan-single.y4m', [{ text: 'S12345678901', cx: 640, cy: 360 }])

test.use({
  channel: 'msedge', // Playwright 自带 headless shell 的媒体栈被裁剪，getUserMedia NotSupported — 用完整版 Edge
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`],
  },
  contextOptions: { permissions: ['camera'] },
})

test('单码：码进画面自动识别入列，检测框指针高亮', async ({ page }) => {
  test.setTimeout(SCAN_TEST_TIMEOUT)
  await openScanModal(page)
  // 识别入列（蜂鸣 + 列表）；虚拟摄像头循环播放，时间预算见 scan-harness 的 SCAN_BUDGET
  await expect(page.getByText('S12345678901').first()).toBeVisible({ timeout: SCAN_BUDGET })
  // 检测框指针出现（单码也画框，primary 绿色高亮）
  await expect(page.locator('.code-box.primary')).toBeVisible({ timeout: SCAN_BUDGET })
})
