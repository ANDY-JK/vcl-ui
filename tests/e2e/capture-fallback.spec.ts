// 采集兜底链 e2e（分支一）— 相机整条不可用 → 用户点一次即落到卡片内兜底页
//
// 确定性做法：注入脚本移除 navigator.mediaDevices.getUserMedia，等价于「非 HTTPS / 无摄像头设备」，
// 触发 detectCaptureCapability().canInpage=false → 直接翻到兜底页，不做注定失败的权限纠缠。
// 兜底页是 CodeCapture 卡片内的翻页（.codecap-fallback），不是叠第二层弹层。
import { test, expect } from '@playwright/test'
import QRCode from 'qrcode'
import { SCAN_BUDGET, SCAN_TEST_TIMEOUT } from './helpers/scan-harness'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // 模拟能力缺失：能拿到 mediaDevices 但没有 getUserMedia
    if (navigator.mediaDevices) {
      // @ts-expect-error 故意置空以模拟不支持的内核
      delete navigator.mediaDevices.getUserMedia
    }
  })
})

test('相机不可用：扫码入口自动翻到「上传识别 + 手工输入」兜底页', async ({ page }) => {
  await page.goto('/#/capture')
  await page.getByRole('button', { name: '开始扫码' }).first().click()

  // 卡片内兜底页出现（单一浮层，无叠层）
  await expect(page.locator('.codecap-fallback')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.capfb-panel')).toBeVisible()
  // 未出现第二层弹层（旧实现会叠一个 .capfb-sheet）
  await expect(page.locator('.capfb-sheet')).toHaveCount(0)

  // 用户描述的最终兜底形态：上面是选图入口、下面是输入框
  await expect(page.locator('.capfb-pick')).toBeVisible()
  await expect(page.locator('.capfb-input input')).toBeVisible()

  // 手工输入提交 → 结果入列、卡片关闭（懒人闭环：不拍照也能完成）
  await page.locator('.capfb-input input').fill('MANUAL-777')
  await page.locator('.codecap-stage').getByRole('button', { name: '确认' }).click()
  await expect(page.locator('.codecap-fallback')).toHaveCount(0)
  await expect(page.locator('.capfb-result')).toContainText('MANUAL-777')
})

test('兜底页：上传一张含二维码的图片也能识别', async ({ page }) => {
  // 解码走 ZXing WASM，CPU 密集；并行/连跑时会被其他用例抢 CPU → 用与扫码用例同一档时间预算
  test.setTimeout(SCAN_TEST_TIMEOUT)
  // Node 侧生成带二维码的 PNG（复用 e2e 的 qrcode 依赖），喂给选图入口直接走「上传识别」
  const dataUrl = await QRCode.toDataURL('UPLOAD-888')
  const buf = Buffer.from(dataUrl.split(',')[1]!, 'base64')

  await page.goto('/#/capture')
  await page.getByRole('button', { name: '开始扫码' }).first().click()
  await expect(page.locator('.codecap-fallback')).toBeVisible({ timeout: 15_000 })

  // 点选图条 → 引擎创建隐藏 file input；用 change 事件把文件喂进去
  const chooserPromise = page.waitForEvent('filechooser')
  await page.locator('.capfb-pick').click()
  const chooser = await chooserPromise
  await chooser.setFiles({ name: 'qr.png', mimeType: 'image/png', buffer: buf })
  await expect(page.locator('.capfb-result')).toContainText('UPLOAD-888', { timeout: SCAN_BUDGET })
})
