#!/usr/bin/env node
/**
 * 测试强度回归（#300）—— 把「变异审计」变成可复跑的清单
 *
 * ## 与 coverage 的分工
 *
 * - 覆盖率回答：**这段代码跑过没有**
 * - 本清单回答：**这段行为守住了没有**（改坏之后有没有用例红）
 *
 * 覆盖率高的地方最容易藏弱断言，因为没人觉得那里需要补（#298 实测：
 * `useTableFilter.applyFilter` 分支覆盖不低，但"全选 == 不筛选"完全没断言）。
 *
 * ## 用法
 *
 *   node scripts/mutation-audit.mjs              # 跑全部条目
 *   node scripts/mutation-audit.mjs filter esc   # 只跑 id 含这些关键词的条目
 *
 * 每条都委托给 `scripts/mutation-control.mjs`（它负责：目标唯一性、变异落地、
 * invalid 分类、还原校验）。本脚本只做编排与汇总。
 *
 * `expect` 取值：
 * - `red`        该行为必须有用例守着（变异后必须红）
 * - `equivalent` 等价变异（语义相同，跑出来是绿也正常）—— 记在清单里是为了
 *                **阻止后人重复调查**，否则每次审计都要重新论证一遍
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const MANIFEST = 'scripts/mutation-audit.manifest.json'
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const filters = process.argv.slice(2).filter((a) => !a.startsWith('--'))

const entries = manifest.entries.filter(
  (e) => filters.length === 0 || filters.some((f) => e.id.includes(f) || e.file.includes(f)),
)

if (!entries.length) {
  console.error(`没有匹配的条目（过滤词：${filters.join(', ') || '（无）'}）`)
  process.exit(1)
}

/* ════════════════════════════════════════
 * --check-manifest：只校验清单本身没漂移（进整链，约 1s）
 *
 * 为什么需要：清单里的 `find` 是**源码字面量**，一旦有人改了实现，
 * 变异目标就消失 —— 那时再跑审计会报"目标出现 0 次"，而**没人会注意到**
 * 因为它只是一条命令。把"清单还指得准"做成闸口，比指望大家定期手跑更实在。
 * ════════════════════════════════════════ */
if (process.argv.includes('--check-manifest')) {
  const { readFileSync: rf, existsSync } = await import('node:fs')
  const problems = []
  const seen = new Set()
  for (const e of manifest.entries) {
    if (seen.has(e.id)) problems.push(`${e.id}：id 重复`)
    seen.add(e.id)
    if (!['red', 'equivalent'].includes(e.expect)) problems.push(`${e.id}：expect 只能是 red / equivalent`)
    if (!e.note || e.note.length < 8) problems.push(`${e.id}：note 太短（要写"变异后用户会看到什么"）`)
    if (!existsSync(e.file)) {
      problems.push(`${e.id}：文件不存在 ${e.file}`)
      continue
    }
    const src = rf(e.file, 'utf8')
    const n = src.split(e.find).length - 1
    if (n !== 1) problems.push(`${e.id}：目标片段在 ${e.file} 中出现 ${n} 次（应为 1）`)
    // cmd 里引用的 spec 文件必须存在，否则变异跑起来只会 "no tests"
    const spec = /tests\/[\w./-]+\.spec\.ts/.exec(e.cmd)
    if (!spec || !existsSync(spec[0])) problems.push(`${e.id}：cmd 里的 spec 文件不存在（${spec?.[0] ?? '未识别'}）`)
  }
  if (problems.length) {
    console.error(`✖ mutation-audit 清单已漂移（${problems.length} 处）：`)
    for (const p of problems) console.error(`  · ${p}`)
    console.error('\n修法：把 find/replace 更新到当前源码；若该行为已不适用，删条目并说明。')
    process.exit(1)
  }
  console.log(`✅ check:mutation-audit 通过 — ${manifest.entries.length} 条变异目标全部指向现有源码、且唯一`)
  process.exit(0)
}
const rows = []
for (const e of entries) {
  process.stdout.write(`  ${e.id} … `)
  let verdict
  let detail = ''
  try {
    execFileSync(
      process.execPath,
      [
        'scripts/mutation-control.mjs',
        '--file',
        e.file,
        '--find',
        e.find,
        '--replace',
        e.replace,
        '--cmd',
        e.cmd,
        '--expect',
        e.expect === 'equivalent' ? 'green' : 'red',
      ],
      { encoding: 'utf8', stdio: 'pipe' },
    )
    verdict = e.expect === 'equivalent' ? 'equivalent' : 'red'
  } catch (err) {
    const out = `${err.stdout ?? ''}${err.stderr ?? ''}`
    // 从子进程输出里捞结论行，便于汇总
    const m = /结论：(.*)/.exec(out)
    detail = m ? m[1].trim() : out.split('\n').slice(-2).join(' ')
    verdict = /无效对照/.test(out) ? 'invalid' : /⚠️ 绿/.test(out) ? 'green' : 'error'
  }
  const ok = verdict === (e.expect === 'equivalent' ? 'equivalent' : 'red')
  rows.push({ id: e.id, expect: e.expect, verdict, ok, detail })
  console.log(ok ? `✓ ${verdict}` : `✗ ${verdict}`)
}

const bad = rows.filter((r) => !r.ok)
const redCount = rows.filter((r) => r.verdict === 'red').length
const eqCount = rows.filter((r) => r.verdict === 'equivalent').length

console.log(`\n共 ${rows.length} 条：守住 ${redCount} · 等价变异 ${eqCount} · 异常 ${bad.length}`)
if (bad.length) {
  console.error('\n✗ 以下条目与期望不符（说明对应行为没有用例守住，或变异本身失效）：')
  for (const r of bad) {
    console.error(`  · ${r.id}（期望 ${r.expect}，实际 ${r.verdict}）`)
    if (r.detail) console.error(`    ${r.detail}`)
  }
  console.error('\n修法：要么补一条能红的用例，要么在清单里改成 equivalent 并写明为什么等价。')
  process.exit(1)
}