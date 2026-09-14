// 采集兜底链布局取证：桌面 + 移动视口截图，覆盖扫码卡片各态与兜底面板
// 用法：先起 dev server（VITE_NO_HTTPS=1 npx vite --port 3721），再 node scripts/evidence-capture-layout.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = 'reports/capture-layout'
mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:3721'

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('shot:', name)
}

const run = async (viewport, tag) => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  // 相机整条不可用 → 直接进兜底页（本轮关注布局，不关注取流）
  await page.addInitScript(() => {
    if (navigator.mediaDevices) delete navigator.mediaDevices.getUserMedia
  })
  await page.goto(`${BASE}/#/capture`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await shot(page, `${tag}-1-demo`)

  // 扫码 → 卡片内翻到兜底页（上上传组件、下输入框）
  await page.getByRole('button', { name: '开始扫码' }).first().click()
  await page.waitForTimeout(900)
  await shot(page, `${tag}-2-fallback-page`)

  // 兜底页滚动到底（看输入区与返回）
  const stage = page.locator('.codecap-stage')
  await stage.evaluate((el) => (el.scrollTop = el.scrollHeight))
  await page.waitForTimeout(300)
  await shot(page, `${tag}-3-fallback-page-bottom`)

  // 手工输入提交 → 回到结果态
  await page.locator('.capfb-input input').fill('ABC-0001')
  await page.locator('.codecap-stage').getByRole('button', { name: '确认' }).click()
  await page.waitForTimeout(500)
  await shot(page, `${tag}-4-after-result`)

  // 拍照组件（含最后兜底面板，CameraCapture 仍是弹层承载）
  await page.getByRole('button', { name: '打开拍照' }).click()
  await page.waitForTimeout(1400)
  await shot(page, `${tag}-5-camera-fallback`)
  await browser.close()
}

await run({ width: 1280, height: 800 }, 'desktop')
await run({ width: 390, height: 844 }, 'mobile')
console.log('done →', OUT)
