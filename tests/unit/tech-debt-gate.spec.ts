// @vitest-environment node
/**
 * `check:tech-debt` 闸口的自测（第 110 轮）。
 *
 * 为什么闸口也要被测：它是"防遗忘"的最后一环，一旦它自己静默失效（比如解析正则悄悄不匹配了、
 * 或 `commitExists` 永远返回 true），台账就会一路腐化而没人知道 —— 与 TD-00 当初担心的情形一致。
 * 所以这里既测**纯函数**（用小夹具），也测**真实台账**（当前仓库这份必须能通过结构+语义校验）。
 *
 * 用深路径导入脚本：node 环境 import barrel 会让 v8 覆盖把这些模块再登记一遍（第 106 轮教训）。
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  commitExists,
  countAppendixRows,
  parseLedger,
  roundsDelta,
  roundsStaleness,
  staleness,
  uncode,
  validateAdrIndex,
  validateLedger,
  STALE_ROUNDS,
  STALE_SRC_COMMITS,
} from '../../scripts/check-tech-debt.mjs'

const HEAD = '## 当前未结项\n\n| 编号 | 一句话 | 证据 | 级别 | 状态 | 目标 |\n| --- | --- | --- | --- | --- | --- |\n'
const TAIL =
  '\n## 已结项（保留历史）\n\n| 编号 | 一句话 | 修法 | 提交 |\n| --- | --- | --- | --- |\n'

const openRow = (cells: string[]) => `| ${cells.join(' | ')} |`

describe('check:tech-debt · 解析与校验（纯函数）', () => {
  it('两段表格分别解析；列数不对 / 落在两表之外 都算问题', () => {
    const text = [
      openRow(['TD-00', '两表之前', 'x', 'P3', 'open', 'y']), // 任何 ## 之前 → 表外
      HEAD,
      openRow(['TD-01', '欠着的', '`a.ts:1`', 'P2', 'open', '上生产前']),
      openRow(['TD-02', '少一列', '`a.ts:2`', 'P2', 'open']), // 5 列 → 问题
      TAIL,
      openRow(['TD-05', '已修', '改法', 'abc1234']),
    ].join('\n')
    const model = parseLedger(text)
    expect(model.open.map((r) => r.id), '解析正常的那些才进 open 表').toEqual(['TD-01'])
    expect(model.closed.map((r) => r.id)).toEqual(['TD-05'])
    const issues = [...model.issues].join('\n')
    expect(issues, '缺列要报').toContain('应有 6 列')
    expect(issues, '落在两表之外的 TD 行要报').toContain('两张表之外')
  })

  it('反引号写法与裸写法等价（`open` === open，`abc1234` === abc1234）', () => {
    expect(uncode('`open`')).toBe('open')
    expect(uncode('open')).toBe('open')
    const model = parseLedger(
      [HEAD, openRow(['TD-01', 's', 'e', '`P2`', '`accepted`', '触发条件：x → y']), TAIL].join('\n'),
    )
    expect(model.open[0]).toMatchObject({ level: 'P2', status: 'accepted' })
  })

  it('语义校验：级别/状态非法、编号重复、accepted 缺触发条件、缺证据 —— 都报', () => {
    const model = parseLedger(
      [
        HEAD,
        openRow(['TD-01', '甲', '`a.ts:1`', 'P9', 'open', 'x']), // 级别非法
        openRow(['TD-01', '乙', '`a.ts:2`', 'P2', 'doing', 'y']), // 编号重复 + 状态非法
        openRow(['TD-03', '丙', '', 'P2', 'accepted', '先这样吧']), // 缺证据 + accepted 缺触发条件
        openRow(['TD-04', '丁', '`a.ts:4`', 'P2', 'closed', 'z']), // closed 不该留在未结项表
        TAIL,
      ].join('\n'),
    )
    const issues = validateLedger(model, { exists: () => true }).join('\n')
    expect(issues).toContain('级别不合法')
    expect(issues).toContain('编号重复 TD-01')
    expect(issues).toContain('状态不合法')
    expect(issues).toContain('没写触发条件')
    expect(issues).toContain('缺证据')
    expect(issues).toContain('应挪到「已结项」表')
  })

  it('closed 行的提交号必须格式合法且真实存在（注入 exists 便于测）', () => {
    const mk = (commit: string) =>
      parseLedger([HEAD, TAIL, openRow(['TD-09', '已修', '改法', commit])].join('\n'))

    expect(validateLedger(mk('abc1234'), { exists: () => true })).toEqual([])
    expect(
      validateLedger(mk('abc1234'), { exists: () => false }).join('\n'),
      '不存在的提交必须报（"有据可查"的错觉比没记录更糟）',
    ).toContain('不存在')
    expect(validateLedger(mk('not-a-sha'), { exists: () => true }).join('\n')).toContain('格式不合法')
    expect(validateLedger(mk(''), { exists: () => true }).join('\n')).toContain('没写提交号')
  })

  it('陈旧度：等于上限不算陈旧，超过才算（阈值来自常量，便于台账里引用）', () => {
    expect(staleness(STALE_SRC_COMMITS).stale).toBe(false)
    expect(staleness(STALE_SRC_COMMITS + 1).stale).toBe(true)
    expect(staleness(0, 0).stale).toBe(false)
    expect(staleness(1, 0).stale).toBe(true)
  })

  // ── #441：主口径从「提交数」改成「审查轮次」（TD-27 收口） ──
  it('**轮次口径**：等于上限不算陈旧，超过才算（TD-27 触发后的改法）', () => {
    expect(roundsStaleness(STALE_ROUNDS).stale).toBe(false)
    expect(roundsStaleness(STALE_ROUNDS + 1).stale).toBe(true)
    expect(roundsStaleness(0, 0).stale).toBe(false)
    expect(roundsStaleness(1, 0).stale).toBe(true)
  })

  it('**轮次行计数**：只数 `| **#NNN** |` 形状的附录行，不数正文里的 # 号', () => {
    const md = ['# 标题', '', '| 项 | 值 |', '| --- | --- |', '| 轮次 | #12 见正文 |', '', '| **#439** | 某轮 |', '| **#440** | 另一轮 |', '', '正文提到 #441 不算行。', ''].join('\n')
    expect(countAppendixRows(md)).toBe(2)
  })

  it('**轮次差**：正常递增算差值；行数倒挂标 regressed（不夹到 0 —— 夹了判据就永久不陈旧）', () => {
    expect(roundsDelta(295, 291)).toEqual({ roundsSince: 4, regressed: false })
    expect(roundsDelta(291, 295)).toEqual({ roundsSince: 4, regressed: true })
    expect(roundsDelta(295, 295)).toEqual({ roundsSince: 0, regressed: false })
  })

  it('**空/缺失文本按 0 轮算**（该提交里还没有审查报告时由调用方决定退回提交数口径）', () => {
    expect(countAppendixRows('')).toBe(0)
    expect(countAppendixRows(undefined)).toBe(0)
  })
})

/**
 * ⚠️ 超时给到 60s（默认 20s）。
 *
 * `结构校验零问题` 会为台账里**每一条已结项**提交号调用一次 `git cat-file` 查真实存在性
 * （现在 28 条 closed）。单跑约几十毫秒，但整链第 15 步 test:unit 并发跑 320 个文件时
 * 实测被拖到 31.6s 打穿 20s 默认超时。放宽超时不掩盖失败：断言一条没动。
 */
describe('check:tech-debt · 真实台账（当前仓库这份必须过）', { timeout: 60000 }, () => {
  const ledger = readFileSync(resolve(process.cwd(), 'docs/tech-debt.md'), 'utf8')

  it('结构与语义校验零问题（closed 的提交号真的在 git 里）', () => {
    const model = parseLedger(ledger)
    // 下限是「非空转」的证明，不是目标数量：open 表随治理收敛而变小是好事，
    // 只要还留着多项未结（>=3），解析器与闸口就仍在真实台账上生效。
    expect(model.open.length, '未结项表不该是空的（解析坏了会静默通过）').toBeGreaterThanOrEqual(3)
    expect(model.closed.length, '已结项表不该是空的').toBeGreaterThan(5)
    const issues = validateLedger(model, { exists: commitExists })
    expect(issues, `台账有问题：\n${issues.join('\n')}`).toEqual([])
    // 至少有一条 accepted 带上触发条件（否则"接受"会悄悄变成"遗忘"）
    expect(model.open.some((r) => r.status === 'accepted' && r.goal.includes('触发条件'))).toBe(true)
  })

  it('ADR 索引与文件一一对应', () => {
    const { issues } = validateAdrIndex()
    expect(issues).toEqual([])
  })

  // 超时放宽到 180s（第 168 轮）：本用例两次 spawnSync 子进程，各自要跑多条 git 命令；
  // 整链 test:unit 会并行 337 个 worker，若同期还有别的 git 操作，索引锁会把这两次 spawn
  // 挤压到 60s 以上，导致质量链假红（实测撞过一次，单独跑该文件仅 9s）。
  // 只放宽时限、不改断言——180s 仍是有界上限，真挂死照样会被抓住。
  it('CLI 行为：陈旧度超限时退 1 并点名"陈旧"，放宽上限后通过', { timeout: 180_000 }, () => {
    const run = (args: string[]) => {
      try {
        return { code: 0, out: execFileSync(process.execPath, ['scripts/check-tech-debt.mjs', ...args], {
          encoding: 'utf8',
          stdio: 'pipe',
        }) }
      } catch (e) {
        const err = e as { status?: number; stdout?: string; stderr?: string }
        return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
      }
    }
    // 用负上限强制命中「陈旧」分支：与"台账是否刚提交"无关（用 0 会随提交状态飘）
    const strict = run(['--stale-limit=-1'])
    expect(strict.code, '上限为负时陈旧判定必然触发，应退 1').toBe(1)
    expect(strict.out).toContain('陈旧')

    const loose = run(['--stale-limit=9999'])
    expect(loose.code, '放宽上限后结构/语义都该过').toBe(0)
    expect(loose.out).toContain('check:tech-debt 通过')
  })
})
