// ==================== 单元格编辑态（双击进入 / Enter 提交 / Tab 切列 / 提交后位移） ====================
// 归一化只在**列显式声明 Column.type** 时生效（opt-in），未声明时原样返回，存量表格行为不变。
import { ref, watch, nextTick } from 'vue'
import { normalizeCellInput } from './cell-input'
import type { CellEditProps, TableEditHooks, EditState } from './cell-types'
import { isInlineEditable } from './cell-types'
import { isImeComposing } from '../../_internal/ime'
import type { Column } from './types'
import { markActive } from './cell-active'
import type { CellWriteApi } from './cell-write'
import type { CellSelectApi } from './cell-select'

export interface CellEditDeps {
  props: CellEditProps
  hooks?: TableEditHooks
  editKey: object
  write: CellWriteApi
  select: CellSelectApi
}

export function useCellEdit(deps: CellEditDeps) {
  const { props, hooks, editKey, write, select } = deps

  const editingCell = ref<EditState | null>(null)
  const editValue = ref('')
  /** 进入编辑前的选中锚点：退出编辑后恢复，保证 Delete/方向键可继续操作 */
  const preEditCell = ref<{ rowKey: string; colKey: string; value: string } | null>(null)
  // 组件级编辑框引用（替代全局 querySelector，避免多实例聚焦错表）
  const editInputEl = ref<HTMLInputElement | null>(null)
  /** Enter/Tab 提交被归一化拒绝时挂起的 i18n key（table.invalid*）：
   *  组件层据此在**编辑格上**渲染红圈 + 提示气泡（用户视线就在格子里，右下角 toast 够不着）。
   *  用户继续输入 / 提交成功 / 取消编辑 / 重新进编辑时清除。
   *  失焦（blur）提交失败不走这里——值已丢弃，改由 onNormalizeError 全局提示。 */
  const editInvalidKey = ref<string | null>(null)
  // 用户在输入框里改动了内容 → 之前那次「失败」提示已过期，清掉。
  // flush:'sync'：值一变提示即消失（同一渲染周期内完成，不必等调度器）；
  // 非 immediate，setup 期不会同步执行（D1 坑）
  watch(
    editValue,
    () => {
      if (editInvalidKey.value) editInvalidKey.value = null
    },
    { flush: 'sync' },
  )

  function setEditInputEl(el: unknown) {
    editInputEl.value = (el as HTMLInputElement) || null
  }

  function startEdit(rowKey: string, colKey: string, currentValue: string) {
    if (!props.editable) return
    // 进入编辑即代表「这个表格是用户当前操作的表格」。
    // 必须在这里标记，不能依赖「双击前一定有个 click 走了 selectCell」——
    // 拖选结束后 200ms 内的 click 会被 _rangeSuppressClick 吞掉，程序化 startEdit 更无 click，
    // 一旦漏标，后续 Ctrl+Z/Ctrl+C/Ctrl+V 会静默失效或作用到别的表格实例上。
    markActive(editKey)
    editInvalidKey.value = null
    preEditCell.value = { rowKey, colKey, value: currentValue }
    // @patch 2026-07-15 进入编辑时清除选中样式，避免与编辑状态混淆
    select.selectedCell.value = null
    select.multiSelection.value = new Set()
    select.selectedColKey.value = null
    select.clearRange()
    editingCell.value = { rowKey, colKey, value: currentValue }
    editValue.value = currentValue
    nextTick(() => {
      const el = editInputEl.value
      el?.focus()
      el?.select()
    })
  }

  /** 提交编辑。返回 false = 归一化失败已拦截（未落库）。
   *
   *  mode 决定失败后的处置：
   *   - 'enter'（Enter / Tab 显式提交）：**保持编辑态**让用户就地修正，对齐 Excel「拒绝非法输入并留在单元格」；
   *     失败原因就地呈现（挂 editInvalidKey，组件层渲染 cell 级红圈 + 气泡，不再弹右下角 toast——
   *     用户视线在格子里，全局提示够不着）
   *   - 'blur'（失焦提交，也是缺省）：丢弃本次输入并退出编辑态 —— 用户已在移开，不能把他困在格子里；
   *     值被丢弃必须让用户知道 → 走 onNormalizeError 全局提示
   */
  function commitEdit(mode?: 'enter' | 'blur'): boolean {
    if (!editingCell.value) return true
    const { rowKey, colKey, value: oldVal } = editingCell.value
    const col = props.columns?.find((c) => c.key === colKey)
    // 归一化仅在列显式声明 type 时生效；未声明时 normalizeCellInput 原样返回，存量行为不变
    const res = normalizeCellInput(editValue.value, {
      type: col?.type,
      dateOrder: props.dateInputOrder,
    })
    if (!res.ok) {
      const key = res.errorKey ?? 'table.invalidNumber'
      if (mode === 'enter') {
        editInvalidKey.value = key
        return false
      }
      hooks?.onNormalizeError?.(key)
      cancelEdit()
      return false
    }
    if (res.value !== oldVal) {
      write.applyChange(rowKey, colKey, res.value)
    }
    editingCell.value = null
    editInvalidKey.value = null
    restorePreEditCell(res.value)
    return true
  }

  function cancelEdit() {
    const oldVal = editingCell.value?.value ?? ''
    editingCell.value = null
    editInvalidKey.value = null
    restorePreEditCell(oldVal)
  }

  /** 恢复编辑前的选中格（Escape/Enter 后仍可继续键盘操作） */
  function restorePreEditCell(value: string) {
    const pre = preEditCell.value
    if (!pre) return
    select.selectedCell.value = { rowKey: pre.rowKey, colKey: pre.colKey }
    select.selectedCellValue.value = value
    preEditCell.value = null
  }

  /** 提交后按行位移移动选中，并落到可编辑列时直接续编（Excel 连续录入手感）。
   *  delta=+1 下移、-1 上移；越界不动。列在显示列中的位置保持不变。 */
  function moveAfterCommit(rowKey: string, colKey: string, delta: number) {
    const ri = select.displayRows.value.indexOf(rowKey)
    const ci = select.displayCols.value.indexOf(colKey)
    if (ri < 0 || ci < 0) return
    const nr = ri + delta
    if (nr < 0 || nr >= select.displayRows.value.length) return
    const nk = select.displayRows.value[nr]
    if (!nk) return
    const col = props.columns?.find((c) => c.key === colKey)
    // 图片列 / 只读列 / options 列不续编（options 列走弹出面板，无内联输入框）
    const editableCol = isInlineEditable(col)
    if (editableCol) {
      // 直接续编下一行同列，省掉「选中 → Enter」两步
      startEdit(nk, colKey, select.displayValue(nk, colKey))
    } else {
      select.selectCell(nk, colKey, select.displayValue(nk, colKey), false)
    }
    hooks?.scrollCellIntoView?.(nk, colKey)
  }

  function onEditKeydown(e: KeyboardEvent, cols: Column[], rowKey: string) {
    // 输入法合成期一律放行（2026-11-01 #276）。
    //
    // 中文用户输拼音 → 候选框 → 按 Enter 上屏。浏览器先派发 keydown
    //（`isComposing: true`，部分浏览器/输入法只给 `keyCode 229`），再派发 compositionend。
    // 此前这里对 Enter 直接 `preventDefault()` + `commitEdit()`，后果是双重的：
    //   ① 上屏被取消；② **拼音被当成单元格值写入**（单元格里出现 "zhangsan" 而不是「张三」）。
    // 部分 Safari/旧 WebView 不发 isComposing，只能靠 keyCode 229 识别，两个都要判。
    if (isImeComposing(e)) return
    if (e.key === 'Enter') {
      e.preventDefault()
      const curCol = editingCell.value?.colKey ?? ''
      // 归一化失败时保持编辑态（不推进焦点），让用户就地修正非法输入
      if (!commitEdit('enter')) return
      // Ctrl+Enter 停留原格；配合 Shift 上移，默认下移（Excel 连续录入习惯）
      if (e.ctrlKey || e.metaKey) return
      const delta = e.shiftKey ? -1 : 1
      nextTick(() => moveAfterCommit(rowKey, curCol, delta))
    } else if (e.key === 'Escape') {
      cancelEdit()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const curCol = editingCell.value?.colKey ?? ''
      if (!commitEdit('enter')) return
      nextTick(() => {
        const idx = cols.findIndex((c) => c.key === curCol)
        // 只落到"可内联编辑"的列：图片列走拖拽/粘贴、options 列走弹出面板（无内联输入框），
        // 只读列（editable === false）更不能进编辑态（第 177 轮：此前只排除 image/options，
        // Tab 会落进只读列，而模板编辑框只判 editable 与 options → 只读列真的可被写入；
        // 全仓另外 5 处都排除了只读列，只有这里漏了）
        const inlineEditable = (c: Column) => isInlineEditable(c)
        const next = cols.slice(idx + 1).find(inlineEditable) ?? cols.find(inlineEditable)
        if (next && next.key !== curCol) {
          // 必须走 startEdit：它负责 markActive / preEditCell / 清选区，并**预填该格当前值**
          // （手工赋 value: '' 会让用户以为格子是空的，且绕过 preEditCell
          //   导致 Tab 之后按 Escape 把选中格恢复到上一格）
          startEdit(rowKey, next.key, select.displayValue(rowKey, next.key))
        }
      })
    }
  }

  return {
    editingCell,
    editValue,
    /** Enter/Tab 提交被归一化拒绝时挂起的 i18n key；组件层据此在编辑格渲染 cell 级提示 */
    editInvalidKey,
    editInputEl,
    setEditInputEl,
    startEdit,
    commitEdit,
    cancelEdit,
    restorePreEditCell,
    moveAfterCommit,
    onEditKeydown,
  }
}

export type CellEditApi = ReturnType<typeof useCellEdit>
