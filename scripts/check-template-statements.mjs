/**
 * 质量链闸口：模板表达式多语句（#384，判据见 template-statements.mjs）
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { check } from './template-statements.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

// 豁免：文件:行 → 理由（双向对账，行号变了就过期）
const EXEMPT = {}

const { hits, staleExempt, scanned } = check(join(ROOT, 'src'), EXEMPT)

if (scanned < 100) {
  console.error(`✗ 扫到的 .vue 只有 ${scanned} 个 —— 先怀疑扫描器坏了`)
  process.exit(1)
}

let fail = false
if (hits.length) {
  fail = true
  console.error(`✗ ${hits.length} 处模板表达式含多语句（Vite 编译期炸、vue-tsc 不查，#383）：`)
  for (const h of hits) console.error(`  · ${h.file}:${h.line} ${h.attr}="${h.value}" —— 收进 script 的函数`)
}
if (staleExempt.length) {
  fail = true
  console.error('✗ 豁免清单过期（行号已变或代码已改）：')
  for (const s of staleExempt) console.error(`  · ${s}`)
}

if (fail) process.exit(1)
console.log(`✅ check:template-statements 通过 — ${scanned} 个 .vue 无模板多语句（豁免 ${Object.keys(EXEMPT).length} 条）`)
