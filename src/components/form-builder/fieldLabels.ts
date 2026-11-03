/**
 * 字段显示名去重 —— **导出与导入共用同一份口径**（#305）
 *
 * ## 为什么单独成文件
 *
 * 字段 `label` 是自由文本，设计器只保证 `key` 唯一。同名 label 会带来两个方向的问题：
 *
 * - **导出**（#304）：`buildExportRow` 用 label 当对象键，同名的后一个把前一个**覆盖**，
 *   Excel 里少一整列且无报错。
 * - **导入**（#305）：`buildHeaderMap` 把 `label → key` 建成映射，同名的后一个把前一个
 *   **覆盖**，于是"姓名"列永远导进第二个字段。
 *
 * 更糟的是两者**规则不一致**：导出给第一个字段写 `姓名`、第二个写 `姓名 (2)`；
 * 而导入把 `姓名` 映射给**最后**一个字段。于是「导出 → 在 Excel 里改 → 再导入」
 * 会把数据写进错字段，并把 `姓名 (2)` 当成未知列丢弃。
 *
 * 所以去重规则必须**只写一份、两边共用**：第一个保持原名，其后按出现顺序加 ` (n)`。
 */

/** 需要去重的"显示名 + 关联键" */
export interface LabeledColumn {
  label: string
}

/**
 * 同名标签按出现顺序加序号：`姓名` / `姓名 (2)` / `姓名 (3)`。
 *
 * 只改 label，不动其余字段（保持调用方的对象形态）。
 *
 * ⚠️ **序号必须避开"已被实体字段占用"的名字**（#400）。原来的"第 n 次出现就加 (n)"
 * 有残留洞：字段本来就叫 `姓名 (2)`（常见于上一次导出再导入），再出现一个 `姓名`
 * 时，第三个会算成 `姓名 (2)` —— 于是**两列同名**，#304 的"导出一列被静默覆盖"
 * 与 #305 的"导入写错字段"就原样复发。现在改成"整表已用名集合 + 顺延找空位"。
 */
export function dedupeFieldLabels<T extends LabeledColumn>(cols: T[]): T[] {
  // 两趟：先把**所有字面名**登记为已占用（唯一字段要保住原名，往返才稳定），
  // 再给重名的顺延找空位 —— 顺延目标既不能撞已分配的，也不能撞表里本来就有的。
  const reserved = new Set(cols.map((c) => c.label))
  const used = new Set<string>()
  return cols.map((col) => {
    if (!used.has(col.label)) {
      used.add(col.label)
      return col
    }
    // 顺延到第一个没被占用的序号（而不是"第几次出现"）
    let n = 2
    while (used.has(`${col.label} (${n})`) || reserved.has(`${col.label} (${n})`)) n++
    const label = `${col.label} (${n})`
    used.add(label)
    return { ...col, label }
  })
}
