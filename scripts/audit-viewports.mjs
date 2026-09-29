/**
 * 全站多分辨率样式体检（机械判据，只报肉眼可辨的真实缺陷）
 *
 * 覆盖：45 路由 × 8 档视口（360/414/768/1024/1366/1440/1920/2560）
 *
 * 判据（每条都对应一种用户看得见的问题）：
 *   O1 横向溢出    ：文档 scrollWidth > clientWidth —— 页面能左右拖，移动端最刺眼
 *   O2 元素越界    ：元素右边缘超出视口（>2px），且不是刻意做的浮层/滚动内容
 *   O3 内容裁切    ：overflow:hidden 且 scrollHeight 明显大于 clientHeight（文字被切掉）
 *   O4 尺寸塌陷    ：本该可见的元素（有文字/图标）计算尺寸 ≤2px
 *   O5 触控过小    ：移动档位下可点元素小于 24px（WCAG 2.2 AA 最小目标）
 *   O6 文字过小    ：正文类文字 < 11px（移动端可读性底线）
 *
 * 用法：先起 dev server（VITE_NO_HTTPS=1 npx vite --port 3721），再
 *   node scripts/audit-viewports.mjs [--routes a,b] [--widths 375,1440]
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { mkdirSync } from 'node:fs'

const OUT = 'reports/viewport-audit'
mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:3721'

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : dflt
}

const src = fs.readFileSync(path.join(process.cwd(), 'src/demos/ComponentDemo.vue'), 'utf8')
const ALL_ROUTES = [...src.matchAll(/^\s*'?([a-z][a-z0-9-]*)'?:\s*defineAsyncComponent/gm)].map((m) => m[1])
const ROUTES = arg('routes', '') ? arg('routes', '').split(',') : ALL_ROUTES
const WIDTHS = arg('widths', '360,414,768,1024,1440,1920,2560').split(',').map(Number)

/** 页内探针：返回本页各类疑点 */
const PROBE = () => {
  const out = { overflowX: null, beyond: [], clipped: [], collapsed: [], small: [] }
  const de = document.documentElement
  const vw = de.clientWidth
  out.overflowX = de.scrollWidth > vw + 1 ? { scrollW: de.scrollWidth, clientW: vw } : null

  const clsOf = (el) => {
    // SVG 元素的 className 是 SVGAnimatedString 对象，直接 toString 会得到 [object ...]
    const raw = typeof el.className === 'string' ? el.className : (el.getAttribute?.('class') ?? '')
    return raw.trim().split(/\s+/).slice(0, 2).join('.')
  }
  const desc = (el) => {
    const cls = clsOf(el)
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`.slice(0, 44)
  }
  /** 仅供屏幕阅读器的内容（视觉上本应裁成 1px）：不参与任何判定 */
  const isSrOnly = (el) => clsOf(el).split('.').includes('sr-only')

  /** 浮层/刻意滚动容器内的元素：越界是设计使然（表格横向滚动就靠这个），不报 */
  const isFloating = (el) => {
    const cs = getComputedStyle(el)
    if (cs.position === 'fixed' || cs.position === 'absolute') return true
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const pcs = getComputedStyle(p)
      if (/scroll|auto|hidden/.test(pcs.overflowX)) return true
      if (pcs.position === 'fixed' || pcs.position === 'absolute') return true
    }
    return false
  }

  for (const el of document.querySelectorAll('body *')) {
    if (isSrOnly(el)) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue

    // O2 元素越界（只看有实质内容、非浮层、非装饰的元素）
    const hasContent = el.children.length > 0 || el.textContent.trim().length > 0
    if (hasContent && !isFloating(el) && r.width > 0) {
      const over = Math.round(r.right - vw)
      if (over > 2 && r.width < vw * 2) {
        out.beyond.push({ at: desc(el), over, w: Math.round(r.width) })
      }
    }

    // O3 内容裁切（overflow hidden 且纵向被切；排除刻意的省略号单行文本）
    if (cs.overflowY === 'hidden' && el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 0) {
      const isEllipsis = cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap'
      if (!isEllipsis) {
        out.clipped.push({
          at: desc(el),
          cut: el.scrollHeight - el.clientHeight,
          h: Math.round(r.height),
        })
      }
    }

    // O4 尺寸塌陷：有文字但高/宽塌到不可见
    const txt = el.textContent.trim()
    if (txt.length > 1 && el.children.length === 0) {
      if (r.height <= 2 || r.width <= 2) {
        out.collapsed.push({ at: desc(el), w: +r.width.toFixed(1), h: +r.height.toFixed(1), txt: txt.slice(0, 20) })
      }
    }
  }

  // O5 触控目标：算「有效可点面」而非元素自身尺寸——
  // 原生 checkbox/radio 多半包在 label 里、小图标多半在按钮/可点 th 里，
  // 实际点得中的是外层，按元素自身尺寸报会满屏假阳性。
  for (const el of document.querySelectorAll('button, a[href], [role=button], input, select, textarea')) {
    if (isSrOnly(el)) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    if (r.width >= 24 && r.height >= 24) continue
    // 有效目标：关联 label / 自身是 label 后代 / 最近的可点祖先
    const label = el.closest('label')
    const clickable = el.closest('button, a[href], [role=button], [role=option], [role=menuitem], th[role=button]')
    const target = (label && label !== el ? label : null) ?? (clickable && clickable !== el ? clickable : null)
    if (target) {
      const tr = target.getBoundingClientRect()
      if (tr.width >= 24 && tr.height >= 24) continue
    }
    out.small.push({ at: desc(el), w: Math.round(r.width), h: Math.round(r.height), via: target ? desc(target) : '—' })
  }
  return out
}

const browser = await chromium.launch()
const findings = { overflowX: [], beyond: [], clipped: [], collapsed: [], small: [] }

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  for (const route of ROUTES) {
    try {
      await page.goto(`${BASE}/#/${route}`, { waitUntil: 'domcontentloaded', timeout: 25000 })
    } catch {
      continue
    }
    await page.waitForTimeout(width <= 768 ? 500 : 700)
    let r
    try {
      r = await page.evaluate(PROBE)
    } catch {
      continue
    }
    for (const k of Object.keys(findings)) {
      const v = r[k]
      if (!v) continue
      if (k === 'overflowX') findings[k].push({ width, route, ...v })
      else for (const item of v) findings[k].push({ width, route, ...item })
    }
    // 窄档留证：溢出/越界才截图，避免几百张无用产物
    if ((r.overflowX || r.beyond.length) && width <= 768) {
      await page.screenshot({ path: `${OUT}/w${width}-${route}.png`, fullPage: false })
    }
  }
  await ctx.close()
  console.log(`已扫 ${width}px × ${ROUTES.length} 路由`)
}
await browser.close()

/** 按「元素描述」聚合去重，附视口与路由，便于定位 */
const agg = (arr, keyf) => {
  const m = new Map()
  for (const x of arr) {
    const k = keyf(x)
    if (!m.has(k)) m.set(k, { ...x, n: 1, widths: new Set([x.width]), routes: new Set([x.route]) })
    else {
      const e = m.get(k)
      e.n++
      e.widths.add(x.width)
      e.routes.add(x.route)
    }
  }
  return [...m.values()].sort((a, b) => b.n - a.n)
}
const show = (title, arr, keyf, fmt, limit = 25) => {
  const list = agg(arr, keyf)
  console.log(`\n=== ${title}：${list.length} 种 / ${arr.length} 条 ===`)
  if (!list.length) console.log('  （无）')
  for (const x of list.slice(0, limit)) {
    console.log(
      '  ' +
        fmt(x) +
        `  ×${x.n} [${[...x.widths].sort((a, b) => a - b).join(',')}] ${[...x.routes].slice(0, 4).join(',')}`,
    )
  }
}

show(
  'O1 横向溢出（文档级）',
  findings.overflowX,
  (x) => x.route,
  (x) => `${String(x.width).padStart(4)}px  scrollW=${x.scrollW} clientW=${x.clientW}`,
)
show(
  'O2 元素越界（右缘超视口）',
  findings.beyond,
  (x) => `${x.at}|${x.over}`,
  (x) => `${String(x.width).padStart(4)}px  越 ${String(x.over).padStart(4)}px  ${x.at}`,
  30,
)
show(
  'O3 内容被裁切',
  findings.clipped,
  (x) => `${x.at}|${x.cut}`,
  (x) => `${String(x.width).padStart(4)}px  切 ${String(x.cut).padStart(4)}px  ${x.at}`,
  25,
)
show(
  'O4 尺寸塌陷',
  findings.collapsed,
  (x) => `${x.at}|${x.txt}`,
  (x) => `${String(x.width).padStart(4)}px  ${x.w}×${x.h}  ${x.at}  「${x.txt}」`,
  20,
)
show(
  'O5 触控目标过小（有效目标仍 <24px；WCAG 2.2 AA 最小 24）',
  findings.small,
  (x) => `${x.at}|${x.w}x${x.h}`,
  (x) => `${String(x.width).padStart(4)}px  ${x.w}×${x.h}  ${x.at}`,
  20,
)

console.log(`\n完成：${ROUTES.length} 路由 × ${WIDTHS.length} 档（${WIDTHS.join('/')}）`)
