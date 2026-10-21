#!/usr/bin/env node
/**
 * quality-check —— 27 步质量链的唯一执行器（含执行留痕）
 *
 * 为什么要有这个脚本：
 *   原先 quality-check 是 package.json 里一条 `&&` 串联的长命令。它有两个结构性缺陷
 *   （第五轮审查 R5-C14/R5-X1）：
 *     1) 任一步失败即中断，**后面还有多少步没跑**没人知道，失败点之外一片黑；
 *     2) 没有任何执行留痕（reports/ 被 gitignore、无 CI run、无时间戳），
 *        「整链通过」这句话事后无法复核——这正是它在 HEAD 上红了 10 天没人发现的原因。
 *   本脚本把步骤清单变成**单一真源**，逐步执行、逐步记录（退出码/耗时/HEAD sha），
 *   最后写 reports/quality-check-latest.json，并把「未执行」的步骤显式标出来。
 *
 * 用法：
 *   node scripts/quality-check.mjs                # 跑全部 27 步
 *   node scripts/quality-check.mjs --from=13      # 从第 13 步开始（快速复跑用）
 *   node scripts/quality-check.mjs --only=check:constants   # 只跑名字含关键字的步骤
 *   node scripts/quality-check.mjs --skip=e2e     # 跳过匹配关键字的步骤（本地快速链）
 *   node scripts/quality-check.mjs --list         # 只打印步骤清单
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, createWriteStream, readdirSync, unlinkSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

/**
 * 每步的完整输出落到 `reports/quality-check-logs/<NN>-<name>.log`（同名覆盖，只留最近一次）。
 *
 * 为什么需要：2026-10-18 整链在第 14 步 test:unit 出现过一次 exit=1，但当时输出是
 * `stdio: 'inherit'` 直接打到终端的——**失败原因随着终端滚掉了，事后无法诊断**，
 * 只能靠"单跑一遍是绿的"来猜是抖动。留痕的价值恰恰在失败那一刻，所以输出必须同时落盘。
 */
const LOG_DIR = join('reports', 'quality-check-logs')
const logNameFor = (no, name) => `${String(no).padStart(2, '0')}-${name.replace(/[:\\/]/g, '-')}.log`

/** 跑一步：输出**同时**打到终端与日志文件，返回退出码 */
function runStep(cmd, logPath) {
  return new Promise((resolve) => {
    const stream = createWriteStream(logPath, { flags: 'w' })
    const child = spawn(cmd, { shell: true })
    const tee = (chunk) => {
      process.stdout.write(chunk)
      stream.write(chunk)
    }
    child.stdout.on('data', tee)
    child.stderr.on('data', tee)
    child.on('close', (code) => {
      stream.end()
      resolve(code === null ? -1 : code)
    })
    child.on('error', (err) => {
      stream.write(`\n[runner] spawn 失败：${err?.message ?? err}\n`)
      stream.end()
      resolve(-1)
    })
  })
}

/** 27 步：与审查报告口径一致（顺序即依赖顺序） */
const STEPS = [
  ['typecheck', 'npm run typecheck'],
  ['lint', 'npm run lint'],
  ['check:constants', 'npm run check:constants'],
  ['check:css-tokens', 'npm run check:css-tokens'],
  ['check:contrast', 'node scripts/contrast-audit.mjs'],
  ['check:css-breakpoints', 'npm run check:css-breakpoints'],
  ['check:css-fonts', 'npm run check:css-fonts'],
  ['check:css-scale', 'npm run check:css-scale'],
  ['check:offline', 'npm run check:offline'],
  ['check:i18n', 'npm run check:i18n'],
  ['check:demo-props', 'npm run check:demo-props'],
  ['check:vendor-data', 'npm run check:vendor-data'],
  ['check:vendor-vulns', 'npm run check:vendor-vulns'],
  ['check:deps', 'npm run check:deps'],
  ['test:unit', 'npm run test:unit'],
  // console 噪音棘轮（R5-B18 / 路线图 6.2 #5）：紧跟 test:unit —— 单测运行时 setup.ts
  // 已把各类 warn/error 记进 spool，这里只读不重跑（--no-run）。判据是**类别集合**而非计数，
  // 所以 spool 有残留也不会误判（集合天然幂等）。
  ['check:console-noise', 'npm run check:console-noise'],
  // 性能基准守护（R5-C10）：放在 test:unit 之后 —— 此时机器已预热，
  // 更接近基线生成时的状态（冷机跑会因 JIT 未热而虚高）。
  // 定位是"防止悄悄翻倍"，不是精密守护：倍率 1.6 与绝对下限 1.0ms 均来自实测分布。
  ['bench:check', 'npm run bench:check'],
  ['check:coverage-domains', 'npm run check:coverage-domains'],
  ['build', 'npm run build'],
  ['smoke:entries', 'npm run smoke:entries'],
  ['verify:pkg', 'npm run verify:pkg'],
  ['check:licenses', 'npm run check:licenses'],
  ['check:release-consistency', 'npm run check:release-consistency'],
  ['docs:build', 'npm run docs:build'],
  ['check:docs', 'npm run check:docs'],
  ['check:doc-completeness', 'npm run check:doc-completeness'],
  // 口径单一真源（6.2 #8）：事实页漂移 + 正文手写数字与真源冲突，两件都拦。
  // 放在文档类闸口之后：它依赖 docs-site/guide/facts.md，且比上面两个更"语义"。
  ['check:facts', 'npm run check:facts'],
  // 台账/ADR 腐化（6.3 #4）：只查机械可验证项（closed 提交号真实存在、ADR 索引无死链）。
  // 放在文档类闸口末尾 —— 它最便宜（纯读文件 + git cat-file），失败时前面已经验过更重的东西。
  ['check:tech-debt', 'npm run check:tech-debt'],
  ['test:e2e', 'npm run test:e2e'],
]

const args = process.argv.slice(2)
const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}

/**
 * 快链（--quick）：给「本地提交前」用的**最小充分**集合，目标 ≈ 90s。
 *
 * 为什么需要：整链 27 步约 10 分钟，没人会在每次提交前跑它；而本仓 `git remote` 为空、
 * CI 从不执行 —— 于是「闸口存在」和「闸口执行」是两件事（报告 6.2 #2 / R5-C14）。
 * 快链把显然会坏的提交挡在本地，整链仍是唯一权威（build / e2e / 许可 / 文档都在整链里）。
 * 逃生口：`git commit --no-verify` 或 `SKIP_QUICK_CHECK=1`。
 */
const QUICK_STEPS = ['typecheck', 'lint', 'check:constants', 'check:css-tokens', 'check:i18n', 'test:unit']
const quick = args.includes('--quick')
if (args.includes('--list')) {
  STEPS.forEach(([n, c], i) => console.log(`${String(i + 1).padStart(2)}. ${n.padEnd(24)} ${c}`))
  process.exit(0)
}
const from = Number(flag('from') || 1)
const skip = flag('skip')
const only = flag('only')

let head = 'unknown'
try {
  head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
} catch {
  /* 非 git 环境不阻断 */
}

const results = []
const t0 = Date.now()
mkdirSync(LOG_DIR, { recursive: true }) // 必须在跑第一步之前建好，否则日志流打不开
/**
 * 每次跑之前清空日志目录（2026-10-19 加）。
 *
 * 起因：插入新步骤会让后续步号整体后移，而旧文件按「步号-步骤名」命名留在原地，
 * 于是同一个编号下可能同时存在两个不同步骤的日志（如 `14-test-unit.log` 是插步前的、
 * `14-check-deps.log` 是插步后的）。**我自己就被它骗过一轮**：读着插步前的旧
 * `14-test-unit.log`，得出"新 spec 没被跑到"的错误结论。
 *
 * 留痕的价值在于"反映最近一次运行"，混着历史文件就失去了这个性质。
 */
const stale = readdirSync(LOG_DIR).filter((f) => f.endsWith('.log'))
if (stale.length) console.log(`[runner] 清理旧日志：${stale.length} 个`)
for (const f of stale) {
  try {
    // 用 unlinkSync 而不是 rmSync：本机实测（Node 24 / Windows）`rmSync` 对这批文件
    // **报成功但文件仍在**（`existsSync` 仍为 true，且不抛错），而 `unlinkSync` 确实删掉。
    // 这正是"以为清了其实没清"的来源，也让旧日志一直混在留痕目录里。
    unlinkSync(join(LOG_DIR, f))
  } catch (err) {
    // 不静默：删不掉就让用户看到
    console.warn(`[runner] 旧日志清理失败（${f}）：${err?.code ?? err}`)
  }
}
console.log(`\n▶ quality-check：${STEPS.length} 步，HEAD=${head.slice(0, 7)}${quick ? `，快链档位（${QUICK_STEPS.length} 步）` : ''}${skip ? `，跳过含「${skip}」的步骤` : ''}\n`)

let brokenAt = null
for (let i = 0; i < STEPS.length; i++) {
  const [name, cmd] = STEPS[i]
  const no = i + 1
  if (no < from) {
    results.push({ no, name, cmd, status: 'skipped-before-start' })
    continue
  }
  if (skip && name.includes(skip)) {
    results.push({ no, name, cmd, status: 'skipped-by-flag' })
    console.log(`  ⏭  ${String(no).padStart(2)}. ${name}（--skip 命中）`)
    continue
  }
  if (quick && !QUICK_STEPS.includes(name)) {
    results.push({ no, name, cmd, status: 'skipped-not-in-quick' })
    continue
  }
  if (only && !name.includes(only)) {
    results.push({ no, name, cmd, status: 'skipped-not-selected' })
    console.log(`  ⏭  ${String(no).padStart(2)}. ${name}（--only 未选中）`)
    continue
  }
  const started = Date.now()
  const logFile = join(LOG_DIR, logNameFor(no, name))
  const code = await runStep(cmd, logFile)
  const secs = Math.round((Date.now() - started) / 100) / 10
  results.push({ no, name, cmd, status: code === 0 ? 'pass' : 'fail', exitCode: code, seconds: secs, logFile })
  if (code !== 0) {
    brokenAt = no
    console.error(`\n✖ 第 ${no} 步「${name}」失败（exit=${code}）——后续步骤本轮未执行`)
    console.error(`   完整输出已留存：${logFile}\n`)
    break
  }
}
// 断链后**没有进入循环**的步骤也要如实登记为「未执行」——否则留痕会谎报"未执行 0 步"
for (let i = results.length; i < STEPS.length; i++) {
  results.push({ no: i + 1, name: STEPS[i][0], cmd: STEPS[i][1], status: 'not-run-after-failure' })
}

const total = Math.round((Date.now() - t0) / 100) / 10
const ran = results.filter((r) => r.status === 'pass' || r.status === 'fail')
const failed = results.filter((r) => r.status === 'fail')
const notRun = results
  .filter((r) => r.status !== 'pass' && r.status !== 'fail')
  .map((r) => ({ no: r.no, name: r.name, reason: r.status }))

const stamp = {
  head,
  at: new Date().toISOString(),
  totalSeconds: total,
  totalSteps: STEPS.length,
  executedSteps: ran.length,
  passed: results.filter((r) => r.status === 'pass').length,
  failed: failed.length,
  failedStep: brokenAt,
  notExecuted: notRun,
  results,
}
writeFileSync(
  // 快链与整链分文件留痕：否则跑一次快链就把 quality-check-latest.json（整链的权威证据）
  // 覆盖成 6/23 的半份，读的人会以为整链没跑完。
  quick ? 'reports/quick-check-latest.json' : 'reports/quality-check-latest.json',
  JSON.stringify(stamp, null, 2),
  'utf8',
)

console.log('─'.repeat(72))
console.log(
  `质量链：${ran.length}/${STEPS.length} 步已执行，通过 ${stamp.passed}，失败 ${stamp.failed}，耗时 ${total}s${quick ? '（快链 --quick）' : ''}`,
)
if (failed.length) console.log(`失败点：第 ${failed[0].no} 步「${failed[0].name}」；其后 ${notRun.length} 步未执行`)
else if (notRun.length) console.log(`未执行 ${notRun.length} 步（--only/--skip/--from 生效时属预期）`)
if (brokenAt) console.log(`（断链位置已写入留痕的 failedStep 字段；该步完整输出见上行的 logFile）`)
console.log(
  `留痕：${quick ? 'reports/quick-check-latest.json' : 'reports/quality-check-latest.json'}（HEAD=${head.slice(0, 7)}）`,
)
console.log(`逐步日志：${LOG_DIR}/（每步一个 .log，失败时可直接回看，不再随终端滚掉）`)
process.exit(failed.length ? 1 : 0)
