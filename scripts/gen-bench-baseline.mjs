/**
 * gen-bench-baseline —— 生成性能基线（跨多次运行取中位数）
 *
 * 为什么不是"跑一次 bench --json 存下来"：
 * 实测 `表格客户端排序` 单次 median 在 46–73ms 之间波动（±25%），一次取样会把
 * **运气最好的一次**固化成基线，之后正常运行也会被误判成回归。
 *
 * 做法：跑 N 次 bench，每个场景取**各次 median 的中位数**作为基线值。
 * 这样基线代表"这台机器上的典型值"，而不是"最好值"。
 *
 * 用法：npm run bench:baseline（默认 3 次）
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RUNS = Number(process.argv.find((a) => a.startsWith('--runs='))?.split('=')[1] ?? 3)

console.log(`▶ 生成性能基线：跑 ${RUNS} 次取中位数（单次取样会把"运气最好的一次"固化成基线）\n`)

const samples = []
/** 每次运行的算力校准值（ms） */
const calibrations = []
for (let i = 1; i <= RUNS; i++) {
  process.stdout.write(`  第 ${i}/${RUNS} 次…`)
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts', 'bench.mjs'), '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const parsed = JSON.parse(out)
  samples.push(parsed.scenarios)
  // 校准值也一并收集：基线要记住"这份基线是在什么算力下测的"，
  // 否则日后无法判断「今天慢了」是代码回归还是机器变慢
  if (typeof parsed.calibrationMs === 'number') calibrations.push(parsed.calibrationMs)
  console.log(` ${parsed.scenarios.length} 个场景（校准 ${parsed.calibrationMs ?? '?'}ms）`)
}

/** 取中位数（偶数个取中间两个的平均） */
function median(xs) {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const names = samples[0].map((s) => s.name)
const scenarios = names.map((name) => {
  const pick = (field) => samples.map((run) => run.find((s) => s.name === name)?.[field] ?? 0)
  const medians = pick('median')
  return {
    name,
    // 基线用 median-of-medians：代表"典型值"
    median: Number(median(medians).toFixed(4)),
    mean: Number(median(pick('mean')).toFixed(4)),
    min: Number(Math.min(...pick('min')).toFixed(4)),
    // 存下各次取样，便于日后判断"基线本身是不是抖的"
    samples: medians.map((m) => Number(m.toFixed(4))),
  }
})

const baseline = {
  node: process.version,
  runs: RUNS,
  // 算力校准（取各次最优）：check 时用它判断「今天这台机器还比得上基线时吗」。
  // 没有这个值，任何跨环境的耗时对比都是不可解释的 —— 实测同代码同机器连跑 6 次
  // 波动可达 2.6 倍（降频/后台负载），光看耗时永远分不清代码回归与环境变慢。
  calibrationMs: calibrations.length ? Number(Math.min(...calibrations).toFixed(3)) : null,
  // 记录生成方式，避免下一个人以为这是单次实测
  note: `每个场景取 ${RUNS} 次运行 median 的中位数；判定用 median，倍率与绝对下限见 scripts/bench.mjs`,
  scenarios,
}

writeFileSync(join(ROOT, 'bench-baseline.json'), `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')

console.log('\n┌─ 基线（median-of-medians） ─────────────────────────────')
for (const s of scenarios) {
  const spread = s.samples.length > 1 ? `（取样 ${s.samples.map((x) => x.toFixed(2)).join(' / ')}）` : ''
  console.log(`│ ${s.median.toFixed(3).padStart(9)} ms  ${s.name}${spread}`)
}
console.log('└────────────────────────────────────────────────────────')
console.log('\n✅ bench-baseline.json 已更新')
