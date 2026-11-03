/**
 * 质量链闸口：模板表达式可编译性（#384 建，判据见 template-statements.mjs）
 *
 * 判据第四版（#385）：启发式定位 + **Vue 编译器权威判定**。
 * 报的是"Vite 编译到这一页会炸"的地方：多语句连写、插值里的语句、以及任何
 * 编译器拒绝的模板表达式 —— vue-tsc 都不查。
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
  console.error(`✗ ${hits.length} 处模板表达式 Vite 编译期会炸（vue-tsc 不查，#383）：`)
  for (const h of hits) {
    const tag = h.kind === 'heuristic' ? '多语句' : h.kind === 'sfc' ? 'SFC' : '编译错误'
    console.error(`  · ${h.file}:${h.line} [${tag}] ${h.attr}="${h.value}" —— 收进 script 的函数 / 修正表达式`)
  }
}
if (staleExempt.length) {
  fail = true
  console.error('✗ 豁免清单过期（行号已变或代码已改）：')
  for (const s of staleExempt) console.error(`  · ${s}`)
}

if (fail) process.exit(1)
console.log(
  `✅ check:template-statements 通过 — ${scanned} 个 .vue 模板表达式均可编译` +
    `（启发式 + 编译器双判据，豁免 ${Object.keys(EXEMPT).length} 条）`,
)
