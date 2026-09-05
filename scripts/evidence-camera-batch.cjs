// CameraCapture 多张连拍留证：伪摄像头驱动真实 getUserMedia
// 运行：node scripts/evidence-camera-batch.cjs（需 dev server；Chrome fake device 自动授权）
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.EVIDENCE_URL || 'https://localhost:3726'
const OUT = path.join(__dirname, 'shots-select-unified')
fs.mkdirSync(OUT, { recursive: true })

const results = []
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

async function main() {
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  })
  const page = await browser.newPage({ viewport: { width: 900, height: 800 }, ignoreHTTPSErrors: true })
  await page.goto(`${BASE}/#/camera-capture`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: '打开连拍相机' }).click()
  await page.waitForSelector('.camc-mask', { timeout: 5000 })
  await page.waitForSelector('.camc-shutter:not([disabled])', { timeout: 15000 })
  check('连拍模式打开：取景就绪、快门可用', true)

  const mask = page.locator('.camc-mask')
  const shutter = mask.locator('.camc-shutter:not(.camc-shutter-confirm)')
  const confirmBtn = mask.locator('.camc-shutter-confirm')

  // 拍第 1 张 → 使用 → 回到取景（不关相机）
  await shutter.click()
  await page.waitForTimeout(300)
  check('快门后进入预览（重拍/使用/取消）', (await mask.locator('.camc-shot').count()) === 1)
  await confirmBtn.click()
  await page.waitForTimeout(300)
  check('使用后回到取景、胶卷 1 张', (await mask.locator('.camc-thumb').count()) === 1)

  // 拍第 2 张
  await shutter.click()
  await page.waitForTimeout(300)
  await confirmBtn.click()
  await page.waitForTimeout(300)
  check('连拍第 2 张后胶卷 2 张', (await mask.locator('.camc-thumb').count()) === 2)
  check('完成按钮显示计数', (await mask.locator('.camc-done').textContent()).includes('(2)'))
  await page.screenshot({ path: path.join(OUT, 'cam-1-连拍两张.png') })

  // 回看第 1 张：左右切换
  await mask.locator('.camc-thumb').first().click()
  await page.waitForTimeout(300)
  check('点缩略图进入回看（重拍/继续拍/删除）', (await mask.locator('.camc-shot').count()) === 1)
  check('第 1 张右侧有下一张箭头', (await mask.locator('.camc-nav-next').count()) === 1)
  await mask.locator('.camc-nav-next').click()
  await page.waitForTimeout(200)
  check('› 切到第 2 张后箭头消失（末张）', (await mask.locator('.camc-nav-next').count()) === 0)
  await mask.locator('.camc-nav-prev').click()
  await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(OUT, 'cam-2-回看切换.png') })

  // 重拍第 1 张：替换不新增
  await mask.locator('.camc-side', { hasText: '重拍' }).click()
  await page.waitForTimeout(300)
  check('重拍进入替换取景（左侧为返回）', (await mask.locator('.camc-side', { hasText: '返回' }).count()) === 1)
  await shutter.click()
  await page.waitForTimeout(300)
  await confirmBtn.click()
  await page.waitForTimeout(300)
  check('替换后胶卷仍 2 张且回看替换结果', (await mask.locator('.camc-thumb').count()) === 2)

  // 删除第 1 张 → 剩 1 张
  await mask.locator('.camc-side', { hasText: '删除' }).click()
  await page.waitForTimeout(300)
  check('删除后胶卷剩 1 张', (await mask.locator('.camc-thumb').count()) === 1)
  await page.screenshot({ path: path.join(OUT, 'cam-3-删除后.png') })

  // 完成 → 交付
  await mask.locator('.camc-done').click()
  await page.waitForTimeout(400)
  check('完成后相机关闭', (await page.locator('.camc-mask').count()) === 0)
  const delivered = await page.locator('img[alt="shot-1"]').count()
  check('demo 收到 finish 交付 1 张', delivered === 1)
  await page.screenshot({ path: path.join(OUT, 'cam-4-完成交付.png') })

  await browser.close()
  const failed = results.filter((r) => !r.pass)
  console.log(`\n==== 结果：${results.length - failed.length}/${results.length} 通过 ====`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error('EVIDENCE SCRIPT ERROR:', e)
  process.exit(2)
})
