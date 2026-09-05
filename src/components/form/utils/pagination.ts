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
  if (current > 4) pages.push(-1)
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i)
  if (current < total - 3) pages.push(-1)
  pages.push(total)
  return pages
}
