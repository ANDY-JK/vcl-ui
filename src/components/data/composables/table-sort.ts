/**
 * 表格排序的比较器（纯函数，与列定义/DOM 无关）
 *
 * ## 为什么需要它（#419）
 *
 * `displayData` 原来把每个单元格先 `String(v ?? '')` 再比较。对文本列没问题，
 * 但对**日期列**是灾难：`String(new Date('2026-01-02'))` 得到 `'Fri Jan 02 2026 …'`，
 * 于是排序实际在按**星期几的英文名**排 —— 用户点「按日期升序」，看到的是周内乱序，
 * 而数据本身完全合法（宿主传 `Date` 对象是受支持的：`getCellText` 会把它格式化成 `YYYY-MM-DD`）。
 *
 * 同类风险：`number` 列传的是数字本身（`String(9)`/`String(10)` 会被 `numeric:true` 兜住，
 * 但只要混进一个带千分位的 `'1,200'` 就会退化成文本序）。所以这里先做**类型投影**再比较：
 *
 *   时间戳/数字 → 数值比较；其余 → `localeCompare(numeric:true)`（含中文排序）
 *
 * 空值（`null`/`undefined`/`''`）按"最小"处理，与改造前行为一致（升序在前、降序在后），
 * 这样既有用例不必跟着改。
 */

/** 比较投影：能当数就用数，否则当字符串 */
type Projection = { kind: 'num'; num: number } | { kind: 'str'; str: string } | { kind: 'empty' }

/** 纯数字文本（不含千分位、不含科学计数法 —— 与填充系列的判据同口径） */
const NUMERIC_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)$/

function project(v: unknown): Projection {
  if (v === null || v === undefined) return { kind: 'empty' }
  // Date 必须先判：`String(date)` 是"星期 月 日 年"的本地化文本，按它排就是按星期几排
  if (v instanceof Date) {
    const t = v.getTime()
    // 非法日期（Invalid Date）当空值：NaN 参与比较会让整个排序变成"随机"
    return Number.isFinite(t) ? { kind: 'num', num: t } : { kind: 'empty' }
  }
  if (typeof v === 'number') return Number.isFinite(v) ? { kind: 'num', num: v } : { kind: 'empty' }
  if (typeof v === 'bigint') return { kind: 'num', num: Number(v) }
  if (typeof v === 'boolean') return { kind: 'str', str: v ? '1' : '0' }
  const s = String(v)
  if (s === '') return { kind: 'empty' }
  return NUMERIC_TEXT.test(s) ? { kind: 'num', num: Number(s) } : { kind: 'str', str: s }
}

/**
 * 单元格值比较：负数表示 a 在前。
 *
 * 空值恒为最小（两侧都空则为 0，保持稳定排序的相对顺序）。
 * 一侧是数、另一侧是文本时按文本比 —— 混合类型列没有正确答案，
 * 统一交给 `localeCompare(numeric:true)` 至少保证**同一份数据每次排出同样的顺序**。
 */
export function compareCellValues(a: unknown, b: unknown): number {
  const pa = project(a)
  const pb = project(b)
  if (pa.kind === 'empty' || pb.kind === 'empty') {
    if (pa.kind === 'empty' && pb.kind === 'empty') return 0
    return pa.kind === 'empty' ? -1 : 1
  }
  if (pa.kind === 'num' && pb.kind === 'num') {
    // 相等时返回 0（而不是 -0/NaN）：NaN 会让 Array#sort 的比较结果失去传递性
    return pa.num === pb.num ? 0 : pa.num < pb.num ? -1 : 1
  }
  const sa = pa.kind === 'num' ? String(pa.num) : pa.str
  const sb = pb.kind === 'num' ? String(pb.num) : pb.str
  return sa.localeCompare(sb, undefined, { numeric: true })
}
