// ==================== 表格键盘总控（全局 keydown 单一入口） ====================
// 协调导航 / 编辑态撤销 / 复制粘贴。依赖方向：keyboard → select / write / clipboard / edit。
// 所有「本表是否当前活动表」的判断集中在此（与 cell-active 模块配合）。
import { isActiveInstance } from './cell-active'
import type { CellEditProps, TableEditHooks } from './cell-types'
import type { CellSelectApi } from './cell-select'
import type { CellWriteApi } from './cell-write'
import type { CellClipboardApi } from './cell-clipboard'
import type { CellEditApi } from './cell-edit'

export interface CellKeyboardDeps {
  props: CellEditProps
  hooks?: TableEditHooks
  editKey: object
  select: CellSelectApi
  write: CellWriteApi
  clipboard: CellClipboardApi
  edit: CellEditApi
}

export function useCellKeyboard(deps: CellKeyboardDeps) {
  const { props, editKey, select, write, clipboard, edit } = deps

  /** 全局 Ctrl+C / Ctrl+V / Ctrl+Z / Ctrl+Y + 键盘导航（编辑中跳过；优先系统剪贴板） */
  async function onCellKeydown(e: KeyboardEvent) {
    // 多实例共存时，第一个处理的实例 preventDefault 后其余实例跳过，避免一次粘贴改多个表格
    if (e.defaultPrevented) return
    // 只处理最后点击/拖选过的实例（用户视角的“当前表格”）
    if (!isActiveInstance(editKey)) return
    // 浮层（右键菜单/选项面板/筛选下拉/列设置）内的键盘事件交给浮层自身处理，
    // 避免 capture 阶段误触表格导航（如菜单 Enter 进入编辑）
    const target = e.target as HTMLElement | null
    if (target?.closest?.('.dt-context-menu, .opt-drop-panel, .dt-filter-dropdown, .dt-col-settings')) return

    // 编辑态下「输入框尚未改动」的 Ctrl+Z/Y：视为撤销/重做上一步表格操作。
    // 背景：Enter 提交后会下移并**直接续编下一格**（连续录入），用户此时按 Ctrl+Z 想撤销刚录的值，
    // 但焦点在输入框内会被下面的 input 守卫（以及 editingCell 守卫）拦掉 → 静默无反应。
    // 若输入框已有改动（dirty），则不拦截，交给浏览器原生撤销输入框内的文本，符合通用预期。
    if (edit.editingCell.value && (e.ctrlKey || e.metaKey) && !e.altKey) {
      const key = e.key.toLowerCase()
      if (key === 'z' || key === 'y') {
        const cell = edit.editingCell.value
        const dirty = edit.editValue.value !== cell.value
        if (!dirty) {
          const isRedo = key === 'y' || e.shiftKey
          const canDo = isRedo ? write.canRedo() : write.canUndo()
          if (canDo && props.editable) {
            e.preventDefault()
            edit.cancelEdit()
            if (isRedo) write.redo()
            else write.undo()
            return
          }
        }
      }
    }

    // 普通表单输入框（工具栏全局搜索/列设置搜索等）内的按键交给原生光标，
    // 避免选中单元格后方向键被表格劫持导致输入框光标无法移动
    if (target?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return
    if (edit.editingCell.value) return

    // 键盘导航：方向键移动选中格、Enter 进入编辑、Delete 清空（编辑输入框内已提前返回）
    if (props.keyboardNav !== false) {
      const isArrow = e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight'
      if (e.shiftKey && isArrow) {
        if (select.navAnchor()) select.extendSelection(e)
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'Home' || e.key === 'End')) {
        if (select.navAnchor()) select.moveToEdge(e)
      } else if (!(e.ctrlKey || e.metaKey) && !e.altKey) {
        if (isArrow) {
          if (select.navAnchor()) select.moveSelection(e)
        } else if (e.key === 'Enter' || e.key === 'F2') {
          // F2 = Excel 进编辑惯例（与 Enter 同义；外层分支已保证无修饰键，Ctrl+F2 不会进到这里）
          select.enterEditFromSelection(e)
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          clipboard.clearSelection(e)
        }
      }
    }
    const hasSelection =
      select.rangeSel.value ||
      select.selectedCell.value ||
      select.multiSelection.value.size > 0 ||
      select.selectedColKey.value

    // Ctrl+Z 撤销 / Ctrl+Y（或 Ctrl+Shift+Z）重做 —— 与 Excel 一致，独立于 keyboardNav 开关
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
      if (!props.editable) return
      e.preventDefault()
      if (e.shiftKey) write.redo()
      else write.undo()
      return
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'y' || e.key === 'Y')) {
      if (!props.editable) return
      e.preventDefault()
      write.redo()
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      // 用户有划词文本选择时，放行让浏览器原生复制处理
      const textSelection = window.getSelection()?.toString().trim()
      if (textSelection) return

      if (hasSelection && select.selectedCell.value) {
        e.preventDefault()
        await clipboard.copySelectedCell()
      } else if (select.rangeSel.value) {
        e.preventDefault()
        await clipboard.copyRangeSelection()
      } else if (select.selectedColKey.value) {
        e.preventDefault()
        clipboard.clipboard.value = ''
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
          clipboard.pasteText(external)
        } else if (clipboard.clipboard.value) {
          clipboard.pasteToSelection()
        }
      }
    }
  }

  return { onCellKeydown }
}

export type CellKeyboardApi = ReturnType<typeof useCellKeyboard>
