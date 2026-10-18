/**
 * contrast-audit —— WCAG 对比度验收（配色「对比明显」目标的量化正源）
 *
 * 解析 tokens.css 亮/暗两块的色令牌，对关键「文字/底色」配对计算对比度，
 * 退出码 0 = 全部达标；✗ 即失败（正文阈值 4.5，大字 3.0 记 △ 提示）。
 * 配对清单改动时同步本文件；用法：node scripts/contrast-audit.mjs
 */
import { readFileSync } from 'node:fs'

const css = readFileSync('src/components/tokens.css', 'utf8')

const rgb = (h) => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
/** rgba() 解析 + alpha 合成：侧栏选中态是「半透明胶囊压底」，必须先合成再算对比度 */
const parseColor = (v) => {
  if (typeof v !== 'string') return null
  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
    const [r, g, b] = rgb(v)
    return { r, g, b, a: 1 }
  }
  const m = v.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/)
  if (!m) return null
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] }
}
/** 把 fg（可带 alpha）叠到不透明 bg 上，返回不透明 [r,g,b] */
const over = (fgRaw, bgRaw) => {
  const fg = parseColor(fgRaw)
  const bg = parseColor(bgRaw)
  if (!fg || !bg) return null
  const a = fg.a
  return [fg.r * a + bg.r * (1 - a), fg.g * a + bg.g * (1 - a), fg.b * a + bg.b * (1 - a)]
}
const lum = ([r, g, b]) => {
  const f = (v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (fgv, bgv) => {
  const [l1, l2] = [lum(fgv), lum(bgv)].sort((a, b) => b - a)
  return (l1 + 0.05) / (l2 + 0.05)
}

// 从 tokens.css 抓亮色块与手动暗色块的色令牌值（hex 与 rgba 都要——侧栏选中态是 rgba）
const blocks = { light: {}, dark: {} }
let mode = null
for (const line of css.split('\n')) {
  const t = line.trim()
  if (/^:root \{/.test(t)) mode = 'light'
  else if (/:root\[data-theme='dark'\]/.test(t)) mode = 'dark'
  else if (/prefers-color-scheme: dark/.test(t)) mode = 'pending'
  else if (t === '}' && mode === 'pending') mode = null
  const m =
    mode && mode !== 'pending' && t.match(/(--vcl-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6}\b|rgba?\([^)]*\))/)
  if (m) blocks[mode][m[1]] = m[2]
}

const WHITE = rgb('#ffffff')
const B = blocks.light
const D = blocks.dark

const lightPairs = [
  ['正文/卡片面', rgb(B['--vcl-color-text']), rgb(B['--vcl-color-surface'])],
  ['次要标签/卡片面', rgb(B['--vcl-color-text-secondary']), rgb(B['--vcl-color-surface'])],
  ['弱化说明/卡片面', rgb(B['--vcl-color-text-muted']), rgb(B['--vcl-color-surface'])],
  ['次要/表头bg-alt', rgb(B['--vcl-color-text-secondary']), rgb(B['--vcl-color-bg-alt'])],
  ['弱化/表头bg-alt', rgb(B['--vcl-color-text-muted']), rgb(B['--vcl-color-bg-alt'])],
  ['主色文字/卡片面', rgb(B['--vcl-color-primary-on-surface']), rgb(B['--vcl-color-surface'])],
  ['危险文字/卡片面', rgb(B['--vcl-color-danger-on-surface']), rgb(B['--vcl-color-surface'])],
  ['成功文字/成功底', rgb(B['--vcl-color-success-text']), rgb(B['--vcl-color-success-bg'])],
  ['警示文字/警示底', rgb(B['--vcl-color-warning-text']), rgb(B['--vcl-color-warning-bg'])],
  ['信息文字/信息底', rgb(B['--vcl-color-info-text']), rgb(B['--vcl-color-info-bg'])],
]
const solids = [
  ['白字/主蓝实心(主按钮)', WHITE, rgb(B['--vcl-color-primary-solid'])],
  ['白字/危险实心', WHITE, rgb(B['--vcl-color-danger-solid'])],
  ['白字/成功实心', WHITE, rgb(B['--vcl-color-success-solid'])],
  ['白字/警示实心', WHITE, rgb(B['--vcl-color-warning-solid'])],
]
const darkPairs = [
  ['正文/卡片面', rgb(D['--vcl-color-text']), rgb(D['--vcl-color-surface'])],
  ['次要/卡片面', rgb(D['--vcl-color-text-secondary']), rgb(D['--vcl-color-surface'])],
  ['弱化/表头bg-alt', rgb(D['--vcl-color-text-muted']), rgb(D['--vcl-color-bg-alt'])],
  ['主色文字/卡片面', rgb(D['--vcl-color-primary-on-surface']), rgb(D['--vcl-color-surface'])],
]
// 导航选中态（实心胶囊压字）：2026-10-17 补回。此前随「皮肤撤回」被整组删掉，但令牌
// （--vcl-color-sidebar-active / -text-active）与消费点（accordion-nav-scoped.css:119-120）都还在，
// 属「删的是配对、不是状态」——最容易被误删、也最容易跌破 AA 的一类组合，必须留在清单里。
const navActive = [
  ['导航选中字/胶囊底(亮)', rgb(B['--vcl-color-sidebar-text-active']), over(B['--vcl-color-sidebar-active'], B['--vcl-color-sidebar'])],
  ['导航选中字/胶囊底(暗)', rgb(D['--vcl-color-sidebar-text-active']), over(D['--vcl-color-sidebar-active'], D['--vcl-color-sidebar'])],
]

const failures = []
const show = (title, list) => {
  console.log(`\n=== ${title}（AA 正文 4.5 / 大字 3.0）===`)
  for (const [label, fg, bg] of list) {
    const r = ratio(fg, bg)
    const flag = r >= 4.5 ? '✓' : r >= 3 ? '△' : '✗'
    if (r < 4.5) failures.push({ title, label, r })
    console.log(`${flag} ${label.padEnd(18, '　')} ${r.toFixed(2)}`)
  }
}
show('亮色', lightPairs)
show('亮色实心底', solids)
show('暗色', darkPairs)
show('导航选中态', navActive)
console.log('\n令牌抓取核对：surface=' + B['--vcl-color-surface'] + ' primary=' + B['--vcl-color-primary'] + ' | 暗块 surface=' + D['--vcl-color-surface'])

// 退出码：任何配对跌破 AA 正文线即红，供 quality-check 当闸口用（2026-10-17 起，
// 见第五轮审查 R5-A2：这份"验收正源"此前不在任何闸口链里）。
const total = lightPairs.length + solids.length + darkPairs.length + navActive.length
if (failures.length) {
  console.error(`\n❌ contrast-audit 未通过 — ${failures.length}/${total} 组配对低于 AA 4.5：`)
  for (const f of failures) console.error(`   - [${f.title}] ${f.label} = ${f.r.toFixed(2)}`)
  process.exit(1)
}
console.log(`\n✅ contrast-audit 通过 — ${total} 组配对全部 ≥ 4.5（AA 正文）`)
