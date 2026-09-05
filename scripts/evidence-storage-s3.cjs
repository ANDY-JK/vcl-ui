// 页面级端到端留证：S3（缤纷云）默认后端生效 → 面板断言 → 合成相机拍照 → 云端对象落盘断言
// 运行：node scripts/evidence-storage-s3.cjs（需 dev server + Chrome fake camera）
const { chromium } = require('playwright')
const crypto = require('crypto')

const BASE = process.env.EVIDENCE_URL || 'https://localhost:3726'
const AK = 'g3r2SqNN2jnCLQEsmYwZ8Uip'
const SK = 'i6pk3isdp7I5cxRyXP4Fgs4LbBHDbwL'
const HOST = 'my-main-oss-2026.s3.bitiful.net'
const results = []
function check(name, cond, detail = '') {
  results.push(cond)
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
function hmac(k, d) { return crypto.createHmac('sha256', k).update(d).digest() }
function sha256hex(d) { return crypto.createHash('sha256').update(d).digest('hex') }
async function listKeys() {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const payloadHash = sha256hex('')
  const headers = { host: HOST, 'x-amz-content-sha256': payloadHash, 'x-amz-date': now }
  const query = { 'list-type': '2', 'max-keys': '1000' }
  const sorted = Object.keys(headers).sort()
  const canonHeaders = sorted.map((h) => `${h}:${headers[h]}\n`).join('')
  const canonQuery = Object.keys(query).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`).join('&')
  const canonReq = ['GET', '/', canonQuery, canonHeaders, sorted.join(';'), payloadHash].join('\n')
  const scope = `${now.slice(0, 8)}/us-east-1/s3/aws4_request`
  const sts = ['AWS4-HMAC-SHA256', now, scope, sha256hex(canonReq)].join('\n')
  const key = hmac(hmac(hmac(hmac('AWS4' + SK, now.slice(0, 8)), 'us-east-1'), 's3'), 'aws4_request')
  const sig = crypto.createHmac('sha256', key).update(sts).digest('hex')
  const res = await fetch(`https://${HOST}/?${canonQuery}`, {
    headers: { ...headers, Authorization: `AWS4-HMAC-SHA256 Credential=${AK}/${scope}, SignedHeaders=${sorted.join(';')}, Signature=${sig}` },
  })
  const xml = await res.text()
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => decodeURIComponent(m[1]))
}

async function main() {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
  // 触屏设备模拟（iPhone 13）：页面内相机是 mobileMenu+触屏 专属路径，与用户真机场景一致
  const ctx = await browser.newContext({ ...require('playwright').devices['iPhone 13'], ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  const pageErrs = []
  page.on('pageerror', (e) => pageErrs.push(e.message.split('\n')[0]))
  await page.goto(`${BASE}/#/contract-collection`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.evaluate(() => localStorage.removeItem('contract-collection-storage-config'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  // 1. env 默认后端 = s3（按钮显示 ☁ 云端）
  const cloudBtn = page.locator('.cc-btn', { hasText: '云端' }).first()
  check('默认后端=云端（env S3 注入）', (await cloudBtn.count()) === 1)

  // 2. 共享面板：s3 radio 选中 + endpoint 预填
  await cloudBtn.click()
  await page.waitForTimeout(400)
  check('面板 s3 radio 选中', await page.locator('input[type=radio][value=s3]').isChecked())
  const ep = await page.locator('.scp-panel input.f-input').first().inputValue()
  check('endpoint 预填', ep.includes('s3.bitiful.net'), ep)
  await page.screenshot({ path: 'scripts/shots-select-unified/s3-1-面板.png' })
  await page.locator('button', { hasText: '取消' }).last().click()
  await page.waitForTimeout(300)

  // 3. 基线对象集合
  const before = new Set(await listKeys())

  // 4. 拍照上传：目标行的上传卡片 → 来源面板「拍照」→ 连拍完成
  const upEntry = page.locator('.cc-table .card-wrap').first()
  check('找到上传入口', (await upEntry.count()) >= 1)
  await upEntry.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await upEntry.click()  // 滚入视口后正常点击（force 会误穿顶栏浮层）
  await page.waitForTimeout(500)
  await page.locator('text=拍照').first().click()
  await page.waitForTimeout(800)
  await page.locator('.camc-shutter:not(.camc-shutter-confirm)').click()
  await page.waitForTimeout(400)
  await page.locator('.camc-shutter-confirm').click()
  await page.waitForTimeout(300)
  check('连拍「完成」按钮在顶部', (await page.locator('.camc-topbar .camc-done').count()) === 1)
  await page.locator('.camc-done').click()
  await page.waitForTimeout(4000) // 上传（SigV4 PUT）+ 保存链路
  await page.screenshot({ path: 'scripts/shots-select-unified/s3-2-拍照上传后.png', fullPage: true })
  check('无页面运行时错误', pageErrs.length === 0, pageErrs[0] || '')

  // 5. 云端断言：新增对象出现
  const after = await listKeys()
  const added = after.filter((k) => !before.has(k) && !k.startsWith('9999'))
  check('云端桶出现新对象', added.length >= 1, added.join(' , ').slice(0, 120))

  await ctx.close()
  await browser.close()
  const failed = results.filter((r) => !r).length
  console.log(`\n==== 结果：${results.length - failed}/${results.length} 通过 ====`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error('E2E-ERR:', e.message.split('\n')[0]); process.exit(2) })
