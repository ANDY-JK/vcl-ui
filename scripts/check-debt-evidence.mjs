// 闸口：技术债台账的「证据路径」不许成死链（#443）
//
// ## 背景
//
// 台账最大的风险不是写得不好，而是**没人更新**：一个已拆走/改名的文件仍被 open 行
// 当作证据引用，接手者点进去什么也找不到，于是整行结论都失去可核验性。
// 第 110 轮加的 `check:tech-debt` 管结构（列数/编号/提交号/陈旧度），但**不管
// 证据列里那些反引号路径是否还存在**。
//
// 本闸口只做一件机械可判的事：open 表里每个**带目录限定**的反引号路径，
// 必须能在仓库根或 `src/` 下找到。
//
// ## 精度边界（写清楚，避免假绿式自信）
//
// · 只认**带 `/` 的路径**：`Card.vue` / `FormBuilder.vue` 这类裸文件名是行内简称，
//   全仓同名文件很多，强行按路径解析只会误报（`docs/*.md`、`.vue` 这类 glob/扩展名同理）。
// · 带 `$` / `{` / `*` 的模板与通配不算路径。
// · 脚本名（`.mjs`）与文档（`.md`）同样在检查范围内 —— 它们也是证据。
// · 不评价证据是否**支持**结论，那是人工判断；这里只保证"点得开"。
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const DEBT = path.join(ROOT, 'docs', 'tech-debt.md')

/** 取 open 表里的 TD 行（按表标题切段，不误收已结项） */
export function openRows(text) {
  const rows = []
  let mode = 'header'
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('## 当前未结项')) mode = 'open'
    else if (line.startsWith('## 已结项')) mode = 'closed'
    if (mode === 'open' && /^\|\s*TD-\d+\s*\|/.test(line)) rows.push(line)
  }
  return rows
}

/** 从一行里抽出"带目录限定"的反引号路径 */
export function evidencePaths(row) {
  const out = new Set()
  for (const m of row.matchAll(/`([^`]+)`/g)) {
    const s = m[1].trim()
    if (!s.includes('/')) continue // 裸文件名 = 行内简称，不按路径解析
    if (/[*${}]/.test(s)) continue // 通配 / 模板
    if (/\s/.test(s)) continue // 带空格的多半是命令或句子
    if (!/\.(ts|vue|mjs|js|cjs|json|css|md|yml|yaml|tsx|jsx)$/.test(s)) continue
    out.add(s)
  }
  return [...out]
}

/**
 * 找出 open 行里已经不存在（死链）的证据路径。
 * @param {{text?: string, root?: string}} opts
 * @returns {{id: string, path: string}[]}
 */
export function findDeadEvidence({ text = fs.readFileSync(DEBT, 'utf8'), root = ROOT } = {}) {
  const dead = []
  for (const row of openRows(text)) {
    const id = row.match(/^\|\s*(TD-\d+)/)?.[1] ?? '?'
    for (const p of evidencePaths(row)) {
      const a = path.join(root, p)
      const b = path.join(root, 'src', p)
      if (!fs.existsSync(a) && !fs.existsSync(b)) dead.push({ id, path: p })
    }
  }
  return dead
}

function main() {
  const rows = openRows(fs.readFileSync(DEBT, 'utf8'))
  const dead = findDeadEvidence()
  const allPaths = new Set(rows.flatMap((r) => evidencePaths(r)))
  if (allPaths.size === 0) {
    console.error('❌ check:debt-evidence 未通过 —— open 表里一个带目录的证据路径都没有（判据空转）')
    process.exit(1)
  }
  if (dead.length) {
    console.error(`❌ check:debt-evidence 未通过 —— ${dead.length} 处证据死链：`)
    for (const d of dead) console.error(`   - ${d.id} → ${d.path}`)
    console.error('   修法：更新台账里的路径，或把已失效的结论挪到「已结项」。')
    process.exit(1)
  }
  console.log(`✅ check:debt-evidence 通过 — open 表 ${rows.length} 行 / ${allPaths.size} 条证据路径全部存在`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
