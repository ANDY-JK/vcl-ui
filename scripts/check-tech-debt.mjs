// 技术债台账与 ADR 的**腐化闸口**（审查 6.3 第 4 项 / R5-B10；第 110 轮扩了三项判据）。
//
// 为什么需要：台账最大的风险不是"写得不好"，而是**没人更新**。
// 「已修的还挂在 open」会让接手者去修一个已经不存在的问题；
// 「closed 项引用的提交号是编的」比没有记录更糟——它给人"有据可查"的错觉。
//
// ## 判据演进（第 110 轮）
//
// 第一版只查 ① closed 提交号真实存在 ② ADR 索引与文件一一对应，并在注释里**明确拒绝**了
// "检查是否过期未更新"（理由：需要人工判断，机器判只会制造噪音）。
//
// 第 110 轮盘点推翻了这条决定，理由是可测的：
//   · 台账最后更新在 d51dcfc（2026-10-21），其后 **82 个提交、其中 13 个动过 src** 都没回填；
//   · 同一份台账里 TD-00 还写着"本文件无生成器、无 check"——**闸口其实早就有**（b3adb44），
//     也就是说"有闸口"并不等于"台账会更新"，缺的是**陈旧度**这个信号。
// 于是追加三项**机械可判**的判据（不评价内容质量）：
//   ③ 结构：两张表列数、编号格式/唯一性、级别与状态枚举合法
//   ④ `accepted` 必须在"目标"列写出「触发条件」（否则"接受"会变成"遗忘"）
//   ⑤ 陈旧度：台账最后被改的提交之后，动过 `src/` 的提交数不得超过 `STALE_SRC_COMMITS`
//
// ## 陈旧度口径（本仓对外开源时收口）
//
// 第五轮起陈旧度曾用"审查轮次"（= 全量审查报告附录里 `| **#NNN** |` 行数）做主口径。
// 那份审查报告属内部工作台账，公开仓库里已整体移除，轮次口径因此**没有可读的真源**：
// 继续读一份不存在的文件会让判据静默失效（这正是本闸口最忌讳的"假绿"）。
// 所以现在只保留**提交数口径**：它只依赖 git 历史，任何人 clone 下来都能复算。
// 纯函数 `roundsStaleness` / `roundsDelta` / `countAppendixRows` 保留导出（有自测引用），
// 但 CLI 不再使用 —— 详见各函数注释。
//
// 退出码：0 通过 / 1 有硬问题。
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DEBT_REL = 'docs/tech-debt.md'
const ROOT = process.cwd()
const DEBT = join(ROOT, 'docs', 'tech-debt.md')
const ADR_DIR = join(ROOT, 'docs', 'adr')
const ADR_INDEX = join(ADR_DIR, 'README.md')

/** 台账最后被改的提交之后，允许有多少个「动过 src/」的提交不问台账 */
export const STALE_SRC_COMMITS = 5
/**
 * 轮次口径的上限常量。**CLI 已不再使用**（审查报告附录随内部台账一起移除），
 * 保留导出只为兼容既有自测的引用，避免导入即报错。
 */
export const STALE_ROUNDS = 3

const LEVELS = new Set(['P0', 'P1', 'P2', 'P3'])
const STATUSES = new Set(['open', 'accepted', 'deferred', 'closed'])
/**
 * 编号格式：TD-NN，**已扩到三位**（台账在 #355 之后越过 99 条 —— TD-100 是第一个三位号）。
 * 注意不要写成 \d{2,3} 之外的宽松形式：这条正则同时用于**发现"编号写错"**（如 TD-1、TD-007），
 * 放宽过头会让真正的笔误通过。
 */
const ID_RE = /^TD-\d{2,3}$/
const SHA_RE = /^[0-9a-f]{7,40}$/

/** 提交号是否真实存在（短 hash 也接受） */
export function commitExists(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** 把 `| a | b |` 切成 ['a','b'] */
export function splitRow(line) {
  const cells = line.split('|').map((c) => c.trim())
  if (cells.length && cells[0] === '') cells.shift()
  if (cells.length && cells[cells.length - 1] === '') cells.pop()
  return cells
}

/** 去掉单元格里的行内代码反引号（台账里 `` `open` `` 与 `open` 两种写法都该接受） */
export function uncode(cell) {
  return cell.replace(/^`+/, '').replace(/`+$/, '').trim()
}

/**
 * 解析台账：`## 当前未结项` 段的 TD 行是 open 表（6 列），`## 已结项` 段的是 closed 表（4 列）。
 * 解析期就能定的问题（列数不对）直接进 `issues`。
 */
export function parseLedger(text) {
  const open = []
  const closed = []
  const issues = []
  let section = null
  let lineNo = 0

  for (const raw of text.split(/\r?\n/)) {
    lineNo += 1
    const line = raw.trim()
    if (line.startsWith('## ')) {
      section = line.includes('已结项') ? 'closed' : line.includes('未结项') ? 'open' : null
      continue
    }
    if (!line.startsWith('| TD-')) continue
    if (!section) {
      issues.push(`L${lineNo}：TD 行落在两张表之外的段落里`)
      continue
    }
    const cells = splitRow(line)
    const expect = section === 'open' ? 6 : 4
    if (cells.length !== expect) {
      issues.push(`L${lineNo}：${section} 表应有 ${expect} 列，实际 ${cells.length} 列 —— ${line.slice(0, 42)}…`)
      continue
    }
    if (section === 'open') {
      open.push({
        section,
        lineNo,
        id: uncode(cells[0]),
        summary: cells[1],
        evidence: cells[2],
        level: uncode(cells[3]),
        status: uncode(cells[4]),
        goal: cells[5],
      })
    } else {
      closed.push({ section, lineNo, id: uncode(cells[0]), summary: cells[1], fix: cells[2], commit: uncode(cells[3]) })
    }
  }
  return { open, closed, issues }
}

/** 结构 + 语义判据（不含 git 交互，纯函数；`exists` 由调用方注入便于单测） */
export function validateLedger(model, { exists = () => true } = {}) {
  const issues = [...model.issues]
  const seen = new Map()
  const noteId = (row) => {
    if (!ID_RE.test(row.id)) issues.push(`L${row.lineNo}：编号不合 TD-NN 格式：${row.id}`)
    if (seen.has(row.id)) issues.push(`L${row.lineNo}：编号重复 ${row.id}（另见 L${seen.get(row.id)}）`)
    seen.set(row.id, row.lineNo)
  }

  for (const row of model.open) {
    noteId(row)
    if (!LEVELS.has(row.level)) issues.push(`L${row.lineNo}：${row.id} 级别不合法：${row.level}`)
    if (!STATUSES.has(row.status)) issues.push(`L${row.lineNo}：${row.id} 状态不合法：${row.status}`)
    if (row.status === 'closed') {
      issues.push(`L${row.lineNo}：${row.id} 状态是 closed —— 应挪到「已结项」表并写提交号`)
    }
    if (row.status === 'accepted' && !row.goal.includes('触发条件')) {
      issues.push(`L${row.lineNo}：${row.id} 是 accepted 却没写触发条件 —— "接受"会变成"遗忘"`)
    }
    if (!row.evidence) issues.push(`L${row.lineNo}：${row.id} 缺证据（file:line 或可复现命令）`)
  }

  for (const row of model.closed) {
    noteId(row)
    if (!row.fix) issues.push(`L${row.lineNo}：${row.id} 缺修法`)
    if (!row.commit) {
      issues.push(`L${row.lineNo}：${row.id} 在「已结项」里但没写提交号 —— 无法核实是否真修了`)
      continue
    }
    if (!SHA_RE.test(row.commit)) {
      issues.push(`L${row.lineNo}：${row.id} 提交号格式不合法：${row.commit}`)
      continue
    }
    if (!exists(row.commit)) issues.push(`L${row.lineNo}：${row.id} 引用的提交 ${row.commit} 不存在 —— 台账里的提交号必须可 git 查到`)
  }
  return issues
}

/** 陈旧度判定（纯函数，提交数口径 —— 本闸口现在唯一使用的口径） */
export function staleness(srcCommitsSince, limit = STALE_SRC_COMMITS) {
  return { srcCommitsSince, limit, stale: srcCommitsSince > limit }
}

/**
 * 陈旧度判定（纯函数，轮次口径）。
 *
 * **保留导出、CLI 不再调用**：轮次的机械定义曾是「审查报告附录里新增的行数」，
 * 而审查报告属内部台账、已随开源移除 —— 没有真源的口径留在链里只会变成假绿。
 */
export function roundsStaleness(roundsSince, limit = STALE_ROUNDS) {
  return { roundsSince, limit, stale: roundsSince > limit }
}

/**
 * 轮次差（纯函数）：`rowsAtHead < rowsAtLedger` 时**不夹到 0**，而是标 `regressed` ——
 * 报告行数倒挂意味着截断/回退，夹到 0 会让判据永久"不陈旧"（负向对照实测过这个洞）。
 *
 * 同 `roundsStaleness`：保留导出、CLI 不再调用（见文件头「陈旧度口径」）。
 */
export function roundsDelta(rowsAtHead, rowsAtLedger) {
  if (rowsAtHead < rowsAtLedger) return { roundsSince: rowsAtLedger - rowsAtHead, regressed: true }
  return { roundsSince: rowsAtHead - rowsAtLedger, regressed: false }
}

/**
 * 审查报告附录里的轮次行数（`| **#NNN** | ...`）。
 *
 * 同 `roundsStaleness`：保留导出、CLI 不再调用 —— 审查报告已随开源移除。
 */
export function countAppendixRows(text) {
  if (!text) return 0
  return (text.match(/^\|\s*\*\*#\d+\*\*/gm) ?? []).length
}

/** ADR 索引与文件一一对应（返回 issues） */
export function validateAdrIndex({ dir = ADR_DIR, index = ADR_INDEX } = {}) {
  const issues = []
  if (!existsSync(index)) return { issues: ['找不到 docs/adr/README.md —— ADR 索引缺失'], count: 0 }
  const files = readdirSync(dir)
    .filter((f) => /^\d{3}-.+\.md$/.test(f))
    .sort()
  const text = readFileSync(index, 'utf8')
  for (const f of files) {
    const num = f.slice(0, 3)
    if (!text.includes(f) && !new RegExp(`\\[${num}\\]`).test(text)) {
      issues.push(`ADR 文件 ${f} 未登记进 docs/adr/README.md 索引`)
    }
  }
  for (const m of text.matchAll(/\|\s*\[(\d{3})\]\((\d{3}-[^)]+\.md)\)/g)) {
    if (!existsSync(join(dir, m[2]))) issues.push(`ADR 索引指向 ${m[2]}，但文件不存在（死链）`)
  }
  return { issues, count: files.length }
}

function git(args) {
  // maxBuffer 显式放大：git 输出（如 `rev-list` 长历史）一旦超过 execFileSync 默认的 1MB
  // 缓冲就会抛 ENOBUFS，陈旧度判定随之静默失效 —— 难看的是失败方式，不是失败本身。
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()
}

function main() {
  const fail = []
  const notes = []

  // ① + ③ + ④ 台账：结构 / 语义 / closed 提交号
  if (!existsSync(DEBT)) {
    fail.push('找不到 docs/tech-debt.md —— 技术债台账缺失')
  } else {
    const model = parseLedger(readFileSync(DEBT, 'utf8'))
    fail.push(...validateLedger(model, { exists: commitExists }))
    notes.push(`台账：未结项 ${model.open.length} 条（其中 accepted ${model.open.filter((r) => r.status === 'accepted').length} 条）· 已结项 ${model.closed.length} 条，提交号全部可查`)
  }

  // ② ADR 索引
  const adr = validateAdrIndex()
  if (adr.issues) fail.push(...adr.issues)
  else notes.push(`ADR ${adr.count} 份，索引与文件一一对应`)

  // ⑤ 陈旧度（提交数口径：只依赖 git 历史，公开仓库里任何人都能复算）
  const limitArg = process.argv.find((a) => a.startsWith('--stale-limit='))
  const limit = limitArg ? Number(limitArg.split('=')[1]) : STALE_SRC_COMMITS
  const effLimit = Number.isFinite(limit) ? limit : STALE_SRC_COMMITS
  let srcCommitsSince = 0
  let ledgerCommit = ''
  try {
    ledgerCommit = git(['log', '-1', '--format=%H', '--', DEBT_REL])
    if (ledgerCommit) {
      srcCommitsSince = Number(git(['rev-list', '--count', `${ledgerCommit}..HEAD`, '--', 'src'])) || 0
    }
  } catch {
    notes.push('读不到 git 历史，跳过陈旧度判定')
  }
  const stale = staleness(srcCommitsSince, effLimit)
  if (stale.stale) {
    fail.push(
      `台账陈旧：最后更新在 ${ledgerCommit.slice(0, 7)}，其后动过 src/ 的提交有 ${srcCommitsSince} 个` +
        `（上限 ${effLimit}）—— 把这些提交里核实过的债登记进来（已修的挪到「已结项」并写提交号）`,
    )
  } else if (ledgerCommit) {
    notes.push(
      `陈旧度：台账最后更新 ${ledgerCommit.slice(0, 7)} → 其后动过 src 的提交 ${srcCommitsSince} 个（上限 ${effLimit}）`,
    )
  }

  console.log('')
  for (const n of notes) console.log(`   ✓ ${n}`)
  if (fail.length) {
    console.error(`\n❌ check:tech-debt 未通过 —— ${fail.length} 处：\n`)
    for (const f of fail) console.error(`   - ${f}`)
    console.error('\n   说明：台账的规矩写在 docs/tech-debt.md 顶部（只登核实过的、accepted 写触发条件、closed 带真实提交号）。')
    process.exit(1)
  }
  console.log('\n✅ check:tech-debt 通过 — 台账与 ADR 机械可验证项全绿')
}

const invokedDirectly = (process.argv[1] ?? '').replace(/\\/g, '/').endsWith('check-tech-debt.mjs')
if (invokedDirectly) {
  try {
    main()
  } catch (e) {
    console.error('❌ check:tech-debt 异常中止：', e?.message ?? e)
    process.exit(1)
  }
}
