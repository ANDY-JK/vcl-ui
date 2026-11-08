#!/usr/bin/env node
/**
 * 闸口：**跳过类用例只许减不许增**（#285）
 *
 * ## 为什么
 *
 * `test.skip(条件不满足)` 把两类完全不同的情况混在同一个出口：
 *   - 「这条断言不成立」→ 该红
 *   - 「环境/数据不满足」→ 看似无害，但它**会随时间静默变成常态**
 *
 * 本仓第 48 轮实测到代价：e2e「截图内容被截断」是用户反馈的回归锁，
 * 却因为 demo 数据里恰好没有 elipsis 截断的单元格而持续 `test.skip`，
 * 整链报「107 passed / 1 skipped」—— **那个 skipped 正是当初出问题的地方**，
 * 而且它剩下的断言（长宽比 < 3）根本没验"文本是不是全文"。
 *
 * 结论：跳过不是"通过"，必须**逐个登记理由**，且新增即失败。
 *
 * ## 判据
 *
 * 扫描 `tests/**` 里的跳过调用（`it.skip` / `describe.skip` / `test.skip` /
 * `*.skipIf` / `*.fixme` / `*.todo`），与 `ALLOWLIST` 逐项比对：
 *   - 出现未登记的点 → 失败（新增跳过必须显式登记 + 写理由）
 *   - 登记的条目已不存在 → 也失败（陈旧登记会让闸口慢慢变成摆设）
 *
 * 注释里出现的写法**不算**（本闸口先剥注释再匹配）—— 否则文档里举例说明
 * `test.skip` 就会被当成真的跳过点。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = process.cwd()

/**
 * 允许的跳过点。
 *
 * 每一项都必须写清「为什么可以跳」，并且理由要经得起追问：
 * 「依赖外部环境」可以，但同一环境**本仓已能提供**（例如 Chromium，e2e 就在跑）就不算。
 */
const ALLOWLIST = [
  {
    file: 'tests/e2e/verify-i18n-fix.spec.ts',
    pattern: "test.skip(",
    reason:
      '页面的「云端」入口由 runtimeEnv() 的开发期 VITE_ 存储配置驱动；产物模式按设计不携带任何凭证（env-guard.ts），于是只剩「本地」。这是安全承诺的必然结果，只在 E2E_PROD_ALL=1 时跳过，dev 模式照常运行',
  },
  {
    file: 'tests/e2e/table-screenshot-fit.spec.ts',
    pattern: 'test.skip(!info',
    reason:
      '虚拟滚动长表：demo 里是否含 >10000px 的虚拟表取决于示例数据。整链最近一次实测该条件成立（用例真跑），保留条件跳过而非硬失败',
  },
  {
    file: 'tests/unit/rtl-gate-robustness.spec.ts',
    pattern: 'describe.skipIf(!RUN_BEHAVIOR)',
    reason:
      '行为级验证要真启动 Chromium；放进 test:unit 会因 CPU 争用拖垮同批用例（第 149 轮实测 3 例红）。真跑路径由整链的 check:rtl-semantics 步骤每轮覆盖',
  },
  {
    file: 'tests/unit/s3-real.spec.ts',
    pattern: 'describe.skipIf(!run)',
    reason: '真实云端 CRUD 需要实桶凭据，环境变量未提供时无法执行；mock 路径已由其它用例覆盖',
  },
]

/** 剥注释：避免把文档里举例的 `test.skip` 当成真的跳过点 */
function stripComments(code) {
  let out = ''
  let i = 0
  let quote = null
  while (i < code.length) {
    const ch = code[i]
    const next = code[i + 1]
    if (quote) {
      out += ch
      if (ch === '\\') {
        out += next ?? ''
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i++
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      out += ch
      i++
      continue
    }
    if (ch === '/' && next === '/') {
      while (i < code.length && code[i] !== '\n') i++
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++
      i += 2
      continue
    }
    out += ch
    i++
  }
  return out
}

/** 跳过调用：it/describe/test + .skip/.skipIf/.fixme/.todo */
const SKIP_RE = /\b(it|describe|test|suite)\s*\.\s*(skipIf|skip|fixme|todo)\s*\(/g

function collect(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) collect(p, acc)
    else if (/\.(spec|test)\.[cm]?[jt]s$/.test(name)) acc.push(p)
  }
  return acc
}

/** 扫描根与白名单：默认扫 tests/ + 内置 ALLOWLIST；自测时用 --root/--allowlist 指到夹具 */
const rootIdx = process.argv.indexOf('--root')
const allowlistIdx = process.argv.indexOf('--allowlist')
const SCAN_DIR = rootIdx > -1 ? resolve(process.argv[rootIdx + 1]) : join(ROOT, 'tests')
const EFFECTIVE_ALLOWLIST = allowlistIdx > -1 ? JSON.parse(readFileSync(process.argv[allowlistIdx + 1], 'utf8')) : ALLOWLIST
// 只在**默认扫描**时排除 fixtures（夹具里故意放着未登记的跳过，供闸门自测用）；
// 显式 --root 指向夹具时不能排除，否则白名单会全被判成陈旧。
const files = collect(SCAN_DIR).filter((f) => rootIdx > -1 || !/[\\/]fixtures[\\/]/.test(f))
const found = []
for (const file of files) {
  const code = stripComments(readFileSync(file, 'utf8'))
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  for (const m of code.matchAll(SKIP_RE)) {
    const lineStart = code.lastIndexOf('\n', m.index) + 1
    const lineEnd = code.indexOf('\n', m.index)
    const line = code.slice(lineStart, lineEnd < 0 ? undefined : lineEnd).trim()
    found.push({ file: rel, pattern: `${m[1]}.${m[2]}(`, line })
  }
}

const problems = []

// ① 未登记的跳过点
for (const f of found) {
  const ok = EFFECTIVE_ALLOWLIST.some((a) => a.file === f.file && f.line.includes(a.pattern))
  if (!ok) problems.push({ kind: 'unregistered', ...f })
}

// ② 已登记但源码里不存在（陈旧登记）
for (const a of EFFECTIVE_ALLOWLIST) {
  const hit = found.some((f) => f.file === a.file && f.line.includes(a.pattern))
  if (!hit) problems.push({ kind: 'stale', file: a.file, pattern: a.pattern })
}

if (problems.length) {
  console.error(`\n✖ check:test-skips 发现 ${problems.length} 个问题：\n`)
  for (const p of problems) {
    if (p.kind === 'unregistered') {
      console.error(`  未登记的跳过：${p.file}`)
      console.error(`    ${p.line}`)
      console.error('    → 跳过不是"通过"。要么改成主动制造前置条件（见 #284 的写法），')
      console.error('      要么在 scripts/check-test-skips.mjs 的 ALLOWLIST 里登记理由。')
    } else {
      console.error(`  陈旧登记：${p.file} 已不含 ${p.pattern}`)
      console.error('    → 从 ALLOWLIST 里删掉，别让闸口慢慢变成摆设。')
    }
    console.error('')
  }
  process.exit(1)
}

console.log(
  `✅ check:test-skips 通过 — ${found.length} 个跳过点均已登记理由（扫描 ${files.length} 个测试文件）`,
)
