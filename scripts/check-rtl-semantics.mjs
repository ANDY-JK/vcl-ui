/**
 * RTL 定位语义守卫（2026-10-21，RTL 第二阶段）
 *
 * ## 为什么需要第二个守卫
 *
 * 第一阶段的 `check:rtl` 断言三件事：零横向溢出、零元素越界、方向生效。
 * 但实测发现：**在 142 处 `left/right` 定位全未转换的情况下它依然全绿** ——
 * 因为「元素跑到错误的一侧」**不会越界**，只是位置不对。
 *
 * 这是守卫的能力边界，必须承认并补上：
 *   · `check:rtl` 管「布局崩坏」（溢出/越界）
 *   · 本文件管「**方向语义**」（该在起始侧的东西是否真在起始侧）
 *
 * ## 断言方式
 *
 * 对同一元素，分别在 `ltr` 与 `rtl` 下取 `getBoundingClientRect().left`：
 *   · 若它是**跟随流向**的元素 → RTL 下应镜像（位置显著变化）
 *   · 若它是**物理固定**的元素 → RTL 下应**不动**（位置几乎不变）
 *
 * 两类断言都能抓错：
 *   · 该镜像的没镜像 → 说明用了物理属性
 *   · 该固定的镜像了 → 说明误用了逻辑属性
 *
 * 用法：node scripts/check-rtl-semantics.mjs [--report]
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 3722
const BASE = process.env.RTL_BASE || `http://localhost:${PORT}`
const REPORT_ONLY = process.argv.includes('--report')

let serverProc = null
async function ensureServer() {
  if (process.env.RTL_BASE) return
  try {
    const r = await fetch(BASE, { signal: AbortSignal.timeout(1500) })
    if (r.ok) return
  } catch {
    /* 自起 */
  }
  serverProc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT)], {
    env: { ...process.env, VITE_NO_HTTPS: '1' },
    stdio: 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    await sleep(1000)
    try {
      const r = await fetch(BASE, { signal: AbortSignal.timeout(1500) })
      if (r.ok) return
    } catch {
      /* 继续等 */
    }
  }
  throw new Error('dev server 未就绪')
}
function stopServer() {
  if (serverProc && !serverProc.killed) {
    serverProc.kill()
    serverProc = null
  }
}

/**
 * 探针定义：`selector` + 期望行为
 *   mirror  —— 跟随流向，RTL 下应相对父容器镜像到另一侧
 *   fixed   —— 物理固定，RTL 下相对父容器的偏移应几乎不变
 *   logical —— **逻辑属性确实生效**：RTL 下 `getComputedStyle().left` 应为 `auto`
 *              （浏览器把 `inset-inline-start` 映射到 `right`，`left` 因此变 auto）
 *
 * ## 为什么需要第三种探针（本轮实测教训）
 *
 * 我一开始只用「相对父容器的偏移」判 mirror/fixed，结果做负向对照时发现：
 * 把 `inset-inline-start: 0` 改回 `left: 0`，Δ **依然是 0.972** —— 探针没红。
 *
 * 原因：表格在 RTL 下**整体翻转**，`left: 0` 的 sticky 单元格恰好也落到了右侧，
 * 于是"位置看起来对了"，但那是巧合，不是逻辑属性生效。
 *
 * 真相只能从**计算样式**看出来（实测）：
 *   LTR: css.left = 0px     css.inset-inline-start = 0px
 *   RTL: css.left = auto    css.inset-inline-start = 0px   ← 映射到 right 的证据
 *
 * 而 `left: 0` 的写法在 RTL 下 css.left 仍是 0px。这是唯一可靠的判据。
 */
const PROBES = [
  // 卡片角位装饰：**相对卡片**的物理角，RTL 下应保持在同一个物理角（fixed）
  { route: 'card', selector: '.grid-corner--top-left', expect: 'fixed', tol: 0.2, why: '角位是相对卡片盒的物理方位' },
  { route: 'card', selector: '.grid-corner--top-right', expect: 'fixed', tol: 0.2, why: '角位是相对卡片盒的物理方位' },
  // 表格固定列：语义是「钉在阅读起始侧」→ 必须用逻辑属性，且 RTL 下应镜像
  {
    route: 'data-table',
    selector: 'td.col-fixed-left',
    expect: 'logical',
    tol: 0.5,
    why: '固定列钉在阅读起始侧，必须用 inset-inline-start（RTL 下 left 应解析为 auto）',
  },
]

await ensureServer()
const browser = await chromium.launch()

async function posOf(dir, route, selector) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.addInitScript((d) => {
    document.addEventListener('DOMContentLoaded', () => document.documentElement.setAttribute('dir', d))
  }, dir)
  try {
    await page.goto(`${BASE}/#/${route}`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
    await page.waitForTimeout(900)
    const r = await page.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const b = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      // **相对父容器的偏移**，不是绝对 left（理由见 PROBES 上方注释）
      const parent = el.parentElement
      const pb = parent ? parent.getBoundingClientRect() : { left: 0, width: 0 }
      const parentW = pb.width || 1
      // 归一化到 0~1：0 = 贴父容器左边界，1 = 贴右边界
      const relLeft = +((b.left - pb.left) / parentW).toFixed(3)
      return {
        relLeft,
        absLeft: +b.left.toFixed(1),
        // 逻辑属性是否生效的**唯一可靠判据**：RTL 下 left 应被解析成 auto
        cssLeft: cs.left,
        cssInsetStart: cs.insetInlineStart || cs.getPropertyValue('inset-inline-start'),
        dir: getComputedStyle(document.body).direction,
      }
    }, selector)
    return r
  } finally {
    await ctx.close()
  }
}

const rows = []
for (const p of PROBES) {
  const ltr = await posOf('ltr', p.route, p.selector)
  const rtl = await posOf('rtl', p.route, p.selector)
  if (!ltr || !rtl) {
    rows.push({ ...p, status: 'SKIP', note: '元素不存在' })
    continue
  }
  if (rtl.dir !== 'rtl') {
    rows.push({ ...p, status: 'SKIP', note: `方向未生效（${rtl.dir}）` })
    continue
  }
  // 归一化比例差：0.5 = 位置差半个父容器宽
  // tol 在 PROBES 里是**比例**（0.2 表示父容器宽的 20%），不是像素
  const delta = +(rtl.relLeft - ltr.relLeft).toFixed(3)
  const shifted = Math.abs(delta) > p.tol

  let ok
  let note
  if (p.expect === 'logical') {
    // 逻辑属性生效的判据：LTR 下 left 有值、RTL 下 left 变 auto（映射到 right）
    const ltrHasLeft = ltr.cssLeft && ltr.cssLeft !== 'auto'
    const rtlIsAuto = rtl.cssLeft === 'auto'
    ok = ltrHasLeft && rtlIsAuto
    note = `LTR left=${ltr.cssLeft} / RTL left=${rtl.cssLeft}`
  } else {
    ok = p.expect === 'mirror' ? shifted : !shifted
    note = ''
  }
  rows.push({ ...p, ltrRel: ltr.relLeft, rtlRel: rtl.relLeft, delta, status: ok ? 'PASS' : 'FAIL', note })
}
await browser.close()
stopServer()

console.log('\n=== RTL 定位语义（ltr vs rtl 的 left 偏移）===')
console.log(['路由', '探针', '期望', 'ltr', 'rtl', 'Δ', '结果'].map((h) => h.padEnd(11)).join(''))
for (const r of rows) {
  console.log(
    [
      r.route,
      r.selector.slice(0, 20),
      r.expect,
      r.ltrRel ?? '-',
      r.rtlRel ?? '-',
      r.delta ?? '-',
      r.status === 'PASS' ? '✓' : r.status === 'SKIP' ? `SKIP(${r.note})` : '✗',
    ]
      .map((c) => String(c).padEnd(11))
      .join(''),
  )
  if (r.status === 'FAIL') {
    console.log(`            ${r.why}`)
    console.log(
      r.expect === 'mirror'
        ? `            → 期望镜像但没镜像（Δ=${r.delta}），说明用了物理属性，应改逻辑属性`
        : `            → 期望固定但镜像了（Δ=${r.delta}），说明误用了逻辑属性，应保持物理`,
    )
  }
}

const fails = rows.filter((r) => r.status === 'FAIL')
console.log('')
if (fails.length) {
  if (REPORT_ONLY) {
    console.log(`⚠ 报告模式：${fails.length} 处方向语义不符（不判失败）`)
    process.exit(0)
  }
  console.error(`❌ check:rtl-semantics 未通过 —— ${fails.length} 处方向语义不符`)
  process.exit(1)
}
console.log(`✅ check:rtl-semantics 通过 — ${rows.filter((r) => r.status === 'PASS').length} 个探针方向语义正确`)
