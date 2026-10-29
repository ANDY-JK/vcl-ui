/**
 * 时间串 → 毫秒；缺失或非法一律 0
 *
 * 为什么单独成文件（第 173 轮）：本函数最初写在 supabase-transport.ts 里，
 * s3-transport.ts `import { toEpochMs } from './supabase-transport'` 复用后形成
 * **循环依赖**（contract-storage → s3-transport → supabase-transport → …），
 * 运行时 toEpochMs 拿到 undefined（`toEpochMs is not a function`）。
 * 抽成零依赖叶子模块，两个传输层各自单向引入，环自然消失。
 * 这也是"同一缺陷不要再出现两份实现"的正确做法——共用实现，但放在无环的位置。
 *
 * 为什么错误值要归一成 0 而不是留 NaN：`new Date('垃圾').getTime()` 是 NaN，
 * 而 NaN 参与比较恒为 false（`NaN > x`、`NaN <= x` 全 false），会让
 * "取更新时间较新者"这类逻辑静默选错；JSON 序列化后又变成 null。
 * 所以在边界上就归一成 0（语义 = "不知道"）。
 */
export function toEpochMs(value: string | undefined | null): number {
  if (!value) return 0
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : 0
}
