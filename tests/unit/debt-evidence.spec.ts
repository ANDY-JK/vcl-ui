/* ═══════════ check:debt-evidence：台账证据路径不许成死链（#443） ═══════════
 *
 * `check:tech-debt` 管结构（列数/编号/提交号/陈旧度），但不管证据列里那些反引号路径
 * 是否还存在。文件改名/拆走之后，open 行仍指着旧位置 → 接手者点不进去，整行结论失效。
 *
 * 本 spec 分三层：真实树零死链、判据非空转、合成夹具证明判据真会报且精度可用。
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { evidencePaths, findDeadEvidence, openRows } from '../../scripts/check-debt-evidence.mjs'

const HEAD = '## 当前未结项\n\n| 编号 | 一句话 | 证据 | 级别 | 状态 | 目标 |\n| --- | --- | --- | --- | --- | --- |\n'
const CLOSED = '\n## 已结项（保留历史）\n\n| 编号 | 一句话 | 修法 | 提交 |\n| --- | --- | --- | --- |\n'

describe('check:debt-evidence · 真实树', () => {
  it('**当前 open 表零死链**（所有带目录限定的证据路径都点得开）', () => {
    const dead = findDeadEvidence()
    expect(dead, `这些证据路径已不存在：${JSON.stringify(dead)}`).toEqual([])
  })

  it('**判据非空转**：open 表里确实抽出了多条带目录的路径', () => {
    const rows = openRows(readFileSync('docs/tech-debt.md', 'utf8'))
    // 阈值是"非空转"的下限，不是目标数量：open 表随治理收敛而变小是好事
    // （#465 从 >5 降到 >=3，#473 TD-25 结项后再降到 >=2）。
    // 只要还留着多项未结，解析器与闸口就仍在真实台账上生效；
    // 真降到 1 项时该重审的是"台账是否还在用"，而不是继续降阈值。
    expect(rows.length, `open 表只剩 ${rows.length} 项 —— 少于 2 项时本条判据失效`).toBeGreaterThanOrEqual(2)
    const paths = new Set(rows.flatMap((r) => evidencePaths(r)))
    expect(paths.size, '证据路径少于 2 条 → 闸口接近摆设').toBeGreaterThanOrEqual(2)
  })
})

describe('check:debt-evidence · 合成夹具（判据有效性 / 精度）', () => {
  let root = ''
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'debt-evidence-'))
    mkdirSync(join(root, 'src', 'a'), { recursive: true })
    writeFileSync(join(root, 'src', 'a', 'exists.ts'), 'export const x = 1\n')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const doc = (openRow, closedRow = '') => HEAD + openRow + CLOSED + closedRow

  it('**报**：指向不存在文件的证据路径', () => {
    const text = doc('| TD-01 | 坏路径 | `src/a/gone.ts` | P3 | open | 修 |\n')
    expect(findDeadEvidence({ text, root }).map((d) => d.path)).toEqual(['src/a/gone.ts'])
  })

  it('**不报**：路径存在（或从 src/ 下能解析到）', () => {
    expect(findDeadEvidence({ text: doc('| TD-01 | 好路径 | `src/a/exists.ts` | P3 | open | 修 |\n'), root })).toEqual([])
    expect(findDeadEvidence({ text: doc('| TD-01 | 相对 src | `a/exists.ts` | P3 | open | 修 |\n'), root })).toEqual([])
  })

  it('**裸文件名 / glob / 带空格命令不按路径解析**（精度保护）', () => {
    const text = doc(
      '| TD-01 | 简称与通配 | `Card.vue` `docs/*.md` `npm run check:docs` `facts.md` | P3 | open | 修 |\n',
    )
    expect(evidencePaths(text.split('\n').find((l) => l.startsWith('| TD-01')) ?? '')).toEqual([])
    expect(findDeadEvidence({ text, root })).toEqual([])
  })

  it('**已结项表里的死路径不报**（只管 open —— 历史记录保留当时的路径）', () => {
    const text = doc(
      '| TD-01 | 正常 | `src/a/exists.ts` | P3 | open | 修 |\n',
      '| TD-02 | 历史 | 修法 | `src/a/ancient.ts` | 1234567 |\n',
    )
    expect(findDeadEvidence({ text, root })).toEqual([])
  })

  it('**负向对照**：真实存在的路径被改名后（删文件）判据必须报', () => {
    const text = doc('| TD-01 | 会被改名 | `src/a/exists.ts` | P3 | open | 修 |\n')
    expect(findDeadEvidence({ text, root })).toEqual([])
    rmSync(join(root, 'src', 'a', 'exists.ts'))
    expect(findDeadEvidence({ text, root }).map((d) => d.path)).toEqual(['src/a/exists.ts'])
  })
})
