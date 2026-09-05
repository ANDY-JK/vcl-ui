// 全部 demo 页运行时扫描：加载 47 页（亮/暗两态），收集 console error 与页面异常
// 运行：node scripts/evidence-demo-sweep.cjs（需 dev server）
const { chromium } = require('playwright')

const BASE = process.env.EVIDENCE_URL || 'https://localhost:3727'
const KEYS = require('fs').readFileSync(__dirname + '/demo-keys.txt', 'utf8').trim().split('\n')

async function sweep(page, theme) {
  const problems = []
  const onPage = (err) => problems.push(`pageerror: ${err.message.split('\n')[0]}`)
  const onConsole = (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text().split('\n')[0]
      // vite HMR/websocket 噪音与已知无关错误过滤
      if (t.includes('[vite]') || t.includes('WebSocket')) return
      problems.push(`console.error: ${t}`)
    }
  }
  page.on('pageerror', onPage)
  page.on('console', onConsole)
  for (const key of KEYS) {
    problems.length = 0
    const tag = `${theme}/${key}`
    try {
      await page.goto(`${BASE}/#/${key}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1300)
      // 主题切换在页面内进行：直接改 html 属性后等一拍
      if (theme === 'dark') {
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
        await page.waitForTimeout(250)
      }
      if (problems.length) console.log(`FAIL  ${tag}  → ${[...new Set(problems)].slice(0, 3).join(' | ')}`)
      else console.log(`PASS  ${tag}`)
    } catch (e) {
      console.log(`FAIL  ${tag}  → 加载异常: ${String(e.message).split('\n')[0]}`)
    }
  }
  page.off('pageerror', onPage)
  page.off('console', onConsole)
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1024, height: 800 }, ignoreHTTPSErrors: true })
  let fail = 0
  // 拦截结果：直接数 FAIL 行
  const orig = console.log
  let fails = 0
  console.log = (...a) => {
    if (String(a[0]).startsWith('FAIL')) fails++
    orig(...a)
  }
  await sweep(page, 'light')
  await sweep(page, 'dark')
  console.log = orig
  console.log(`\n==== 结果：${KEYS.length * 2} 页次，FAIL ${fails} ====`)
  await browser.close()
  process.exit(fails ? 1 : 0)
}

main().catch((e) => {
  console.error('SWEEP ERROR:', e)
  process.exit(2)
})
