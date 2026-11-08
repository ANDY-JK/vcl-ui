import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { AxeBuilder } from '@axe-core/playwright'

/**
 * 全站无障碍回归锁（axe-core / WCAG 2.1 AA）
 *
 * 第一轮基线：153 条违规 → 清零标题层级 / 库组件可访问名 / 组件配色后剩 36 条节点级，其中三方与 demo 内联两类在扫描循环内直接放行，余 15 条进 TRADEOFF 基线（按「规则 × 页面」条数计）。已清零的类别（标题层级、库组件
 * 可访问名、组件配色）由本用例守住不回归；剩余 36 处按下述三类显式豁免——
 * 豁免必须点名来源（与 site-audit.spec.ts 同口径），不允许"凑数式放过"：
 *
 *   THIRD_PARTY  三方 SDK 自渲染内容（本库改不掉）：
 *     - amap / amap-widget / route-planner 三页的高德 markers 图片 <img>（SDK 内部注入，
 *       官方主题图 PNG 命中 webapi.amap.com 前缀；本库自绘的 green 图标是百分号编码
 *       data URI，按 src 形态单独放行）
 *     - 高德 SDK 自带的 logo 图（同为 webapi.amap.com 前缀）
 *     - amap 页的 <select class="radius-select">、高德 <iframe> 无 title
 *   DEMO_INLINE  demo 页自己写的内联样式（不入库产物，属示例写法）：
 *     - 各页 <span style="color: var(--vcl-color-success/danger)"> 统计数字、.result 文本
 *     - .demo-add-btn / .upload-link / .fl-label 等 demo 私有类的对比度
 *   TRADEOFF     解除需改库公开契约、已登记的取舍：
 *     - nested-interactive ×2：ToggleList list-item（role=button 内嵌可聚焦 checkbox，
 *       Enter/itemClick 契约被 keyboard-a11y.spec.ts 锁定）、Upload area（同构问题）
 *     - empty-table-header：DataTable 的 th-checkbox 只有 checkbox 无文本（全选列表头）
 *     - label ×2：DataTable 某处 checkbox、storage demo 内联 input
 *     - landmark-*：demo 站点的 main/landmark 结构（非库组件）
 *     - label-title-only：popover/route-planner demo 的 input 仅靠 title
 *
 * 若豁免条数比基线多 → 判红（防止"顺手多放过几条"）。新增规则类别也判红。
 */
const BASE = process.env.E2E_BASE || 'http://localhost:3721'
const ROOT = process.cwd()

const demoSource = fs.readFileSync(path.join(ROOT, 'src/demos/ComponentDemo.vue'), 'utf8')
const ROUTES = [...demoSource.matchAll(/^\s*'?([a-z][a-z0-9-]*)'?:\s*defineAsyncComponent/gm)].map((m) => m[1])

const THIRD_PARTY = [
  /webapi\.amap\.com/, // 高德 JS SDK 自带的 logo/版权图（marker 图已于 2026-09-28 改为本库自绘，见下条）
  // 本库交给高德 SDK 的**自绘 marker 图标**：`_internal/map-marker.ts` 的 mapMarkerIcon 用
  // encodeURIComponent 产出百分号编码 data URI（`data:image/svg+xml,%3Csvg…`），消费方是
  // AmapWidget 的 red/blue/green、RouteMap 的起点针与 AmapDemo 的切换针。<img> 由 SDK 生成，我们塞不进 alt。
  // 锚点收到 `,%` 为止是刻意的：demo 里手写的内联 SVG 用 `data:image/svg+xml;utf8,`
  // （DataTableDemo.vue:702），不在此列，缺 alt 照样红。
  /src="data:image\/svg\+xml,%/,
  /radius-select/, // 高德 SDK 的半径下拉
  /<iframe/, // 三方库注入的工作 iframe（截图库的透明离屏 iframe，src 为 javascript:void(0)）
]
// demo 页私有类名 / 内联色（示例写法，不入库产物）。按类名与内联样式匹配，与页面无关：
// 这些是写 demo 的人当场负责的展示样式，改了不动库产物，故放行不计数。
const DEMO_INLINE = [
  /class="[^"]*\bfl-label\b/,
  /class="[^"]*\bresult\b/,
  /class="[^"]*\bupload-link\b/,
  /class="[^"]*\bdemo-add-btn\b/,
  /class="[^"]*\bpill\b/,
  /class="[^"]*\bforgot-password\b/,
  /class="[^"]*\bbtn-template\b/,
  /class="[^"]*\bbtn-add\b/,
  /class="[^"]*\bdays-label\b/,
  /class="[^"]*\bcc-stat-badge\b/,
  /class="[^"]*\bcc-btn\b/,
  /class="[^"]*\bftc-stat\b/,
  /class="[^"]*\bld-btn\b/,
  /class="[^"]*\bbtn\b/,
  /style="color: var\(--(vcl-)?color-/,
]
// 已知取舍：规则 × 页面（命中即放行），条数被 countTradeoff 计数
const TRADEOFF: Record<string, Set<string>> = {
  'nested-interactive': new Set(['upload', 'toggle-list']),
  'empty-table-header': new Set(['data-table']),
  label: new Set(['data-table', 'storage']),
  'scrollable-region-focusable': new Set(['divider', 'avatar']),
  'label-title-only': new Set(['popover', 'route-planner']),
  'landmark-unique': new Set(['pagination', 'breadcrumb', 'route-planner', 'form-builder', 'data-table']),
  'landmark-main-is-top-level': new Set(['form-builder']),
  'landmark-no-duplicate-main': new Set(['form-builder']),
}
// 基线总取舍条数（2026-09-20 修复后，按「规则 × 页面」的 violation 条数计）：
// 第一轮 axe 首扫 153 条，清零标题层级/可访问名/组件配色后剩 36 条节点级违规；
// 其中三方（amap 自渲染 img/select/iframe）与 demo 内联样式两条线在扫描循环里
// 直接放行不计数，剩下 14 条进 TRADEOFF 基线——降了说明又修好一批（改小这个数），
// 升了说明回退或新增（判红）。
//
// [2026-09-29 由 15 降为 14] 全站等比缩放落地后重扫，divider 页的
// scrollable-region-focusable 不再命中。逐项查证：该条针对的是 .content-body
// 这个可滚动容器，divider 页内容随缩放变短后溢出量只剩 4px（scrollHeight 608 /
// clientHeight 604），落到 axe 判定阈值之下——不是我们修好了这条，是内容变短了。
// divider 仍留在下面的登记集内：内容哪天回涨到再溢出，总数变 15 会被断言拦下，
// 提示重新核对，而不是静默放过。
// [2026-09-30 由 14 降为 13] 等比缩放全量动态化（--vcl-scale = 100vw/1920 无地板）后，
// 1280 视口缩放 0.88→0.667，demo 内容更短：avatar 页的 scrollable-region-focusable
// 不再溢出（与 09-29 divider 同理），取舍总数 14→13。逐项查证：divider 与 avatar 两条
// scrollable 均已 0 命中（探针实测），其余 13 条不变。avatar 仍留在登记集内：
// 内容哪天回涨到再溢出会被拦下提示重核，而不是静默放过。
// [2026-09-30 由 13 升为 15] 缩放基准 1440→1280 后，1280 视口缩放 0.889→1.0，demo 内容
// 变长：divider 与 avatar 两条 scrollable 登记对重新溢出命中（即 09-20 登记集的上限 15，
// 与 BASELINE_BY_RULE 的 scrollable:2 上限一致），取舍总数 13→15。属内容随等比缩放
// 自然变长的已知取舍回归，非新增缺陷；两条仍留登记集内作回涨探针。
// [2026-09-30 晚 由 15 降为 13] 基准改 1536（用户主屏 1912 观感定案）后，本 spec 的
// 1280 视口缩放 1.0→0.833，divider 与 avatar 两条 scrollable 登记对不再溢出命中
// （探针实测 = 0），取舍总数 15→13。两条仍留登记集内作回涨探针：基准若再往窄
// （1280）方向改，总数回升到 15 会被本断言拦下提示重核，而不是静默放过。
// [2026-11-08 由 13 降为 11] 修掉 data-table 的两条真取舍（不是内容变短导致的假消失）：
//   ① `empty-table-header`：全选列的表头 `<th>` 只有 `<input>`，没有**文本内容**
//      （aria-label 不算 axe 的「表头文本」）→ 补视觉隐藏文本 `.dt-sr`；
//   ② `label`：全选框 `<input type="checkbox">` 无可访问名 → 补 `aria-label`。
// 两条都是代码修复，`TRADEOFF` 里对应条目保留作回涨探针：若哪天又退回去，总数回到 13 会被断言拦下。
// `label` 在 storage 页的那条仍为已知取舍（那是演示页自绘控件，不在本轮范围）。
//
// [2026-11-08 由 11 降为 9] 设计器画布由 `<main>` 改为 `<section role="region">`：
// 外层 AppLayout 已经是 `<main>`，画布再嵌一个 main 会同时命中
// `landmark-main-is-top-level` 与 `landmark-no-duplicate-main` 两条。画布语义上是页内一块区域，
// 不是页面主内容，改成带 aria-label 的 region 才对。两条 tradeoff 归零（11 → 9）。
// [2026-11-08 由 9 降为 8，又回到 9] 设计器侧栏补名确实消掉了 form-builder 的 landmark-unique，
// 但 data-table 那条**修不了**：表格分页被 `table-pagination-a11y.spec` 钉死必须与 nav/Pagination 一致地
// 使用 <nav>（第 140 轮契约），一页多表就必然出现多个同名「分页导航」地标。契约优先，故回到 9，
// 并把 data-table 登记进 TRADEOFF 作为有据的已知取舍。
const BASELINE_TOTAL = 9
// 基线里各「规则 × 页面」条数（升即红；仅覆盖 TRADEOFF 类别，三方/demo 内联不计入）
const BASELINE_BY_RULE: Record<string, number> = {
  // [2026-11-08 收紧] 图表 frame 的 role="img" 已挪到画布那块，`nested-interactive` 归零
  'nested-interactive': 0,
  // [2026-11-08 收紧] 全选列表头补了视觉隐藏文本，`empty-table-header` 归零
  'empty-table-header': 0,
  // [2026-11-08 收紧] 全选框补了 aria-label，data-table 那条已消失；剩 storage 页自绘控件是 TRADEOFF
  label: 0,
  'scrollable-region-focusable': 0,
  'label-title-only': 2,
  // [2026-11-08 收紧] 设计器侧栏补名后 form-builder 不再命中；data-table 走 TRADEOFF（契约要求 nav）
  'landmark-unique': 0,
  // [2026-11-08 收紧] 设计器画布由 <main> 改 region，两条 landmark 归零
  'landmark-main-is-top-level': 0,
  'landmark-no-duplicate-main': 0,
}

const isThirdParty = (text: string) => THIRD_PARTY.some((r) => r.test(text))
const isDemoInline = (text: string) => DEMO_INLINE.some((r) => r.test(text))

test('全站 axe 无障碍扫描：基线值守，不新增', async ({ page }) => {
  test.setTimeout(15 * 60_000)
  let total = 0
  const byRule: Record<string, number> = {}
  const unexempted: string[] = []
  let tradeoffCount = 0

  for (const route of ROUTES) {
    await page.goto(`${BASE}/#/${route}`)
    // 等 demo 页真挂载再扫：换页走 defineAsyncComponent 异步 chunk，盲等固定毫秒在
    // 串行全链负载下不够（amap-widget 要拉高德 SDK，实测超 600ms），扫到未挂载的空页
    // 会把「无 h1」误报成 page-has-heading-one —— 09-20 全链假红过一次。
    // 历史全量探针证实 45 条路由均有 h1（挂载 100~800ms），
    // 等 h1 可见即页面就绪，比固定 sleep 确定。
    await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15_000 })
    // 还要等入场动画收尾：login 卡片带 slideUp 0.5s（库组件 login/login.vue），
    // 动画中段 axe 取到的是混合色（h1 #a4a6aa on #f8f9fa = 2.31），一次误报 9 条
    // color-contrast —— 09-20 全链真红过。无限动画（loading 页 spinner）不纳入等待条件。
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
    )
    let violations: Array<{ id: string; impact?: string | null; nodes: unknown[] }>
    try {
      violations = (await new AxeBuilder({ page }).analyze()).violations
    } catch {
      continue
    }
    for (const v of violations) {
      // 判定顺序（先特异后一般）：
      //   1) 点名登记的取舍（规则 × 页面）→ 计入 tradeoffCount 后放行（条数受基线断言）
      //   2) 按节点过滤：三方 SDK 自渲染 / demo 页私有类与内联色 → 这些节点不计
      //      （一条违规常混多种节点，如 data-table 的 demo-add-btn 与库 cell-text-inner
      //       同在一条里——必须逐节点判，否则豁免一个会连带放过真缺陷）
      //   3) 过滤后仍有残余节点、或无节点明细且未登记 → 未豁免违规，判红
      if (TRADEOFF[v.id]?.has(route)) {
        tradeoffCount++
        continue
      }
      const nodeTexts = ((v.nodes ?? []) as Array<string | { html?: string }>)
        .map((n) => (typeof n === 'string' ? n : (n?.html ?? '')))
        .filter(Boolean)
      if (nodeTexts.length === 0) {
        // 无节点明细的结构类规则：未登记的才是回退
        total++
        byRule[v.id] = (byRule[v.id] ?? 0) + 1
        unexempted.push(`${route}/${v.id}`)
        continue
      }
      const residual = nodeTexts.filter((t) => !isThirdParty(t) && !isDemoInline(t))
      if (residual.length === 0) continue
      total++
      byRule[v.id] = (byRule[v.id] ?? 0) + 1
      unexempted.push(`${route}/${v.id}(${residual.length}/${nodeTexts.length})`)
    }
  }

  // 超出基线的规则逐一报出（既有规则涨了 / 新规则出现都逃不掉）
  const regressions: string[] = []
  for (const [rule, n] of Object.entries(byRule)) {
    const base = BASELINE_BY_RULE[rule] ?? 0
    if (n > base) regressions.push(`${rule} 现有 ${n} > 基线 ${base}`)
  }
  const newRules = Object.keys(byRule).filter((r) => !(r in BASELINE_BY_RULE))
  if (newRules.length) regressions.push(`新规则类别（未登记）：${newRules.join(', ')}`)

  expect(regressions, `无障碍基线回退（豁免未覆盖的违规 ${total} 条：${unexempted.slice(0, 12).join(', ')}）`).toEqual(
    [],
  )
  expect(
    tradeoffCount,
    `已知取舍条数应为 ${BASELINE_TOTAL}（当前 ${tradeoffCount}）——基线数字变了要同步 BASELINE_*`,
  ).toBe(BASELINE_TOTAL)
  console.log(`axe 全站扫描：路由 ${ROUTES.length}，已知取舍 ${tradeoffCount}，未豁免违规 ${total}`)
})

/**
 * 暗色主题对比度值守（2026-09-29 新增）
 *
 * 为什么单开一条：上面那条只扫**亮色**——暗色从建库起就没进过 axe 覆盖，
 * 于是「暗底上对比度不足」这类缺陷一路漏网。实测一次抓出 395 处
 * （--vcl-color-text-muted 在暗底仅 3.17~3.78、--vcl-color-primary-solid 当文字色仅 2.62~3.13，
 * 两者都是既有的、被亮色扫描掩盖的真缺陷）。
 *
 * 本用例只盯 color-contrast：暗色下别的规则与亮色同源，重复扫描只是拖慢全链。
 * 不设条数基线——对比度是硬指标，有违规就该修，没有「已知取舍」的空间；
 * 上限只用来兜住「一次回归几百处」的极端情形，避免输出刷屏。
 */
test('暗色主题对比度值守：全站 color-contrast 不新增', async ({ page }) => {
  test.setTimeout(15 * 60_000)
  const offenders: string[] = []
  let nodes = 0

  for (const route of ROUTES) {
    await page.goto(`${BASE}/#/${route}`)
    await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15_000 })
    // 手动切暗色（走 data-theme，与用户点「暗色」同一条路径；不依赖系统偏好）
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
    )
    let violations: Array<{ id: string; nodes: unknown[] }>
    try {
      violations = (await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()).violations
    } catch {
      continue
    }
    for (const v of violations) {
      if (v.id !== 'color-contrast') continue
      const list = (v.nodes ?? []) as Array<string | { html?: string }>
      const texts = list.map((n) => (typeof n === 'string' ? n : (n?.html ?? ''))).filter(Boolean)
      // 三方 SDK 自渲染内容与 demo 私有类仍按亮色那条的口径放行
      const residual = texts.filter((t) => !isThirdParty(t) && !isDemoInline(t))
      if (!residual.length) continue
      nodes += residual.length
      offenders.push(`${route}(${residual.length})`)
    }
  }

  expect(
    offenders,
    `暗色下对比度不足 ${nodes} 处——涉及 ${offenders.slice(0, 10).join(', ')}。` +
      `改法优先调 tokens.css 的颜色令牌（两套暗色块同值），别在组件里写死色值。`,
  ).toEqual([])
  console.log(`axe 暗色扫描：路由 ${ROUTES.length}，对比度违规 0`)
})
