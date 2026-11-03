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
  // ── 移动端侧栏抽屉（2026-10-22 新增）──
  //
  // 此前这个守卫**完全测不到移动端**：视口固定 1280，而 `.sidebar` 的
  // fixed 定位只写在 `@container layout (max-width: 767px)` 里。
  // 于是「RTL 下抽屉从错误一侧滑出」这类缺陷一直存在且无人发现
  // （实测 375px + dir=rtl 时 rectLeft=0，即仍从左边滑出）。
  //
  // ⚠️ 这里必须用 `mirror` 而**不能**用 `logical`：
  //   `logical` 的判据是「RTL 下 computed left === auto」，那只对**宽度未定**
  //   的元素成立（如表格固定列 td）。而 `.sidebar` 有确定的
  //   `width: min(260px*scale, 85vw)`，RTL 下浏览器会由 right 反算出
  //   `left: 180px`（不是 auto）—— 实测确认。
  //   所以对固定宽度元素，唯一可靠判据是「位置是否镜像」。
  {
    route: 'card',
    selector: '.sidebar',
    expect: 'mirror',
    tol: 0.2,
    viewport: { width: 375, height: 800 },
    why: '移动端抽屉从阅读起始侧滑出（LTR 贴左 / RTL 贴右），位置必须镜像',
  },
]

await ensureServer()
const browser = await chromium.launch()

async function posOf(dir, route, selector, viewport) {
  // 视口可覆盖（2026-10-22）：移动端专属规则（如 @container max-width:767px 里的
  // 抽屉定位）在 1280 下根本不会命中，用默认视口测等于没测。
  const vp = viewport ?? { width: 1280, height: 900 }
  const ctx = await browser.newContext({ viewport: { ...vp, deviceScaleFactor: 1 } })
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
    return r ? { status: 'ok', data: r } : { status: 'missing' }
  } catch (err) {
    // ⚠️ 必须 catch，不能让它抛出去（第 149 轮实测）：
    //   整链跑到第 31 步时 Chromium 被系统回收，`page.goto` 抛
    //   "Target page, context or browser has been closed" —— 原来只有 finally 没有 catch，
    //   于是整条闸口带着栈回溯崩掉：既没报告"哪些探针验过"，也没机会跑那 5394 个元素的扫描。
    //   闸口遇到"测不了"要**诚实报告没测到**（后面 SKIP 计失败），而不是崩。
    const msg = String(err && err.message ? err.message : err).split(String.fromCharCode(10))[0]
    return { status: 'error', error: msg }
  } finally {
    // 浏览器已死时 close 本身也会抛；清理失败不该盖住真正的原因
    await ctx.close().catch(() => {})
  }
}

const rows = []
for (const p of PROBES) {
  const ltrRes = await posOf('ltr', p.route, p.selector, p.viewport)
  const rtlRes = await posOf('rtl', p.route, p.selector, p.viewport)
  if (ltrRes.status !== 'ok' || rtlRes.status !== 'ok') {
    // 两种 SKIP 必须分开写：元素不存在是"探针过时了"，页面打不开是"这次没测成"，
    // 混成一句话会让人以为组件没了。
    const err = ltrRes.error || rtlRes.error
    const note = err ? `页面打不开（${err.slice(0, 80)}）` : '元素不存在'
    rows.push({ ...p, status: 'SKIP', note })
    continue
  }
  const ltr = ltrRes.data
  const rtl = rtlRes.data
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

// ── 全路由自动扫描（2026-10-22 新增）──────────────────────────────────────────
//
// ## 为什么手写 PROBES 不够
//
// 上面的 PROBES 是**手工登记**的 4 条。它们只能验证"我已经想到的元素"，
// 而 RTL 缺陷的典型形态恰恰是"我没想到的那个元素"——
// 实测：`.fl-label`（浮动标签基类）、`.cell-expand-icon`（表格展开图标）
// 都是这样被漏掉的，前者影响 Input/Select 全部组件。
//
// ## 自动扫描的判据（经过三轮修正，每轮都是被假阳性逼出来的）
//
//   ① key 用 **DOM 路径**（childIndex 链），不用 class 名
//      —— 同名元素（div.grid-card × 4）会互相覆盖，第一版据此报"10 个组件全坏"，全假
//   ② 排除 **inline 元素** —— `<span>` 在 `<p text-align:start>` 里是文字流的一部分，
//      位置不变才是对的，第二版没排除时 upload 报 8 个假阳性
//   ③ 排除 **fixed** —— 浮层越界不算布局缺陷（与 check:rtl 口径一致）
//   ④ 只看**窄元素**（父宽 5%~60%）—— 全宽元素 offsetRatio 恒 0，无"左右"之分
//   ⑤ 阈值留 2% 容差 —— 实测 beep-voice 的 0.85+0.05=0.90 恰好卡边界被误判
//
// ## 为什么这条断言可信
//
// 负向对照验过：把 `.cell-expand-icon` 的 `inset-inline-end` 改回 `right`，
// 扫描立刻报 `data-table BAD 未镜像 1 <span.cell-expand-icon> LTR=0.91 RTL=0.91`。
const SCAN_ROUTES = [
  'button', 'icon', 'tag', 'input', 'select', 'group', 'upload', 'capture', 'card',
  'toggle-list', 'data-table', 'progress', 'divider', 'collapse', 'image', 'tree',
  'skeleton', 'avatar', 'toast', 'result', 'popover', 'loading', 'drawer',
  'error-boundary', 'beep-voice', 'confirm-modal', 'state', 'chart-table', 'tabs',
  'steps', 'pagination', 'breadcrumb', 'menu', 'modal', 'flex', 'login',
  'contract-collection', 'contract-target-collect', 'form-builder', 'form-designer',
  'form-renderer', 'storage',
]

/** 在页面内采集"窄且靠边"的元素位置（相对父容器的比例） */
const SCAN_SNAPSHOT = () => {
  /**
   * 扫描根用 `body` 而不是 `.content-body`（2026-10-22 修）。
   *
   * ## 为什么必须换成 body
   *
   * 上一版扫 `.content-body`，而 **`.sidebar` / `.topbar` 是它的兄弟节点、
   * 在它外面**（`AppLayout` 的布局外壳）。于是：
   *   · 移动端抽屉 `.sidebar` 从来没被扫过（实测 sidebarInContentBody=false）
   *   · 我给移动端注入探针做负向对照时，探针在 `.sidebar` 里 → 采不到 → 负向对照"未生效"
   *
   * 而布局外壳恰恰是移动端 RTL 问题最集中的地方（抽屉方向、汉堡菜单位置）。
   *
   * 噪音问题：换 body 后会把 demo 站的顶栏按钮也扫进来
   * （`button.topbar-tool-btn` 之类）。它们**属于组件库**（AppLayout 的一部分），
   * 该测；但 demo 站自己的 `.demo-wrap` 内容不算。这里不排除任何东西 ——
   * 实测 `.demo-wrap` 里没有"窄且靠边"的定位元素，不会制造噪音。
   */
  const root = document.body
  const pathOf = (el) => {
    const parts = []
    let cur = el
    while (cur && cur !== root) {
      const p = cur.parentElement
      if (!p) break
      parts.unshift([...p.children].indexOf(cur))
      cur = p
    }
    return parts.join('/')
  }
  const out = []
  for (const el of root.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    if (cs.position === 'fixed') continue
    if (cs.display.startsWith('inline')) continue
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 8) continue
    const p = el.parentElement
    if (!p) continue
    const pr = p.getBoundingClientRect()
    if (pr.width < 40) continue
    const wr = r.width / pr.width
    if (wr < 0.05 || wr > 0.6) continue
    const off = (r.left - pr.left) / pr.width
    if (off > 0.1 && off + wr < 0.9) continue
    const cls = typeof el.className === 'string' ? el.className.split(/\s+/)[0] : ''
    out.push({ k: pathOf(el), tag: el.tagName.toLowerCase(), cls, off: +off.toFixed(2), wr: +wr.toFixed(2) })
  }
  return out.slice(0, 100)
}

const scanFails = []
const scanSkipped = []
let scanChecked = 0

/**
 * 重试与复核（#389）。
 *
 * ## 为什么补
 *
 * #388 的整链在第 44 步本闸口断掉：`<div.topbar-tools>` 报"未镜像"（LTR=0.58 RTL=0.91）、
 * 另一条路由 `chart-table@1280` 连不上，而且扫描元素数只有 **5688**（正常 5924）。
 * 单独重跑：**5924 个元素、未镜像 0、绿**。也就是说整条 40 分钟的链被一次负载抖动打断。
 *
 * ## 两档措施，都不放松判据
 *
 * 1) **取快照有界重试**：`goto` 超时/浏览器被回收时重试，最多 `SCAN_ATTEMPTS` 次；
 *    **重试用尽仍失败 → 仍然记 SKIP（仍然判红）**。"测不了"和"测了不合格"都必须红，
 *    重试只是把"偶发"和"真坏"分开，不是把红变绿。
 * 2) **未镜像需复核**：候选失败的元素换更长 settle（`SCAN_RECHECK_SETTLE_MS`）重测一遍，
 *    **两次都不镜像才报**。真缺陷不会被更长 settle 抹掉；动画/布局未稳定的中间值会被排除。
 */
const SCAN_ATTEMPTS = Math.max(1, Math.min(3, Number(process.env.RTL_ATTEMPTS ?? 2)))
const SCAN_SETTLE_MS = 700
const SCAN_RECHECK_SETTLE_MS = 1500

/** 取一次扫描快照；失败返回 null（不抛，页面级失败要如实计 SKIP） */
async function captureScan(browser, route, vp, dir, settleMs) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.addInitScript((d) => {
    document.addEventListener('DOMContentLoaded', () => document.documentElement.setAttribute('dir', d))
  }, dir)
  try {
    await page.goto(`${BASE}/#/${route}`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
    await page.waitForTimeout(settleMs)
    return await page.evaluate(SCAN_SNAPSHOT)
  } catch {
    return null
  } finally {
    // 浏览器已死时 close 会抛，不该让整轮扫描崩在这里
    await ctx.close().catch(() => {})
  }
}

/** 带重试地取快照：偶发失败重试，重试用尽返回 null（由调用方计 SKIP，仍然判红） */
async function captureScanWithRetry(browser, route, vp, dir, settleMs = SCAN_SETTLE_MS) {
  for (let attempt = 1; attempt <= SCAN_ATTEMPTS; attempt++) {
    const snap = await captureScan(browser, route, vp, dir, settleMs)
    if (snap) return snap
    if (attempt < SCAN_ATTEMPTS) await sleep(250 * attempt)
  }
  return null
}

/** 逐元素比对 ltr / rtl 的镜像关系，返回 { checked, fails } */
function compareScan(snapLtr, snapRtl) {
  const rtlMap = new Map(snapRtl.map((x) => [x.k, x]))
  let checked = 0
  const fails = []
  for (const l of snapLtr) {
    const r = rtlMap.get(l.k)
    if (!r) continue
    checked++
    const nearLeft = l.off < 0.1
    const nearRight = l.off + l.wr > 0.9
    // 阈值留 2% 容差（实测 0.85+0.05=0.90 卡边界被误判）
    const flipped = nearLeft ? r.off + r.wr >= 0.88 : nearRight ? r.off <= 0.12 : true
    if (!flipped) {
      fails.push({
        route: '',
        el: `<${l.tag}${l.cls ? '.' + l.cls : ''}>`,
        ltr: l.off,
        rtl: r.off,
        wr: l.wr,
      })
    }
  }
  return { checked, fails }
}

/**
 * 扫描视口（2026-10-22 新增移动端）。
 *
 * ## 为什么必须加 375
 *
 * 上一版只扫 1280，而**移动端专属规则完全扫不到**：
 * `@container layout (max-width: 767px)` 里的定位在 1280 下根本不命中。
 * 上轮修好的 `.sidebar` 抽屉方向缺陷就是这类 —— 它在 1280 下连 fixed 都不生效。
 *
 * 加 375 后，同一套判据能覆盖到移动端的抽屉、汉堡菜单、折叠面板等。
 * 代价是扫描量翻倍（42 路由 × 2 方向 × 2 视口 = 168 次页面加载），
 * 实测整步从 ~40s 涨到 ~75s，可接受。
 */
const SCAN_VIEWPORTS = [
  { name: '1280', width: 1280, height: 900 },
  { name: '375', width: 375, height: 800 },
]

/**
 * 实际参与扫描的路由。
 *
 * 默认**全量** —— 这是覆盖率的保证。RTL_SCAN_LIMIT 只给"快速抽查 / 自测闸口本身"用：
 * 例如 tests/unit/rtl-gate-robustness.spec.ts 要验"页面打不开时闸口怎么反应"，
 * 没必要为此扫完 42 个路由（单次约 50s）。
 *
 * ⚠️ 只要生效就**必然打印**一行醒目提示，不允许静默缩减覆盖：
 * 静默少扫 = 假绿，这正是本文件多处注释反复在防的事。
 */
const scanLimitRaw = Number(process.env.RTL_SCAN_LIMIT ?? "")
const scanLimited = Number.isFinite(scanLimitRaw) && scanLimitRaw > 0
const scanRoutes = scanLimited ? SCAN_ROUTES.slice(0, scanLimitRaw) : SCAN_ROUTES
if (scanLimited) {
  console.log(
    `\n⚠ RTL_SCAN_LIMIT=` +
      scanLimitRaw +
      `：本次只抽查前 ` +
      scanRoutes.length +
      `/` +
      SCAN_ROUTES.length +
      ` 个路由（非全量覆盖，仅供诊断）`,
  )
}

for (const route of scanRoutes) {
  for (const vp of SCAN_VIEWPORTS) {
    const snap = {}
    for (const dir of ['ltr', 'rtl']) {
      snap[dir] = await captureScanWithRetry(browser, route, vp, dir)
    }

    // ⚠️ SKIP 必须计失败：第一版只 continue，于是「server 没起来 → 全部 goto 失败
    // → 全 SKIP → 汇总仍显示 0」= 假绿。负向对照失效的真因就是它。
    // #389：重试用尽才走到这里 —— 偶发失败被挡在前面，真坏仍然记 SKIP（仍然红）。
    if (!snap.ltr || !snap.rtl) {
      scanSkipped.push(`${route}@${vp.name}`)
      continue
    }

    let { checked, fails } = compareScan(snap.ltr, snap.rtl)

    // 复核：动画/布局未稳定时会把中间值读成"未镜像"（#389 实测 topbar-tools LTR=0.58 RTL=0.91）。
    // 真缺陷在更长 settle 下照样不镜像 → 仍然报；只有"两次都不镜像"才落账。
    if (fails.length) {
      const recheck = {}
      for (const dir of ['ltr', 'rtl']) {
        recheck[dir] = await captureScanWithRetry(browser, route, vp, dir, SCAN_RECHECK_SETTLE_MS)
      }
      if (recheck.ltr && recheck.rtl) {
        const again = compareScan(recheck.ltr, recheck.rtl)
        const stillFailing = new Set(again.fails.map((f) => f.el))
        const dropped = fails.filter((f) => !stillFailing.has(f.el))
        if (dropped.length) {
          console.log(
            `  · 复核后排除 ${dropped.length} 处偶发（${route}@${vp.name}）：` +
              dropped.map((f) => `${f.el} LTR=${f.ltr} RTL=${f.rtl}`).join('、'),
          )
        }
        fails = fails.filter((f) => stillFailing.has(f.el))
        checked = Math.max(checked, again.checked)
      }
    }

    scanChecked += checked
    for (const f of fails) scanFails.push({ ...f, route: `${route}@${vp.name}` })
  }
}

await browser.close().catch(() => {})
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

// ── 全路由扫描结果 ──
console.log(`\n=== 全路由自动扫描（${SCAN_ROUTES.length} 个路由）===`)
console.log(
  `检查 ${scanChecked} 个窄定位元素，未镜像 ${scanFails.length} 个，SKIP ${scanSkipped.length} 个路由` +
    (scanLimited ? `（只抽查前 ${scanRoutes.length}/${SCAN_ROUTES.length} 个路由）` : ''),
)
for (const f of scanFails.slice(0, 10)) {
  console.log(`  ✗ [${f.route}] ${f.el} LTR=${f.ltr} RTL=${f.rtl} wr=${f.wr}`)
}
if (scanFails.length > 10) console.log(`  …还有 ${scanFails.length - 10} 个`)

console.log('')
if (fails.length || scanFails.length || scanSkipped.length) {
  if (REPORT_ONLY) {
    console.log(
      `⚠ 报告模式：${fails.length} 处探针不符 + ${scanFails.length} 处扫描未镜像 + ${scanSkipped.length} 个 SKIP（不判失败）`,
    )
    process.exit(0)
  }
  if (fails.length) console.error(`❌ check:rtl-semantics 未通过 —— ${fails.length} 处探针方向语义不符`)
  if (scanFails.length) console.error(`❌ check:rtl-semantics 未通过 —— ${scanFails.length} 处元素未镜像`)
  // SKIP 也必须红：否则"连不上 server"会伪装成"全部通过"
  if (scanSkipped.length) {
    console.error(`❌ check:rtl-semantics 未通过 —— ${scanSkipped.length} 个路由没测到（连不上/超时）`)
    console.error(`   不能当作通过：${scanSkipped.join(', ')}`)
  }
  console.error('\n   改法：物理 left/right → inset-inline-start/end；')
  console.error('   确需物理定位的（箭头/进度条/地图角标）在 PROBES 里登记 expect: fixed。')
  process.exit(1)
}
console.log(
  `✅ check:rtl-semantics 通过 — ${rows.filter((r) => r.status === 'PASS').length} 个探针 + ` +
    `${scanChecked} 个扫描元素方向语义正确`,
)
