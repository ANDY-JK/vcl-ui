// ⛔ 保护 — 禁止修改 EditState 接口结构，禁止删除 editable/noteMode 逻辑
//    需我确认：编辑状态管理、批处理 cellChange/batchChange 事件签名
// ==================== 单元格编辑 & 备注提示 ====================
import { ref, watch, nextTick, computed } from 'vue'
import type { Column } from './types'

export interface EditState {
  rowKey: string
  colKey: string
  value: string
}

/** 矩形选区（拖选结果）：行/列均为「显示顺序」快照，anchor 为起始格 */
export interface RangeSelection {
  anchor: {
    rowKey: string
    colKey: string
    rowIndex: number
    colIndex: number
    value: string
  }
  focus: { rowIndex: number; colIndex: number }
  /** 当前显示行的 rowKey（按显示顺序） */
  rows: string[]
  /** 当前显示列的 colKey（按显示顺序） */
  cols: string[]
  /** rowKey → 显示行索引：拖选 mousemove 高频判格用 O(1)，避免 rows.indexOf 的 O(n) 逐格扫描 */
  rowIndexOf: (rowKey: string) => number
}

export interface TableEditHooks {
  /** 获取矩形选区某格显示值（复制时使用） */
  getCellDisplayValue?: (rowKey: string, colKey: string) => string
  /** 滚动到某单元格（键盘导航时保持可见） */
  scrollCellIntoView?: (rowKey: string, colKey: string) => void
  /** 复制成功后的轻提示回调 */
  onCopied?: () => void
}

import { readClipboardImage, extractImageFile } from './utils'
import { copyText } from '../../_internal/useCopy'

/** 模块级活动实例标记：多实例共存时，Ctrl+C/V 只作用于最后点击/拖选过的表格 */
let _activeEditInstance: object | null = null

export function useTableEdit(
  props: {
    columns?: Column[]
    editable?: boolean
    /** 键盘导航开关：false 时方向键/Enter/Delete/Ctrl+Home/End 不拦截（Ctrl+C/V 仍可用） */
    keyboardNav?: boolean
    noteMode?: boolean
    /** 外部传入的备注数据 */
    notes?: Record<string, Record<string, string>>
    /** @patch 2026-07-15 原始值气泡：hover 已编辑单元格时弹出原始值供对比 */
    originalTooltip?: boolean
  },
  emit: {
    cellChange: (rowKey: string, colKey: string, newValue: string) => void
    cellNote: (rowKey: string, colKey: string, note: string) => void
  },
  hooks?: TableEditHooks,
) {
  /** 当前实例唯一标识 */
  const _editKey = {}
  function markEditActive() {
    _activeEditInstance = _editKey
  }

  // ==================== 修改追踪 & 即时预览 ====================
  const _modifiedRows = ref<Set<string>>(new Set())
  const modifiedCount = computed(() => _modifiedRows.value.size)
  /** 本地覆盖值：rowKey → { colKey: displayValue }，改后即时显示 */
  const _cellOverrides = ref<Record<string, Record<string, string>>>({})

  function getCellValue(rowKey: string, colKey: string, original: string): string {
    return _cellOverrides.value[rowKey]?.[colKey] ?? original
  }

  function _applyChange(rowKey: string, colKey: string, value: string) {
    if (!_cellOverrides.value[rowKey]) _cellOverrides.value[rowKey] = {}
    _cellOverrides.value[rowKey][colKey] = value
    _modifiedRows.value.add(rowKey)
    emit.cellChange(rowKey, colKey, value)
  }

  // ==================== 单元格选择 & 内部剪贴板 ====================
  const selectedCell = ref<{ rowKey: string; colKey: string } | null>(null) // 主选格（最后点击的）
  const _selectedCellValue = ref('')
  const _clipboard = ref('')
  /** 多选格集合：Ctrl+点击添加/移除，key = "rowKey|colKey" */
  const _multiSelection = ref<Set<string>>(new Set())
  /** 选中整列的 colKey（列头 Ctrl+点击） */
  const _selectedColKey = ref<string | null>(null)
  /** 矩形选区：长按/拖拽选择，优先级高于 Ctrl+点击多选 */
  const rangeSel = ref<RangeSelection | null>(null)
  /** 当前显示行列快照（DataTable 维护）：供无矩形选区时矩阵粘贴定位 */
  const displayRows = ref<string[]>([])
  const displayCols = ref<string[]>([])

  function setDisplayMatrix(rows: string[], cols: string[]) {
    displayRows.value = rows
    displayCols.value = cols
  }

  function _cellKey(rk: string, ck: string) {
    return `${rk}|${ck}`
  }

  /** 安全拆分 "rowKey|colKey"（rowKey 本身可能含 |） */
  function _splitCellKey(key: string): [string, string] | null {
    const idx = key.indexOf('|')
    if (idx <= 0) return null
    return [key.slice(0, idx), key.slice(idx + 1)]
  }

  /** 列是否接受某粘贴值：图片列拒绝文本；下拉选项列仅接受选项内值（保护数据约束） */
  function isAllowedColumnValue(col: Column | undefined, value: string): boolean {
    if (!col) return true
    if (col.accept === 'image') return false
    if (!col.options || col.options.length === 0) return true
    return col.options.some((o) =>
      typeof o === 'string' ? o === value : String(o.value) === value || String(o.label ?? o.value) === value,
    )
  }

  function selectCell(rowKey: string, colKey: string, displayValue: string, ctrlKey: boolean) {
    markEditActive()
    clearRange()
    const key = _cellKey(rowKey, colKey)
    if (ctrlKey) {
      // Ctrl+点击：切换该格多选
      if (_multiSelection.value.has(key)) {
        _multiSelection.value.delete(key)
      } else {
        _multiSelection.value.add(key)
      }
      // 用新的 Set 触发响应
      _multiSelection.value = new Set(_multiSelection.value)
      if (_multiSelection.value.size > 0) {
        selectedCell.value = { rowKey, colKey }
        _selectedCellValue.value = displayValue
      } else {
        selectedCell.value = null
      }
      _selectedColKey.value = null
    } else {
      // 普通点击：单选
      selectedCell.value = { rowKey, colKey }
      _selectedCellValue.value = displayValue
      _multiSelection.value = new Set()
      _selectedColKey.value = null
    }
  }

  /** 选中/取消整列（列头 Ctrl+点击） */
  function toggleSelectColumn(colKey: string) {
    markEditActive()
    clearRange()
    if (_selectedColKey.value === colKey) {
      _selectedColKey.value = null
    } else {
      _selectedColKey.value = colKey
      selectedCell.value = null
      _multiSelection.value = new Set()
    }
  }

  /** 单元格是否被选中（单选 / 多选 / 列选） */
  function isCellSelected(rowKey: string, colKey: string): boolean {
    if (isInRange(rowKey, colKey)) return true
    if (_selectedColKey.value === colKey) return true
    if (_multiSelection.value.has(_cellKey(rowKey, colKey))) return true
    return (
      selectedCell.value?.rowKey === rowKey && selectedCell.value?.colKey === colKey && _multiSelection.value.size === 0
    )
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
    _multiSelection.value = new Set()
    _selectedColKey.value = null
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
    selectCell(nk, nck, hooks?.getCellDisplayValue?.(nk, nck) ?? '', false)
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
      startRange(
        ri,
        ci,
        displayRows.value,
        displayCols.value,
        hooks?.getCellDisplayValue?.(anchor.rowKey, anchor.colKey) ?? '',
      )
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
    selectCell(nk, nck, hooks?.getCellDisplayValue?.(nk, nck) ?? '', false)
    hooks?.scrollCellIntoView?.(nk, nck)
  }

  /** Enter：进入编辑（文本列；options/图片列忽略） */
  function enterEditFromSelection(e: KeyboardEvent) {
    const anchor = navAnchor()
    if (!anchor || !props.editable) return
    const col = props.columns?.find((c) => c.key === anchor.colKey)
    if (!col || col.editable === false || col.options || col.accept === 'image') return
    e.preventDefault()
    startEdit(anchor.rowKey, anchor.colKey, hooks?.getCellDisplayValue?.(anchor.rowKey, anchor.colKey) ?? '')
  }

  /** Delete/Backspace：清空选中格（矩形选区全清；只读/图片列跳过） */
  function clearSelection(e?: KeyboardEvent) {
    // 非编辑模式下禁用清空（键盘 Delete 与右键菜单共用此入口）
    if (!props.editable) return
    const colMap = new Map((props.columns ?? []).map((c) => [c.key, c]))
    const r = rangeSel.value
    if (r) {
      const r0 = Math.min(r.anchor.rowIndex, r.focus.rowIndex)
      const r1 = Math.max(r.anchor.rowIndex, r.focus.rowIndex)
      const c0 = Math.min(r.anchor.colIndex, r.focus.colIndex)
      const c1 = Math.max(r.anchor.colIndex, r.focus.colIndex)
      let changed = false
      for (let ri = r0; ri <= r1; ri++) {
        for (let ci = c0; ci <= c1; ci++) {
          const rk = r.rows[ri]
          const ck = r.cols[ci]
          if (!rk || !ck) continue
          const col = colMap.get(ck)
          if (col?.editable === false || col?.accept === 'image') continue
          _applyChange(rk, ck, '')
          changed = true
        }
      }
      if (changed) e?.preventDefault?.()
      return
    }
    if (!selectedCell.value) return
    const { rowKey, colKey } = selectedCell.value
    const col = colMap.get(colKey)
    if (col?.editable === false || col?.accept === 'image') return
    e?.preventDefault?.()
    _applyChange(rowKey, colKey, '')
    _selectedCellValue.value = ''
  }

  /** 粘贴纯文本到选区：包含制表符/换行 → 按矩阵从锚点填充；否则单值填满选区 */
  function pasteText(text: string) {
    if (!text) return
    const looksMatrix = /[\t\n\r]/.test(text)
    const target = looksMatrix ? resolvePasteTarget() : null
    if (target) pasteMatrix(text, target)
    else pasteValue(text)
  }

  /** 粘贴定位：矩形选区 > 单击格 > 整列选择（均按当前显示行列映射） */
  interface PasteTarget {
    rows: string[]
    cols: string[]
    anchorRi: number
    anchorCi: number
  }
  function resolvePasteTarget(): PasteTarget | null {
    if (rangeSel.value) {
      const r = rangeSel.value
      return { rows: r.rows, cols: r.cols, anchorRi: r.anchor.rowIndex, anchorCi: r.anchor.colIndex }
    }
    if (selectedCell.value) {
      const ri = displayRows.value.indexOf(selectedCell.value.rowKey)
      const ci = displayCols.value.indexOf(selectedCell.value.colKey)
      if (ri >= 0 && ci >= 0) {
        return { rows: displayRows.value, cols: displayCols.value, anchorRi: ri, anchorCi: ci }
      }
      return null
    }
    if (_selectedColKey.value) {
      const ci = displayCols.value.indexOf(_selectedColKey.value)
      if (ci >= 0) return { rows: displayRows.value, cols: displayCols.value, anchorRi: 0, anchorCi: ci }
    }
    return null
  }

  /** 矩阵粘贴：从目标锚点开始逐行逐列填充（行/列均只落在当前显示范围） */
  function pasteMatrix(text: string, target: PasteTarget) {
    const colMap = new Map((props.columns ?? []).map((c) => [c.key, c]))
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    // 末尾空行（Excel 复制常带）忽略
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
    for (let i = 0; i < lines.length; i++) {
      const cells = lines[i].split('\t')
      for (let j = 0; j < cells.length; j++) {
        const rk = target.rows[target.anchorRi + i]
        const ck = target.cols[target.anchorCi + j]
        if (!rk || !ck) continue
        const col = colMap.get(ck)
        if (!isAllowedColumnValue(col, cells[j])) continue
        _applyChange(rk, ck, cells[j])
      }
    }
  }

  /** 单值粘贴：矩形选区 → 填满整个区域；否则走原有单选/多选/整列逻辑 */
  function pasteValue(value: string) {
    const colMap = new Map((props.columns ?? []).map((c) => [c.key, c]))
    const r = rangeSel.value
    if (r) {
      const r0 = Math.min(r.anchor.rowIndex, r.focus.rowIndex)
      const r1 = Math.max(r.anchor.rowIndex, r.focus.rowIndex)
      const c0 = Math.min(r.anchor.colIndex, r.focus.colIndex)
      const c1 = Math.max(r.anchor.colIndex, r.focus.colIndex)
      for (let ri = r0; ri <= r1; ri++) {
        for (let ci = c0; ci <= c1; ci++) {
          const rk = r.rows[ri]
          const ck = r.cols[ci]
          if (!rk || !ck) continue
          const col = colMap.get(ck)
          if (!isAllowedColumnValue(col, value)) continue
          _applyChange(rk, ck, value)
        }
      }
      return
    }
    if (_multiSelection.value.size > 0) {
      for (const key of _multiSelection.value) {
        const parts = _splitCellKey(key)
        if (!parts) continue
        const [rk, ck] = parts
        const col = colMap.get(ck)
        if (!isAllowedColumnValue(col, value)) continue
        _applyChange(rk, ck, value)
      }
    } else if (_selectedColKey.value) {
      const col = colMap.get(_selectedColKey.value)
      if (isAllowedColumnValue(col, value)) {
        for (const rk of _pasteRowKeys.value) _applyChange(rk, _selectedColKey.value, value)
      }
    } else if (selectedCell.value) {
      const col = colMap.get(selectedCell.value!.colKey)
      if (isAllowedColumnValue(col, value)) {
        _applyChange(selectedCell.value.rowKey, selectedCell.value.colKey, value)
        _selectedCellValue.value = value
      }
    }
  }

  async function copySelectedCell() {
    if (!selectedCell.value) return
    const val = _selectedCellValue.value
    _clipboard.value = val
    // @patch 2026-08-09 同步写入系统剪贴板：
    // Ctrl+V 优先读取系统剪贴板，若不写入，粘贴会拿到用户之前留在系统里的旧内容
    await copyText(val)
    hooks?.onCopied?.()
  }

  /** 粘贴内部剪贴板到所有选中格（矩形选区支持矩阵） */
  const _pasteRowKeys = ref<string[]>([])

  function pasteToSelection() {
    if (!_clipboard.value) return
    pasteText(_clipboard.value)
  }

  /** 复制矩形选区为 TSV（写入系统剪贴板 + 内部剪贴板兜底）；值内换行/制表符转空格防行列错位 */
  async function copyRangeSelection() {
    const r = rangeSel.value
    if (!r) return
    const r0 = Math.min(r.anchor.rowIndex, r.focus.rowIndex)
    const r1 = Math.max(r.anchor.rowIndex, r.focus.rowIndex)
    const c0 = Math.min(r.anchor.colIndex, r.focus.colIndex)
    const c1 = Math.max(r.anchor.colIndex, r.focus.colIndex)
    const tsv = r.rows
      .slice(r0, r1 + 1)
      .map((rk) =>
        r.cols
          .slice(c0, c1 + 1)
          .map((ck) => {
            const col = props.columns?.find((c) => c.key === ck)
            if (col?.accept === 'image') return ''
            const v = hooks?.getCellDisplayValue?.(rk, ck) ?? ''
            return String(v).replace(/[\t\r\n]+/g, ' ')
          })
          .join('\t'),
      )
      .join('\n')
    _clipboard.value = tsv
    await copyText(tsv)
    hooks?.onCopied?.()
  }

  /** 全局 Ctrl+C / Ctrl+V（编辑中跳过；优先系统剪贴板，内部剪贴板兜底） */
  async function onCellKeydown(e: KeyboardEvent) {
    // 多实例共存时，第一个处理的实例 preventDefault 后其余实例跳过，避免一次粘贴改多个表格
    if (e.defaultPrevented) return
    // 只处理最后点击/拖选过的实例（用户视角的“当前表格”）
    if (_activeEditInstance !== _editKey) return
    // 浮层（右键菜单/选项面板/筛选下拉/列设置）内的键盘事件交给浮层自身处理，
    // 避免 capture 阶段误触表格导航（如菜单 Enter 进入编辑）
    const target = e.target as HTMLElement | null
    if (target?.closest?.('.dt-context-menu, .opt-drop-panel, .dt-filter-dropdown, .dt-col-settings')) return
    // 普通表单输入框（工具栏全局搜索/列设置搜索等）内的按键交给原生光标，
    // 避免选中单元格后方向键被表格劫持导致输入框光标无法移动
    if (target?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return
    if (editingCell.value) return
    // 键盘导航：方向键移动选中格、Enter 进入编辑、Delete 清空（编辑输入框内已提前返回）
    if (props.keyboardNav !== false) {
      const isArrow = e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight'
      if (e.shiftKey && isArrow) {
        if (navAnchor()) extendSelection(e)
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'Home' || e.key === 'End')) {
        if (navAnchor()) moveToEdge(e)
      } else if (!(e.ctrlKey || e.metaKey) && !e.altKey) {
        if (isArrow) {
          if (navAnchor()) moveSelection(e)
        } else if (e.key === 'Enter') {
          enterEditFromSelection(e)
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          clearSelection(e)
        }
      }
    }
    const hasSelection = rangeSel.value || selectedCell.value || _multiSelection.value.size > 0 || _selectedColKey.value

    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      // 用户有划词文本选择时，放行让浏览器原生复制处理
      const textSelection = window.getSelection()?.toString().trim()
      if (textSelection) return

      if (hasSelection && selectedCell.value) {
        e.preventDefault()
        await copySelectedCell()
      } else if (rangeSel.value) {
        e.preventDefault()
        await copyRangeSelection()
      } else if (_selectedColKey.value) {
        e.preventDefault()
        _clipboard.value = ''
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      if (props.editable && hasSelection) {
        e.preventDefault()
        // 优先读取系统剪贴板（支持从 Excel/网页复制 TSV 矩阵）
        let external: string
        try {
          external = await navigator.clipboard.readText()
        } catch {
          external = ''
        }
        if (external) {
          pasteText(external)
        } else if (_clipboard.value) {
          pasteToSelection()
        }
      }
    }
  }

  // ==================== 编辑模式 ====================
  const editingCell = ref<EditState | null>(null)
  const editValue = ref('')
  /** 进入编辑前的选中锚点：退出编辑后恢复，保证 Delete/方向键可继续操作 */
  const _preEditCell = ref<{ rowKey: string; colKey: string; value: string } | null>(null)
  // 组件级编辑框/备注框引用（替代全局 querySelector，避免多实例聚焦错表）
  const editInputEl = ref<HTMLInputElement | null>(null)
  const noteInputEl = ref<HTMLInputElement | null>(null)

  function setEditInputEl(el: unknown) {
    editInputEl.value = (el as HTMLInputElement) || null
  }
  function setNoteInputEl(el: unknown) {
    noteInputEl.value = (el as HTMLInputElement) || null
  }

  function startEdit(rowKey: string, colKey: string, currentValue: string) {
    if (!props.editable) return
    _preEditCell.value = { rowKey, colKey, value: currentValue }
    // @patch 2026-07-15 进入编辑时清除选中样式，避免与编辑状态混淆
    selectedCell.value = null
    _multiSelection.value = new Set()
    _selectedColKey.value = null
    clearRange()
    editingCell.value = { rowKey, colKey, value: currentValue }
    editValue.value = currentValue
    nextTick(() => {
      const el = editInputEl.value
      el?.focus()
      el?.select()
    })
  }

  function commitEdit() {
    if (!editingCell.value) return
    const { rowKey, colKey, value: oldVal } = editingCell.value
    if (editValue.value !== oldVal) {
      _applyChange(rowKey, colKey, editValue.value)
    }
    editingCell.value = null
    restorePreEditCell(editValue.value)
  }

  function cancelEdit() {
    const oldVal = editingCell.value?.value ?? ''
    editingCell.value = null
    restorePreEditCell(oldVal)
  }

  /** 恢复编辑前的选中格（Escape/Enter 后仍可继续键盘操作） */
  function restorePreEditCell(value: string) {
    const pre = _preEditCell.value
    if (!pre) return
    selectedCell.value = { rowKey: pre.rowKey, colKey: pre.colKey }
    _selectedCellValue.value = value
    _preEditCell.value = null
  }

  function onEditKeydown(e: KeyboardEvent, cols: Column[], rowKey: string) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const curCol = editingCell.value?.colKey ?? ''
      commitEdit()
      nextTick(() => {
        const idx = cols.findIndex((c) => c.key === curCol)
        // 跳过图片列与下拉选项列（options 列不走内联编辑，避免假编辑态）
        const next =
          cols.slice(idx + 1).find((c) => c.accept !== 'image' && !c.options) ??
          cols.find((c) => c.accept !== 'image' && !c.options)
        if (next && next.key !== curCol) {
          editingCell.value = { rowKey, colKey: next.key, value: '' }
          editValue.value = ''
          nextTick(() => {
            const el = editInputEl.value
            el?.focus()
          })
        }
      })
    }
  }

  // ==================== 备注模式 ====================
  const _notes = ref<Record<string, Record<string, string>>>(props.notes ?? {})
  watch(
    () => props.notes,
    (val) => {
      if (val) _notes.value = { ...val }
    },
    { deep: true },
  )
  const noteEditing = ref<{ rowKey: string; colKey: string } | null>(null)
  const noteDraft = ref('')
  const noteTooltip = ref<{ rowKey: string; colKey: string; text: string; x: number; y: number } | null>(null)

  /** 某单元格是否有备注 */
  function hasNote(rowKey: string, colKey: string): boolean {
    return !!_notes.value[rowKey]?.[colKey]
  }

  /** 获取备注文本 */
  function getNote(rowKey: string, colKey: string): string {
    return _notes.value[rowKey]?.[colKey] ?? ''
  }

  /** 鼠标悬停显示备注 */
  function showNoteTooltip(e: MouseEvent, rowKey: string, colKey: string) {
    if (!props.noteMode) return
    const text = _notes.value[rowKey]?.[colKey]
    if (!text) return
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    noteTooltip.value = {
      rowKey,
      colKey,
      text,
      x: rect.left,
      y: rect.top - 4,
    }
  }

  function hideNoteTooltip() {
    noteTooltip.value = null
  }

  // ==================== @patch 2026-07-15 原始值气泡（hover 已编辑单元格显示原始值） ====================
  const originalTooltip = ref<{ text: string; x: number; y: number } | null>(null)

  /** hover 已编辑单元格时，若开启了 originalTooltip 则弹出原始值气泡 */
  function showOriginalTooltip(e: MouseEvent, rowKey: string, colKey: string, originalText: string) {
    if (!props.originalTooltip) return
    if (!_cellOverrides.value[rowKey]?.[colKey]) return
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    originalTooltip.value = {
      text: originalText,
      x: rect.left,
      y: rect.top - 4,
    }
  }

  function hideOriginalTooltip() {
    originalTooltip.value = null
  }

  /** 点击备注指示器 → 弹出输入框 */
  function startNoteEdit(e: MouseEvent, rowKey: string, colKey: string) {
    if (!props.noteMode) return
    e.stopPropagation()
    noteEditing.value = { rowKey, colKey }
    noteDraft.value = _notes.value[rowKey]?.[colKey] ?? ''
    nextTick(() => {
      const el = noteInputEl.value
      el?.focus()
    })
  }

  function commitNote() {
    if (!noteEditing.value) return
    const { rowKey, colKey } = noteEditing.value
    const val = noteDraft.value.trim()
    if (val) {
      if (!_notes.value[rowKey]) _notes.value[rowKey] = {}
      _notes.value[rowKey][colKey] = val
    } else {
      if (_notes.value[rowKey]) {
        delete _notes.value[rowKey][colKey]
        if (Object.keys(_notes.value[rowKey]).length === 0) delete _notes.value[rowKey]
      }
    }
    emit.cellNote(rowKey, colKey, val)
    noteEditing.value = null
  }

  function cancelNote() {
    noteEditing.value = null
  }

  function onNoteKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitNote()
    } else if (e.key === 'Escape') cancelNote()
  }

  // ==================== 粘贴 & 拖拽图片 ====================
  async function onCellPaste(e: ClipboardEvent, rowKey: string, colKey: string, accept: string) {
    if (!props.editable) return
    const imgFile = extractImageFile(e)
    if (imgFile && accept !== 'text') {
      e.preventDefault()
      const dataUrl = await readClipboardImage(imgFile)
      _applyChange(rowKey, colKey, dataUrl)
      return
    }
    if (accept === 'image') return
    const text = e.clipboardData?.getData('text/plain')
    if (text) {
      e.preventDefault()
      _applyChange(rowKey, colKey, text)
      editingCell.value = null
    }
  }

  async function onImageDrop(e: DragEvent, rowKey: string, colKey: string) {
    if (!props.editable) return
    const imgFile = extractImageFile(e)
    if (!imgFile) return
    e.preventDefault()
    const td = (e.currentTarget as HTMLElement).closest('td')
    if (td) td.classList.remove('drag-over-image')
    const dataUrl = await readClipboardImage(imgFile)
    _applyChange(rowKey, colKey, dataUrl)
  }

  function onImageDragOver(e: DragEvent) {
    if (!props.editable) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    const td = (e.currentTarget as HTMLElement).closest('td')
    if (td) td.classList.add('drag-over-image')
  }

  function onImageDragLeave(e: DragEvent) {
    const td = (e.currentTarget as HTMLElement).closest('td')
    if (td) td.classList.remove('drag-over-image')
  }

  return {
    // 编辑模式
    editingCell,
    editValue,
    startEdit,
    commitEdit,
    cancelEdit,
    onEditKeydown,
    setEditInputEl,
    setNoteInputEl,
    noteInputEl,
    // 备注模式
    _notes,
    noteEditing,
    noteDraft,
    noteTooltip,
    hasNote,
    getNote,
    showNoteTooltip,
    hideNoteTooltip,
    startNoteEdit,
    commitNote,
    cancelNote,
    onNoteKeydown,
    // @patch 2026-07-15 原始值气泡
    originalTooltip,
    showOriginalTooltip,
    hideOriginalTooltip,
    // 粘贴 & 拖拽
    onCellPaste,
    onImageDrop,
    onImageDragOver,
    onImageDragLeave,
    // 修改追踪
    _modifiedRows,
    modifiedCount,
    // 即时预览
    getCellValue,
    _cellOverrides,
    // 单元格选择 & 复制黏贴
    selectedCell,
    _selectedColKey,
    _multiSelection,
    _clipboard,
    _pasteRowKeys,
    rangeSel,
    selectCell,
    toggleSelectColumn,
    isCellSelected,
    isInRange,
    isRangeAnchor,
    startRange,
    updateRange,
    clearRange,
    displayRows,
    displayCols,
    setDisplayMatrix,
    copySelectedCell,
    pasteToSelection,
    pasteText,
    clearSelection,
    onCellKeydown,
  }
}
