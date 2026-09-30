/**
 * 风格细节几何审计：垂直居中残差 / 走形 / 过大 / 不协调
 *
 * 判据（全部机械可复现，阈值见探针内注释）：
 *   V1 flex 居中残差     ：父声明 align-items:center（行向）或 justify-content:center（列向），
 *                          子元素中心 Y 与父内容盒中心 Y 偏差 >1.5px
 *   V2 图标-文本对中残差 ：同一 flex 容器内 svg 图标与直接文本中心 Y 偏差 >2.2px 立案
 *                          （0.9~2.2px 属全站字体墨迹现象=Segoe UI ascent 重，登记不立案）
 *   A1 图片走形         ：img 盒子宽高比与 natural 宽高比偏差 >3%（object-fit:fill/none/默认）
 *   A2 应正方偏离       ：avatar/qr/spinner/dot 等应正方元素 |w-h| > 1px
 *   A3 图标尺度离群      ：同页 svg 图标尺寸分布，离群值 ≥ 中位数 1.8 倍且 ≥2 个（"太大"）
 *   S1 家族高度离群      ：同类名元素（≥4 个）高度偏离中位数 >25% 且 >4.5px（不协调）
 *   S2 兄弟间距抖动      ：flex 行内相邻子间距偏离中位间距 ±35% 且 ≥3px
 *   O7 子撑破父         ：子元素可视边缘越过父 border-box >2px 且父 overflow visible
 *   F1 文字过小         ：可见文本 computed font-size < 11.5px（桌面）/ 11px（移动）
 *
 * 探针必须自包含（page.evaluate 只序列化函数源码，不带 Node 侧闭包），故单一 PROBE，
 * 与 audit-viewports.mjs 同形——这是该约束下的既定仓库先例，不受 50 行规则约束。
 *
 * 用法：dev server 须已在 3721（VITE_NO_HTTPS=1 npx vite --port 3721），然后
 *   node scripts/audit-style-details.mjs [--widths 1440] [--routes button,tag]
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const OUT = 'reports/style-details-audit'
fs.mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:3721'

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : dflt
}

const src = fs.readFileSync(path.join(process.cwd(), 'src/demos/ComponentDemo.vue'), 'utf8')
let ALL_ROUTES = [...src.matchAll(/^\s*'?([a-z][a-z0-9-]*)'?:\s*defineAsyncComponent/gm)].map((m) => m[1])
ALL_ROUTES = [...new Set(ALL_ROUTES), 'theme-editor']
// 地图类三页以 canvas/外部 SDK 为主，HTML 几何判据不适用（另需断网取证流程），本轮跳过
const SKIP = new Set(['amap', 'amap-widget', 'route-planner'])
const ROUTES = arg('routes', '') ? arg('routes', '').split(',') : ALL_ROUTES.filter((r) => !SKIP.has(r))
const WIDTHS = arg('widths', '1440,390').split(',').map(Number)

/** 页内探针：返回本页全部判据命中（纯数据，无闭包依赖） */
const PROBE = () => {
  const out = {
    scale: getComputedStyle(document.documentElement).getPropertyValue('--vcl-scale').trim() || '1',
    v1: [],
    v2: [],
    a1: [],
    a2: [],
    a3: null,
    s1: [],
    s2: [],
    o7: [],
    f1: [],
  }

  const clsOf = (el) => {
    const raw = typeof el.className === 'string' ? el.className : (el.getAttribute?.('class') ?? '')
    return raw.trim().split(/\s+/)
  }
  const tokenOf = (el) => clsOf(el).find((t) => /^[a-z][a-z0-9](-[a-z0-9]+)*$/i.test(t)) || ''
  const descOf = (el, extra) => {
    const t = tokenOf(el)
    const c = clsOf(el).filter((x) => !x.startsWith('[data-v')).slice(0, 3).join('.')
    return `${el.tagName.toLowerCase()}.${t || c}${extra ? ' ' + extra : ''}`.slice(0, 64)
  }
  const isVisible = (el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }
  const isSrOnly = (el) => clsOf(el).includes('sr-only')
  /** 浮层/滚动容器内元素与绝对定位元素：越出容器是设计使然 */
  const isFloating = (el) => {
    const cs = getComputedStyle(el)
    if (cs.position === 'fixed' || cs.position === 'absolute') return true
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const pcs = getComputedStyle(p)
      if (/scroll|auto/.test(pcs.overflowX)) return true
    }
    return false
  }
  const inShell = (el) => !!el.closest('#app')
  const SQUARE_RE = /avatar|qr-|spinner|spin|loading|dot-|-dot|badge|checkbox|radio/i

  // ---------- V1 flex 居中残差（行向看 align-items，列向看 justify-content，都映射到 Y 轴） ----------
  for (const el of document.querySelectorAll('body *')) {
    if (!inShell(el) || !isVisible(el) || isSrOnly(el)) continue
    const cs = getComputedStyle(el)
    if (cs.display !== 'flex') continue
    const row = cs.flexDirection === 'row' || cs.flexDirection === 'row-reverse'
    const claimsVCenter = row ? cs.alignItems === 'center' : cs.justifyContent === 'center'
    if (!claimsVCenter) continue
    const r = el.getBoundingClientRect()
    if (r.height < 24 || r.height > 240) continue
    const padT = parseFloat(cs.paddingTop) || 0
    const padB = parseFloat(cs.paddingBottom) || 0
    const cy = r.top + padT + (r.height - padT - padB) / 2
    for (const child of el.children) {
      if (child.nodeType !== 1 || !isVisible(child) || isSrOnly(child) || isFloating(child)) continue
      const cr = child.getBoundingClientRect()
      if (cr.height < 4 || cr.height > r.height * 0.92) continue
      const res = cr.top + cr.height / 2 - cy
      if (Math.abs(res) > 1.5) out.v1.push({ at: descOf(el), child: descOf(child), res: Math.round(res * 100) / 100 })
    }
    if (out.v1.length > 400) break
  }

  // ---------- V2 图标-文本对中残差 ----------
  for (const el of document.querySelectorAll('body *')) {
    if (!inShell(el) || !isVisible(el) || isSrOnly(el)) continue
    const cs = getComputedStyle(el)
    if (cs.display !== 'flex' || cs.alignItems !== 'center') continue
    const r = el.getBoundingClientRect()
    if (r.height < 20 || r.height > 140) continue
    const svgs = [...el.querySelectorAll('svg')].filter((s) => s.getBoundingClientRect().width > 4)
    if (!svgs.length) continue
    const textKids = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim().length > 0)
    if (!textKids.length) continue
    const rects = []
    for (const n of textKids) {
      const rg = document.createRange()
      rg.selectNodeContents(n)
      for (const tr of rg.getClientRects()) rects.push(tr)
    }
    if (!rects.length) continue
    const tTop = Math.min(...rects.map((t) => t.top))
    const tBot = Math.max(...rects.map((t) => t.bottom))
    const sr = svgs[0].getBoundingClientRect()
    const res = sr.top + sr.height / 2 - (tTop + tBot) / 2
    if (Math.abs(res) > 2.2) out.v2.push({ at: descOf(el), res: Math.round(res * 100) / 100 })
    if (out.v2.length > 200) break
  }

  // ---------- A1 图片走形 ----------
  for (const img of document.querySelectorAll('img')) {
    if (!inShell(img) || !isVisible(img) || isSrOnly(img)) continue
    const fit = getComputedStyle(img).objectFit
    if (fit === 'cover' || fit === 'contain') continue // 裁切/留白设计，非走形
    const r = img.getBoundingClientRect()
    if (img.naturalWidth > 1 && img.naturalHeight > 1) {
      const boxA = r.width / r.height
      const natA = img.naturalWidth / img.naturalHeight
      if (Math.abs(boxA - natA) / natA > 0.03) {
        out.a1.push({ at: descOf(img), box: `${Math.round(r.width)}x${Math.round(r.height)}`, nat: `${img.naturalWidth}x${img.naturalHeight}`, fit })
      }
    }
  }

  // ---------- A2 应正方偏离 ----------
  const scanSquare = (el, extra) => {
    const r = el.getBoundingClientRect()
    if (r.width > 8 && r.height > 8 && Math.abs(r.width - r.height) > 1) {
      out.a2.push({ at: descOf(el, extra), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 })
    }
  }
  for (const img of document.querySelectorAll('img')) {
    if (!inShell(img) || !isVisible(img) || isSrOnly(img)) continue
    const tok = (img.getAttribute('class') || '') + ' ' + (img.parentElement?.getAttribute('class') || '')
    if (SQUARE_RE.test(tok)) scanSquare(img, 'img')
  }
  for (const el of document.querySelectorAll('body *')) {
    if (!inShell(el) || !isVisible(el) || isSrOnly(el)) continue
    if (!SQUARE_RE.test(tokenOf(el))) continue
    if (el.querySelector('img,svg,video') || el.children.length > 2) continue
    scanSquare(el)
    if (out.a2.length > 200) break
  }

  // ---------- A3 图标尺度离群（"太大"） ----------
  const sizes = []
  for (const svg of document.querySelectorAll('svg')) {
    if (!inShell(svg) || isSrOnly(svg) || !isVisible(svg)) continue
    const r = svg.getBoundingClientRect()
    if (r.width >= 12 && r.width <= 200 && Math.abs(r.width - r.height) < 1.5) sizes.push(Math.round(r.width))
  }
  if (sizes.length >= 6) {
    const sorted = [...sizes].sort((a, b) => a - b)
    const med = sorted[Math.floor(sorted.length / 2)]
    const outliers = {}
    for (const s of sizes) if (s >= med * 1.8) outliers[s] = (outliers[s] || 0) + 1
    const total = Object.values(outliers).reduce((a, b) => a + b, 0)
    if (total >= 2 && med > 0) out.a3 = { med, n: sizes.length, outliers }
  }

  // ---------- S1 家族高度离群（"不协调"） ----------
  const fams = {}
  for (const el of document.querySelectorAll('body *')) {
    if (!inShell(el) || !isVisible(el) || isSrOnly(el)) continue
    const t = tokenOf(el)
    if (!t || /demo|page|section|wrap|box|col|row|list$/.test(t)) continue
    const r = el.getBoundingClientRect()
    if (r.height < 6 || r.height > 120) continue
    ;(fams[t] ||= []).push({ h: r.height, el })
  }
  for (const [fam, items] of Object.entries(fams)) {
    if (items.length < 4) continue
    const hs = items.map((i) => i.h).sort((a, b) => a - b)
    const med = hs[Math.floor(hs.length / 2)]
    const bad = items.filter((i) => Math.abs(i.h - med) > 0.25 * med && Math.abs(i.h - med) > 4.5)
    if (bad.length) {
      out.s1.push({
        fam,
        n: items.length,
        med: Math.round(med * 10) / 10,
        min: Math.round(hs[0] * 10) / 10,
        max: Math.round(hs[hs.length - 1] * 10) / 10,
        bad: bad.slice(0, 4).map((i) => ({ at: descOf(i.el), h: Math.round(i.h * 10) / 10 })),
      })
    }
    if (out.s1.length > 40) break
  }

  // ---------- S2 兄弟间距抖动 ----------
  for (const el of document.querySelectorAll('body *')) {
    if (!inShell(el) || !isVisible(el) || isSrOnly(el)) continue
    if (el.tagName === 'svg') continue
    const cs = getComputedStyle(el)
    if (cs.display !== 'flex' || cs.flexDirection !== 'row') continue
    // space-between/around 的大间距是分组设计（顶栏左右分组等），不是抖动
    if (/space-(between|around|evenly)/.test(cs.justifyContent)) continue
    const kids = [...el.children].filter((c) => c.nodeType === 1 && isVisible(c) && !isSrOnly(c))
    if (kids.length < 4) continue
    const rects = kids.map((k) => k.getBoundingClientRect())
    const gaps = []
    for (let i = 1; i < rects.length; i++) gaps.push(Math.max(0, rects[i].left - rects[i - 1].right))
    const gs = gaps.filter((g) => g > 0).sort((a, b) => a - b)
    if (!gs.length) continue
    const med = gs[Math.floor(gs.length / 2)]
    if (med < 2.5) continue
    const off = gaps.map((g, i) => ({ i, dev: g - med })).filter((x) => Math.abs(x.dev) > 0.35 * med && Math.abs(x.dev) >= 3)
    if (off.length) {
      out.s2.push({ at: descOf(el), med: Math.round(med * 10) / 10, off: off.slice(0, 3).map((o) => ({ i: o.i, g: Math.round((gaps[o.i] || 0) * 10) / 10 })) })
    }
    if (out.s2.length > 300) break
  }

  // ---------- O7 子撑破父（内容挤压容器 → 视觉越界/走形） ----------
  for (const el of document.querySelectorAll('body *')) {
    if (!inShell(el) || !isVisible(el) || isSrOnly(el)) continue
    const cs = getComputedStyle(el)
    if (/scroll|auto/.test(cs.overflowX + cs.overflowY)) continue
    if (cs.position === 'fixed' || cs.position === 'absolute') continue
    const r = el.getBoundingClientRect()
    if (r.height < 24) continue
    for (const child of el.children) {
      if (child.nodeType !== 1 || !isVisible(child) || isSrOnly(child) || isFloating(child)) continue
      const ccs = getComputedStyle(child)
      if (/scroll|auto/.test(ccs.overflowY) || ccs.position === 'absolute' || ccs.position === 'fixed') continue
      const cr = child.getBoundingClientRect()
      const overB = cr.bottom - r.bottom
      const overT = r.top - cr.top
      if ((overB > 2 || overT > 2) && cr.height > 12 && cr.width > 20) {
        out.o7.push({ at: descOf(el), child: descOf(child), overB: Math.round(overB * 10) / 10, overT: Math.round(overT * 10) / 10 })
      }
      if (out.o7.length > 300) break
    }
    if (out.o7.length > 300) break
  }

  // ---------- F1 文字过小 ----------
  const mobile = document.documentElement.clientWidth < 600
  for (const el of document.querySelectorAll('body *')) {
    if (!inShell(el) || !isVisible(el) || isSrOnly(el) || el.children.length) continue
    const txt = (el.textContent || '').trim()
    if (txt.length < 2) continue
    const fs = parseFloat(getComputedStyle(el).fontSize)
    if (fs > 0 && fs < (mobile ? 11 : 11.5)) out.f1.push({ at: descOf(el, txt.slice(0, 18)), fs })
    if (out.f1.length > 200) break
  }

  return out
}

const main = async () => {
  const browser = await chromium.launch()
  const summary = []
  for (const w of WIDTHS) {
    const h = w < 500 ? 844 : 900
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
    for (const route of ROUTES) {
      const page = await ctx.newPage()
      let data = null
      try {
        await page.goto(`${BASE}/#/${route}`, { waitUntil: 'load', timeout: 20000 })
        await page.waitForTimeout(1000)
        data = await page.evaluate(PROBE)
      } catch (e) {
        summary.push({ route, width: w, error: String(e).slice(0, 120) })
        await page.close()
        continue
      }
      const rep = { route, width: w, scale: data.scale, ...data }
      fs.writeFileSync(path.join(OUT, `${w}x${h}__${route}.json`), JSON.stringify(rep, null, 1))
      const counts = ['v1', 'v2', 'a1', 'a2', 's1', 's2', 'o7', 'f1'].map((k) => `${k}:${rep[k].length}`).join(' ')
      summary.push({ route, width: w, counts })
      await page.close()
    }
    await ctx.close()
  }
  await browser.close()
  fs.writeFileSync(path.join(OUT, '_summary.json'), JSON.stringify(summary, null, 1))
  for (const s of summary) console.log(JSON.stringify(s))
  console.log('done →', OUT)
}
main()
