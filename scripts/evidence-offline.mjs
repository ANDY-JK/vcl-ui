/**
 * 离线可用性取证：**阻断除本站以外的一切网络**，逐页打开，看是否仍能正常渲染。
 *
 * 这比静态扫源码更硬：静态扫描只能证明「代码里没写字面量外链」，
 * 而本探针证明「就算真有隐藏外链，页面也不依赖它」。
 *
 * 用法：先起 dev server（VITE_NO_HTTPS=1 npx vite --port 3721），再 node scripts/evidence-offline.mjs
 * 产物：reports/offline/*.png + 控制台统计（任何被阻断的请求都会列出，便于判断是否真依赖）
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = 'reports/offline'
mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:3721'

const PAGES = ['select', 'data-table', 'image', 'icon', 'chart', 'form-builder', 'upload', 'avatar', 'collapse']

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()

const blocked = []
// 核心：只放行本站，其余一律 abort —— 模拟「外网全断 + 图床/字体/CDN 全不可用」
await ctx.route('**/*', (route) => {
  const url = route.request().url()
  if (url.startsWith(BASE) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue()
  blocked.push(url)
  return route.abort()
})

const rows = []
for (const p of PAGES) {
  try {
    await page.goto(`${BASE}/#/${p}`, { waitUntil: 'domcontentloaded', timeout: 25000 })
    await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15000 })
    await page.waitForTimeout(900)
    const m = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')]
      const broke = imgs.filter((i) => i.complete && i.naturalWidth === 0).length
      /**
       * 兜底占位图标判定：**只认类名**，不能只看图元形状。
       * 真 lucide 图标渲染出来带 `lucide lucide-<名>-icon` 类；
       * 而有些真图标本身就是 4 个 rect（layout-grid 的九宫格就是这个形状），
       * 按「4 rect 且无 path」判会把它误报成兜底（实测踩过：28 个假警报全是它）。
       */
      const icons = [...document.querySelectorAll('svg.icon-svg')]
      const fallback = icons.filter((s) => {
        const cls = s.getAttribute('class') || ''
        if (/lucide-/.test(cls)) return false
        // 非 lucide 类名：可能是 solar/morph 容器内的，也可能是真兜底
        if (s.closest('[class*=solar], [class*=morph]')) return false
        return (
          s.querySelectorAll('rect').length === 4 &&
          !s.querySelector('path,circle,line,polyline,polygon,ellipse')
        )
      })
      return {
        imgs: imgs.length,
        broke,
        h1: document.querySelector('h1')?.textContent?.trim().slice(0, 20) ?? '',
        svgIcons: icons.length,
        fallbackIcons: fallback.length,
      }
    })
    rows.push({ page: p, ...m })
  } catch (e) {
    rows.push({ page: p, error: String(e).slice(0, 70) })
  }
  await page.screenshot({ path: `${OUT}/${p}.png` })
}
await browser.close()

console.log('=== 外网全断下的页面状态 ===')
console.log(['页面', '标题', 'img总数', '破图', '图标', '兜底'].map((h) => h.padEnd(9)).join(''))
for (const r of rows) {
  if (r.error) {
    console.log(`${r.page.padEnd(9)} ✗ ${r.error}`)
    continue
  }
  console.log(
    [r.page, r.h1, String(r.imgs), String(r.broke), String(r.svgIcons), String(r.fallbackIcons)]
      .map((c) => c.padEnd(9))
      .join(''),
  )
}
const totalBroke = rows.reduce((a, r) => a + (r.broke ?? 0), 0)
const totalFallback = rows.reduce((a, r) => a + (r.fallbackIcons ?? 0), 0)

console.log(`\n=== 被阻断的外部请求（${new Set(blocked).size} 个不同 URL）===`)
const uniq = [...new Set(blocked)]
console.log(uniq.length ? uniq.slice(0, 12).join('\n') : '（无：页面根本没尝试取任何外部资源）')

console.log(`\n破图合计 ${totalBroke}，兜底图标合计 ${totalFallback}`)
console.log(`截图：${OUT}/`)
process.exit(totalBroke > 0 || totalFallback > 0 || rows.some((r) => r.error) ? 1 : 0)
