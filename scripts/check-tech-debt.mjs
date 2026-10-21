// 技术债台账与 ADR 的**腐化闸口**（审查 6.3 第 4 项 / R5-B10）。
//
// 为什么需要：台账最大的风险不是"写得不好"，而是**没人更新**。
// 「已修的还挂在 open」会让接手者去修一个已经不存在的问题；
// 「closed 项引用的提交号是编的」比没有记录更糟——它给人"有据可查"的错觉。
//
// 本闸口只查**机械可验证**的三件事，不评价内容质量：
//   ① closed 项引用的提交号真实存在（`git cat-file -e`）
//   ② closed 项必须有提交号或明确修法（不许空着说"已修"）
//   ③ ADR 索引与实际文件一一对应（新增 ADR 忘登记索引 → 红）
//
// 刻意**不**做的：检查"是否过期未更新"。那需要人工判断，机器判只会制造噪音。
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const DEBT = join(ROOT, 'docs', 'tech-debt.md')
const ADR_DIR = join(ROOT, 'docs', 'adr')
const ADR_INDEX = join(ADR_DIR, 'README.md')

const fail = []
const notes = []

/** 提交号是否真实存在（短 hash 也接受） */
function commitExists(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// ── ① 台账：closed 项必须有真实提交号 ──
if (!existsSync(DEBT)) {
  fail.push('找不到 docs/tech-debt.md —— 技术债台账缺失')
} else {
  const text = readFileSync(DEBT, 'utf8')
  const lines = text.split('\n')
  // 只看「已结项」表格里的行：以 | TD- 开头且行内含 `closed` 或位于已结项段
  const closedStart = lines.findIndex((l) => /^## 已结项/.test(l))
  const closedLines = closedStart >= 0 ? lines.slice(closedStart) : []
  let closedCount = 0
  for (const line of closedLines) {
    const m = line.match(/^\|\s*(TD-\d+)\s*\|/)
    if (!m) continue
    closedCount++
    const id = m[1]
    // 提取 6~40 位十六进制提交号
    const shas = [...line.matchAll(/\b([0-9a-f]{6,40})\b/g)].map((x) => x[1])
    if (shas.length === 0) {
      fail.push(`${id} 在「已结项」里但没写提交号 —— 无法核实是否真修了（写 \`本轮\` 的请补上实际提交）`)
      continue
    }
    for (const sha of shas) {
      if (!commitExists(sha)) {
        fail.push(`${id} 引用的提交 ${sha} 不存在 —— 台账里的提交号必须可 git 查到`)
      }
    }
  }
  notes.push(`台账已结项 ${closedCount} 条，提交号全部可查`)
}

// ── ② ADR 索引与文件一一对应 ──
if (!existsSync(ADR_INDEX)) {
  fail.push('找不到 docs/adr/README.md —— ADR 索引缺失')
} else {
  const files = readdirSync(ADR_DIR)
    .filter((f) => /^\d{3}-.+\.md$/.test(f))
    .sort()
  const index = readFileSync(ADR_INDEX, 'utf8')
  for (const f of files) {
    // 索引里应出现文件名（允许以 `001` 编号 + 链接两种形式之一）
    const num = f.slice(0, 3)
    if (!index.includes(f) && !new RegExp(`\\[${num}\\]`).test(index)) {
      fail.push(`ADR 文件 ${f} 未登记进 docs/adr/README.md 索引`)
    }
  }
  // 反向：索引里提到的 ADR 编号必须有对应文件
  for (const m of index.matchAll(/\|\s*\[(\d{3})\]\((\d{3}-[^)]+\.md)\)/g)) {
    if (!existsSync(join(ADR_DIR, m[2]))) {
      fail.push(`ADR 索引指向 ${m[2]}，但文件不存在（死链）`)
    }
  }
  notes.push(`ADR ${files.length} 份，索引与文件一一对应`)
}

// ── 汇总 ──
console.log('')
for (const n of notes) console.log(`   ✓ ${n}`)
if (fail.length) {
  console.error(`\n❌ check:tech-debt 未通过 —— ${fail.length} 处：\n`)
  for (const f of fail) console.error(`   - ${f}`)
  console.error('\n   说明：台账的规矩写在 docs/tech-debt.md 顶部（只登核实过的、closed 要带提交号）。')
  process.exit(1)
}
console.log('\n✅ check:tech-debt 通过 — 台账与 ADR 机械可验证项全绿')
