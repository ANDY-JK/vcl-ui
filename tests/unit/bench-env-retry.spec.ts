/* ═══════════ 环境不健康时的复判（TD-05 收口，#444） ═══════════
 *
 * 旧行为：校准探针一旦超容差，`bench --check` 一律"不判性能回归"（exit 0 + 醒目警告）。
 * 诚实的降级，但把**稳定偏慢的机器**和**忽快忽慢的机器**混成一类 —— 前者只是 CPU 降频，
 * 场景与探针同比放大，折算判据完全成立，真回归本可被抓到。
 *
 * 本 spec 覆盖纯函数判据 + 接线（防止 bench.mjs 以后又退化成一律未判定）。
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { judgeUnhealthyRetry, judgeEnv, normalizeRatio } from '../../scripts/bench-env.mjs'

const TOL = 1.6

describe('judgeUnhealthyRetry · 稳定偏慢 / 忽快忽慢', () => {
  it('**稳定偏慢 → proceed-normalized**（不再一律未判定，真回归仍能被抓）', () => {
    const r = judgeUnhealthyRetry({ ratios: [1.92, 1.95, 1.90], tolerance: TOL })
    expect(r.verdict).toBe('proceed-normalized')
    expect(r.stable).toBe(true)
    expect(r.allSlow).toBe(true)
    expect(r.spread).toBeLessThan(1.05)
  })

  it('**忽快忽慢 → undetermined**（离散度大，承认测不准）', () => {
    const r = judgeUnhealthyRetry({ ratios: [1.10, 2.70, 1.35], tolerance: TOL })
    expect(r.verdict).toBe('undetermined')
    expect(r.stable).toBe(false)
  })

  it('**复判时机器恢复 → healthy**（不能拿首轮的慢倍率继续放宽门槛）', () => {
    const r = judgeUnhealthyRetry({ ratios: [1.02, 1.04, 1.01], tolerance: TOL })
    expect(r.verdict).toBe('healthy')
    expect(r.reason).toContain('恢复')
  })

  it('**样本不足 / 脏数据 → undetermined**（fail-closed）', () => {
    expect(judgeUnhealthyRetry({ ratios: [1.9, 1.9], tolerance: TOL }).verdict).toBe('undetermined')
    expect(judgeUnhealthyRetry({ ratios: [1.9, Number.NaN, 0, 1.9], tolerance: TOL }).verdict).toBe(
      'undetermined',
    )
    expect(judgeUnhealthyRetry({ ratios: [], tolerance: TOL }).verdict).toBe('undetermined')
  })

  it('**跨容差两侧 → undetermined**（状态不一致，不能瞎折算）', () => {
    expect(judgeUnhealthyRetry({ ratios: [1.55, 1.56, 1.57, 1.65], tolerance: TOL, spreadTolerance: 1.2 }).verdict).toBe(
      'undetermined',
    )
  })

  it('**离散度阈值边界**：等于上限算稳定，超过算不稳定', () => {
    const at = judgeUnhealthyRetry({ ratios: [1.80, 1.80, 2.07], tolerance: TOL, spreadTolerance: 1.15 })
    const over = judgeUnhealthyRetry({ ratios: [1.80, 1.80, 2.08], tolerance: TOL, spreadTolerance: 1.15 })
    expect(at.stable).toBe(true)
    expect(over.stable).toBe(false)
  })

  it('**折算判据仍在**：稳定偏慢机器上的真回归（场景 ×4.0）折算后仍超常规阈值', () => {
    expect(judgeEnv({ ratio: 1.9, tolerance: TOL }).healthy).toBe(false)
    expect(normalizeRatio({ ratio: 4.0, envRatioValue: 1.9 })).toBeGreaterThan(2.0)
  })
})

describe('bench.mjs · 接线（防"又退化成一律未判定"）', () => {
  const src = readFileSync('scripts/bench.mjs', 'utf8')

  it('调用 judgeUnhealthyRetry 且按 verdict 分支处理（不是无条件清 regressions）', () => {
    expect(src).toContain('judgeUnhealthyRetry({ ratios: retryRatios')
    expect(src).toMatch(/retry\.verdict === 'proceed-normalized'[\s\S]*envUnhealthy = false/)
    expect(src).toMatch(/retry\.verdict === 'healthy'[\s\S]*envUnhealthy = false/)
  })

  it('复判样本数是 3（与纯函数的最少样本数一致）', () => {
    expect(src).toMatch(/for \(let k = 0; k < 3; k\+\+\)/)
  })

  it('**负向对照（合成夹具）**：把复判短路成"一律不健康" → 静态判据必须报', () => {
    const mutant = src.replace(
      "const retry = judgeUnhealthyRetry({ ratios: retryRatios, tolerance: CALIBRATION_TOLERANCE })",
      "const retry = { verdict: 'undetermined', reason: 'SHORT_CIRCUIT' }",
    )
    expect(mutant).not.toBe(src)
    expect(mutant).not.toContain('judgeUnhealthyRetry({ ratios: retryRatios')
  })
})
