/**
 * 环境降速倍率的**纯函数版**（#371，从 bench.mjs 拆出）
 *
 * ## 为什么单独成文件
 *
 * `bench.mjs` 顶层会跑全部基准（十几秒到几十秒），任何 import 它的人都得等一遍。
 * 判定逻辑抽出来才能秒级单测 —— 与 #368 把 RTL 判据拆成 `rtl-judge.mjs` 同一手法。
 *
 * ## 为什么需要两个探针（本文件存在的全部理由）
 *
 * 原实现只有一个「纯整数运算」探针，用来判断"这台机器现在能不能测"。
 * 2026-11-02 整链第 28 步实测反例：
 *
 *   · 算力校准 53.1ms vs 基线 33.9ms → ×1.57（未超容差 ×1.6）
 *   · 表格客户端排序 123.50ms vs 基线 49.22ms → 原始 ×2.51，折算后 ×2.44（阈值 ×2.2）→ 判红
 *   · 但**同一份代码**在空闲时重跑：排序 48.93ms（×1.11）、算力校准 ×1.02 → 判绿
 *
 * 结论：那个场景是**分配/GC 密集**（1 万行 × 10 列文本排序，大量临时字符串与数组），
 * 而纯算术探针对 GC 压力、内存带宽几乎不敏感 —— **环境整体慢了 2.4 倍，探针只报 1.57 倍**，
 * 折算不足 → 假回归。
 *
 * ## 判定语义
 *
 * · 取两个探针里**更大的**降速倍率（任一维度变慢都说明这台机器不能测）
 * · 超过容差 → `unhealthy`，调用方据此**不判回归**（诚实的降级：报告里写明"这次没测准"）
 * · 基线缺探针值 → 该维度不参与（向后兼容旧基线），两个都缺则降速按 1 处理
 */

/**
 * @param {object} p
 * @param {number} p.cpuMs        本次纯算术探针耗时（ms）
 * @param {number} p.allocMs      本次分配探针耗时（ms）
 * @param {number|null} p.baseCpuMs   基线记录的纯算术探针耗时
 * @param {number|null} p.baseAllocMs 基线记录的分配探针耗时
 * @returns {{ratio: number, cpuRatio: number|null, allocRatio: number|null, source: 'cpu'|'alloc'|null}}
 */
export function envRatio({ cpuMs, allocMs, baseCpuMs, baseAllocMs }) {
  const cpuRatio = typeof baseCpuMs === 'number' && baseCpuMs > 0 ? cpuMs / baseCpuMs : null
  const allocRatio = typeof baseAllocMs === 'number' && baseAllocMs > 0 ? allocMs / baseAllocMs : null
  const candidates = [
    ['cpu', cpuRatio],
    ['alloc', allocRatio],
  ].filter(([, r]) => typeof r === 'number')
  if (!candidates.length) return { ratio: 1, cpuRatio, allocRatio, source: null }
  // 取更大的那个：任一处变慢都意味着这台机器现在不能测
  const [source, ratio] = candidates.reduce((a, b) => (b[1] > a[1] ? b : a))
  return { ratio, cpuRatio, allocRatio, source }
}

/**
 * 环境是否健康到可以判回归。
 *
 * @param {{ratio: number, tolerance: number}} p
 * @returns {{healthy: boolean, overBy: number}}  overBy = 超出容差多少倍（健康时为 0）
 */
export function judgeEnv({ ratio, tolerance }) {
  const healthy = !(ratio > tolerance)
  return { healthy, overBy: healthy ? 0 : ratio / tolerance }
}

/**
 * 把某场景的实测倍率折算成"扣掉环境降速后还剩多少"。
 *
 * 注意折算后**不做上限裁剪**：环境不健康时调用方本就不判回归，
 * 这里只负责如实相除，避免掩盖"折算后依然很差"的情况。
 */
export function normalizeRatio({ ratio, envRatioValue }) {
  const denom = envRatioValue && envRatioValue > 0 ? envRatioValue : 1
  return ratio / denom
}
