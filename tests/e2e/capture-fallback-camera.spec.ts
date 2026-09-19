// 采集兜底链 e2e（分支二）— 相机可用 → 走页面内实时扫码，不触发兜底面板
//
// 这里只验证「降级决策」：相机可用时必须停在页面内一级，不得误降级。
// 不依赖真实解码（QR 从视频帧解码已由 barcode-single/multi 覆盖，且多开 msedge 假摄像头会互相抢设备）。
// 做法：注入 getUserMedia 桩，返回 canvas 捕获流 —— 有实时画面、但画面里没有码，
// 因此组件应长期停在 live 态且兜底面板始终不出现。
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    const ctx = canvas.getContext('2d')!
    // 画点噪点，避免纯黑帧被解码器当异常；关键是画面里没有条码
    const paint = () => {
      ctx.fillStyle = '#f1f5f9'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = i % 2 ? '#cbd5e1' : '#e2e8f0'
        ctx.fillRect(Math.random() * 600, Math.random() * 440, 24, 24)
      }
    }
    paint()
    // 低帧率即可：本用例不看画面内容，只为「有流」时走实时态
    const stream = canvas.captureStream(2)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => Promise.resolve(stream),
        enumerateDevices: () => Promise.resolve([{ kind: 'videoinput' }]),
      },
    })
  })
})

test('相机可用：停在页面内实时取景，兜底面板始终不出现', async ({ page }) => {
  await page.goto('/#/capture')
  await page.getByRole('button', { name: '开始扫码' }).first().click()

  // 走了最佳一级：实时取景出现（未被误降级）
  await expect(page.locator('.codecap-live')).toBeVisible({ timeout: 15_000 })
  // 画面里没有码 → 停在实时态，不弹兜底面板
  await page.waitForTimeout(1200)
  await expect(page.locator('.capfb-sheet')).toHaveCount(0)
  await expect(page.locator('.codecap-live')).toBeVisible()
})
