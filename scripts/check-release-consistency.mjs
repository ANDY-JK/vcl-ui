/**
 * check:release-consistency —— 版本三件套对齐闸口（审查 R5-C16 / 路线图 6.2 #1）
 *
 * 立此存照的问题：`package.json` 说 2.0.0、`v2.0.0` tag 指向 09-21 的提交、
 * 而 CHANGELOG 的 `[Unreleased]` 段是空的 —— 三处各自"看起来正常"，
 * 合起来却说不清"当前到底是哪个版本、发了什么"。这类分裂靠人盯不住。
 *
 * 本闸口断言四件事：
 *   ① package.json.version 有对应的 `v<version>` tag
 *   ② 该 tag 是 HEAD 的祖先（否则说明版本号领先于 tag，或 tag 打错了地方）
 *   ③ CHANGELOG 有 `## [<version>]` 段（发布说明不能缺）
 *   ④ **`[Unreleased]` 段与「tag 之后是否有提交」保持一致**：
 *      · tag 之后有提交 → `[Unreleased]` 不能只有标题（否则发布后累积的变更无处可查）
 *      · tag 之后无提交 → `[Unreleased]` 应为空（否则是过期残留）
 *
 * 刻意不做的判断：
 *   · 不校验语义化版本的"该不该升" —— 那需要判断改动是否破坏性，机器判不准；
 *   · 不要求 tag 必须指向 HEAD —— 发布后继续开发是常态，tag 落后于 HEAD 是正常的。
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const failures = []
const notes = []

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

// ── 读 package.json 版本 ──────────────────────────────
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const version = pkg.version
if (!version) {
  console.error('❌ check:release-consistency —— package.json 缺 version 字段')
  process.exit(1)
}
const tag = `v${version}`
console.log(`[1] package.json version = ${version}（期望 tag = ${tag}）`)

// ── ① tag 是否存在 ────────────────────────────────────
const tagExists = run(`git rev-parse --verify --quiet refs/tags/${tag}`) !== null
if (!tagExists) {
  failures.push(`找不到 tag ${tag}（package.json 说 ${version}，但没有发布标记）`)
} else {
  notes.push(`tag ${tag} 存在`)
}

// ── ② tag 是否为 HEAD 祖先 ────────────────────────────
if (tagExists) {
  // merge-base --is-ancestor 是"退出码即结论"：成功时无输出，所以不能用 run() 的返回值判断
  let ok
  try {
    execSync(`git merge-base --is-ancestor ${tag} HEAD`, { stdio: 'ignore' })
    ok = true
  } catch {
    ok = false
  }
  if (!ok) failures.push(`tag ${tag} 不是 HEAD 的祖先（版本号与历史脱节）`)
  else notes.push(`tag ${tag} 是 HEAD 祖先`)
}

// ── ③ CHANGELOG 有对应版本段 ──────────────────────────
let changelog = ''
try {
  changelog = readFileSync('CHANGELOG.md', 'utf8')
} catch {
  failures.push('找不到 CHANGELOG.md')
}
const versionHeading = `## [${version}]`
if (changelog && !changelog.includes(versionHeading)) {
  failures.push(`CHANGELOG 缺少版本段「${versionHeading}」`)
} else if (changelog) {
  notes.push(`CHANGELOG 含「${versionHeading}」段`)
}

// ── ④ [Unreleased] 与 tag 之后是否有提交保持一致 ──────
if (changelog && tagExists) {
  const commitsSince = Number(run(`git rev-list --count ${tag}..HEAD`) ?? '0')
  // 取 [Unreleased] 到下一个 ## 标题之间的内容
  const m = /## \[Unreleased\]([\s\S]*?)(?=\n## |\n*$)/.exec(changelog)
  const body = (m?.[1] ?? '').trim()
  const hasBody = body.replace(/^---$/gm, '').trim().length > 0

  if (commitsSince > 0 && !hasBody) {
    failures.push(
      `${tag} 之后有 ${commitsSince} 个提交，但 CHANGELOG 的 [Unreleased] 段是空的` +
        `（发布后累积的变更无处可查；跑 npm run changelog -- --since ${tag} 补齐）`,
    )
  } else if (commitsSince === 0 && hasBody) {
    failures.push(`${tag} 之后没有提交，但 CHANGELOG 的 [Unreleased] 段有内容（过期残留）`)
  } else {
    notes.push(
      commitsSince > 0
        ? `[Unreleased] 与 ${commitsSince} 个待发布提交一致`
        : '[Unreleased] 为空且无待发布提交',
    )
  }
}

// ── 汇总 ──────────────────────────────────────────────
console.log('')
for (const n of notes) console.log(`   ✓ ${n}`)

if (failures.length) {
  console.error('\n❌ check:release-consistency 未通过 —— 版本三件套不一致：')
  for (const f of failures) console.error(`   - ${f}`)
  console.error('\n   规矩见 README「开发规范 · 版本与发布」：package.json / tag / CHANGELOG 三处必须对齐。')
  process.exit(1)
}

console.log('\n✅ check:release-consistency 通过 — package.json / tag / CHANGELOG 三处对齐')
