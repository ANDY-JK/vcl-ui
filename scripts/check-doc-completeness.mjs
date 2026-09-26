// 闸口：文档 API 表的「说明」列不允许有「—」（M6 回归防线）
//
// 为什么需要它：M6（JSDoc 覆盖 58%）是 13 批手工补齐才从 368 收到 0 的，
// 但补完没有任何东西阻止回退——新增 prop/事件/slot 忘了写注释，文档站
// 「说明」列又会悄悄变「—」，而 check:docs 只管漂移（重新生成无 diff），
// 管不了「生成出来就是缺的」。本闸口把「说明列无空缺」变成机械断言。
//
// 口径：对 gen-docs 的产物，按表头定位说明列——Props 第 5 列、Events 第 3 列、
// Slots 第 3 列（第 4 列是兜底预览，允许「—」）、命名导出第 2 列。
// 注意不能对渲染行做 split(' | ') 后取末列：说明文字里的竖线被 mdEscape
// 转义成 \|，切片会把一个单元格拆成两个，末列错位（曾把 0 虚报成 29）。

/**
 * 扫描一份域 md，返回说明列为「—」的行 → [{ component, table, label }]
 * @param {string} mdText
 * @returns {{ component: string, table: string, label: string }[]}
 */
export function findDocGaps(mdText) {
  const gaps = []
  const lines = mdText.split('\n')
  // 各表的说明列下标（按表头识别，-1 = 当前不在受检表内）
  const TABLE_COLS = [
    ['属性', 4],
    ['事件', 2],
    ['插槽', 2],
    ['导出', 1],
  ]
  let descCol = -1
  let table = ''
  let component = ''
  for (const line of lines) {
    if (line.startsWith('## ')) {
      component = line.slice(3).replace(/`/g, '').trim()
      continue
    }
    if (!line.startsWith('|')) continue
    // 还原转义竖线后再切片，保证单元格边界正确（哨兵用私用区字符，避开 no-control-regex）
    const cells = line
      .replace(/\\\|/g, '\uE000')
      .split(' | ')
      .map((c) =>
        c
          .replace(/\uE000/g, '|')
          .replace(/^\|/, '')
          .replace(/\|\s*$/, ''),
      )
    if (cells.every((c) => /^-+$/.test(c.trim()))) continue // 分隔行
    const head = cells.map((c) => c.trim())
    const hit = TABLE_COLS.find(([h]) => head.includes(h))
    if (hit) {
      table = hit[0]
      descCol = hit[1]
      continue
    }
    if (descCol < 0 || cells.length <= descCol) continue
    if (cells[descCol].trim() === '—') {
      gaps.push({ component: component || '（导出表）', table, label: cells[0].trim().replace(/`/g, '') })
    }
  }
  return gaps
}

// ---------- CLI ----------
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generate } from './gen-docs.mjs'

const isMain =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').replace(/^.*[/\\]scripts[/\\]/, 'scripts/'))

if (isMain) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vcl-docs-gap-'))
  try {
    generate(tmp)
    let total = 0
    const detail = []
    for (const f of fs.readdirSync(tmp).filter((x) => x.endsWith('.md'))) {
      for (const gap of findDocGaps(fs.readFileSync(path.join(tmp, f), 'utf8'))) {
        total++
        if (detail.length < 40) detail.push(`${f} ${gap.component} ${gap.table}.${gap.label}`)
      }
    }
    console.log(`[check:doc-completeness] 说明列空缺 ${total}`)
    if (total > 0) {
      console.error('\n❌ check:doc-completeness 未通过')
      console.error(
        `   ${total} 个 API 成员缺「说明」（props/事件写 /** */ JSDoc，slot 写 <!-- @slot name: 说明 -->）：`,
      )
      detail.forEach((d) => console.error('   - ' + d))
      if (total > detail.length) console.error(`   - …另 ${total - detail.length} 条`)
      process.exit(1)
    }
    console.log('\n✅ check:doc-completeness 通过')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}
