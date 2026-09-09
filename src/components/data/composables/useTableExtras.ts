// ⛔ 保护 — 禁止修改持久化键名/格式（storageGet/Set 依赖），禁止删除全局事件清理
//    需我确认：导出 CSV 格式、右键菜单结构、namespace 存储隔离逻辑
// ==================== 周边功能：搜索 / 导出 / 右键菜单 / 行选择 / 持久化 / 全局事件 ====================
import { ref, computed, watch, nextTick, type Ref, type ComputedRef } from 'vue'
import type { Column, ColumnFilterState, RowContextAction, TableStorage } from './types'
import { getCellText, clampFloatingPosition, markLayerOpen } from './utils'
import { useTablePersistence } from './useTablePersistence'
import { resolveRowKey } from './useTableCore'
import { downloadBlob } from '@/components/_internal/utils'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：纯 .ts composable 直接用（模式 3） */
const t = useT()

export function useTableExtras(
  props: {
    columns: Column[]
    data: Record<string, any>[]
    exportFileName?: string
    exportable?: boolean
    excelExportable?: boolean
    /** 导出范围：'all' 筛选后全量（默认），'page' 仅当前页 */
    exportScope?: 'all' | 'page'
    onExport?: () => void
    // 行选择 + 行右键
    rowKey?: string
    selectedKeys?: string[]
    selectable?: boolean
    rowContextActions?: RowContextAction[]
    // 持久化
    sortKey?: string
    dense?: boolean
    namespace?: string
    persistence?: 'auto' | 'none'
    searchMode?: 'client' | 'server'
    filterMode?: 'client' | 'server'
    /** 外部存储适配器（不传用默认 localStorage） */
    storage?: TableStorage
  },
  emit: (...args: unknown[]) => void,
  options: {
    // 数据核心
    displayData: ComputedRef<Record<string, any>[]>
    tableWrapRef: { value: HTMLElement | null }
    // 筛选
    filteredOptions: ComputedRef<{ value: string }[]>
    filterDraft: Ref<ColumnFilterState | null>
    hiddenColumns: Ref<Set<string>>
    filterState: Ref<Record<string, ColumnFilterState>>
    filterOptionsRef?: { value: HTMLElement | null }
    // 导出
    displayColumns?: ComputedRef<Column[]>
    cellOverrides?: Ref<Record<string, Record<string, string>>>
    // 持久化状态
    sortState?: Ref<{ key: string; order: 'asc' | 'desc' }>
    sortHistory?: Ref<Record<string, 'asc' | 'desc'>>
    _columnOrder?: Ref<string[]>
    columnWidths?: Ref<Record<string, number>>
    _userResizedCols?: Ref<Set<string>>
    _dense?: Ref<boolean>
    dynamicFixedLeft?: Ref<Set<string>>
    dynamicFixedRight?: Ref<Set<string>>
    // 分页
    pagedData?: ComputedRef<Record<string, any>[]>
  },
) {
  const {
    displayData,
    tableWrapRef,
    filteredOptions,
    filterDraft,
    hiddenColumns,
    filterState,
    filterOptionsRef,
    displayColumns,
    cellOverrides,
    sortState,
    sortHistory,
    _columnOrder,
    columnWidths,
    _userResizedCols,
    _dense,
    dynamicFixedLeft,
    dynamicFixedRight,
    pagedData,
  } = options

  // ==================== CSV 导出（表里看到啥就导出啥） ====================
  /** CSV 公式注入防护：以 = + - @ 或制表符/回车开头的值加单引号前缀，Excel/WPS 按文本打开 */
  function csvFormulaSafe(val: string): string {
    return /^[=+\-@\t\r]/.test(val) ? `'${val}` : val
  }

  /** 导出共用数据源：列（过滤隐藏）+ 行值（含编辑 override），支持 exportScope 当前页 */
  function buildExportPayload(): { cols: Column[]; body: (string | number)[][] } {
    const allCols = displayColumns?.value ?? props.columns
    const cols = allCols.filter((c) => !hiddenColumns.value.has(c.key))
    const rows = props.exportScope === 'page' ? (pagedData?.value ?? displayData.value) : displayData.value
    const overrides = cellOverrides?.value ?? {}
    const body = rows.map((row, rowIdx) => {
      const rk = resolveRowKey(row, props.rowKey)
      return cols.map((col) => {
        const origVal = getCellText(row[col.key], col, row, rowIdx)
        return overrides[rk]?.[col.key] ?? origVal
      })
    })
    return { cols, body }
  }

  function exportCSV() {
    // 服务端导出：由外部回调处理（后端返回全量数据下载）
    if (props.onExport) return props.onExport()

    const { cols, body } = buildExportPayload()
    const BOM = '﻿'
    const header = cols.map((c) => `"${csvFormulaSafe(c.title).replace(/"/g, '""')}"`).join(',')
    const csvBody = body
      .map((row) => row.map((val) => `"${csvFormulaSafe(String(val)).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([BOM + header + '\n' + csvBody], { type: 'text/csv;charset=utf-8' })
    downloadBlob(blob, `${props.exportFileName || 'export'}.csv`)
  }

  // ==================== Excel 导出（xlsx 惰性加载，含编辑后显示值） ====================
  async function exportExcel() {
    // 服务端导出：由外部回调处理
    if (props.onExport) return props.onExport()

    // 惰性加载 xlsx，避免首屏包体增加（与 DynamicForm 同一策略）
    const XLSX = await import('xlsx')
    const { cols, body } = buildExportPayload()
    const aoa: (string | number)[][] = [cols.map((c) => c.title), ...body]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    // 表头 + 内容列宽自适应（中文按 2 字符宽估算）
    ws['!cols'] = cols.map((c) => ({ wch: Math.max(Math.ceil(c.title.length * 2) + 2, 12) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, t('table.sheetData'))
    XLSX.writeFile(wb, `${props.exportFileName || 'export'}.xlsx`)
  }

  // ==================== 右键菜单 ====================
  const contextMenu = ref<{
    visible: boolean
    x: number
    y: number
    above: boolean
    columnKey: string | null
    rowKey: string | null
    row: Record<string, any> | null
    rowIndex: number
  }>({ visible: false, x: 0, y: 0, above: false, columnKey: null, rowKey: null, row: null, rowIndex: -1 })
  const contextMenuStyle = computed(() => {
    if (!contextMenu.value.visible) return { display: 'none' }
    const base = { position: 'fixed' as const, left: `${contextMenu.value.x}px`, zIndex: 'var(--z-dropdown, 2000)' }
    // above 模式：菜单底边贴着点击点向上展开（用 bottom 定位）
    // 此时 contextMenu.value.y 存的是原始 clientY
    return contextMenu.value.above
      ? { ...base, bottom: `${window.innerHeight - contextMenu.value.y}px`, top: 'auto' as const }
      : { ...base, top: `${contextMenu.value.y}px` }
  })

  function showContextMenu(col: Column, event: MouseEvent, closeFilter?: () => void) {
    closeFilter?.()
    markLayerOpen()
    contextMenu.value.columnKey = col.key
    const pos = clampFloatingPosition(event.clientX, event.clientY, 160, 200, tableWrapRef.value)
    contextMenu.value.x = pos.left
    // above 模式下 y 保留原始 clientY，让 bottom 定位自动处理
    contextMenu.value.y = pos.above ? event.clientY : pos.top
    contextMenu.value.above = pos.above
    contextMenu.value.visible = true
  }

  function closeContextMenu() {
    contextMenu.value.visible = false
    contextMenu.value.columnKey = null
    contextMenu.value.rowKey = null
    contextMenu.value.row = null
    contextMenu.value.rowIndex = -1
    contextMenu.value.above = false
  }

  /** 行右键菜单：右键数据行触发 */
  function showRowContextMenu(row: Record<string, any>, event: MouseEvent) {
    if (!props.rowContextActions?.length) return
    closeContextMenu()
    markLayerOpen()
    const rk = resolveRowKey(row, props.rowKey)
    const idx = displayData.value.findIndex((r) => resolveRowKey(r, props.rowKey) === rk)
    contextMenu.value.rowKey = rk
    contextMenu.value.row = row
    contextMenu.value.rowIndex = idx
    contextMenu.value.columnKey = null
    const pos = clampFloatingPosition(
      event.clientX,
      event.clientY,
      160,
      40 + props.rowContextActions.length * 36,
      tableWrapRef.value,
    )
    contextMenu.value.x = pos.left
    contextMenu.value.y = pos.above ? event.clientY : pos.top
    contextMenu.value.above = pos.above
    contextMenu.value.visible = true
  }

  function hideCurrentColumn() {
    if (!contextMenu.value.columnKey) return
    const visibleCount = props.columns.length - hiddenColumns.value.size
    if (visibleCount <= 1) return
    hiddenColumns.value.add(contextMenu.value.columnKey)
    delete filterState.value[contextMenu.value.columnKey]
    closeContextMenu()
  }

  function showAllColumns() {
    hiddenColumns.value.clear()
    closeContextMenu()
  }

  // ==================== 键盘导航 ====================
  const filterFocusIndex = ref(-1)

  function onFilterKeydown(e: KeyboardEvent) {
    const len = filteredOptions.value.length
    if (len === 0) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        filterFocusIndex.value = Math.min(filterFocusIndex.value + 1, len - 1)
        scrollFocusedIntoView()
        break
      case 'ArrowUp':
        e.preventDefault()
        filterFocusIndex.value = Math.max(filterFocusIndex.value - 1, 0)
        scrollFocusedIntoView()
        break
      case 'Enter':
        e.preventDefault()
        if (filterFocusIndex.value >= 0 && filterFocusIndex.value < len) {
          const optVal = filteredOptions.value[filterFocusIndex.value].value
          if (filterDraft.value) {
            const idx = filterDraft.value.selectedValues.indexOf(optVal)
            if (idx >= 0) filterDraft.value.selectedValues.splice(idx, 1)
            else filterDraft.value.selectedValues.push(optVal)
          }
        }
        break
    }
  }

  function scrollFocusedIntoView() {
    nextTick(() => {
      const el = filterOptionsRef?.value?.querySelector('.dt-filter-option.focused')
      el?.scrollIntoView({ block: 'nearest' })
    })
  }

  // ==================== 行选择 ====================
  const _selectedKeys = ref<string[]>([...(props.selectedKeys ?? [])])

  watch(
    () => props.selectedKeys,
    (keys) => {
      if (keys && !arraysEqual(keys, _selectedKeys.value)) _selectedKeys.value = [...keys]
    },
  )

  const isAllSelected = computed(() => {
    const data = pagedData?.value ?? displayData.value
    const keys = data.map((r) => resolveRowKey(r, props.rowKey))
    if (keys.length === 0) return false
    return keys.every((k) => _selectedKeys.value.includes(k))
  })

  /** 部分选中（本页有选中但未全选）：供表头全选框的 indeterminate 状态使用 */
  const isIndeterminateSelection = computed(() => {
    const data = pagedData?.value ?? displayData.value
    const keys = data.map((r) => resolveRowKey(r, props.rowKey))
    if (keys.length === 0) return false
    const selectedCount = keys.filter((k) => _selectedKeys.value.includes(k)).length
    return selectedCount > 0 && selectedCount < keys.length
  })

  function toggleSelectAll() {
    const current = _selectedKeys.value
    const data = pagedData?.value ?? displayData.value
    if (isAllSelected.value) {
      const pageKeys = new Set(data.map((r) => resolveRowKey(r, props.rowKey)))
      updateSelectedKeys(current.filter((k) => !pageKeys.has(k)))
    } else {
      const pageKeys = data.map((r) => resolveRowKey(r, props.rowKey))
      updateSelectedKeys([...new Set([...current, ...pageKeys])])
    }
  }

  function toggleRowSelect(row: Record<string, any>) {
    const key = resolveRowKey(row, props.rowKey)
    if (_selectedKeys.value.includes(key)) {
      updateSelectedKeys(_selectedKeys.value.filter((k) => k !== key))
    } else {
      updateSelectedKeys([..._selectedKeys.value, key])
    }
  }

  function updateSelectedKeys(keys: string[]) {
    _selectedKeys.value = keys
    emit('update:selectedKeys', keys)
    emit(
      'selectionChange',
      keys,
      props.data.filter((r) => keys.includes(resolveRowKey(r, props.rowKey))),
    )
  }

  // ==================== 持久化（提取至 useTablePersistence） ====================
  // 列经 getter 惰性读取：columns 可能异步到达，直接传数组会让 auto namespace 恒为 -i0 串数据
  const { _ns, _colKey, _clearPersisted, restoreColWidths, clearAllPersisted, flushWidths } = useTablePersistence(
    props.namespace,
    () => props.columns,
    {
      sortState,
      sortHistory,
      sortKey: props.sortKey,
      filterState,
      _columnOrder,
      columnWidths,
      _userResizedCols,
      _dense,
      denseProp: props.dense,
      dynamicFixedLeft,
      dynamicFixedRight,
      hiddenColumns,
      persistence: props.persistence,
      searchMode: props.searchMode,
      filterMode: props.filterMode,
      storage: props.storage,
    },
  )

  // ==================== 全局事件管理 ====================
  function onGlobalKeydown(
    e: KeyboardEvent,
    activeFilterKey: { value: string | null },
    contextMenuRef: { value: { visible: boolean } },
    closeFilter: () => void,
  ) {
    if (e.key === 'Escape') {
      if (activeFilterKey.value) {
        closeFilter()
        return
      }
      if (contextMenuRef.value.visible) {
        closeContextMenu()
        return
      }
    }
  }

  function onDocumentClick(e: MouseEvent, closeFilter: () => void) {
    const target = e.target as HTMLElement
    if (!target.closest('.dt-filter-dropdown') && !target.closest('.th-filter-icon')) closeFilter()
    if (!target.closest('.dt-context-menu')) closeContextMenu()
  }

  function onScrollClose(e: Event, activeFilterKey: { value: string | null }, closeFilter: () => void) {
    if (activeFilterKey.value && !(e.target as HTMLElement)?.closest('.dt-filter-dropdown')) closeFilter()
    if (contextMenu.value.visible) closeContextMenu()
  }

  return {
    exportCSV,
    exportExcel,
    // 右键菜单
    contextMenu,
    contextMenuStyle,
    showContextMenu,
    showRowContextMenu,
    closeContextMenu,
    hideCurrentColumn,
    showAllColumns,
    // 键盘导航
    filterFocusIndex,
    onFilterKeydown,
    scrollFocusedIntoView,
    // 行选择
    _selectedKeys,
    isAllSelected,
    isIndeterminateSelection,
    toggleSelectAll,
    toggleRowSelect,
    // 全局事件
    onGlobalKeydown,
    onDocumentClick,
    onScrollClose,
    // 存储命名空间 + 列指纹（供外部拼装持久化 key）
    _ns,
    _colKey,
    // 显式清除持久化（供 clearAllFilters/clearSort 直接调用，不依赖 watch）
    _clearPersisted,
    // 列宽恢复（供 DataTable 在数据到达后调用）
    restoreColWidths,
    // 卸载前落盘防抖中的列宽
    flushWidths,
    // 统一清除全部持久化
    clearAllPersisted,
  }
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}
