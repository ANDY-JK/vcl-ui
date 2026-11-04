#!/usr/bin/env node
/**
 * 编辑态单一写入门（TD-76 收口）
 *
 * 背景：第 177 轮修 Tab 分支时发现，`editingCell.value = {...}` 手工拼状态绕过了
 * startEdit 的三个副作用（markActive / preEditCell / 清选区），表现为 Tab 后按 Escape
 * 把选中格恢复到上一格。当时只修了 Tab 这一处，没有闸口 —— 将来新增键盘入口仍可能重犯。
 *
 * 判据：`editingCell.value = {`（对象字面量赋值 = 在"建立编辑态"）在整个 src/ 只允许
 * 出现在 cell-edit.ts 的 startEdit 内。置 null（退出编辑态）不在管辖内 —— 退出路径
 * 的副作用由 commitEdit/cancelEdit 自己负责，多处合理。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

const ROOT = 'src'
const OWNER = join('src', 'components', 'data', 'composables', 'cell-edit.ts')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|vue|mjs)$/.test(name)) out.push(p)
  }
  return out
}

const offenders = []
for (const file of walk(ROOT)) {
  if (file.split(sep).join('/') === OWNER.split(sep).join('/')) continue
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    // 只拦"建立编辑态"的对象赋值；`editingCell.value = null` 是退出路径，不拦
    if (/editingCell\.value\s*=\s*\{/.test(line)) {
      offenders.push(`${file}:${i + 1}: ${line.trim().slice(0, 90)}`)
    }
  })
}

if (offenders.length) {
  console.error(`✖ 编辑态写入门：editingCell 建立态的手工赋值只允许在 cell-edit.ts 的 startEdit 内（TD-76）`)
  for (const o of offenders) console.error('  · ' + o)
  console.error('\n修法：改走 startEdit(rowKey, colKey, displayValue) —— 它负责 markActive / preEditCell / 清选区 / 聚焦。')
  process.exit(1)
}
console.log('✅ check:edit-single-writer 通过 — editingCell 建立态仅 startEdit 一处写入')
