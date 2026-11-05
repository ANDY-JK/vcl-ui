#!/usr/bin/env node
/**
 * 覆盖率查询工具（读 `reports/coverage/coverage-final.json`）。
 *
 * 两种用法：
 *   node scripts/list-coverage-low.mjs                    → 列出**脚本段**覆盖率最低的 16 个文件
 *   node scripts/list-coverage-low.mjs Image.vue Loading  → 只报这些文件的三项覆盖率（语句/分支/函数）
 *
 * 为什么并进一个脚本：以前"查某个文件覆盖率"是一个 `reports/cov-of.mjs` 小脚本，
 * 而 `reports/` 是 gitignore 的产物目录，每轮清理临时文件都会把它删掉、下一轮又重写一遍。
 * 常用查询不该住在会被清理的地方。
 *
 * ## #445（TD-67 收口）：排行榜不许被模板行骗
 *
 * 完整套件采集时 `.vue` 的模板渲染函数覆盖会整片丢失（实测 `Card.vue` 模板段未覆盖 14 条，
 * 脚本段 0 条），于是按"文件语句覆盖率"排行会把一个**早已测全**的组件排到榜尾 ——
 * 第 57 轮就照着这个榜挑了 `Loading.vue 30.4%` 当"最欠测"，实际 30.4% 全是模板行错配。
 *
 * 修法与 `reports/cov-detail.mjs` 同口径：**按 `<template>` 行号把语句分成脚本段/模板段**，
 * 排行只用脚本段（可信），模板段单独列出并标注"需单独复跑确认"。
 */
import { readFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const REPORT = 'reports/coverage/coverage-final.json'
const pct = (hit, total) => (total ? ((hit / total) * 100).toFixed(1) : '—')

/**
 * 把语句计数按 `<template>` 行号拆成脚本段/模板段（纯函数，可单测）。
 *
 * @param {{filePath: string, sourceText?: string|null, statementMap?: object, s?: object}} p
 * @returns {{script: {hit:number,total:number}, template: {hit:number,total:number}, split: boolean}}
 */
export function splitStatements({ filePath, sourceText = null, statementMap = {}, s = {} }) {
  const script = { hit: 0, total: 0 }
  const template = { hit: 0, total: 0 }
  // 只有 .vue 且能读到源码时才分段；其余一律按"全是脚本段"处理（split=false）
  let tplLine = 0
  if (/\.vue$/.test(filePath) && sourceText) {
    const lines = sourceText.split(/\r?\n/)
    tplLine = lines.findIndex((x) => x.trim() === '<template>') + 1
  }
  for (const [id, count] of Object.entries(s ?? {})) {
    const line = statementMap?.[id]?.start?.line
    const covered = Number(count) > 0 ? 1 : 0
    if (tplLine > 0 && Number.isFinite(line) && line > tplLine) {
      template.total++
      template.hit += covered
    } else {
      script.total++
      script.hit += covered
    }
  }
  return { script, template, split: tplLine > 0 }
}

/** 排行键：脚本段覆盖率（模板行不参与），无语句时按 100% 处理 */
export function rankKey(row) {
  return row.script.total ? row.script.hit / row.script.total : 1
}

/** 组装一行（纯函数，便于单测与排行共用） */
export function buildRow(file, d, sourceText = null) {
  const st = Object.values(d.s ?? {})
  const br = Object.values(d.b ?? {}).flat()
  const fn = Object.values(d.f ?? {})
  const { script, template, split } = splitStatements({
    filePath: file,
    sourceText,
    statementMap: d.statementMap ?? {},
    s: d.s ?? {},
  })
  return {
    file,
    script,
    template,
    split,
    // 兼容精确查询模式：保留原始数组供三项覆盖率展示
    st,
    br,
    fn,
    stmt: st.length ? st.filter((x) => x > 0).length / st.length : 1,
    brPct: br.length ? br.filter((x) => x > 0).length / br.length : 1,
  }
}

function main() {
  if (!existsSync(REPORT)) {
    console.error(`  ✗ 找不到 ${REPORT} —— 先跑 npm run test:unit（会生成全量覆盖报告）`)
    process.exit(2)
  }
  const raw = JSON.parse(readFileSync(REPORT, 'utf8'))
  const filters = process.argv.slice(2)
  const rows = []
  for (const [file, d] of Object.entries(raw)) {
    const p = file.split('\\').join('/')
    const i = p.indexOf('/src/')
    if (i < 0) continue
    const rel = p.slice(i + 5)
    let sourceText = null
    if (rel.endsWith('.vue')) {
      try {
        sourceText = readFileSync(rel.startsWith('src/') ? rel : 'src/' + rel, 'utf8')
      } catch {
        sourceText = null // 源码读不到 → 退回不分段，下面按原始口径
      }
    }
    rows.push(buildRow(rel, d, sourceText))
  }

  if (filters.length) {
    const hit = rows.filter((r) => filters.some((f) => r.file.includes(f)))
    if (!hit.length) {
      console.log(`  ✗ 没有匹配 ${JSON.stringify(filters)} 的文件`)
      process.exitCode = 1
    }
    for (const r of hit.sort((a, b) => a.file.localeCompare(b.file))) {
      console.log(
        `  ${r.file}\n    语句 ${pct(r.st.filter((x) => x > 0).length, r.st.length)}% (${r.st.length})  分支 ${pct(r.br.filter((x) => x > 0).length, r.br.length)}% (${r.br.length})  函数 ${pct(r.fn.filter((x) => x > 0).length, r.fn.length)}% (${r.fn.length})`,
      )
      if (r.split) {
        console.log(
          `    脚本段 ${pct(r.script.hit, r.script.total)}% (${r.script.total}) ← 可信  模板段 ${pct(r.template.hit, r.template.total)}% (${r.template.total}) ← 需单独复跑确认`,
        )
      }
    }
    return
  }

  rows.sort((a, b) => rankKey(a) - rankKey(b))
  console.log(`  文件数 ${rows.length}`)
  console.log('  ── 脚本段覆盖率最低 16 个（模板行不参与排行，见 TD-67 / #445）──')
  for (const r of rows.slice(0, 16)) {
    const tpl = r.split ? `  模板段 ${pct(r.template.hit, r.template.total)}% (${r.template.total}) 需单独复跑` : ''
    console.log(
      `   ${r.file.padEnd(52)} 脚本段 ${pct(r.script.hit, r.script.total)}% (${r.script.total})${tpl}`,
    )
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
