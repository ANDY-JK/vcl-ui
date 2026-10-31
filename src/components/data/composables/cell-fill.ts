// ==================== 填充柄（拖拽批量填充，Excel 行为） ====================
// 依赖方向：fill → select（只读选区的行列快照与边界）→ write（写入漏斗）。无反向依赖。
import { computed } from 'vue'
import { buildFillCells } from './fill-series'
import type { FillDirection } from './fill-series'
import type { CellEditProps, WriteEntry } from './cell-types'
import { isTextWritable } from './cell-types'
import type { CellSelectApi } from './cell-select'
import type { CellWriteApi } from './cell-write'

export interface CellFillDeps {
  props: CellEditProps
  select: CellSelectApi
  write: CellWriteApi
}

export function useCellFill(deps: CellFillDeps) {
  const { props, select, write } = deps

  /** 当前有效选区边界（显示序）：矩形选区优先，**回退到单选格** ——
   *  Excel 里单击选中也带填充柄，所以单选是最小的 1×1 选区。 */
  function rangeBounds() {
    const r = select.rangeSel.value
    if (r) {
      return {
        r0: Math.min(r.anchor.rowIndex, r.focus.rowIndex),
        r1: Math.max(r.anchor.rowIndex, r.focus.rowIndex),
        c0: Math.min(r.anchor.colIndex, r.focus.colIndex),
        c1: Math.max(r.anchor.colIndex, r.focus.colIndex),
      }
    }
    const sc = select.selectedCell.value
    if (!sc) return null
    const ri = select.displayRows.value.indexOf(sc.rowKey)
    const ci = select.displayCols.value.indexOf(sc.colKey)
    if (ri < 0 || ci < 0) return null
    return { r0: ri, r1: ri, c0: ci, c1: ci }
  }

  /** 选区对应的行列快照：矩形选区用自身快照（拖选当时的顺序），单选回退到当前显示矩阵 */
  function rangeMatrix(): { rows: string[]; cols: string[] } {
    const r = select.rangeSel.value
    if (r) return { rows: r.rows, cols: r.cols }
    return { rows: select.displayRows.value, cols: select.displayCols.value }
  }

  /** 填充柄是否可用：**整表**可编辑 + 存在有效选区（矩形或单选格）+ 涉及列都可编辑。
   *  ⚠️ 必须同时校验 `props.editable`：applyFill 里有该守卫，若这里漏掉，
   *  整表不可编辑时填充柄照旧渲染（紫色小点），拖拽却无效 —— 「看着能点却点不了」。
   *  该判定同时驱动 `cell-fill-corner` 类与 `.cell-fill-handle` 的渲染，是唯一事实来源。 */
  function canFill(): boolean {
    if (!props.editable) return false
    const b = rangeBounds()
    if (!b) return false
    const { cols } = rangeMatrix()
    for (let ci = b.c0; ci <= b.c1; ci++) {
      const ck = cols[ci]
      if (!ck) return false
      const col = props.columns?.find((c) => c.key === ck)
      if (!isTextWritable(col)) return false
    }
    return true
  }

  /** 选中区域的当前显示值矩阵（含本地 override，即用户已改的值 —— 与 Excel 一致，填充基于眼前所见） */
  function sourceMatrix(): string[][] {
    const b = rangeBounds()
    if (!b) return []
    const { rows, cols } = rangeMatrix()
    const out: string[][] = []
    for (let ri = b.r0; ri <= b.r1; ri++) {
      const row: string[] = []
      for (let ci = b.c0; ci <= b.c1; ci++) {
        row.push(select.displayValue(rows[ri], cols[ci]))
      }
      out.push(row)
    }
    return out
  }

  /** 填充柄锚点：选区右下角单元格（模板在该格渲染小方块） */
  function isFillCorner(rowKey: string, colKey: string): boolean {
    const b = rangeBounds()
    if (!b) return false
    const { rows, cols } = rangeMatrix()
    return rows[b.r1] === rowKey && cols[b.c1] === colKey
  }

  /**
   * 拖拽填充：从选区边缘沿 direction 扩展 count 格并写入推断值。
   * 填充**理解列语义**（全数字走等差、日期按天步进）；options 列沿用源值循环，不做归一化。
   */
  function applyFill(direction: FillDirection, count: number): boolean {
    if (!props.editable || count <= 0) return false
    const b = rangeBounds()
    if (!b || !canFill()) return false
    const { rows, cols } = rangeMatrix()

    const src = sourceMatrix()
    const cells = buildFillCells(src, direction, count)
    const colMap = new Map((props.columns ?? []).map((c) => [c.key, c]))
    const entries: WriteEntry[] = []
    const next = { r0: b.r0, r1: b.r1, c0: b.c0, c1: b.c1 }

    for (const cell of cells) {
      // 填充格位置以「源选区左上角」为原点；up/left 的负偏移已由 buildFillCells 生成
      const ri = b.r0 + cell.rowOffset
      const ci = b.c0 + cell.colOffset
      if (ri < 0 || ri >= rows.length || ci < 0 || ci >= cols.length) continue
      const rk = rows[ri]
      const ck = cols[ci]
      if (!rk || !ck) continue
      if (!colMap.has(ck)) continue
      entries.push({ rowKey: rk, colKey: ck, value: cell.value })
      next.r0 = Math.min(next.r0, ri)
      next.r1 = Math.max(next.r1, ri)
      next.c0 = Math.min(next.c0, ci)
      next.c1 = Math.max(next.c1, ci)
    }
    if (!entries.length) return false

    write.applyChanges(entries)
    // 选区扩到「源 + 新增」，与 Excel 拖完保持整块选中一致。
    // 单选态拖填充 → 先立成矩形选区（用显示矩阵作快照）
    if (!select.rangeSel.value) {
      select.startRange(b.r0, b.c0, rows, cols, src[0]?.[0] ?? '')
    }
    const cur = select.rangeSel.value
    if (cur) {
      cur.focus = { rowIndex: next.r1, colIndex: next.c1 }
      cur.anchor = { ...cur.anchor, rowIndex: next.r0, colIndex: next.c0 }
    }
    return true
  }

  return {
    rangeBounds,
    rangeMatrix,
    canFill,
    isFillCorner,
    applyFill,
    /** 模板用：选区边界（拒绝写入的只读计算） */
    fillHandleRange: computed(() => rangeBounds()),
    /** 模板用：是否显示填充柄 */
    fillable: computed(() => canFill()),
  }
}

export type CellFillApi = ReturnType<typeof useCellFill>
