// 滑块数值工具 — Slider 步进对齐与钳制
// ⛔ 保护 — 禁止：步进对齐 / 钳制逻辑改动

/** 钳制到 [min, max] */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** 按 step 对齐（浮点安全：先除后 round 再乘）并钳制到 [min, max]；step<=0 时按 1 处理 */
export function alignStep(v: number, min: number, max: number, step: number): number {
  const st = step > 0 ? step : 1
  const stepped = Math.round((v - min) / st) * st + min
  return clamp(stepped, min, max)
}
