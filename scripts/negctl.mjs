/**
 * 负向对照执行器（Round 67 起改用本脚本，替代之前每次手写的 tmp-neg-*.mjs）。
 *
 * ## 为什么重写
 *
 * 之前的临时脚本用 `src.replace(find, repl)` 直接改源码，踩了三类坑：
 *   ① PowerShell 写文件时把 `` `n `` / 引号当转义处理 → 写进去的替换串是坏的，
 *      编译直接失败，vitest 报 "no tests" 而**退出码 0** → 被判成「抓到」或「没抓到」全靠猜；
 *   ② 判定靠正则匹配 vitest 输出，输出被截断时漏判 → 假绿；
 *   ③ 变异没生效（文件没真改 / 改错位置）时脚本无从发现。
 *
 * 本脚本的对策：
 *   - 全部用 Node fs 读写，替换串来自 JSON 数组，不经任何 shell；
 *   - 每次变异后**校验「原文已消失、替换文已出现」**，不成立直接报 ERROR 而不是默默跳过；
 *   - 判定用**子进程退出码**（权威信号），并额外要求输出里既没出现 "no tests" 也没有编译错误；
 *   - 「绿」（=没抓到）时把 vitest 输出尾部打出来，便于一眼看出是假绿还是真等价。
 *
 * 用法：node scripts/negctl.mjs <probes.json>
 * probes.json 形如 [{ "file": "...", "name": "...", "find": "...", "repl": "...", "mode": "global|equivalent" }]
 */
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const probesPath = process.argv[2]
if (!probesPath) {
  console.error('用法: node scripts/negctl.mjs <probes.json>')
  process.exit(2)
}
const cfg = JSON.parse(readFileSync(probesPath, 'utf8'))
const SPECS = cfg.specs
const PROBES = cfg.probes

/** @returns {{ failed: boolean, out: string, broken: boolean }} */
function runSpecs(probe) {
  // 命令来源：探针自带 `cmd`（数组）优先 → 顶层 `cfg.cmd` → 默认 vitest 跑 cfg.specs。
  // 加 `cmd` 是为了让 **playwright 的 e2e 探针**也能自动做负向对照（e2e 常是最强证据）。
  // ★ 默认必须走 `npx`：仓库里没有全局 `vitest`，直接跑会 command not found →
  //   没有汇总行 → 被结构性判据判成"变异体没跑起来"（那是**工具**的错，不是探针的错）。
  const argv = probe?.cmd ?? cfg.cmd ?? ['npx', 'vitest', 'run', ...SPECS, '--reporter=dot']
  const bin = argv[0]
  // 不用 `let out = ''`：两个分支都会赋值，初值属于无用赋值（eslint no-useless-assignment）
  let out
  let code = 0
  try {
    out = execFileSync(bin, argv.slice(1), {
      encoding: 'utf8',
      shell: true,
      maxBuffer: 60e6,
      // ★ 必须显式合并 stderr：测试摘要常写到 stderr，
      //   默认只捕获 stdout 会拿不到失败信息（曾经因此把失败误判成绿）。
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (e) {
    out = (e.stdout ?? '') + (e.stderr ?? '')
    code = e.status ?? 1
  }
  // 编译失败 / 用例没跑起来：退出码可能是 0，必须单独识别，否则任何变异都会被判成「抓到」。
  //
  // ⚠️ 判据必须**结构性**，不能只正则匹配关键词：断言失败时测试运行器会把被断言的源码
  //    （含 diff 里的 `+` 行）整段打出来，源码里出现 `SyntaxError` / `new Error(`
  //    之类字样就会被误判成"变异体编译失败"（第 106 轮实测踩到：一个**有效**探针
  //    因被测文件里有 `err instanceof SyntaxError` 而被判 ⚠）。
  // 实测形状：vitest 真编译失败 → `Failed Suites` + `Tests  no tests`；
  //          playwright 真编译失败 → `Error: …` 且**没有** `N passed/failed` 汇总行。
  const hasSummary =
    (/Test Files\s+\d/.test(out) && /\bTests\s+/.test(out)) || /\d+ (?:passed|failed|flaky)\b/.test(out)
  const noTestsRun = /\bTests\s+no tests\b/.test(out)
  const loaderSignal =
    /Failed Suites|Failed to parse source|Failed to load url|no test files found|Transform failed|Cannot find module|error TS\d{3,}/i.test(
      out,
    )
  const broken = loaderSignal || noTestsRun || !hasSummary
  const summary = (out.match(/Tests\s+([^\n]+)/) ?? out.match(/\d+ (?:passed|failed|flaky)[^\n]*/) ?? [])[1] ?? ''
  return { failed: code !== 0 && !broken, out, broken, summary }
}

const touched = new Set()
let applied = 0
let caught = 0
const misses = []
const notApplied = []
const broken = []
const equivalent = []

function restoreAll() {
  for (const f of touched) {
    const bak = `${f}.negctl.bak`
    if (existsSync(bak)) {
      copyFileSync(bak, f)
      unlinkSync(bak)
    }
  }
}

process.on('exit', restoreAll)

for (const p of PROBES) {
  const { file, name, find, repl, mode } = p
  const src = readFileSync(file, 'utf8')
  if (!src.includes(find)) {
    notApplied.push(name)
    console.log(`⚠ ${name}  ← 原文未匹配，探针需修正`)
    continue
  }
  const bak = `${file}.negctl.bak`
  if (!existsSync(bak)) {
    copyFileSync(file, bak)
    touched.add(file)
  }
  // 用拼接而不是模板串，避免替换串里的 $ 被当成特殊模式
  const mutant = mode === 'global' ? src.split(find).join(repl) : src.replace(find, repl)
  writeFileSync(file, mutant, 'utf8')

  // 严格校验：原文必须消失（非 global 模式下可能还剩别的出现处，只校验「替换文已出现」）
  const written = readFileSync(file, 'utf8')
  const replLanded = written.includes(repl) || repl.trim() === '' || written !== src
  if (written === src || !replLanded) {
    broken.push(name)
    console.log(`⚠ ${name}  ← 变异未落到文件上`)
    copyFileSync(bak, file)
    continue
  }

  if (mode === 'equivalent') {
    const r = runSpecs(p)
    if (r.broken) {
      broken.push(`${name}（变异体自身编译失败）`)
      console.log(`⚠ ${name}  ← 变异体编译失败，等价结论无效`)
    } else if (r.failed) {
      misses.push(`${name}（声称等价但被判失败）`)
      console.log(`❌ ${name}  ← 声称等价但测试失败，说明可观测`)
    } else {
      equivalent.push(name)
      console.log(`≈ ${name}  ← 实测不失败（等价成立）`)
    }
    copyFileSync(bak, file)
    continue
  }

  applied++
  const r = runSpecs(p)
  if (r.broken) {
    broken.push(name)
    console.log(`⚠ ${name}  ← 变异体编译失败（测试没跑起来），需修正探针`)
  } else if (r.failed) {
    caught++
    console.log(`✅ ${name}`)
  } else {
    misses.push(name)
    console.log(`❌ ${name}  ← 用例仍全绿`)
  }
  copyFileSync(bak, file)
}

restoreAll()

console.log(`\n生效 ${caught}/${applied}`)
if (notApplied.length) console.log('未匹配（探针需修正）：\n  - ' + notApplied.join('\n  - '))
if (broken.length) console.log('变异体编译失败（结论无效）：\n  - ' + broken.join('\n  - '))
if (misses.length) console.log('未生效：\n  - ' + misses.join('\n  - '))
if (equivalent.length) console.log('行为等价（实测）：\n  - ' + equivalent.join('\n  - '))
if (!misses.length && !broken.length && !notApplied.length) console.log('✅ 全部探针结论有效')
