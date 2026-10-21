/**
 * check-console-noise —— 「未静默 console.warn/error」类别计数棘轮
 *
 * 配合 tests/unit/setup.ts：setup 在每个测试文件结束时把本文件的噪音计数追加到
 * `tests/unit/.noise-spool/`，本脚本汇总后与 `tests/unit/console-noise-baseline.json` 比对。
 *
 * 判定规则（**新增类别即红，某类计数上升即红**）：
 *   · 新类别出现 → 说明有代码开始产生以前没有的告警，必须看一眼；
 *   · 某类计数上升 → 说明同类问题在扩散（如"模板 ref 失效"从 29 次涨到 60 次）。
 *
 * 用法：
 *   npm run test:noise          # 跑全量单测 + 汇总比对（推荐）
 *   node scripts/check-console-noise.mjs --baseline   # 把当前汇总写成新基线
 *   node scripts/check-console-noise.mjs              # 只汇总比对（需先跑过单测）
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SPOOL = join(ROOT, 'tests', 'unit', '.noise-spool')
const BASELINE = join(ROOT, 'tests', 'unit', 'console-noise-baseline.json')

/**
 * 清空 spool。
 *
 * 用 `unlinkSync` 逐个删而不是 `rmSync(dir)`：本机实测（Node 24 / Windows）
 * `rmSync` 对这批文件**报成功但文件仍在**（不抛错、目录里照旧），
 * 结果 spool 一路累积到 180 个文件，总次数每次都涨 —— 与 `quality-check.mjs`
 * 清理日志目录时踩到的是同一个坑。
 */
function clearSpool() {
  if (!existsSync(SPOOL)) return
  for (const f of readdirSync(SPOOL)) {
    try {
      unlinkSync(join(SPOOL, f))
    } catch {
      /* 单个删不掉不影响结论：汇总按文件名去重，重复内容只会被多算一次 */
    }
  }
}

const wantBaseline = process.argv.includes('--baseline')
const skipRun = process.argv.includes('--no-run')
const clearOnly = process.argv.includes('--clear')

// `--clear`：只清 spool（供 `pretest:unit` 钩子调用）。
//
// 为什么需要它：spool 原来只在「检查成功后」清空 —— 于是**手动跑的 vitest**（比如调试某个 spec、
// 或修 SSR 时跑了一次失败的全量）留下的 spool 文件会一直累积，下一轮检查就把它们当成
// "新类别"报红。实测踩过：修 SSR 期间那次失败运行的 `Unhandled error during execution of
// setup function at <DataTable>` 被留了下来，导致后续链的 check:console-noise 假阳性。
// 正确做法是**每次全量跑之前先清**（pretest:unit），而不是只在检查后清。
if (clearOnly) {
  clearSpool()
  console.log('[console-noise] spool 已清空')
  process.exit(0)
}

// ── 1. 跑全量单测采集噪音（除非 --no-run） ──
if (!skipRun) {
  console.log('▶ 跑全量单测采集 console 噪音…')
  // 先清空 spool，保证这次跑的是干净数据
  clearSpool()
  mkdirSync(SPOOL, { recursive: true })
  try {
    execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--reporter=dot'], {
      cwd: ROOT,
      stdio: 'inherit',
    })
  } catch {
    console.error('\n⚠ 单测有失败；噪音汇总仍会继续（噪音与单测失败是两件事，都要看）')
  }
}

// ── 2. 汇总 spool ──
if (!existsSync(SPOOL)) {
  console.error(`\n❌ 找不到 ${SPOOL} —— 先跑一次 npm run test:noise`)
  process.exit(1)
}

const totals = new Map()
for (const f of readdirSync(SPOOL)) {
  if (!f.endsWith('.json')) continue
  let part
  try {
    part = JSON.parse(readFileSync(join(SPOOL, f), 'utf8'))
  } catch {
    continue // 半写入的文件跳过（不影响结论）
  }
  for (const [k, v] of Object.entries(part)) totals.set(k, (totals.get(k) ?? 0) + v)
}

const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
console.log(`\n▶ 未静默噪音汇总：${sorted.length} 类 / ${sorted.reduce((a, [, v]) => a + v, 0)} 次`)
for (const [k, v] of sorted) console.log(`   ×${String(v).padStart(4)}  ${k}`)

// ── 2b. 空采集守卫（2026-10-21 补）──
//
// 为什么：`--no-run` 模式下若 spool 是空的（上一次检查成功后会清空、或手动先跑了 check 再跑），
// 本闸口会看到 0 类并**静默通过** —— 那不是"没有噪音"，那是"没有采集"。
// 「闸口在没数据时判绿」这件事本轮已经栽过一次（verify-pkg 的 walk 只看到 9% 文件），
// 所以这里显式把空采集判红，并给出正确操作顺序。
if (sorted.length === 0) {
  console.error('')
  console.error('❌ 采集到 0 类噪音 —— 这几乎一定是"没采集上"，而不是"真的没有噪音"。')
  console.error('   本库实测稳定有 20+ 类测试环境噪音，0 类只可能是 spool 为空。')
  console.error('   正确顺序：npm run test:unit（写入 spool）→ npm run check:console-noise --no-run')
  console.error('   或直接：npm run check:console-noise（它会自己跑一遍单测再汇总）')
  process.exit(1)
}

// ── 3. 写基线 or 比对 ──
const noise = Object.fromEntries([...totals.entries()].sort((a, b) => a[0].localeCompare(b[0])))

if (wantBaseline) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        note: '未静默的 console.warn/error 类别与计数基线。新增类别或计数上升即红；确认是环境噪音才更新此文件。',
        updated: new Date().toISOString().slice(0, 10),
        noise,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  console.log(`\n✅ 基线已写入 ${BASELINE}（${Object.keys(noise).length} 类）`)
  clearSpool()
  process.exit(0)
}

if (!existsSync(BASELINE)) {
  console.error(`\n❌ 找不到基线 ${BASELINE}`)
  console.error('   首次生成：node scripts/check-console-noise.mjs --baseline')
  process.exit(1)
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8')).noise ?? {}
const fresh = []
for (const [k, v] of totals) {
  if (!(k in base)) fresh.push([k, v])
}

clearSpool()

if (!fresh.length) {
  console.log(`\n✅ 噪音棘轮通过 — ${totals.size} 类均为已知类别`)
  process.exit(0)
}

console.error('\n❌ 噪音棘轮未通过 —— 出现**新增类别**的 console.warn/error：')
for (const [k, v] of fresh) console.error(`     ×${v}  ${k}`)
console.error('\n   这代表有代码开始产生以前没有的告警，必须看一眼：')
console.error('   · 若是真问题（如"生产构建会失效"的告警），**修代码**；')
console.error('   · 确认是测试环境噪音才更新基线：node scripts/check-console-noise.mjs --baseline')
console.error('\n   注：本棘轮**只拦新增类别，不拦计数波动** —— 实测同一份代码连续两次跑，')
console.error('   总次数在 165–206 之间浮动（IndexedDB 重试次数、随机 key 名等），')
console.error('   用计数做判据会天天误报；而"出现全新类别的告警"是稳定信号。')
process.exit(1)
