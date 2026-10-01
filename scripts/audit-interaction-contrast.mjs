/**
 * 交互态对比度审计：axe 只扫静态态，本脚本补 hover / disabled 两态的 WCAG 对比度
 *
 * 判据：
 *   H1 hover 对比度：hover 后文字色 vs 合成有效背景 < 4.5:1（正文）/< 3:1（大字≥18.66px 或粗体大字）→ 立案
 *   H2 hover 弱反馈：hover 前后背景+文字+边框全部不变 → 已由 audit-component-deep D3 覆盖，此处不再报
 *   D1 disabled 可见性：disabled 元素文字对比度 < 2:1 = 几乎不可见（立案）；2~3:1 = 记录
 *
 * 每页采样：button/a[href] 前 15 个可交互元素 + 全部 disabled 元素（≤8 个）。
 * 用法：dev server 3721，node scripts/audit-interaction-contrast.mjs [--routes a,b]
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const OUT = 'reports/interaction-contrast'
fs.mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:3721'

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : dflt
}

const src = fs.readFileSync(path.join(process.cwd(), 'src/demos/ComponentDemo.vue'), 'utf8')
let ALL_ROUTES = [...src.matchAll(/^\s*'?([a-z][a-z0-9-]*)'?:\s*defineAsyncComponent/gm)].map((m) => m[1])
ALL_ROUTES = [...new Set(ALL_ROUTES), 'theme-editor']
const SKIP = new Set(['amap', 'amap-widget', 'route-planner'])
const ROUTES = arg('routes', '') ? arg('routes', '').split(',') : ALL_ROUTES.filter((r) => !SKIP.has(r))

/** 页面上下文：收集交互元素静态样式（含 disabled），供 Node 侧逐个 hover */
const COLLECT = () => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/)
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null
  }
  const effBg = (el) => {
    // 祖先链背景合成：绘制顺序=祖先先画（底）、后代后画（顶），故从最外往内叠、内层盖外层
    const chain = []
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const c = parse(getComputedStyle(p).backgroundColor)
      if (c) chain.push(c)
    }
    let acc = [255, 255, 255, 1] // 兜底白
    for (let i = chain.length - 1; i >= 0; i--) {
      const [r, g, b, a] = chain[i]
      acc = [r * a + acc[0] * (1 - a), g * a + acc[1] * (1 - a), b * a + acc[2] * (1 - a), 1]
    }
    return `rgb(${Math.round(acc[0])},${Math.round(acc[1])},${Math.round(acc[2])})`
  }
  const out = []
  const els = [...document.querySelectorAll('button, a[href], input, [role="button"]')]
  let disabled = 0
  for (const el of els) {
    if (el.closest('.accordion-nav, [class*="sidebar"], .vcl-topbar')) continue // 壳层导航/顶栏不在组件审计范围
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width < 8 || r.height < 8) continue
    const isDisabled = el.disabled || el.getAttribute('aria-disabled') === 'true' || cs.pointerEvents === 'none'
    if (isDisabled && disabled >= 8) continue
    const text = (el.textContent || el.placeholder || '').trim()
    if (!text && el.tagName !== 'INPUT') continue
    el.setAttribute('data-ic-idx', String(out.length))
    out.push({
      i: out.length,
      text: text.slice(0, 10),
      disabled: isDisabled,
      color: cs.color,
      bg: effBg(el),
      fs: parseFloat(cs.fontSize),
      fw: +cs.fontWeight || 400,
    })
    if (isDisabled) disabled++
    if (out.length >= 24) break
  }
  return out
}

/** Node 侧 WCAG 对比度（与页面采集的 rgb 字符串配对使用） */
const lum = (rgb) => {
  const [r, g, b] = rgb.match(/\d+/g).map(Number).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (c1, c2) => {
  const a = lum(c1)
  const b = lum(c2)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** hover 单元素并读合成背景（页面上下文函数，随 evaluate 序列化） */
const HOVER_STYLE = (el) => {
  const cs = getComputedStyle(el)
  const parse = (c) => {
    const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/)
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null
  }
  // 祖先链背景合成（与 COLLECT.effBg 同算法）：从最外往内叠、内层盖外层
  const chain = []
  for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
    const c = parse(getComputedStyle(p).backgroundColor)
    if (c) chain.push(c)
  }
  let acc = [255, 255, 255, 1]
  for (let i = chain.length - 1; i >= 0; i--) {
    const [r, g, b, a] = chain[i]
    acc = [r * a + acc[0] * (1 - a), g * a + acc[1] * (1 - a), b * a + acc[2] * (1 - a), 1]
  }
  return { color: cs.color, bg: `rgb(${Math.round(acc[0])},${Math.round(acc[1])},${Math.round(acc[2])})`, gradient: cs.backgroundImage !== 'none' }
}

const main = async () => {
  const browser = await chromium.launch()
  const summary = []
  for (const route of ROUTES) {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    try {
      await page.goto(`${BASE}/#/${route}`, { waitUntil: 'load', timeout: 20000 })
      await page.waitForTimeout(800)
      const samples = await page.evaluate(COLLECT)
      const rows = []
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i]
        if (s.disabled) {
          const cr = ratio(s.color, s.bg)
          rows.push({ ...s, state: 'disabled', cr: Math.round(cr * 100) / 100, verdict: cr < 2 ? 'invisible' : cr < 3 ? 'faint' : 'ok' })
          continue
        }
        const loc = page.locator('[data-ic-idx="' + i + '"]')
        try {
          await loc.hover({ timeout: 2500 })
          await page.waitForTimeout(400) // 超 demo transition 0.18s，避免采到过渡中间态
          const h = await loc.evaluate(HOVER_STYLE)
          const big = s.fs >= 24 || (s.fs >= 18.66 && s.fw >= 700)
          const need = big ? 3 : 4.5
          if (h.gradient) { rows.push({ ...s, state: 'hover', verdict: 'gradient-bg' }); continue }
          const cr = ratio(h.color, h.bg)
          rows.push({ ...s, state: 'hover', cr: Math.round(cr * 100) / 100, verdict: cr < need ? 'low' : 'ok', need })
        } catch (err) {
          rows.push({ ...s, state: 'hover', verdict: 'hover-failed', err: String(err).split('\n')[0].slice(0, 130) })
        }
      }
      const bad = rows.filter((r) => r.verdict === 'low' || r.verdict === 'invisible')
      const faint = rows.filter((r) => r.verdict === 'faint')
      fs.writeFileSync(path.join(OUT, `${route}.json`), JSON.stringify({ route, rows }, null, 1))
      summary.push({ route, bad: bad.length, faint: faint.length, badList: bad.map((b) => `${b.text}:${b.state}:${b.cr}`) })
      console.log(`${route} low:${bad.length} faint:${faint.length} ${bad.length ? JSON.stringify(bad.map((x) => `${x.text}(${x.state})=${x.cr}`)) : ''}`)
      await page.close()
    } catch (e) {
      console.log(`${route} ERROR ${String(e).slice(0, 80)}`)
      await page.close()
    }
  }
  await browser.close()
  fs.writeFileSync(path.join(OUT, '_summary.json'), JSON.stringify(summary, null, 1))
  console.log('done →', OUT)
}
main()
