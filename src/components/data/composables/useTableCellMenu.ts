// ==================== 单元格右键菜单 / 选项下拉面板 / 批量编辑 ====================
import { ref, watch, nextTick, type Ref, type ComputedRef } from 'vue'
import type { Column, ColumnOption } from './types'
import { clampFloatingPosition, markLayerOpen } from './utils'

export function useTableCellMenu(
  props: {
    editable?: boolean
    selectable?: boolean
    cellContextMenu?: boolean
  },
  options: {
    tableWrapRef: Ref<HTMLElement | null>
    visibleColumns: ComputedRef<Column[]>
    rowMetaMap: ComputedRef<Map<Record<string, any>, any>>
    _effectivePagedData: ComputedRef<Record<string, any>[]>
    contextMenu: Ref<{
      visible: boolean
      x: number
      y: number
      columnKey: string | null
      rowKey: string | null
      row: Record<string, any> | null
      rowIndex: number
    }>
    closeContextMenu: () => void
    cellVal: (row: Record<string, any>, colKey: string, metaVal: string) => string
    cellOverrides: Ref<Record<string, Record<string, string>>>
    _selectedKeys: Ref<string[]>
    selectedCell: Ref<{ rowKey: string; colKey: string } | null>
    selectCell: (rowKey: string, colKey: string, displayValue: string, ctrlKey: boolean) => void
    clearSelection: (e?: KeyboardEvent) => void
    copySelectedCell: () => Promise<void>
    pasteToSelection: () => void
    pasteText: (text: string) => void
    noteInputEl: Ref<HTMLInputElement | null>
    emit: (...args: unknown[]) => void
  },
) {
  const {
    tableWrapRef,
    visibleColumns,
    rowMetaMap,
    _effectivePagedData,
    contextMenu,
    closeContextMenu,
    cellVal,
    cellOverrides,
    _selectedKeys,
    selectedCell,
    selectCell,
    clearSelection,
    copySelectedCell,
    pasteToSelection,
    pasteText,
    noteInputEl,
    emit,
  } = options

  const contextMenuRef = ref<HTMLElement | null>(null)
  const _menuFocusIndex = ref(0)

  watch(
    () => contextMenu.value.visible,
    (v) => {
      if (!v) return
      _menuFocusIndex.value = 0
      nextTick(() => {
        contextMenuRef.value?.focus()
        updateMenuFocus()
      })
    },
  )

  function updateMenuFocus() {
    const menu = contextMenuRef.value
    if (!menu) return
    menu.querySelectorAll<HTMLElement>('.dt-context-item').forEach((el, i) => {
      el.classList.toggle('menu-focused', i === _menuFocusIndex.value)
      el.tabIndex = i === _menuFocusIndex.value ? 0 : -1
    })
  }

  function onContextMenuKeydown(e: KeyboardEvent) {
    const menu = contextMenuRef.value
    if (!menu) return
    const items = [...menu.querySelectorAll<HTMLElement>('.dt-context-item:not(.disabled)')]
    if (items.length === 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const delta = e.key === 'ArrowDown' ? 1 : -1
      _menuFocusIndex.value = (_menuFocusIndex.value + delta + items.length) % items.length
      updateMenuFocus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      items[_menuFocusIndex.value]?.click()
    }
  }

  /** 单元格右键守卫 */
  function onCellContextMenuGuard(row: Record<string, any>, col: Column, e: MouseEvent) {
    if (!props.cellContextMenu) return
    e.preventDefault()
    e.stopPropagation()
    onCellContextMenu(row, col, e)
  }

  function onCellContextMenu(row: Record<string, any>, col: Column, event: MouseEvent) {
    markLayerOpen()
    const rk = rowMetaMap.value.get(row)?.key ?? ''
    selectCell(rk, col.key, cellVal(row, col.key, rowMetaMap.value.get(row)?.texts[col.key] ?? ''), false)
    closeContextMenu()
    const idx = _effectivePagedData.value.findIndex((r) => rowMetaMap.value.get(r)?.key === rk)
    contextMenu.value = {
      visible: true,
      x: event.clientX,
      y: event.clientY,
      columnKey: col.key,
      rowKey: rk,
      row,
      rowIndex: idx,
    }
    const pos = clampFloatingPosition(event.clientX, event.clientY, 140, 150, tableWrapRef.value)
    contextMenu.value.x = pos.left
    contextMenu.value.y = pos.top
  }

  async function onContextCopyCell() {
    closeContextMenu()
    await copySelectedCell()
  }

  async function onContextPasteCell() {
    closeContextMenu()
    if (!props.editable || !selectedCell.value) return
    let external: string
    try {
      external = await navigator.clipboard.readText()
    } catch {
      external = ''
    }
    if (external) pasteText(external)
    else pasteToSelection()
  }

  function onContextClearCell() {
    closeContextMenu()
    clearSelection()
  }

  // ==================== 选项列下拉面板 ====================
  const _optDrop = ref<{
    rowKey: string
    colKey: string
    options: (string | ColumnOption)[]
    currentVal: string
    top: number
    left: number
    width: number
  } | null>(null)

  function openOptDrop(row: Record<string, any>, col: Column, event: MouseEvent) {
    if (!col.options || !props.editable || col.editable === false) return
    markLayerOpen()
    const rk = rowMetaMap.value.get(row)?.key ?? ''
    if (_optDrop.value?.rowKey === rk && _optDrop.value?.colKey === col.key) {
      _optDrop.value = null
      return
    }
    const td = event.currentTarget as HTMLElement
    const rect = td.getBoundingClientRect()
    _optDrop.value = {
      rowKey: rk,
      colKey: col.key,
      options: col.options,
      currentVal: cellVal(row, col.key, rowMetaMap.value.get(row)?.texts[col.key] ?? ''),
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 100),
    }
  }

  function closeOptDrop() {
    _optDrop.value = null
  }

  function pickOption(val: string) {
    if (!_optDrop.value) return
    if (!props.editable) return
    const { rowKey, colKey, currentVal } = _optDrop.value
    _optDrop.value = null
    if (val !== currentVal) {
      const next = { ...cellOverrides.value }
      if (!next[rowKey]) next[rowKey] = {}
      next[rowKey] = { ...next[rowKey], [colKey]: val }
      cellOverrides.value = next
      emit('cellChange', rowKey, colKey, val)
    }
  }

  function optColor(col: Column, val: string): string {
    if (!col.options) return 'inherit'
    const opt = col.options.find((o) => (typeof o === 'string' ? o : o.value) === val)
    return opt && typeof opt === 'object' && opt.color ? opt.color : 'inherit'
  }

  // 选项面板键盘导航
  const optDropRef = ref<HTMLElement | null>(null)
  const _optFocusIndex = ref(0)
  watch(_optDrop, (v) => {
    if (!v) return
    _optFocusIndex.value = 0
    nextTick(() => optDropRef.value?.focus())
  })

  function onOptDropKeydown(e: KeyboardEvent) {
    if (!_optDrop.value) return
    const len = _optDrop.value.options.length
    if (len === 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      _optFocusIndex.value = (_optFocusIndex.value + (e.key === 'ArrowDown' ? 1 : -1) + len) % len
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = _optDrop.value.options[_optFocusIndex.value]
      if (opt) pickOption(typeof opt === 'string' ? opt : opt.value)
    } else if (e.key === 'Escape') {
      closeOptDrop()
    }
  }

  // ==================== 批量修改 ====================
  const _batchShow = ref(false)
  const _batchCol = ref('')
  const _batchValue = ref('')

  function openBatchEdit() {
    if (_selectedKeys.value.length === 0) return
    _batchCol.value = visibleColumns.value[0]?.key ?? ''
    _batchValue.value = ''
    _batchShow.value = true
    nextTick(() => noteInputEl.value?.focus())
  }

  function confirmBatchEdit() {
    if (!_batchCol.value || _batchShow.value === false) return
    emit('batchChange', _batchCol.value, _batchValue.value, [..._selectedKeys.value])
    _batchShow.value = false
  }

  return {
    contextMenuRef,
    _menuFocusIndex,
    updateMenuFocus,
    onContextMenuKeydown,
    onCellContextMenuGuard,
    onCellContextMenu,
    onContextCopyCell,
    onContextPasteCell,
    onContextClearCell,
    _optDrop,
    openOptDrop,
    closeOptDrop,
    pickOption,
    optColor,
    optDropRef,
    _optFocusIndex,
    onOptDropKeydown,
    _batchShow,
    _batchCol,
    _batchValue,
    openBatchEdit,
    confirmBatchEdit,
  }
}
