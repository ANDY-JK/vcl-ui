/**
 * apply-scale —— 全站等比缩放迁移器
 *
 * 用法：
 *   node scripts/apply-scale.mjs            # 干跑：统计 + 样例，不落盘
 *   node scripts/apply-scale.mjs --write    # 落盘（之后跑 prettier 重新格式化）
 *
 * 覆盖范围：src/components 与 src/demos 下的 .vue / .css。
 *   - .vue：`<style>` 块按 CSS 处理；`<template>` 内 `style="..."` 内联属性按声明处理；
 *     `<script>` 一律跳过（JS 侧设计尺寸由人工迁移，运行时测量坐标不属缩放范畴）
 *   - .css：全文处理
 *   - tokens.css 豁免（令牌定义手工维护，脚本只提示不一致项）
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyToText, scanDeclarations } from './scale-rules.mjs'

const WRITE = process.argv.includes('--write')
/** 迁移范围含自定义属性：--thumb-size / --track-height 这类组件内部尺寸变量同样需等比 */
const OPT = { allowCustomProps: true }
const DIRS = ['src/components', 'src/demos']
const EXEMPT = new Set(['src\\components\\tokens.css', 'src/components/tokens.css'])
const SAMPLES = 24

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      walk(p, out)
      continue
    }
    if (/\.(vue|css)$/.test(name)) out.push(p.replaceAll('\\', '/'))
  }
  return out
}

/** .vue：只动 <style> 块与模板内 style 属性；<script> 绝不触碰 */
function transformVue(text, hits) {
  let out = text.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, (_m, open, body, close) => {
    const r = applyToText(body, OPT)
    if (r.count > 0) hits.push(...scanDeclarations(body, OPT).map((h) => ({ ...h, zone: 'style' })))
    return open + r.text + close
  })
  out = out.replace(/(?<![:-])style="([^"]*)"/g, (m, css) => {
    const r = applyToText(css, OPT)
    if (r.count > 0) hits.push(...scanDeclarations(css, OPT).map((h) => ({ ...h, zone: 'inline' })))
    return `style="${r.text}"`
  })
  return out
}

const files = DIRS.flatMap((d) => walk(d))
const report = []
let totalChanged = 0
let touched = 0

for (const file of files) {
  if (EXEMPT.has(file)) continue
  const src = readFileSync(file, 'utf8')
  const hits = []
  const isVue = file.endsWith('.vue')
  const out = isVue
    ? transformVue(src, hits)
    : (() => {
        const r = applyToText(src, OPT)
        if (r.count > 0) hits.push(...scanDeclarations(src, OPT))
        return r.text
      })()
  if (out === src) continue
  const count = hits.length
  totalChanged += count
  touched++
  report.push({ file, count, hits })
  if (WRITE) writeFileSync(file, out)
}

// 遗留 --vcl-fit 引用（非标准插值形态，需人工收敛）
const leftovers = report.flatMap((r) =>
  r.hits.filter((h) => h.fitLeftover).map((h) => `${r.file}  ${h.prop}: ${h.raw}`),
)

report.sort((a, b) => b.count - a.count)
console.log(`${WRITE ? '✍️  已写入' : '🔍 干跑'} — ${touched} 个文件、${totalChanged} 处声明迁移到 --vcl-scale`)
for (const r of report.slice(0, SAMPLES)) {
  console.log(`  ${String(r.count).padStart(3)}  ${r.file}`)
  for (const h of r.hits.slice(0, 2)) console.log(`        ${h.prop}: ${h.raw}  →  ${h.next}`)
}
if (report.length > SAMPLES) console.log(`  …还有 ${report.length - SAMPLES} 个文件`)

if (leftovers.length > 0) {
  console.log(`\n⚠️  ${leftovers.length} 处 --vcl-fit 残留（需人工收敛）：`)
  for (const l of leftovers) console.log('  ' + l)
}
