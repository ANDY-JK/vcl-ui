// ==================== 列设置面板（显隐 / 顺序 / 固定 / 列宽微调） ====================
import { ref, computed, watch, nextTick, type Ref, type ComputedRef } from 'vue'
import type { Column } from './types'
import { matchPinyin } from './useTableCore'

export function useTableColSettings(
  props: { columns: Column[]; colSettings?: boolean },
  hiddenColumns: Ref<Set<string>>,
  columnWidths: Ref<Record<string, number>>,
  _userResizedCols: Ref<Set<string>>,
  _columnOrder: Ref<string[]>,
  dynamicFixedLeft: Ref<Set<string>>,
  dynamicFixedRight: Ref<Set<string>>,
  visibleColumns: ComputedRef<Column[]>,
  headerMinW: (col: Column) => number,
  applyAutoFit: () => void,
  fixLeftCascade: (key: string) => void,
  fixRightCascade: (key: string) => void,
  notify: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
  _clearPersisted: (key: string) => void,
  closeFilter: () => void,
) {
  const _colSettingsShow = ref(false)
  const _colSettingsAbove = ref(false)
  const _colSettingsStyle = ref<Record<string, string>>({})
  const colSettingsRef = ref<HTMLElement | null>(null)
  const _colSettingsWidth = 380
  const colKeyword = ref('')

  /** Column 标题：title 优先，label 别名兜底，key 最终兜底 */
  function colTitle(col: Column): string { return col.title || col.label || col.key }

  /** 面板列列表：全部列（含隐藏列），按当前拖拽顺序 */
  const _settingsColumns = computed(() => {
    const orderMap = new Map(_columnOrder.value.map((k, i) => [k, i]))
    return [...props.columns].sort((a, b) => (orderMap.get(a.key) ?? 999) - (orderMap.get(b.key) ?? 999))
  })

  /** 过滤后的列列表 */
  const _filteredSettingsColumns = computed(() => {
    const kw = colKeyword.value.trim().toLowerCase()
    return _settingsColumns.value
      .map((col, i) => ({ col, i }))
      .filter(({ col }) => {
        if (!kw) return true
        const title = colTitle(col)
        return title.toLowerCase().includes(kw) || matchPinyin(title, kw)
      })
  })

  function toggleColSettings(e?: MouseEvent) {
    _colSettingsShow.value = !_colSettingsShow.value
    if (!_colSettingsShow.value) return
    closeFilter()
    const btn = (e?.currentTarget as HTMLElement | null) ?? null
    const rect = btn?.getBoundingClientRect()
    if (!rect) {
      _colSettingsStyle.value = { top: '56px', right: '16px' }
      return
    }
    const spaceBelow = window.innerHeight - rect.bottom
    const left = Math.max(8, Math.min(rect.right - _colSettingsWidth, window.innerWidth - _colSettingsWidth - 8))
    _colSettingsAbove.value = false
    _colSettingsStyle.value = { top: `${rect.bottom + 4}px`, left: `${left}px` }
    nextTick(() => {
      const el = colSettingsRef.value
      if (!el) return
      const h = el.offsetHeight
      const fitsBelow = rect.bottom + 4 + h <= window.innerHeight - 8
      const spaceAbove = rect.top - 8
      if (!fitsBelow && spaceAbove > spaceBelow) {
        _colSettingsAbove.value = true
        _colSettingsStyle.value = { bottom: `${window.innerHeight - rect.top + 4}px`, left: `${left}px` }
      }
    })
  }

  function toggleColVisible(colKey: string) {
    if (hiddenColumns.value.has(colKey)) {
      hiddenColumns.value.delete(colKey)
    } else {
      const visibleCount = props.columns.length - hiddenColumns.value.size
      if (visibleCount <= 1) return // 至少保留一列
      hiddenColumns.value.add(colKey)
    }
    hiddenColumns.value = new Set(hiddenColumns.value)
  }

  function toggleAllColsVisible(show: boolean) {
    if (show) {
      hiddenColumns.value = new Set()
    } else {
      hiddenColumns.value = new Set(props.columns.map(c => c.key).slice(1))
    }
  }

  const allColumnsVisible = computed(() => hiddenColumns.value.size === 0)

  const _userResizeTick = ref(0)
  watch(columnWidths, () => { _userResizeTick.value++ })
  const hasManualWidths = computed(() => {
    void _userResizeTick.value
    return _userResizedCols.value.size > 0
  })

  function resetColumnWidths() {
    _userResizedCols.value.clear()
    columnWidths.value = {}
    _clearPersisted('colwidth')
    applyAutoFit()
    notify('已重置列宽，恢复自动列宽')
  }

  function moveCol(colKey: string, dir: -1 | 1) {
    const keys = [..._columnOrder.value]
    const idx = keys.indexOf(colKey)
    const target = idx + dir
    if (idx < 0 || target < 0 || target >= keys.length) return
    keys.splice(idx, 1)
    keys.splice(target, 0, colKey)
    _columnOrder.value = keys
  }

  function colWidthPx(col: Column): number {
    return Math.round(columnWidths.value[col.key] || Math.max(headerMinW(col), 60))
  }

  function adjustColWidth(colKey: string, delta: number) {
    const col = props.columns.find(c => c.key === colKey)
    const minW = col ? Math.max(headerMinW(col), 30) : 30
    const cur = columnWidths.value[colKey] || minW
    columnWidths.value = { ...columnWidths.value, [colKey]: Math.max(minW, Math.round(cur + delta)) }
    _userResizedCols.value.add(colKey)
  }

  const _leftFixedCount = computed(() => {
    const keys = _settingsColumns.value.map(c => c.key)
    let n = 0
    while (n < keys.length && dynamicFixedLeft.value.has(keys[n])) n++
    return n
  })

  const _rightFixedCount = computed(() => {
    const keys = _settingsColumns.value.map(c => c.key)
    let n = 0
    while (n < keys.length && dynamicFixedRight.value.has(keys[keys.length - 1 - n])) n++
    return n
  })

  function setLeftFixedCount(n: number) {
    const keys = _settingsColumns.value.map(c => c.key)
    dynamicFixedLeft.value = new Set(n > 0 ? keys.slice(0, n) : [])
  }

  function setRightFixedCount(n: number) {
    const keys = _settingsColumns.value.map(c => c.key)
    dynamicFixedRight.value = new Set(n > 0 ? keys.slice(keys.length - n) : [])
  }

  function setColFixed(col: Column, pos: 'left' | 'right' | null) {
    if (pos === 'left') fixLeftCascade(col.key)
    else if (pos === 'right') fixRightCascade(col.key)
    else {
      const keys = _settingsColumns.value.map(c => c.key)
      const idx = keys.indexOf(col.key)
      if (idx < 0) return
      const l = new Set(dynamicFixedLeft.value)
      const r = new Set(dynamicFixedRight.value)
      if (l.has(col.key)) {
        for (const k of keys.slice(idx)) l.delete(k)
      }
      if (r.has(col.key)) {
        for (const k of keys.slice(0, idx + 1)) r.delete(k)
      }
      dynamicFixedLeft.value = l
      dynamicFixedRight.value = r
    }
  }

  function setAllFixed(side: 'left' | 'right' | null) {
    const keys = _settingsColumns.value.map(c => c.key)
    if (side === 'left') {
      dynamicFixedLeft.value = new Set(keys)
      dynamicFixedRight.value = new Set()
    } else if (side === 'right') {
      dynamicFixedRight.value = new Set(keys)
      dynamicFixedLeft.value = new Set()
    } else {
      dynamicFixedLeft.value = new Set()
      dynamicFixedRight.value = new Set()
    }
  }

  const allFixedLeft = computed(() => {
    const keys = visibleColumns.value.map(c => c.key)
    return keys.length > 0 && keys.every(k => dynamicFixedLeft.value.has(k))
  })

  const allFixedRight = computed(() => {
    const keys = visibleColumns.value.map(c => c.key)
    return keys.length > 0 && keys.every(k => dynamicFixedRight.value.has(k))
  })

  const nothingFixed = computed(() => dynamicFixedLeft.value.size === 0 && dynamicFixedRight.value.size === 0)

  function toggleAllFixed(side: 'left' | 'right') {
    const active = side === 'left' ? allFixedLeft.value : allFixedRight.value
    setAllFixed(active ? null : side)
  }

  function onUnfixFromMenu(colKey: string) {
    const keys = _settingsColumns.value.map(c => c.key)
    const idx = keys.indexOf(colKey)
    if (idx < 0) return
    if (dynamicFixedLeft.value.has(colKey)) setLeftFixedCount(Math.max(0, idx))
    if (dynamicFixedRight.value.has(colKey)) setRightFixedCount(Math.max(0, keys.length - 1 - idx))
  }

  const _fixedSummary = computed(() => {
    const parts: string[] = []
    if (_leftFixedCount.value > 0) parts.push(`左侧 ${_leftFixedCount.value} 列`)
    if (_rightFixedCount.value > 0) parts.push(`右侧 ${_rightFixedCount.value} 列`)
    return parts.length ? parts.join('，') : ''
  })

  return {
    _colSettingsShow,
    _colSettingsAbove,
    _colSettingsStyle,
    colSettingsRef,
    colKeyword,
    _settingsColumns,
    _filteredSettingsColumns,
    allColumnsVisible,
    hasManualWidths,
    _leftFixedCount,
    _rightFixedCount,
    allFixedLeft,
    allFixedRight,
    nothingFixed,
    _fixedSummary,
    colTitle,
    toggleColSettings,
    toggleColVisible,
    toggleAllColsVisible,
    resetColumnWidths,
    moveCol,
    colWidthPx,
    adjustColWidth,
    setLeftFixedCount,
    setRightFixedCount,
    setColFixed,
    setAllFixed,
    toggleAllFixed,
    onUnfixFromMenu,
  }
}
