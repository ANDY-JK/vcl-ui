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

  const mkQr = async (text: string) => {
    const dataUrl = await QRCode.toDataURL(text)
    return Buffer.from(dataUrl.split(',')[1]!, 'base64')
  }
  /** 走一遍「入口 → 自动翻兜底页 → 选图 → 等识别收尾」，返回本次是否出结果 */
  const upload = async (text: string, waitMs: number) => {
    if (
      !(await page
        .locator('.capfb-pick')
        .isVisible()
        .catch(() => false))
    ) {
      await page.getByRole('button', { name: '开始扫码' }).first().click()
      await expect(page.locator('.codecap-fallback')).toBeVisible({ timeout: 15_000 })
    }
    const chooserPromise = page.waitForEvent('filechooser')
    await page.locator('.capfb-pick').click()
    const chooser = await chooserPromise
    await chooser.setFiles({ name: 'qr.png', mimeType: 'image/png', buffer: await mkQr(text) })
    // 识别结束的标志是转圈消失（命中会连卡片一起关掉，未命中/超时回到可操作态）
    const settled = await page
      .locator('.capfb-busy')
      .waitFor({ state: 'detached', timeout: waitMs })
      .then(() => true)
      .catch(() => false)
    return settled
  }

  await page.goto('/#/capture')

  // **先把解码器焐热，再验语义**：首解的成本几乎全在 zxing-wasm 模块启动上
  // （2026-09-28 分段实测：取 Blob/解图/读像素 ≤13ms，热路径整次识别 24~46ms，
  // 而冷启动 0.82s 空载 / 最长 7.5s @4 并发，整链尾段曾 >45s 不返回）。
  // 这段前置与本用例要验的「兜底页上传能识别」无关，放这里不计入断言预算；
  // 用另一个值焐热，避免把列表里的旧值当成本次的通过证据；等待档位复用 SCAN_BUDGET，
  // 库侧 20s 硬上限保证这段一定结算（不会把整条用例拖到 test.setTimeout 之外）。
  await upload('PRIME-000', SCAN_BUDGET)

  await upload('UPLOAD-888', SCAN_BUDGET)
  await expect(page.locator('.capfb-result')).toContainText('UPLOAD-888', { timeout: SCAN_BUDGET })
})

test('扫码零外发：拦掉所有非本机请求后，上传识别照样出结果', async ({ page }) => {
  // 随包分发解码 wasm 的验收（2026-09-28）：zxing 默认 locateFile 会向 fastly.jsdelivr.net 取
  // zxing_reader.wasm，CDN 一抖用户就是「识别中…」长挂。本用例把跨源请求全断，
  // 要求①识别仍然出结果 ②扫码过程一次跨源请求都没发起——两条缺一不算离线。
  test.setTimeout(SCAN_TEST_TIMEOUT)

  const crossOrigin: string[] = []
  // 放行**本机任意端口**：dev 跑 3721、产物模式跑 3722。只拦真正的外发请求，
  // 否则产物模式连文档本身都被 abort（goto 直接 net::ERR_FAILED）。
  await page.route(/^(?!https?:\/\/(localhost|127\.0\.0\.1)).*/i, (route) => {
    crossOrigin.push(route.request().url())
    return route.abort()
  })

  const mkQr = async (text: string) => {
    const dataUrl = await QRCode.toDataURL(text)
    return Buffer.from(dataUrl.split(',')[1]!, 'base64')
  }

  await page.goto('/#/capture')
  await page.getByRole('button', { name: '开始扫码' }).first().click()
  await expect(page.locator('.codecap-fallback')).toBeVisible({ timeout: 15_000 })

  const chooserPromise = page.waitForEvent('filechooser')
  await page.locator('.capfb-pick').click()
  const chooser = await chooserPromise
  await chooser.setFiles({ name: 'qr.png', mimeType: 'image/png', buffer: await mkQr('OFFLINE-404') })

  await expect(page.locator('.capfb-result')).toContainText('OFFLINE-404', { timeout: SCAN_BUDGET })
  // 断网守卫本身要能证伪：上面那次识别真的跑过（结果已在列表里），且没有一次跨源取件
  expect(crossOrigin).toEqual([])
})
