/**
 * 环境降速判据的自测（#371）
 *
 * ## 它守的是什么
 *
 * `bench --check` 判"回归"之前，先要判断**这台机器现在能不能测**。
 * 判错的两个方向都危险：
 *   · 该判"测不准"却判了回归 → 假阳性（本轮 #371 的起因）
 *   · 该判回归却判"测不准" → 真回归被放过
 *
 * ## 本轮的实测反例（务必保留在案）
 *
 * 2026-11-02 整链第 28 步：
 *   · 纯算术探针 ×1.57（未超 ×1.6，判"健康"）
 *   · 表格文本排序 123.50ms vs 基线 49.22ms → 折算后 ×2.44 > ×2.2 → 判红
 *   · 同一份代码空闲重跑：排序 ×1.11、探针 ×1.02 → 判绿
 *
 * 原因是那个场景**分配/GC 密集**，纯算术探针看不见那一维。修法：加分配探针，两者取大。
 */
import { describe, it, expect } from 'vitest'
import { envRatio, judgeEnv, normalizeRatio } from '../../scripts/bench-env.mjs'

const env = (over = {}) => ({
  cpuMs: 34,
  allocMs: 3.4,
  baseCpuMs: 34,
  baseAllocMs: 3.4,
  ...over,
})

describe('bench 环境降速判据', () => {
  it('**两探针都正常时降速为 1，环境健康**', () => {
    const e = envRatio(env())
    expect(e.ratio).toBeCloseTo(1, 6)
    expect(judgeEnv({ ratio: e.ratio, tolerance: 1.6 }).healthy).toBe(true)
  })

  it('**取两个探针里更大的那个 —— 分配变慢不能被算术正常掩盖**（本轮反例）', () => {
    // 算术只慢 1.57 倍（会判健康），分配慢 2.4 倍（真实情况）
    const e = envRatio(env({ cpuMs: 34 * 1.57, allocMs: 3.4 * 2.4 }))
    expect(e.cpuRatio).toBeCloseTo(1.57, 2)
    expect(e.allocRatio).toBeCloseTo(2.4, 2)
    expect(e.ratio).toBeCloseTo(2.4, 2)
    expect(e.source).toBe('alloc')
    // 关键：这一档必须判"不健康"，否则就会像 #371 那样把环境问题判成代码回归
    expect(judgeEnv({ ratio: e.ratio, tolerance: 1.6 }).healthy).toBe(false)
  })

  it('**旧基线只有算术探针时，分配维度不参与**（不能因缺字段就把环境判坏）', () => {
    const e = envRatio(env({ baseAllocMs: null }))
    expect(e.allocRatio).toBeNull()
    expect(e.ratio).toBeCloseTo(1, 6)
    expect(e.source).toBe('cpu')
  })

  it('**两个基线值都缺时降速按 1 处理**（无参照就不折算，报告里另有提示）', () => {
    const e = envRatio(env({ baseCpuMs: null, baseAllocMs: null }))
    expect(e).toMatchObject({ ratio: 1, source: null })
  })

  it('**折算：扣除环境降速后才暴露真实退化**', () => {
    expect(normalizeRatio({ ratio: 3.2, envRatioValue: 1.6 })).toBeCloseTo(2, 6)
    // 除数缺失/非法时按 1，绝不产生 NaN/Infinity 把判定搞崩
    expect(normalizeRatio({ ratio: 2, envRatioValue: 0 })).toBe(2)
    expect(normalizeRatio({ ratio: 2, envRatioValue: undefined })).toBe(2)
  })

  it('**机器比基线快时不产生 <1 的折算放大**（快机器不该被过度惩罚）', () => {
    const e = envRatio(env({ cpuMs: 20, allocMs: 2 }))
    expect(e.ratio).toBeLessThan(1)
    // 判定侧：ratio 小于 1 时 calRatio 归一化为 1（见 bench.mjs 的 allowed 计算）
    expect(judgeEnv({ ratio: e.ratio, tolerance: 1.6 }).healthy).toBe(true)
  })
})
