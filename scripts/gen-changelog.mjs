#!/usr/bin/env node
/**
 * gen-changelog — 从 conventional commits 生成 CHANGELOG.md（Keep a Changelog 格式）
 *
 * 为什么自建不引依赖：conventional-changelog 一族要带一整棵 node 依赖，
 * 而本仓只需要「按 type/scope 分组列出来」这一件事；git log 本身就是数据源。
 *
 * 用法：npm run changelog            （全量重生成）
 *       npm run changelog -- --since v1.0.0   （只列某 tag 之后的提交，旧版本段原样保留在文件后部）
 *
 * 口径说明（写进生成文件，避免后人误读）：
 *   - 本仓无 v* 版本 tag 前，1.0.0 段落 = 全部历史
 *   - docs(audit) 是审查过程记录（属内部流程，非消费方可见变更），默认折叠成一行汇总
 *   - 不符合 conventional 格式的提交进 Other，不静默丢弃
 *   - `type(scope)!:` 的感叹号 = 破坏性变更，单独进 BREAKING CHANGES 段（Keep a Changelog 约定），
 *     同时在原 type 分组里保留一行——破坏性变更首先是它那个 type 的变更
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const OUT = 'CHANGELOG.md'
const PKG = JSON.parse(readFileSync('package.json', 'utf8'))
const since = process.argv.includes('--since') ? process.argv[process.argv.indexOf('--since') + 1] : null

const SEP = '\x1f'
const log = execFileSync(
  'git',
  [
    'log',
    '--no-merges',
    '--pretty=format:%h' + SEP + '%s' + SEP + '%ad',
    '--date=short',
    ...(since ? [since + '..HEAD'] : []),
  ],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
).trim()

/** @type {{ hash: string; type: string; scope: string; subject: string; date: string; breaking: boolean }[]} */
const entries = []
let auditCount = 0
let malformed = 0

for (const line of log.split('\n')) {
  const [hash, subject, date] = line.split(SEP)
  if (!subject) continue
  const m = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/.exec(subject.trim())
  if (!m) {
    malformed++
    entries.push({ hash, type: 'other', scope: '', subject: subject.trim(), date, breaking: false })
    continue
  }
  const [, type, scope = '', bang, text] = m
  // 审查过程记录：折叠计数，不逐条列（内部流程，不是消费方可见变更）
  if (type === 'docs' && scope.split(/[,+]/).includes('audit')) {
    auditCount++
    continue
  }
  entries.push({ hash, type: type.toLowerCase(), scope: scope.trim(), subject: text.trim(), date, breaking: !!bang })
}

// Keep a Changelog 分组顺序
/** @type {{ title: string; match: string[] }[]} */
const GROUPS = [
  { title: 'Added', match: ['feat'] },
  { title: 'Changed', match: ['refactor', 'perf', 'style', 'build'] },
  { title: 'Fixed', match: ['fix'] },
  { title: 'Documentation', match: ['docs'] },
  { title: 'Tests', match: ['test'] },
  { title: 'Chores', match: ['chore', 'ci'] },
]

/** @type string[] */
const lines = []
lines.push('# Changelog')
lines.push('')
lines.push(
  since
    ? '本文件由 `npm run changelog` 从 conventional commits 增量重生成（`--since`），历史版本段原样保留，请勿手改。'
    : '本文件由 `npm run changelog` 从 conventional commits 全量重生成，请勿手改。',
)
lines.push(
  `格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。`,
)
lines.push('')
lines.push('## [Unreleased]')
lines.push('')

const version = PKG.version
if (!since) {
  // 全量模式（首次生成/换大版本重写）：全部历史收进当前版本段
  lines.push(`## [${version}] - ${new Date().toISOString().slice(0, 10)}`)
  lines.push('')
  lines.push('> 首次发布：以下为全部历史变更。')
  lines.push('')
}
// --since 增量模式：增量提交归入上方 [Unreleased]（Keep a Changelog 约定——发布后的
// 工作累积在 Unreleased，直到下次发版才切版本段）。绝不生成「当前版本号 + 今天」的
// 段：该版本可能已发布（tag），会覆盖真正的发布段（含 BREAKING CHANGES），实测踩过。

// BREAKING CHANGES 段（Keep a Changelog 约定置于版本头部）：`!` 标记的提交
const breakingItems = entries.filter((e) => e.breaking)
if (breakingItems.length) {
  lines.push('### BREAKING CHANGES')
  lines.push('')
  for (const e of breakingItems) {
    const label = e.scope ? `**\`${e.scope}\`**` : '**通用**'
    lines.push(`- ${label} ${e.subject}（${e.hash}）`)
  }
  lines.push('')
}

for (const g of GROUPS) {
  const items = entries.filter((e) => g.match.includes(e.type))
  if (!items.length) continue
  lines.push(`### ${g.title}`)
  lines.push('')
  // scope 优先排序，同 scope 内保持时间倒序（git log 本身顺序）
  const byScope = new Map()
  for (const e of items) {
    const k = e.scope || '_'
    if (!byScope.has(k)) byScope.set(k, [])
    byScope.get(k).push(e)
  }
  for (const scope of [...byScope.keys()].sort()) {
    const list = byScope.get(scope)
    const label = scope === '_' ? '通用' : `\`${scope}\``
    lines.push(`- **${label}**`)
    for (const e of list) lines.push(`  - ${e.subject}（${e.hash}）`)
  }
  lines.push('')
}

if (entries.some((e) => e.type === 'other')) {
  lines.push('### Other')
  lines.push('')
  lines.push('> 以下提交不符合 conventional 格式，未归类（不丢弃，供补写时参考）。')
  lines.push('')
  for (const e of entries.filter((x) => x.type === 'other')) lines.push(`- ${e.subject}（${e.hash}）`)
  lines.push('')
}

const summary = [
  `生成口径：${entries.length + auditCount + malformed} 条提交 → 列入 ${entries.length} 条`,
  auditCount ? `，审查过程记录折叠 ${auditCount} 条` : '',
  malformed ? `，非 conventional 格式 ${malformed} 条（见 Other）` : '',
  since ? `；范围 ${since}..HEAD` : '；范围：全部历史',
  '。',
].join('')
lines.push('---')
lines.push('')
lines.push(summary)

// --since 增量模式：旧文件里「第一个带日期的版本段」起全部原样拼回（已发布段神圣不可
// 覆盖；Unreleased 的旧增量被本次重生成替代，属预期）。幂等：重复跑结果一致。
if (since) {
  try {
    const old = readFileSync(OUT, 'utf8')
    const re = /^## \[([^\]]+)\] - \d{4}-\d{2}-\d{2}$/gm
    const m = re.exec(old)
    if (m) {
      lines.push('')
      lines.push(old.slice(m.index).trimEnd())
    }
  } catch {
    // 旧文件不存在（首次生成）——没有可保留的段，正常
  }
}

writeFileSync(OUT, lines.join('\n') + '\n')
console.log(`✅ ${OUT} 已重生成（${entries.length} 条，审查记录折叠 ${auditCount}，非规范 ${malformed}）`)
