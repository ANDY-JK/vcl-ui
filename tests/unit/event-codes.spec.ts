/* ═══════════ 事件码是宿主建告警的契约，删改即红（#450） ═══════════
 *
 * facts.md 的事件码清单直接对外，宿主按 `code` 建告警（注释写死：不要用 message）。
 * 此前没有任何东西阻止重命名/删除已发布的码：gen:facts 会照实生成新清单，
 * 文档"看起来更新了"，宿主告警却静默失效。
 *
 * 本 spec：真实基线一致 + 判据非空转 + 合成夹具（删码报 / 加码不报 / 基线脏数据报）。
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { diffCodes, validateBaseline } from '../../scripts/check-event-codes.mjs'
import { scanEventCodes } from '../../scripts/lib/event-codes.mjs'

describe('diffCodes · 码集对比', () => {
  it('**删码/改名 → removed**（破坏性变更）', () => {
    const r = diffCodes({ baseline: ['a/x', 'a/y', 'b/z'], current: ['a/x', 'b/z'] })
    expect(r.removed).toEqual(['a/y'])
    expect(r.added).toEqual([])
  })

  it('**新增码 → added（不红，仅提示）', () => {
    const r = diffCodes({ baseline: ['a/x'], current: ['a/x', 'a/new'] })
    expect(r.removed).toEqual([])
    expect(r.added).toEqual(['a/new'])
  })

  it('**顺序无关**：两侧排序不同不算差异', () => {
    expect(diffCodes({ baseline: ['b/z', 'a/x'], current: ['a/x', 'b/z'] })).toEqual({ removed: [], added: [] })
  })

  it('**重复码去重比较**', () => {
    expect(diffCodes({ baseline: ['a/x', 'a/x'], current: ['a/x'] })).toEqual({ removed: [], added: [] })
  })
})

describe('validateBaseline · 基线形状', () => {
  it('**报**：缺 codes / 少于 10 个 / 重复 / 非法码', () => {
    expect(validateBaseline({}).length).toBeGreaterThan(0)
    expect(validateBaseline({ codes: ['a/x'] }).join()).toContain('< 10')
    expect(validateBaseline({ codes: Array(10).fill('a/x') }).join()).toContain('重复')
    expect(validateBaseline({ codes: [...Array(10).keys()].map((i) => `d${i}/x`).concat(['bogus']) }).join()).toContain('非法码')
  })

  it('**不报**：10 个以上合法唯一码', () => {
    const codes = [...Array(12).keys()].map((i) => `domain${i}/event`)
    expect(validateBaseline({ codes })).toEqual([])
  })
})

describe('check:event-codes · 真实树', () => {
  it('**当前码集与基线一致**（基线 18 个、扫描 20 个调用点）', () => {
    const baseline = JSON.parse(readFileSync('event-codes-baseline.json', 'utf8'))
    expect(validateBaseline(baseline)).toEqual([])
    const rows = scanEventCodes({ root: process.cwd() })
    const current = [...new Set(rows.map((r) => r.code))].sort()
    expect(rows.length, '调用点少于 10 → 判据空转').toBeGreaterThan(10)
    expect(diffCodes({ baseline: baseline.codes, current })).toEqual({ removed: [], added: [] })
  })

  it('**共享解析器不变量**：每个 reportEvent 调用点都被解析（scanner 内部自检不抛错）', () => {
    expect(() => scanEventCodes({ root: process.cwd() })).not.toThrow()
  })
})
