/**
 * 逐组件深抠审计：家族档位一致性 / 尺寸网格 / 交互态 / 标题对应
 *
 * 判据：
 *   D1 家族档位：同 class-token 家族（≥4 例）内 height/fontSize/paddingX/radius 的 distinct 值
 *                集合——家族带 -sm/-md/-lg 档位后缀时多值合法，否则多值=不协调嫌疑
 *   D2 尺寸网格：控件 padding/height 的设计值（computed/scale）偏离 2px 网格 >0.35px = 奇异值
 *   D3 交互态：  btn/link 类元素 hover 后 background/color/border 均无变化 = 缺 hover 态
 *                （disabled 与纯文字元素排除；每页采样前 12 个）
 *   D4 标题对应：demo h1 文本与路由名比对（复制粘贴错标题检出）
 *
 * 用法：dev server 3721，node scripts/audit-component-deep.mjs [--routes a,b] [--widths 1440]
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const OUT = 'reports/component-deep'
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
const WIDTHS = arg('widths', '1440').split(',').map(Number)

/** 量当前 --vcl-scale 实值（隐藏元素落到布局读数） */
const PROBE_SCALE = () => {
  const el = document.createElement('i')
  el.style.cssText = 'position:absolute;visibility:hidden;font-size:calc(1px * var(--vcl-scale))'
  document.body.appendChild(el)
  const v = parseFloat(getComputedStyle(el).fontSize) || 1
  el.remove()
  return v
}

/** D1+D5 家族档位：同 token 家族（≥4 例、无 size 档后缀）的多值检测 */
const PROBE_FAM = () => {
  const out = []
  const visOK = (el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return false
    const r = el.getBoundingClientRect()
    return r.width > 2 && r.height > 2
  }
  const clsOf = (el) => (typeof el.className === 'string' ? el.className : el.getAttribute?.('class') || '')
  const fams = {}
  for (const el of document.querySelectorAll('button, .btn, .tag, input, .base-btn, [class*="vcl-"]')) {
    if (!visOK(el)) continue
    const toks = clsOf(el).split(/\s+/).filter((t) => /^[a-z][a-z0-9-]*$/i.test(t) && !t.startsWith('vcl-'))
    const fam = toks[0]
    if (!fam) continue
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const sizeKey = toks.find((t) => /^(sm|md|lg|xs|xl)$/.test(t.replace(/^-/, ''))) || ''
    ;(fams[fam] ||= { n: 0, sizes: [], heights: {}, fonts: {}, radii: {}, pads: {} }).n++
    const f = fams[fam]
    f.sizes.push(sizeKey || '-')
    f.heights[Math.round(r.height * 10) / 10] = (f.heights[Math.round(r.height * 10) / 10] || 0) + 1
    f.fonts[cs.fontSize] = (f.fonts[cs.fontSize] || 0) + 1
    f.radii[cs.borderRadius] = (f.radii[cs.borderRadius] || 0) + 1
    const padKey = `${cs.paddingLeft}|${cs.paddingTop}`
    f.pads[padKey] = (f.pads[padKey] || 0) + 1
  }
  for (const [fam, f] of Object.entries(fams)) {
    if (f.n < 4) continue
    const hasSizes = new Set(f.sizes).size > 1
    const multi = (obj) => Object.keys(obj).length > 1
    const dims = { h: multi(f.heights), fs: multi(f.fonts), r: multi(f.radii), p: multi(f.pads) }
    if (!hasSizes && Object.values(dims).some(Boolean)) {
      out.push({ fam, n: f.n, h: Object.keys(f.heights), fs: Object.keys(f.fonts), r: Object.keys(f.radii).slice(0, 4), p: Object.keys(f.pads).slice(0, 4) })
    }
    if (out.length > 30) break
  }
  return out
}

/** D2 尺寸网格：padding/height 设计值（computed/scale）偏离 2px 网格 >0.35px */
const PROBE_GRID = (scale) => {
  const out = []
  const visOK = (el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return false
    const r = el.getBoundingClientRect()
    return r.width > 2 && r.height > 2
  }
  const clsOf = (el) => (typeof el.className === 'string' ? el.className : el.getAttribute?.('class') || '')
  for (const el of document.querySelectorAll('button, .btn, .tag, input, .base-btn')) {
    if (!visOK(el)) continue
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const fam = clsOf(el).split(/\s+/)[0] || el.tagName.toLowerCase()
    for (const [k, v] of [['padT', parseFloat(cs.paddingTop)], ['padX', parseFloat(cs.paddingLeft)], ['h', r.height]]) {
      if (!v || v < 8) continue
      const design = v / scale
      const off = Math.abs(design - Math.round(design / 2) * 2)
      if (off > 0.35) out.push({ fam, k, design: Math.round(design * 100) / 100, off: Math.round(off * 100) / 100 })
    }
    if (out.length > 40) break
  }
  return out
}

/** D3 交互态：返回页面 btn/link 类候选的索引与文本（Node 侧逐个 hover） */
const COLLECT_HOVER = () => {
  const out = []
  const els = [...document.querySelectorAll('button, a[href]')].filter((el) => {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return cs.display !== 'none' && r.width > 8 && r.height > 8 && !el.disabled && (el.textContent || '').trim()
  })
  for (const el of els.slice(0, 12)) {
    const cs = getComputedStyle(el)
    out.push({
      text: (el.textContent || '').trim().slice(0, 10),
      bg: cs.backgroundColor, color: cs.color, bc: cs.borderColor,
    })
  }
  return { count: els.length, samples: out }
}

/** D4 标题 */
const PROBE_TITLE = () => {
  const h1 = document.querySelector('.demo-title, h1')
  return { h1: h1 ? (h1.textContent || '').trim() : null }
}

const main = async () => {
  const browser = await chromium.launch()
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 })
    for (const route of ROUTES) {
      const page = await ctx.newPage()
      try {
        await page.goto(`${BASE}/#/${route}`, { waitUntil: 'load', timeout: 20000 })
        await page.waitForTimeout(900)
        const scale = await page.evaluate(PROBE_SCALE)
        const fams = await page.evaluate(PROBE_FAM)
        const grid = await page.evaluate(PROBE_GRID, scale)
        const title = await page.evaluate(PROBE_TITLE)
        // D3 hover 采样
        const before = await page.evaluate(COLLECT_HOVER)
        const after = []
        for (let i = 0; i < before.samples.length; i++) {
          const loc = page.locator('button:visible, a[href]:visible').nth(i)
          try {
            await loc.hover({ timeout: 1500 })
            await page.waitForTimeout(120)
            const st = await loc.evaluate((el) => {
              const cs = getComputedStyle(el)
              return { bg: cs.backgroundColor, color: cs.color, bc: cs.borderColor }
            })
            after.push(st)
          } catch {
            after.push(null)
          }
        }
        const hover = before.samples.map((s, i) => {
          const a = after[i]
          if (!a) return { text: s.text, missing: 'hover-failed' }
          const changed = a.bg !== s.bg || a.color !== s.color || a.bc !== s.bc
          return { text: s.text, hoverChanged: changed }
        })
        const rep = { route, width: w, scale, fams, grid, hover, h1: title.h1 }
        fs.writeFileSync(path.join(OUT, `${w}__${route}.json`), JSON.stringify(rep, null, 1))
        const noHover = hover.filter((h) => h.hoverChanged === false).length
        console.log(`${route} fams:${rep.fams.length} grid:${rep.grid.length} noHover:${noHover}`)
      } catch (e) {
        console.log(`${route} ERROR ${String(e).slice(0, 80)}`)
      }
      await page.close()
    }
    await ctx.close()
  }
  await browser.close()
  console.log('done →', OUT)
}
main()
