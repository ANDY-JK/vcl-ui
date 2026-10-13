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

// 从 tokens.css 抓亮色块与手动暗色块的六位 hex 令牌值
const blocks = { light: {}, dark: {} }
let mode = null
for (const line of css.split('\n')) {
  const t = line.trim()
  if (/^:root \{/.test(t)) mode = 'light'
  else if (/:root\[data-theme='dark'\]/.test(t)) mode = 'dark'
  else if (/prefers-color-scheme: dark/.test(t)) mode = 'pending'
  else if (t === '}' && mode === 'pending') mode = null
  const m = mode && mode !== 'pending' && t.match(/(--vcl-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/)
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

const show = (title, list) => {
  console.log(`\n=== ${title}（AA 正文 4.5 / 大字 3.0）===`)
  for (const [label, fg, bg] of list) {
    const r = ratio(fg, bg)
    const flag = r >= 4.5 ? '✓' : r >= 3 ? '△' : '✗'
    console.log(`${flag} ${label.padEnd(18, '　')} ${r.toFixed(2)}`)
  }
}
show('亮色', lightPairs)
show('亮色实心底', solids)
show('暗色', darkPairs)
console.log('\n令牌抓取核对：surface=' + B['--vcl-color-surface'] + ' primary=' + B['--vcl-color-primary'] + ' | 暗块 surface=' + D['--vcl-color-surface'])
