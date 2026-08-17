// 分页工具 — 页码计算
// ⛔ 保护 — 禁止：totalPages 计算逻辑改动（pageSize<=0 必须按 1 处理，否则 Math.ceil(total/0)=Infinity）

/** 计算总页数：pageSize<=0 按 1 处理，避免 Infinity 导致分页循环无限渲染；total 为 0/NaN 时兜底 1 页 */
export function calcTotalPages(total: number, pageSize: number): number {
  return Math.ceil(total / Math.max(1, pageSize)) || 1
}
