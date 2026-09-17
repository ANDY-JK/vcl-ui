// ==================== 单元格选择 / 矩形选区 / 显示矩阵 / 键盘导航 ====================
// 职责：单选 / Ctrl 多选 / 列选 / 矩形选区（拖选）四套选择模型，以及基于它们的键盘导航。
// 填充柄的「选区边界」视图见 cell-fill.ts（它只读本模块的快照，方向单一）。
import { ref } from 'vue'
import type { RangeSelection, CellEditProps, TableEditHooks } from './cell-types'
import { markActive } from './cell-active'

export interface CellSelectDeps {
  props: CellEditProps
  hooks?: TableEditHooks
  editKey: object
  /** 进入编辑（Enter 从选区触发） */
  startEdit: (rowKey: string, colKey: string, currentValue: string) => void
}

export function useCellSelect(deps: CellSelectDeps) {
  const { props, hooks, editKey } = deps

  const selectedCell = ref<{ rowKey: string; colKey: string } | null>(null) // 主选格（最后点击的）
  const selectedCellValue = ref('')
  /** 多选格集合：Ctrl+点击添加/移除，key = "rowKey|colKey" */
  const multiSelection = ref<Set<string>>(new Set())
  /** 选中整列的 colKey（列头 Ctrl+点击） */
  const selectedColKey = ref<string | null>(null)
  /** 矩形选区：长按/拖拽选择，优先级高于 Ctrl+点击多选 */
  const rangeSel = ref<RangeSelection | null>(null)
  /** 当前显示行列快照（DataTable 维护）：供无矩形选区时矩阵粘贴定位 */
  const displayRows = ref<string[]>([])
  const displayCols = ref<string[]>([])

  function markEditActive() {
    markActive(editKey)
  }

  function setDisplayMatrix(rows: string[], cols: string[]) {
    displayRows.value = rows
    displayCols.value = cols
  }

  function cellKey(rk: string, ck: string) {
    return `${rk}|${ck}`
  }

  /** 安全拆分 "rowKey|colKey"（rowKey 本身可能含 |） */
  function splitCellKey(key: string): [string, string] | null {
    const idx = key.indexOf('|')
    if (idx <= 0) return null
    return [key.slice(0, idx), key.slice(idx + 1)]
  }

  /** 取某格显示值（hook 优先，回落到空串） */
  function displayValue(rk: string, ck: string): string {
    return hooks?.getCellDisplayValue?.(rk, ck) ?? ''
  }

  // ==================== 选择 ====================

  function selectCell(rowKey: string, colKey: string, value: string, ctrlKey: boolean) {
    markEditActive()
    clearRange()
    const key = cellKey(rowKey, colKey)
    if (ctrlKey) {
      // Ctrl+点击：切换该格多选
      if (multiSelection.value.has(key)) {
        multiSelection.value.delete(key)
      } else {
        multiSelection.value.add(key)
      }
      // 用新的 Set 触发响应
      multiSelection.value = new Set(multiSelection.value)
      if (multiSelection.value.size > 0) {
        selectedCell.value = { rowKey, colKey }
        selectedCellValue.value = value
      } else {
        selectedCell.value = null
      }
      selectedColKey.value = null
    } else {
      // 普通点击：单选
      selectedCell.value = { rowKey, colKey }
      selectedCellValue.value = value
      multiSelection.value = new Set()
      selectedColKey.value = null
    }
  }

  /** 选中/取消整列（列头 Ctrl+点击） */
  function toggleSelectColumn(colKey: string) {
    markEditActive()
    clearRange()
    if (selectedColKey.value === colKey) {
      selectedColKey.value = null
    } else {
      selectedColKey.value = colKey
      selectedCell.value = null
      multiSelection.value = new Set()
    }
  }

  /** 单元格是否被选中（单选 / 多选 / 列选） */
  function isCellSelected(rowKey: string, colKey: string): boolean {
    if (isInRange(rowKey, colKey)) return true
    if (selectedColKey.value === colKey) return true
    if (multiSelection.value.has(cellKey(rowKey, colKey))) return true
    return selectedCell.value?.rowKey === rowKey && selectedCell.value?.colKey === colKey && multiSelection.value.size === 0
  }

  /** 判断单元格是否在矩形选区（按显示顺序的行列索引）。
      O(1) 版：用行列索引直接与锚点/焦点边界比较，替代 rows/cols 数组 indexOf（拖选 mousemove 高频路径 O(格数×行数)） */
  function isInRange(rowKey: string, colKey: string): boolean {
    const r = rangeSel.value
    if (!r) return false
    const ri = r.rowIndexOf(rowKey)
    const ci = r.cols.indexOf(colKey)
    if (ri < 0 || ci < 0) return false
    const r0 = Math.min(r.anchor.rowIndex, r.focus.rowIndex)
    const r1 = Math.max(r.anchor.rowIndex, r.focus.rowIndex)
    const c0 = Math.min(r.anchor.colIndex, r.focus.colIndex)
    const c1 = Math.max(r.anchor.colIndex, r.focus.colIndex)
    return ri >= r0 && ri <= r1 && ci >= c0 && ci <= c1
  }

  /** 是否为矩形选区的锚点格（视觉区分） */
  function isRangeAnchor(rowKey: string, colKey: string): boolean {
    const r = rangeSel.value
    if (!r) return false
    return r.anchor.rowKey === rowKey && r.anchor.colKey === colKey
  }

  /** 启动矩形选区（长按触发）：rows/cols 为当前显示行列快照 */
  function startRange(
    anchorRowIndex: number,
    anchorColIndex: number,
    rows: string[],
    cols: string[],
    anchorValue: string,
  ) {
    markEditActive()
    const anchorRowKey = rows[anchorRowIndex]
    const anchorColKey = cols[anchorColIndex]
    if (!anchorRowKey || !anchorColKey) return
    // 矩形选区与其它选择互斥
    selectedCell.value = null
    multiSelection.value = new Set()
    selectedColKey.value = null
    // rowKey → 显示行索引 Map：拖选判格 O(1)（rows 数组本身保留，供矩阵粘贴等按序取值）
    const rowIdxMap = new Map(rows.map((k, i) => [k, i]))
    rangeSel.value = {
      anchor: {
        rowKey: anchorRowKey,
        colKey: anchorColKey,
        rowIndex: anchorRowIndex,
        colIndex: anchorColIndex,
        value: anchorValue,
      },
      focus: { rowIndex: anchorRowIndex, colIndex: anchorColIndex },
      rows,
      cols,
      rowIndexOf: (k) => rowIdxMap.get(k) ?? -1,
    }
  }

  /** 拖拽中更新选区焦点 */
  function updateRange(focusRowIndex: number, focusColIndex: number) {
    if (!rangeSel.value) return
    rangeSel.value.focus = {
      rowIndex: Math.max(0, Math.min(focusRowIndex, rangeSel.value.rows.length - 1)),
      colIndex: Math.max(0, Math.min(focusColIndex, rangeSel.value.cols.length - 1)),
    }
  }

  /** 清空矩形选区（点击其它单元格 / 数据筛选排序分页变化 / 开始编辑时） */
  function clearRange() {
    rangeSel.value = null
  }

  // ==================== 键盘导航（选中态：方向键 / Enter / Delete） ====================

  /** 当前导航锚点：矩形选区优先取锚点格，否则取单选格 */
  function navAnchor(): { rowKey: string; colKey: string } | null {
    if (rangeSel.value) return { rowKey: rangeSel.value.anchor.rowKey, colKey: rangeSel.value.anchor.colKey }
    return selectedCell.value
  }

  function moveSelection(e: KeyboardEvent) {
    const anchor = navAnchor()
    if (!anchor) return
    const ri = displayRows.value.indexOf(anchor.rowKey)
    const ci = displayCols.value.indexOf(anchor.colKey)
    if (ri < 0 || ci < 0) return
    let nr = ri
    let nc = ci
    if (e.key === 'ArrowUp') nr = ri - 1
    else if (e.key === 'ArrowDown') nr = ri + 1
    else if (e.key === 'ArrowLeft') nc = ci - 1
    else if (e.key === 'ArrowRight') nc = ci + 1
    if (nr < 0 || nr >= displayRows.value.length || nc < 0 || nc >= displayCols.value.length) return
    const nk = displayRows.value[nr]
    const nck = displayCols.value[nc]
    if (!nk || !nck) return
    e.preventDefault()
    selectCell(nk, nck, displayValue(nk, nck), false)
    hooks?.scrollCellIntoView?.(nk, nck)
  }

  /** Shift+方向键：从锚点扩展/收缩矩形选区（Excel 行为） */
  function extendSelection(e: KeyboardEvent) {
    const anchor = navAnchor()
    if (!anchor) return
    const ri = displayRows.value.indexOf(anchor.rowKey)
    const ci = displayCols.value.indexOf(anchor.colKey)
    if (ri < 0 || ci < 0) return
    // 已有选区时基于当前焦点累进扩展；否则从锚点起步
    const baseRi = rangeSel.value ? rangeSel.value.focus.rowIndex : ri
    const baseCi = rangeSel.value ? rangeSel.value.focus.colIndex : ci
    let nr = baseRi
    let nc = baseCi
    if (e.key === 'ArrowUp') nr = baseRi - 1
    else if (e.key === 'ArrowDown') nr = baseRi + 1
    else if (e.key === 'ArrowLeft') nc = baseCi - 1
    else if (e.key === 'ArrowRight') nc = baseCi + 1
    if (nr < 0 || nr >= displayRows.value.length || nc < 0 || nc >= displayCols.value.length) return
    e.preventDefault()
    if (!rangeSel.value) {
      startRange(ri, ci, displayRows.value, displayCols.value, displayValue(anchor.rowKey, anchor.colKey))
    }
    updateRange(nr, nc)
    hooks?.scrollCellIntoView?.(displayRows.value[nr], displayCols.value[nc])
  }

  /** Ctrl+Home/End：跳到首格 / 末格 */
  function moveToEdge(e: KeyboardEvent) {
    const isHome = e.key === 'Home'
    const nk = displayRows.value[isHome ? 0 : displayRows.value.length - 1]
    const nck = displayCols.value[isHome ? 0 : displayCols.value.length - 1]
    if (!nk || !nck) return
    e.preventDefault()
    selectCell(nk, nck, displayValue(nk, nck), false)
    hooks?.scrollCellIntoView?.(nk, nck)
  }

  /** Enter：进入编辑（文本列；options/图片列忽略） */
  function enterEditFromSelection(e: KeyboardEvent) {
    const anchor = navAnchor()
    if (!anchor || !props.editable) return
    const col = props.columns?.find((c) => c.key === anchor.colKey)
    if (!col || col.editable === false || col.options || col.accept === 'image') return
    e.preventDefault()
    deps.startEdit(anchor.rowKey, anchor.colKey, displayValue(anchor.rowKey, anchor.colKey))
  }

  return {
    selectedCell,
    selectedCellValue,
    multiSelection,
    selectedColKey,
    rangeSel,
    displayRows,
    displayCols,
    markEditActive,
    setDisplayMatrix,
    cellKey,
    splitCellKey,
    displayValue,
    selectCell,
    toggleSelectColumn,
    isCellSelected,
    isInRange,
    isRangeAnchor,
    startRange,
    updateRange,
    clearRange,
    navAnchor,
    moveSelection,
    extendSelection,
    moveToEdge,
    enterEditFromSelection,
  }
}

export type CellSelectApi = ReturnType<typeof useCellSelect>
