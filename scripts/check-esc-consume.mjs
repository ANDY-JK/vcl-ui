#!/usr/bin/env node
/**
 * Esc 消费契约闸口（TD-91 收口，#280 契约的静态化）
 *
 * 契约（#280）：**谁真正消费了 Esc，谁调 preventDefault()**。
 * useEscClose 据 `defaultPrevented` 让行 —— 手写 Esc 分支若只关自己不消费，
 * 事件继续冒到 window，外层弹窗同帧被关（#280 修的正是这类"双关"）。
 *
 * 判据：`e.key === 'Escape'` 的 if 块（10 行内）必须出现 `preventDefault`。
 * 豁免：useEscClose.ts 自身（它读 defaultPrevented，是契约的裁判不是选手）；
 *       只判断不消费的**读路径**需在行内标注 `esc-passive` 才能豁免。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

const ROOT = 'src'
const EXEMPT = new Set([join('src', 'components', '_internal', 'useEscClose.ts').split(sep).join('/')])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|vue)$/.test(name)) out.push(p)
  }
  return out
}

const offenders = []
for (const file of walk(ROOT)) {
  const norm = file.split(sep).join('/')
  if (EXEMPT.has(norm)) continue
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!/\.key\s*===\s*'Escape'/.test(line)) continue
    if (line.includes('esc-passive')) continue // 显式豁免：只读路径
    // 契约常在条件行同行或其后 10 行内消费；超出即视为漏
    const window = lines.slice(i, i + 10).join('\n')
    if (!window.includes('preventDefault')) {
      offenders.push(`${norm}:${i + 1}: ${line.trim().slice(0, 80)}`)
    }
  }
}

if (offenders.length) {
  console.error('✖ check:esc-consume 未通过 —— Esc 消费点漏 preventDefault（TD-91/#280 契约）：')
  for (const o of offenders) console.error('  · ' + o)
  console.error('\n修法：在该分支里补 `e.preventDefault?.()`（消费语义）；若确属只读路径，行内加 `esc-passive` 豁免并写明理由。')
  process.exit(1)
}
console.log('✅ check:esc-consume 通过 — 全部 Esc 消费点都调用了 preventDefault（TD-91 契约成立）')
