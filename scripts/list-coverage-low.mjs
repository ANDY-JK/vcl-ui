#!/usr/bin/env node
/**
 * 覆盖率查询工具（读 `reports/coverage/coverage-final.json`）。
 *
 * 两种用法：
 *   node scripts/list-coverage-low.mjs                    → 列出语句覆盖率最低的 16 个文件
 *   node scripts/list-coverage-low.mjs Image.vue Loading  → 只报这些文件的三项覆盖率（语句/分支/函数）
 *
 * 为什么并进一个脚本：以前"查某个文件覆盖率"是一个 `reports/cov-of.mjs` 小脚本，
 * 而 `reports/` 是 gitignore 的产物目录，每轮清理临时文件都会把它删掉、下一轮又重写一遍。
 * 常用查询不该住在会被清理的地方。
 */
import { readFileSync, existsSync } from 'node:fs'

const REPORT = 'reports/coverage/coverage-final.json'
if (!existsSync(REPORT)) {
  console.error(`  ✗ 找不到 ${REPORT} —— 先跑 npm run test:unit（会生成全量覆盖报告）`)
  process.exit(2)
}

const raw = JSON.parse(readFileSync(REPORT, 'utf8'))
const filters = process.argv.slice(2)
const pct = (arr) => (arr.length ? ((arr.filter((x) => x > 0).length / arr.length) * 100).toFixed(1) : '—')

const rows = []
for (const [file, d] of Object.entries(raw)) {
  const p = file.split('\\').join('/')
  const i = p.indexOf('/src/')
  if (i < 0) continue
  const st = Object.values(d.s ?? {})
  const br = Object.values(d.b ?? {}).flat()
  const fn = Object.values(d.f ?? {})
  rows.push({
    file: p.slice(i + 5),
    stmt: st.length ? st.filter((x) => x > 0).length / st.length : 1,
    brPct: br.length ? br.filter((x) => x > 0).length / br.length : 1,
    st,
    br,
    fn,
  })
}

if (filters.length) {
  // 精确查询模式：按文件名/路径片段匹配
  const hit = rows.filter((r) => filters.some((f) => r.file.includes(f)))
  if (!hit.length) {
    console.log(`  ✗ 没有匹配 ${JSON.stringify(filters)} 的文件`)
    process.exitCode = 1
  }
  for (const r of hit.sort((a, b) => a.file.localeCompare(b.file))) {
    console.log(
      `  ${r.file}\n    语句 ${pct(r.st)}% (${r.st.length})  分支 ${pct(r.br)}% (${r.br.length})  函数 ${pct(r.fn)}% (${r.fn.length})`,
    )
  }
} else {
  rows.sort((a, b) => a.stmt - b.stmt)
  console.log(`  文件数 ${rows.length}`)
  console.log('  ── 语句覆盖率最低 16 个 ──')
  for (const r of rows.slice(0, 16)) {
    console.log(
      `   ${r.file.padEnd(52)} 语句(${r.st.length}) ${(r.stmt * 100).toFixed(1)}%  分支(${r.br.length}) ${(r.brPct * 100).toFixed(1)}%`,
    )
  }
}
