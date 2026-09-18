// ==================== 复制 / 粘贴 / 清空 / 图片粘贴拖拽 ====================
// 批量写入一律经 write.applyChanges 批量提交，保证「一次动作 = 一条撤销记录」。
import { ref } from 'vue'
import type { Ref } from 'vue'
import type { CellEditProps, TableEditHooks, EditState, WriteEntry } from './cell-types'
import type { Column } from './types'
import type { CellWriteApi } from './cell-write'
import type { CellSelectApi } from './cell-select'
import { readClipboardImage, extractImageFile } from './utils'
import { copyText } from '../../_internal/useCopy'

export interface CellClipboardDeps {
  props: CellEditProps
  hooks?: TableEditHooks
  write: CellWriteApi
  select: CellSelectApi
  /** 编辑态（onCellPaste 需判断粘贴是否发生在编辑框内） */
  editingCell: Ref<EditState | null>
}

/** 粘贴定位：矩形选区 > 单击格 > 整列选择（均按当前显示行列映射）
 *  必须是模块级导出类型 —— 声明在 useCellClipboard 内部会让 tsc 报 TS4060
 *  （返回类型引用了私有名字），该文件的 .d.ts 直接不生成，消费者 TS2307。 */
export interface PasteTarget {
  rows: string[]
  cols: string[]
  anchorRi: number
  anchorCi: number
}

export function useCellClipboard(deps: CellClipboardDeps) {
  const { props, hooks, write, select, editingCell } = deps

  const clipboard = ref('')
  /** 整列粘贴时的目标行键（DataTable 在勾选变化时同步） */
  const pasteRowKeys = ref<string[]>([])

  /** 列是否接受某粘贴值：图片列拒绝文本；下拉选项列仅接受选项内值（保护数据约束） */
  function isAllowedColumnValue(col: Column | undefined, value: string): boolean {
    if (!col) return true
    if (col.accept === 'image') return false
    if (!col.options || col.options.length === 0) return true
    return col.options.some((o) =>
      typeof o === 'string' ? o === value : String(o.value) === value || String(o.label ?? o.value) === value,
    )
  }

  function colMap(): Map<string, Column> {
    return new Map((props.columns ?? []).map((c) => [c.key, c]))
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
  function resolvePasteTarget(): PasteTarget | null {
    const r = select.rangeSel.value
    if (r) {
      return { rows: r.rows, cols: r.cols, anchorRi: r.anchor.rowIndex, anchorCi: r.anchor.colIndex }
    }
    const sc = select.selectedCell.value
    if (sc) {
      const ri = select.displayRows.value.indexOf(sc.rowKey)
      const ci = select.displayCols.value.indexOf(sc.colKey)
      if (ri >= 0 && ci >= 0) {
        return { rows: select.displayRows.value, cols: select.displayCols.value, anchorRi: ri, anchorCi: ci }
      }
      return null
    }
    if (select.selectedColKey.value) {
      const ci = select.displayCols.value.indexOf(select.selectedColKey.value)
      if (ci >= 0) return { rows: select.displayRows.value, cols: select.displayCols.value, anchorRi: 0, anchorCi: ci }
    }
    return null
  }

  /** 矩阵粘贴：从目标锚点开始逐行逐列填充（行/列均只落在当前显示范围）。
   *  整批合成**一条**撤销记录 —— 一次 Ctrl+Z 撤掉整片粘贴，而不是逐格回退。 */
  function pasteMatrix(text: string, target: PasteTarget) {
    const cols = colMap()
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    // 末尾空行（Excel 复制常带）忽略
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
    const entries: WriteEntry[] = []
    for (let i = 0; i < lines.length; i++) {
      const cells = lines[i].split('\t')
      for (let j = 0; j < cells.length; j++) {
        const rk = target.rows[target.anchorRi + i]
        const ck = target.cols[target.anchorCi + j]
        if (!rk || !ck) continue
        if (!isAllowedColumnValue(cols.get(ck), cells[j])) continue
        entries.push({ rowKey: rk, colKey: ck, value: cells[j] })
      }
    }
    write.applyChanges(entries)
  }

  /** 单值粘贴：矩形选区 → 填满整个区域；否则走单选/多选/整列逻辑。
   *  多格填充同样合成**一条**撤销记录。 */
  function pasteValue(value: string) {
    const cols = colMap()
    const r = select.rangeSel.value
    if (r) {
      const r0 = Math.min(r.anchor.rowIndex, r.focus.rowIndex)
      const r1 = Math.max(r.anchor.rowIndex, r.focus.rowIndex)
      const c0 = Math.min(r.anchor.colIndex, r.focus.colIndex)
      const c1 = Math.max(r.anchor.colIndex, r.focus.colIndex)
      const entries: WriteEntry[] = []
      for (let ri = r0; ri <= r1; ri++) {
        for (let ci = c0; ci <= c1; ci++) {
          const rk = r.rows[ri]
          const ck = r.cols[ci]
          if (!rk || !ck) continue
          if (!isAllowedColumnValue(cols.get(ck), value)) continue
          entries.push({ rowKey: rk, colKey: ck, value })
        }
      }
      write.applyChanges(entries)
      return
    }
    if (select.multiSelection.value.size > 0) {
      const entries: WriteEntry[] = []
      for (const key of select.multiSelection.value) {
        const parts = select.splitCellKey(key)
        if (!parts) continue
        const [rk, ck] = parts
        if (!isAllowedColumnValue(cols.get(ck), value)) continue
        entries.push({ rowKey: rk, colKey: ck, value })
      }
      write.applyChanges(entries)
    } else if (select.selectedColKey.value) {
      const colKey = select.selectedColKey.value
      if (isAllowedColumnValue(cols.get(colKey), value)) {
        write.applyChanges(pasteRowKeys.value.map((rk) => ({ rowKey: rk, colKey, value })))
      }
    } else if (select.selectedCell.value) {
      const { rowKey, colKey } = select.selectedCell.value
      if (isAllowedColumnValue(cols.get(colKey), value)) {
        write.applyChange(rowKey, colKey, value)
        select.selectedCellValue.value = value
      }
    }
  }

  /** Delete/Backspace：清空选中格（矩形选区全清；只读/图片列跳过） */
  function clearSelection(e?: KeyboardEvent) {
    // 非编辑模式下禁用清空（键盘 Delete 与右键菜单共用此入口）
    if (!props.editable) return
    const cols = colMap()
    const r = select.rangeSel.value
    if (r) {
      const r0 = Math.min(r.anchor.rowIndex, r.focus.rowIndex)
      const r1 = Math.max(r.anchor.rowIndex, r.focus.rowIndex)
      const c0 = Math.min(r.anchor.colIndex, r.focus.colIndex)
      const c1 = Math.max(r.anchor.colIndex, r.focus.colIndex)
      // 整片清空合成**一条**撤销记录（否则 Ctrl+Z 一次只回一格）
      const entries: WriteEntry[] = []
      for (let ri = r0; ri <= r1; ri++) {
        for (let ci = c0; ci <= c1; ci++) {
          const rk = r.rows[ri]
          const ck = r.cols[ci]
          if (!rk || !ck) continue
          const col = cols.get(ck)
          if (col?.editable === false || col?.accept === 'image') continue
          entries.push({ rowKey: rk, colKey: ck, value: '' })
        }
      }
      if (entries.length) {
        write.applyChanges(entries)
        e?.preventDefault?.()
      }
      return
    }
    const sc = select.selectedCell.value
    if (!sc) return
    const col = cols.get(sc.colKey)
    if (col?.editable === false || col?.accept === 'image') return
    e?.preventDefault?.()
    write.applyChange(sc.rowKey, sc.colKey, '')
    select.selectedCellValue.value = ''
  }

  async function copySelectedCell() {
    if (!select.selectedCell.value) return
    const val = select.selectedCellValue.value
    clipboard.value = val
    // @patch 2026-08-09 同步写入系统剪贴板：
    // Ctrl+V 优先读取系统剪贴板，若不写入，粘贴会拿到用户之前留在系统里的旧内容
    await copyText(val)
    hooks?.onCopied?.()
  }

  function pasteToSelection() {
    if (!clipboard.value) return
    pasteText(clipboard.value)
  }

  /** 复制矩形选区为 TSV（写入系统剪贴板 + 内部剪贴板兜底）；值内换行/制表符转空格防行列错位 */
  async function copyRangeSelection() {
    const r = select.rangeSel.value
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
            const v = select.displayValue(rk, ck)
            return String(v).replace(/[\t\r\n]+/g, ' ')
          })
          .join('\t'),
      )
      .join('\n')
    clipboard.value = tsv
    await copyText(tsv)
    hooks?.onCopied?.()
  }

  // ==================== 单元格粘贴 & 拖拽图片 ====================
  async function onCellPaste(e: ClipboardEvent, rowKey: string, colKey: string, accept: string) {
    if (!props.editable) return
    // 编辑输入框内粘贴时，paste 会从 input 冒泡到 td：此处必须放行，
    // 否则会被当作「直接粘贴到单元格」处理 —— 存原值绕过 commitEdit 的归一化，且强制关闭编辑态。
    // 放行后由原生粘贴写入 input，提交时再走归一化（与键入同口径）。
    const t = e.target as HTMLElement | null
    if (
      t?.classList?.contains('cell-edit-input') &&
      editingCell.value?.rowKey === rowKey &&
      editingCell.value?.colKey === colKey
    ) {
      return
    }
    const imgFile = extractImageFile(e)
    if (imgFile && accept !== 'text') {
      e.preventDefault()
      const dataUrl = await readClipboardImage(imgFile)
      write.applyChange(rowKey, colKey, dataUrl)
      return
    }
    if (accept === 'image') return
    const text = e.clipboardData?.getData('text/plain')
    if (text) {
      e.preventDefault()
      write.applyChange(rowKey, colKey, text)
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
    write.applyChange(rowKey, colKey, dataUrl)
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
    clipboard,
    pasteRowKeys,
    pasteText,
    pasteToSelection,
    pasteMatrix,
    pasteValue,
    copySelectedCell,
    copyRangeSelection,
    clearSelection,
    onCellPaste,
    onImageDrop,
    onImageDragOver,
    onImageDragLeave,
  }
}

export type CellClipboardApi = ReturnType<typeof useCellClipboard>
