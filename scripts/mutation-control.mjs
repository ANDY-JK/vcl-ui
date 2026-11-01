#!/usr/bin/env node
/**
 * 负向对照执行器 —— 让"变异到底有没有生效"不再靠肉眼（TD-87 / #295）
 *
 * ## 为什么需要它
 *
 * 负向对照（mutation control）是判断"用例到底有没有守住某行代码"的唯一可靠手段：
 * 删掉被测逻辑 → 用例必须红。但这件事有两个反复踩中的陷阱，两次都是**假绿**：
 *
 *   ① **变异静默没落地**：用 `String.replace` 替换时，目标文件是 CRLF 而脚本里写的是
 *      LF，`replace` 一声不响地什么都没换 → 测试全绿 → 得出"这条断言没被测到"的
 *      **相反结论**（第 55 轮 #291 实测）。
 *   ② **变异把代码改坏**：挪动模板行导致标签不配对，vitest 报 `no tests` —— 退出码非 0、
 *      看起来"红了"，但红的原因不是断言失败，而是**根本没跑起来**（第 58 轮 #294 实测）。
 *
 * 本脚本把三件事合成一条命令，并且**在跑测试前后都做断言**：
 *   1. 变异前：目标片段必须**恰好出现一次**（0 次 / 多次都报错，并提示行尾符不一致）；
 *   2. 变异后：**文件哈希必须变化**（否则说明写入没生效）；
 *   3. 跑命令后：输出里出现 `no tests` / 语法错误 → 判 **INVALID**（不是红，是无效对照）；
 *   4. 还原后：哈希必须回到原值。
 *
 * ## 用法
 *
 *   node scripts/mutation-control.mjs \
 *     --file src/components/x.ts \
 *     --find "return true" \
 *     --replace "return false" \
 *     --cmd "npx vitest run tests/unit/x.spec.ts --no-coverage" \
 *     --expect red
 *
 * `--expect red|green|invalid` 缺省为 red。分类与期望不符时退出码 1。
 * `--find` / `--replace` 支持 `\n` 转义（会被还原成换行）。
 */
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback
}

/* ════════════════════════════════════════
 * --self-test：用临时夹具把三种分类各跑一遍（整链第 9 步用，约 1s）
 * 目的不是"测业务"，而是**证明这把尺子本身还准** —— 尺子坏了，
 * 之前所有"负向对照通过"的结论都要重来。
 * ════════════════════════════════════════ */
if (process.argv.includes('--self-test')) {
  const dir = mkdtempSync(join(tmpdir(), 'mutctl-selftest-'))
  const fixture = join(dir, 'fixture.txt')
  const run = (args) => {
    try {
      const out = execSync(`node "${process.argv[1]}" ${args}`, { encoding: 'utf8', stdio: 'pipe' })
      return { code: 0, out }
    } catch (e) {
      return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
    }
  }
  const results = []

  // A. 变异落地 + 命令失败 → red
  writeFileSync(fixture, 'alpha\nbeta\ngamma\n')
  let r = run(`--file "${fixture}" --find "beta" --replace "BETA" --cmd "node -e process.exit(1)" --expect red`)
  results.push({ name: 'A 变异落地 → red', ok: r.code === 0 && /结论：✅ 红/.test(r.out), out: r.out })

  // B. 目标不存在 → 必须报错（不能静默当绿）
  r = run(`--file "${fixture}" --find "不存在的片段" --replace "x" --cmd "node -e process.exit(0)"`)
  results.push({ name: 'B 目标不存在 → 报错', ok: r.code === 1 && /出现 0 次/.test(r.out), out: r.out })

  // C. 命令输出 no tests → 判 invalid（不是 red）
  r = run(
    `--file "${fixture}" --find "beta" --replace "BETA" --cmd "node -e console.log('Tests  no tests')" --expect invalid`,
  )
  results.push({ name: 'C no tests → invalid', ok: r.code === 0 && /无效对照/.test(r.out), out: r.out })

  // D. find === replace（变异未落地）→ 必须报错
  r = run(`--file "${fixture}" --find "beta" --replace "beta" --cmd "node -e process.exit(1)"`)
  results.push({ name: 'D 变异未落地 → 报错', ok: r.code === 1 && /哈希未变化/.test(r.out), out: r.out })

  // E. 夹具已被还原（证明不会留下脏文件）
  results.push({ name: 'E 夹具已还原', ok: readFileSync(fixture, 'utf8') === 'alpha\nbeta\ngamma\n', out: '' })

  const bad = results.filter((x) => !x.ok)
  for (const x of results) console.log(`  ${x.ok ? '✓' : '✗'} ${x.name}`)
  if (bad.length) {
    console.error(`\n✖ mutation-control 自检未通过 ${bad.length}/${results.length}`)
    for (const x of bad) console.error(`\n--- ${x.name} ---\n${x.out.split('\n').slice(-8).join('\n')}`)
    process.exit(1)
  }
  console.log(`✅ check:mutation-tool 通过 — 负向对照执行器 4 种分类 + 还原全部正确`)
  process.exit(0)
}
const file = arg('file')
const find = arg('find')
const replace = arg('replace')
const cmd = arg('cmd')
const expect = arg('expect', 'red')

if (!file || find === null || replace === null || !cmd) {
  console.error('用法: node scripts/mutation-control.mjs --file <path> --find <literal> --replace <literal> --cmd <command> [--expect red|green|invalid]')
  process.exit(1)
}

/** 把命令行里的字面 \n 还原成换行（PowerShell 传多行参数很别扭） */
const unesc = (s) => s.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
const findStr = unesc(find)
const replaceStr = unesc(replace)

const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 12)

const original = readFileSync(file)
const originalSha = sha(original)
const text = original.toString('utf8')

/* ── ① 变异前：目标必须恰好出现一次 ── */
const occurrences = text.split(findStr).length - 1
if (occurrences === 0) {
  // 行尾符不一致是最容易被忽略的原因：给出可操作提示，而不是只说"没找到"
  const lf = findStr.replace(/\r\n/g, '\n')
  const hitWithLf = text.replace(/\r\n/g, '\n').includes(lf)
  console.error(`✖ 变异未生效：目标片段在 ${file} 中出现 0 次。`)
  if (hitWithLf) {
    console.error('  提示：把行尾符统一成 LF 后能匹配上 —— 文件是 CRLF，而 --find 写的是 LF。')
    console.error('  建议：改用只含单行的片段，或先 node scripts/mutation-control.mjs --file ... 前把 \\r\\n 显式写出。')
  }
  process.exit(1)
}
if (occurrences > 1) {
  console.error(`✖ 变异目标不唯一：出现 ${occurrences} 次，请给出更长的上下文片段。`)
  process.exit(1)
}

/* ── ② 写入并确认落盘 ── */
const backup = join(mkdtempSync(join(tmpdir(), 'mutctl-')), 'backup')
copyFileSync(file, backup)
const mutated = text.replace(findStr, replaceStr)
writeFileSync(file, mutated)
const mutatedSha = sha(readFileSync(file))
if (mutatedSha === originalSha) {
  console.error('✖ 写入后文件哈希未变化 —— 变异没有落地。')
  copyFileSync(backup, file)
  process.exit(1)
}

/* ── ③ 跑命令并分类 ── */
let output = ''
let exitCode = 0
try {
  output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' })
} catch (e) {
  output = `${e.stdout ?? ''}${e.stderr ?? ''}`
  exitCode = e.status ?? 1
}

const INVALID_PATTERNS = [
  /no tests/i,
  /Failed to parse/i,
  /SyntaxError/i,
  /Unexpected token/i,
  /Transform failed/i,
  /Error: Cannot find module/i,
]
const invalid = INVALID_PATTERNS.some((re) => re.test(output))

/* ── ④ 还原并确认回到原样 ── */
copyFileSync(backup, file)
const restoredSha = sha(readFileSync(file))
if (restoredSha !== originalSha) {
  console.error(`✖ 还原失败！${file} 的哈希是 ${restoredSha}，期望 ${originalSha}。请手工检查。`)
  process.exit(1)
}

const verdict = invalid ? 'invalid' : exitCode === 0 ? 'green' : 'red'
const label = {
  red: '✅ 红（用例守住了这段逻辑）',
  green: '⚠️ 绿（用例没守住 —— 变异后仍全过）',
  invalid: '✖ 无效对照（变异把代码改坏了，红的原因不是断言失败）',
}[verdict]

console.log(`变异：${file}  ${originalSha} → ${mutatedSha}（已还原 ${restoredSha}）`)
console.log(`命令退出码：${exitCode}`)
console.log(`结论：${label}`)
if (verdict === 'invalid') {
  console.log('\n输出摘要：')
  console.log(output.split('\n').slice(0, 12).join('\n'))
}

if (verdict !== expect) {
  console.error(`\n✖ 与期望不符：期望 ${expect}，实际 ${verdict}`)
  process.exit(1)
}
