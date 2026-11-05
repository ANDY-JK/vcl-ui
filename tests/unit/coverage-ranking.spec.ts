/* ═══════════ 覆盖率排行不许被模板行骗（TD-67 收口，#445） ═══════════
 *
 * 完整套件采集时 `.vue` 模板渲染函数的覆盖会整片丢失：Card.vue 模板段 14 条未覆盖、
 * 脚本段 0 条；按"文件语句覆盖率"排行会把它排到榜尾，第 57 轮就照榜挑了
 * `Loading.vue 30.4%` 当"最欠测"，实际 30.4% 全来自模板行错配，脚本段早已测全。
 *
 * 本 spec 用合成夹具钉住三件事：分段口径、排行只用脚本段、模板段仍如实报出（不是丢弃）。
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { buildRow, rankKey, splitStatements } from '../../scripts/list-coverage-low.mjs'

const VUE = [
  '<script setup lang="ts">',
  'const a = 1',
  'const b = 2',
  '</script>',
  '',
  '<template>',
  '<div>{{ a }}</div>',
  '<span>{{ b }}</span>',
  '</template>',
].join('\n')

/** 造一份 istanbul 记录：scriptLines 全命中，templateLines 全未命中 */
function fixture(scriptLines, templateLines, { file = 'src/components/x/X.vue', sourceText = VUE } = {}) {
  const s = {}
  const statementMap = {}
  let id = 0
  for (const line of scriptLines) {
    s[id] = 1
    statementMap[id] = { start: { line } }
    id++
  }
  for (const line of templateLines) {
    s[id] = 0
    statementMap[id] = { start: { line } }
    id++
  }
  const d = { s, statementMap, b: {}, f: {} }
  return { file, d, sourceText }
}

describe('splitStatements · 脚本段/模板段', () => {
  it('**模板行不进脚本段**：模板 9 条全未覆盖，脚本 2 条全命中 → 脚本段 100%', () => {
    const { file, d } = fixture([2, 3], [7, 8, 9, 10, 11, 12, 13, 14, 15])
    const r = splitStatements({ filePath: file, sourceText: VUE, statementMap: d.statementMap, s: d.s })
    expect(r.split).toBe(true)
    expect(r.script).toEqual({ hit: 2, total: 2 })
    expect(r.template).toEqual({ hit: 0, total: 9 })
  })

  it('**排行键只看脚本段**：同一个文件按 raw 是 2/11，按脚本段是 1.0', () => {
    const { file, d } = fixture([2, 3], [7, 8, 9, 10, 11, 12, 13, 14, 15])
    const row = buildRow(file, d, VUE)
    expect(row.stmt).toBeCloseTo(2 / 11)
    expect(rankKey(row)).toBe(1)
  })

  it('**模板段仍如实报出**（不丢弃、不假装不存在）', () => {
    const { file, d } = fixture([2, 3], [7, 8])
    const row = buildRow(file, d, VUE)
    expect(row.template.total).toBe(2)
    expect(row.split).toBe(true)
  })

  it('**非 .vue / 无源码 / 无 `<template>` → 不分段，全部算脚本段**（fail-open 到旧口径）', () => {
    const plain = fixture([2, 3], [7, 8], { file: 'src/a.ts' })
    expect(splitStatements({ filePath: plain.file, sourceText: plain.sourceText, statementMap: plain.d.statementMap, s: plain.d.s }).split).toBe(false)
    const noSrc = fixture([2, 3], [7, 8], { sourceText: null })
    const r0 = splitStatements({ filePath: noSrc.file, sourceText: null, statementMap: noSrc.d.statementMap, s: noSrc.d.s })
    expect(r0.split).toBe(false)
    expect(r0.script.total).toBe(4)
    const noTpl = fixture([2, 3], [7, 8], { sourceText: '<script>\nconst a=1\n</script>' })
    expect(splitStatements({ filePath: noTpl.file, sourceText: noTpl.sourceText, statementMap: noTpl.d.statementMap, s: noTpl.d.s }).split).toBe(false)
  })

  it('**脚本段真有缺口时排行键会掉下来**（判据不是恒 1 的摆设）', () => {
    const d = { s: { 0: 0, 1: 1 }, statementMap: { 0: { start: { line: 2 } }, 1: { start: { line: 3 } } }, b: {}, f: {} }
    expect(rankKey(buildRow('src/components/x/X.vue', d, VUE))).toBeCloseTo(0.5)
  })
})

describe('list-coverage-low.mjs · 接线（防排行退化回原始口径）', () => {
  const src = readFileSync('scripts/list-coverage-low.mjs', 'utf8')

  it('排行用 rankKey（脚本段），且模板段在输出里标注需单独复跑', () => {
    expect(src).toMatch(/rows\.sort\(\(a, b\) => rankKey\(a\) - rankKey\(b\)\)/)
    expect(src).toContain('需单独复跑')
    expect(src).toContain('模板行不参与排行')
  })

  it('**负向对照（合成夹具）**：把排行改回 raw `stmt` → 静态判据必须报', () => {
    const mutant = src.replace(
      'rows.sort((a, b) => rankKey(a) - rankKey(b))',
      'rows.sort((a, b) => a.stmt - b.stmt)',
    )
    expect(mutant).not.toBe(src)
    expect(mutant).not.toMatch(/rows\.sort\(\(a, b\) => rankKey\(a\) - rankKey\(b\)\)/)
  })
})
