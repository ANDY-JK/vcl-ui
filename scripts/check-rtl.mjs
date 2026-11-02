/**
 * RTL 取证与守卫（2026-10-21，审查 6.3 第 3 项 / R5-A21；对应 docs/rtl-立项清单-2026-09-30.md §2）
 *
 * ## 为什么先建这个再改样式
 *
 * 立项清单原文：「不做无验证的盲改 —— 逻辑属性替换若无 RTL 渲染取证兜底，
 * 等于把『LTR 下碰巧正常』换成『双向都可能坏』」。
 *
 * 这句话是本文件存在的全部理由。RTL 改造最危险的形态是：
 * 把 `margin-left` 换成 `margin-inline-start`，LTR 下**看起来没变**（因为 start=left），
 * 于是所有既有测试继续绿 —— 而 RTL 下可能整个错位。**没有 RTL 断言，改动是无风险的假象。**
 *
 * ## 做什么
 *
 * 对代表路由集，在 `dir=ltr` 与 `dir=rtl` 下各量一遍，断言三条：
 *   1. **零横向溢出**（`scrollWidth <= clientWidth`）—— 最常见的 RTL 破坏形态
 *   2. **零元素越界**（所有可见元素的 rect 不超出视口左右边界）
 *   3. **方向确实生效**（`getComputedStyle(body).direction === 'rtl'`）—— 防止"测了但没切过去"
 *
 * ## 用法
 *
 *   node scripts/check-rtl.mjs            # 守卫模式（违规即 exit 1）
 *   node scripts/check-rtl.mjs --report   # 只报告（RTL 改造期间用，先看有多少问题）
 *
 * 需要先起 dev server（`VITE_NO_HTTPS=1 npx vite --port 3721`）。
 */
import { chromium } from 'playwright'
import { judgeRows } from './rtl-judge.mjs'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 3721
const BASE = process.env.RTL_BASE || `http://localhost:${PORT}`
const REPORT_ONLY = process.argv.includes('--report')

/**
 * 自起 dev server（与 playwright.config.ts 同款：`VITE_NO_HTTPS=1` 走明文 HTTP）。
 *
 * 为什么不复用已在跑的服务：与 e2e 同一个理由 —— 仓库里有 key.pem 时 `npm run dev`
 * 默认走 HTTPS，自签证书会让探活直接失败。也不去杀别人的进程，起在自己的端口上最干净。
 * 若 `RTL_BASE` 已指定（外部已有服务），跳过自起。
 */
let serverProc = null
async function ensureServer() {
  if (process.env.RTL_BASE) {
    console.log(`[rtl] 使用外部服务 ${BASE}`)
    return
  }
  try {
    const r = await fetch(BASE, { signal: AbortSignal.timeout(1500) })
    if (r.ok) {
      console.log(`[rtl] 端口 ${PORT} 已有服务，直接复用`)
      return
    }
  } catch {
    /* 没服务，往下自起 */
  }
  console.log(`[rtl] 启动 dev server（端口 ${PORT}）…`)
  serverProc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT)], {
    env: { ...process.env, VITE_NO_HTTPS: '1' },
    stdio: 'ignore',
    detached: false,
  })
  for (let i = 0; i < 60; i++) {
    await sleep(1000)
    try {
      const r = await fetch(BASE, { signal: AbortSignal.timeout(1500) })
      if (r.ok) {
        console.log('[rtl] dev server 就绪')
        return
      }
    } catch {
      /* 继续等 */
    }
  }
  throw new Error('dev server 60s 内未就绪')
}

function stopServer() {
  if (serverProc && !serverProc.killed) {
    serverProc.kill()
    serverProc = null
  }
}

/**
 * 代表路由集（立项清单 §2.2 指定，覆盖四类裁决）：
 * - `data-table`：滚动 / 列宽（JS 侧含方向量）
 * - `select`：浮层锚定（left/right 定位最多的地方）
 * - `menu`：缩进 / 箭头方向
 * - `drawer`：滑出方向
 * - `tabs`：指示条位置
 * - `pagination`：首末页按钮顺序
 * - `form-builder`：低代码主力，栅格与嵌套最深
 */
const ROUTES = [
  // ── 首批 7 个（有明确方向语义的代表）──
  'data-table', // 固定列 / 拖拽手柄 / 横向滚动
  'select', // 浮层锚定（left/right 定位最多的地方）
  'menu', // 缩进 / 箭头方向
  'drawer', // 滑出方向
  'tabs', // 指示条位置
  'pagination', // 首末页按钮顺序
  'form-builder', // 低代码主力，栅格与嵌套最深
  // ── 2026-10-22 扩面：7 → 42 ──
  //
  // 起因：`src/components` 里实测还有 132 处 `left/right` 声明，而闸口只覆盖 7 个路由
  // —— 没被覆盖的组件，方向问题闸口看不见。
  //
  // 选取原则：**纯本地组件优先**。以下 4 个重依赖路由仍然排除：
  //   chart / amap / amap-widget / route-planner
  // 理由：依赖 canvas 或高德 SDK，dev server 下加载慢且受网络影响，
  // 会让闸口偶发超时（超时会被误判成失败）。
  //
  // ⚠️ 关于这个闸口的能力边界（2026-10-22 实测查明，此前未记录）：
  //   demo 站每个页面都包在 `.content-body` 里，而它 `overflow-y: auto`
  //   按 CSS 规范会把 `overflow-x` 也算成 `auto`（一个方向 auto + 另一个
  //   visible ⇒ visible 计算为 auto）。于是 `inScroller()` 把页内所有越界
  //   元素都豁免了 —— **本闸口实际只防 `body` 级溢出**。
  //   所以"42 路由全绿"只说明它们没造成页面级溢出，
  //   **不等于方向语义正确**。（想验语义需要镜像对称性判据，
  //   那条尝试过但负向对照验证不通过，已撤回，见报告 #78。）
  'button',
  'icon',
  'tag',
  'input',
  'group',
  'upload',
  'capture',
  'card',
  'toggle-list',
  'progress',
  'divider',
  'collapse',
  'image',
  'tree',
  'skeleton',
  'avatar',
  'toast',
  'result',
  'popover',
  'loading',
  'error-boundary',
  'beep-voice',
  'confirm-modal',
  'state',
  'chart-table',
  'steps',
  'breadcrumb',
  'modal',
  'flex',
  'login',
  'contract-collection',
  'contract-target-collect',
  'form-designer',
  'form-renderer',
  'storage',
]

/** 在页面内量：横向溢出 + 越界元素 + 方向是否生效 */
const MEASURE = () => {
  const de = document.documentElement
  const vw = de.clientWidth

  const overflowX = Math.max(0, de.scrollWidth - de.clientWidth)

  /**
   * 元素是否处在**可横向滚动的祖先**里。
   *
   * 为什么必须排除：`DataTable` 的宽表格本来就是横向滚动的（LTR 下实测
   * `left=255 right=1636` 同样越界），这是**设计行为**而非 RTL 缺陷。
   * 第一版没排除，LTR/RTL 各报 12 个越界 —— 那是把"表格比视口宽"当成了 bug，
   * 而真正的 RTL 缺陷（元素跑到**错误的一侧**）反而被这堆噪音盖住。
   */
  const inScroller = (el) => {
    let p = el.parentElement
    while (p && p !== document.body) {
      const cs = getComputedStyle(p)
      if (/(auto|scroll)/.test(cs.overflowX)) return true
      p = p.parentElement
    }
    return false
  }

  // 越界元素：只看可见的、有实际尺寸的、且不在滚动容器内的
  const offenders = []
  const all = document.body.querySelectorAll('*')
  for (const el of all) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    // 允许 1px 容差（亚像素舍入）
    if (r.left < -1 || r.right > vw + 1) {
      if (inScroller(el)) continue
      const cls = typeof el.className === 'string' ? el.className.split(/\s+/).slice(0, 2).join('.') : ''
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls,
        left: +r.left.toFixed(1),
        right: +r.right.toFixed(1),
      })
    }
    if (offenders.length >= 12) break
  }

  return {
    direction: getComputedStyle(document.body).direction,
    htmlDir: de.getAttribute('dir'),
    vw,
    overflowX,
    offenders,
  }
}

await ensureServer()
const browser = await chromium.launch()
const rows = []

for (const route of ROUTES) {
  for (const dir of ['ltr', 'rtl']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    // 用 addInitScript 在文档创建前设 dir：模拟宿主 `<html dir="rtl">`，
    // 与库内组件「不自行设置 dir、跟随文档流向」的契约一致
    await page.addInitScript((d) => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.setAttribute('dir', d)
      })
    }, dir)
    try {
      await page.goto(`${BASE}/#/${route}`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
      await page.waitForTimeout(900)
      const m = await page.evaluate(MEASURE)
      rows.push({ route, dir, ...m })
    } catch (e) {
      rows.push({ route, dir, error: String(e).slice(0, 80) })
    }
    await ctx.close()
  }
}
await browser.close()
// 自起的服务要自己收掉（外部服务不动）
stopServer()

// ── 汇总 ──
const fmt = (n) => (n === undefined || n === null ? '-' : String(n))
console.log('\n=== RTL 取证（1280 视口，双向对照）===')
console.log(['路由', 'dir', '生效', '横向溢出', '越界元素'].map((h) => h.padEnd(12)).join(''))
for (const r of rows) {
  console.log(
    [
      r.route,
      r.dir,
      r.error ? 'ERR' : r.direction === r.dir ? '✓' : `✗(${r.direction})`,
      fmt(r.overflowX),
      r.error ?? r.offenders.length,
    ]
      .map((c) => String(c).padEnd(12))
      .join(''),
  )
  if (r.offenders?.length) {
    for (const o of r.offenders.slice(0, 4)) {
      console.log(`            越界: <${o.tag}${o.cls ? ` class="${o.cls}"` : ''}> left=${o.left} right=${o.right} (视口 ${r.vw})`)
    }
  }
}

// ── 判定 ──
const failures = judgeRows(rows)

console.log('')
if (failures.length) {
  if (REPORT_ONLY) {
    console.log(`⚠ RTL 报告模式：${failures.length} 处待处理（不判失败）`)
    for (const f of failures) console.log(`   · ${f}`)
    console.log('\n   这是 RTL 改造期间的"施工看板"。改造完成、--report 去掉后仍为 0 才算收口。')
    process.exit(0)
  }
  console.error(`❌ check:rtl 未通过 —— ${failures.length} 处：\n`)
  for (const f of failures) console.error(`   - ${f}`)
  console.error('\n   改法优先用逻辑属性（margin-inline-start / inset-inline-end / text-align: start），')
  console.error('   物理定位（地图角标、全屏钮）保持物理值并加注释说明。')
  process.exit(1)
}
console.log(`✅ check:rtl 通过 — ${ROUTES.length} 个路由 × 2 方向，零横向溢出、零元素越界、方向均已生效`)
