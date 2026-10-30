// ⛔ 保护 — 禁止修改 EditState 接口结构，禁止删除 editable/noteMode 逻辑
//    需我确认：编辑状态管理、批处理 cellChange/batchChange 事件签名
// ==================== 单元格编辑 & 备注提示（组装层） ====================
// 本文件只做**组装与转发**：具体实现按职责拆到下列子模块（2026-09-17 拆分，原 1198 行单文件）：
//   cell-types.ts     跨模块共享类型（EditState / RangeSelection / 依赖接口）
//   cell-active.ts    活动表格实例标记（多实例下 Ctrl+Z/C/V 的作用域）
//   cell-write.ts     写入漏斗 + 撤销/重做 + 修改追踪
//   cell-select.ts    选择 / 矩形选区 / 显示矩阵 / 键盘导航
//   cell-fill.ts      填充柄（选区边界 + 取值推断 + 拖拽落库）
//   cell-edit.ts      编辑态（双击进入 / 提交 / 归一化 / 提交后位移）
//   cell-clipboard.ts 复制 / 粘贴 / 清空 / 图片粘贴拖拽
//   cell-note.ts      备注模式 + 原始值气泡
//   cell-keyboard.ts  全局 keydown 总控（导航 + 撤销 + 剪贴板）
//
// ⚠️ 顶层对外返回的对象结构保持与原单文件完全一致（DataTable 与测试均按此解构）。
import { computed } from 'vue'
import { createEditKey } from './cell-active'
import { useCellWrite } from './cell-write'
import { useCellSelect } from './cell-select'
import { useCellFill } from './cell-fill'
import { useCellEdit } from './cell-edit'
import { useCellClipboard } from './cell-clipboard'
import { useCellNote } from './cell-note'
import { useCellKeyboard } from './cell-keyboard'
import type { CellEditProps, CellEditEmit, TableEditHooks } from './cell-types'

export type { EditState, RangeSelection, TableEditHooks } from './cell-types'

export function useTableEdit(props: CellEditProps, emit: CellEditEmit, hooks?: TableEditHooks) {
  /** 当前实例唯一标识（活动表格判定用） */
  const editKey = createEditKey()

  // 写入漏斗：其它模块都通过它落库（保证「一次动作 = 一条撤销记录」）
  const write = useCellWrite(emit, {
    getDisplayValue: (rk, ck) => hooks?.getCellDisplayValue?.(rk, ck),
    // 历史回写后同步选中格的复制缓存：否则撤销后 Ctrl+C 会复制到撤销前的旧值
    onAfterHistory: (changes) => {
      const sc = select.selectedCell.value
      if (sc && changes.some((c) => c.rowKey === sc.rowKey && c.colKey === sc.colKey)) {
        select.selectedCellValue.value = hooks?.getCellDisplayValue?.(sc.rowKey, sc.colKey) ?? ''
      }
    },
    // 只读闸口（第 178 轮）：只读列任何路径都写不进去。
    // 列不存在（如自定义 cellKey / 计算列）时不设限，保持既有行为。
    isWritable: (_rk, ck) => props.columns?.find((c) => c.key === ck)?.editable !== false,
  })

  // 选择模型（cell-edit 的 startEdit 由下方 edit 模块提供，这里用惰性转发避免循环依赖）
  const select = useCellSelect({
    props,
    hooks,
    editKey,
    startEdit: (rk, ck, v) => edit.startEdit(rk, ck, v),
  })

  const edit = useCellEdit({ props, hooks, editKey, write, select })
  const fill = useCellFill({ props, select, write })
  const clipboard = useCellClipboard({ props, hooks, write, select, editingCell: edit.editingCell })
  const note = useCellNote({ props, emit, write })
  const keyboard = useCellKeyboard({ props, hooks, editKey, select, write, clipboard, edit })

  return {
    // 编辑模式
    editingCell: edit.editingCell,
    editValue: edit.editValue,
    editInvalidKey: edit.editInvalidKey,
    startEdit: edit.startEdit,
    commitEdit: edit.commitEdit,
    cancelEdit: edit.cancelEdit,
    onEditKeydown: edit.onEditKeydown,
    setEditInputEl: edit.setEditInputEl,
    setNoteInputEl: note.setNoteInputEl,
    noteInputEl: note.noteInputEl,
    // 备注模式
    _notes: note.notes,
    noteEditing: note.noteEditing,
    noteDraft: note.noteDraft,
    noteTooltip: note.noteTooltip,
    hasNote: note.hasNote,
    getNote: note.getNote,
    showNoteTooltip: note.showNoteTooltip,
    hideNoteTooltip: note.hideNoteTooltip,
    startNoteEdit: note.startNoteEdit,
    commitNote: note.commitNote,
    cancelNote: note.cancelNote,
    onNoteKeydown: note.onNoteKeydown,
    // @patch 2026-07-15 原始值气泡
    originalTooltip: note.originalTooltip,
    showOriginalTooltip: note.showOriginalTooltip,
    hideOriginalTooltip: note.hideOriginalTooltip,
    // 粘贴 & 拖拽
    onCellPaste: clipboard.onCellPaste,
    onImageDrop: clipboard.onImageDrop,
    onImageDragOver: clipboard.onImageDragOver,
    onImageDragLeave: clipboard.onImageDragLeave,
    // 修改追踪
    _modifiedRows: write.modifiedRows,
    modifiedCount: write.modifiedCount,
    // 即时预览
    getCellValue: write.getCellValue,
    _cellOverrides: write.overrides,
    // 单元格选择 & 复制黏贴
    selectedCell: select.selectedCell,
    _selectedColKey: select.selectedColKey,
    _multiSelection: select.multiSelection,
    _clipboard: clipboard.clipboard,
    _pasteRowKeys: clipboard.pasteRowKeys,
    rangeSel: select.rangeSel,
    selectCell: select.selectCell,
    toggleSelectColumn: select.toggleSelectColumn,
    isCellSelected: select.isCellSelected,
    isInRange: select.isInRange,
    isRangeAnchor: select.isRangeAnchor,
    startRange: select.startRange,
    updateRange: select.updateRange,
    clearRange: select.clearRange,
    displayRows: select.displayRows,
    displayCols: select.displayCols,
    setDisplayMatrix: select.setDisplayMatrix,
    copySelectedCell: clipboard.copySelectedCell,
    pasteToSelection: clipboard.pasteToSelection,
    pasteText: clipboard.pasteText,
    clearSelection: clipboard.clearSelection,
    onCellKeydown: keyboard.onCellKeydown,
    // 撤销 / 重做
    undo: write.undo,
    redo: write.redo,
    canUndo: computed(() => write.canUndo()),
    canRedo: computed(() => write.canRedo()),
    // 填充柄
    fillHandleRange: fill.fillHandleRange,
    canFill: fill.canFill,
    fillable: fill.fillable,
    isFillCorner: fill.isFillCorner,
    applyFill: fill.applyFill,
    // 批量写入（pickOption 等外部调用点收敛到漏斗）
    applyChanges: write.applyChanges,
    /** 标记本表格为「用户当前操作的表格」（多实例下 Ctrl+Z/C/V 只作用于它）。
     *  卡片视图字段点击等不经 selectCell 的入口需显式调用。 */
    markEditActive: select.markEditActive,
  }
}
