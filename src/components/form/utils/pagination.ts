/**
 * 分页按钮序列计算（FormCollect 记录列表 / FormDataSummary 明细表共用）
 *
 * 返回页码数组，-1 表示省略号：
 * - 总页数 ≤7 全量展示
 * - 超过时展示 首页 + 当前页邻域（±1）+ 尾页，缺口以省略号填充
 */
export function computePageButtons(current: number, total: number): number[] {
  const pages: number[] = []
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i)
    return pages
  }
  pages.push(1)
  // 省略号条件按「邻域与首/尾页之间是否存在被吞页码」判定：
  // 邻域起点 current-1 与首页 1 之间差 >1 页才需要 -1（旧条件 current>4 会在
  // current=4 时静默吞掉页码 2）；右侧对偶（旧条件 current<total-3 在
  // current=total-3 时吞掉 total-1 页）
  if (current - 1 > 2) pages.push(-1)
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i)
  if (current + 1 < total - 1) pages.push(-1)
  pages.push(total)
  return pages
}
