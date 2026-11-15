import { reportWarn } from '@/components/_internal/runtime-observer'
// ⛔ 保护 — 禁止修改 filterState 数据结构，禁止删除拼音搜索支持
//    需我确认：OptionSort 排序策略、筛选下拉定位算法
// ==================== 筛选全链路（状态 / 选项计算 / 拼音 / 下拉定位 / 开关） ====================
import { ref, computed, watch, nextTick } from 'vue'
import type { Column, ColumnFilterState, FilterOption, OptionSort } from './types'
import type { TableRow } from '@/components/_internal/api-any'
import { matchPinyin, measureTextWidth, markLayerOpen } from './utils'
import { compareText } from './table-sort'
import { computeFloatingPosition } from '@/components/_internal/useFloating'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：纯 .ts composable 直接用（模式 3） */
const t = useT()

export function useTableFilter(
  props: { columns: Column[]; data: TableRow[]; pinyinSearch?: boolean },
  emit: (e: 'filter', filters: Record<string, string[]>) => void,
  tableWrapRef: { value: HTMLElement | null },
  hiddenColumns: { value: Set<string> },
  closeContextMenu: () => void,
  /** 外部筛选状态 getter（服务端模式）：父组件程序化控制筛选时传入，变化时自动同步到内部 filterState */
  externalFilters?: () => Record<string, string[]> | undefined,
) {
  // ==================== 筛选状态 ====================
  const _closeCallbacks = new Set<() => void>()
  const filterState = ref<Record<string, ColumnFilterState>>({})
  const filterDraft = ref<ColumnFilterState | null>(null)
  const activeFilterKey = ref<string | null>(null)
  const filterDropdownStyle = ref<Record<string, string>>({})
  const filterDropdownAbove = ref(false)
  const optionSort = ref<OptionSort>('name')

  // 下拉框内搜索框 / 选项列表 DOM 引用
  const filterSearchRef = ref<HTMLInputElement | null>(null)
  const filterOptionsRef = ref<HTMLDivElement | null>(null)
  const filterOptionsScrollTop = ref(0)
  const filterOptionsScrollH = ref(0)
  const filterOptionsClientH = ref(0)

  const filterOptionsScrollable = computed(() => filterOptionsScrollH.value > filterOptionsClientH.value + 2)
  const filterOptionsScrollPct = computed(() => {
    if (filterOptionsScrollH.value <= filterOptionsClientH.value) return 0
    return Math.round((filterOptionsScrollTop.value / (filterOptionsScrollH.value - filterOptionsClientH.value)) * 100)
  })

  function onFilterOptionsScroll(e: Event) {
    const el = e.target as HTMLDivElement
    filterOptionsScrollTop.value = el.scrollTop
    filterOptionsScrollH.value = el.scrollHeight
    filterOptionsClientH.value = el.clientHeight
  }

  /* 某列是否有激活的已应用筛选 */
  function isFilterActive(colKey: string): boolean {
    const s = filterState.value[colKey]
    return !!(s && s.selectedValues.length > 0)
  }

  /* 初始化下拉草稿 */
  function initFilterDraft(colKey: string): ColumnFilterState {
    const applied = filterState.value[colKey]
    return applied
      ? { searchText: '', selectedValues: [...applied.selectedValues] }
      : { searchText: '', selectedValues: [] }
  }

  // ==================== 筛选选项计算 ====================
  function computeFilterOptions(colKey: string): FilterOption[] {
    // 服务端分页：外部传入全量候选值，优先使用，无需从 data 提取
    const col = props.columns.find((c) => c.key === colKey)
    if (col?.filterValues && col.filterValues.length > 0) {
      return col.filterValues.map((v) => ({ value: v, count: 0 })).sort((a, b) => compareText(a.value, b.value))
    }

    const otherFilters = Object.entries(filterState.value).filter(
      ([key, s]) => key !== colKey && s.selectedValues.length > 0 && !hiddenColumns.value.has(key),
    )
    const counts = new Map<string, number>()
    // 收集每个唯一值的最佳标签（用 column.render 富文本化，取第一个匹配行）
    const labels = new Map<string, string>()
    const hasRender = typeof col?.render === 'function'
    for (const row of props.data) {
      if (
        otherFilters.length > 0 &&
        !otherFilters.every(([key, s]) => s.selectedValues.includes(String(row[key] ?? '')))
      )
        continue
      const val = String(row[colKey] ?? '')
      counts.set(val, (counts.get(val) || 0) + 1)
      if (hasRender && !labels.has(val)) {
        try {
          labels.set(val, col!.render!(row[colKey], row, 0))
        } catch {
          reportWarn('[DataTable] render 异常，放弃 label:', colKey)
        }
      }
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count, label: labels.get(value) || undefined }))
      .sort((a, b) => compareText(a.value, b.value))
  }

  const activeFilterOptions = computed<FilterOption[]>(() => {
    if (!activeFilterKey.value) return []
    return computeFilterOptions(activeFilterKey.value)
  })

  /* 搜索 + 排序后的选项列表 */
  const filteredOptions = computed<FilterOption[]>(() => {
    const draft = filterDraft.value
    let list = activeFilterOptions.value
    if (draft && draft.searchText) {
      list = list.filter(
        (opt) => matchPinyin(opt.value, draft.searchText) || (!!opt.label && matchPinyin(opt.label!, draft.searchText)),
      )
    }
    const s = optionSort.value
    if (s === 'count' || s === 'count-desc') {
      list = [...list].sort((a, b) => (s === 'count' ? a.count - b.count : b.count - a.count))
    } else {
      list = [...list].sort((a, b) =>
        s === 'name-desc' ? compareText(b.value, a.value) : compareText(a.value, b.value),
      )
    }
    return list
  })

  watch(filteredOptions, () => {
    nextTick(() => {
      const el = filterOptionsRef.value
      if (el) {
        filterOptionsScrollH.value = el.scrollHeight
        filterOptionsClientH.value = el.clientHeight
      }
    })
  })

  // ==================== 筛选快捷操作 ====================
  function filterQuickAction(action: 'all' | 'none' | 'duplicates' | 'unique') {
    if (!filterDraft.value) return
    const draft = filterDraft.value
    // 基于搜索过滤后的可见选项操作，而非全量选项
    const visibleOpts = filteredOptions.value
    const visibleValues = visibleOpts.map((o) => o.value)
    switch (action) {
      case 'all':
        draft.selectedValues = [...visibleValues]
        break
      case 'none': {
        // toggle 每个可见值，保留搜索范围外的已选状态不丢失
        const selectedSet = new Set(draft.selectedValues)
        for (const v of visibleValues) {
          if (selectedSet.has(v)) selectedSet.delete(v)
          else selectedSet.add(v)
        }
        draft.selectedValues = [...selectedSet]
        break
      }
      case 'duplicates':
        draft.selectedValues = visibleOpts.filter((o) => o.count > 1).map((o) => o.value)
        break
      case 'unique':
        draft.selectedValues = visibleOpts.filter((o) => o.count === 1).map((o) => o.value)
        break
    }
  }

  function toggleFilterValue(val: string) {
    if (!filterDraft.value) return
    const idx = filterDraft.value.selectedValues.indexOf(val)
    if (idx >= 0) filterDraft.value.selectedValues.splice(idx, 1)
    else filterDraft.value.selectedValues.push(val)
  }

  // ==================== 筛选应用 / 重置 / 清除 ====================
  function emitFilterChange() {
    const active: Record<string, string[]> = {}
    for (const [key, s] of Object.entries(filterState.value)) {
      if (s.selectedValues.length > 0) active[key] = [...s.selectedValues]
    }
    emit('filter', active)
  }

  function applyFilter() {
    if (!activeFilterKey.value || !filterDraft.value) return
    const colKey = activeFilterKey.value
    const draft = filterDraft.value
    // 基于全量选项判断"全选"（非搜索过滤后），避免搜索后选中所有可见项时误删筛选
    const allValues = activeFilterOptions.value.map((o) => o.value)
    if (draft.selectedValues.length === 0 || draft.selectedValues.length === allValues.length) {
      delete filterState.value[colKey]
    } else {
      filterState.value[colKey] = { searchText: '', selectedValues: [...draft.selectedValues] }
    }
    closeFilter()
    emitFilterChange()
  }

  function resetFilter() {
    if (!activeFilterKey.value) return
    const colKey = activeFilterKey.value
    delete filterState.value[colKey]
    filterDraft.value = null
    closeFilter()
    emitFilterChange()
  }

  function removeFilter(colKey: string) {
    delete filterState.value[colKey]
    emitFilterChange()
  }

  function clearAllFilters() {
    filterState.value = {}
    emitFilterChange()
  }

  // ==================== 筛选下拉定位 ====================
  // 快捷按钮文案键化：key + 宽度测算用的计数后缀（调用处翻译，跟随当前语言）
  const FILTER_BTN_KEYS = [
    ['table.selectAll', ' (88)'],
    ['table.invertSelection', ''],
    ['table.duplicates', ''],
    ['table.uniqueOnly', ''],
  ] as const
  /* 以 4 个快捷按钮为基准计算下拉框最小宽度，保证完整显示 */
  function calcFilterDdWidth(): number {
    let textW = 0
    for (const [key, suffix] of FILTER_BTN_KEYS) textW += measureTextWidth(t(key) + suffix, 12)
    // 4 个按钮：padding(10*2) + border(1*2) = 每个按钮 22px 额外 + 4px gap * 3
    const btnsExtra = 4 * (10 * 2 + 1 * 2) + 4 * 3
    // 下拉框内边距 8*2 = 16
    const panelPadding = 16
    return Math.ceil(textW + btnsExtra + panelPadding)
  }

  /* 下拉框固定宽度（以按钮栏为准） */
  let _filterDdWidth = 0
  function filterDdWidth(): number {
    if (!_filterDdWidth) _filterDdWidth = calcFilterDdWidth()
    return _filterDdWidth
  }

  function updateDropdownPosition(event: MouseEvent) {
    const target = event.currentTarget as HTMLElement
    const anchor = target.closest('th') || target
    const rect = anchor.getBoundingClientRect()
    const ddW = filterDdWidth()
    const tableRect = tableWrapRef.value?.getBoundingClientRect()

    const result = computeFloatingPosition({
      rect,
      floatingW: ddW,
      floatingH: 200, // 预估下拉高度
      offset: 4,
      defaultDirection: 'down',
      containerLeft: tableRect?.left,
      containerRight: tableRect?.right,
    })

    const preferAbove = result.direction === 'up'
    filterDropdownAbove.value = preferAbove
    const vh = window.innerHeight
    const maxH = preferAbove ? Math.min(360, rect.top - 8) : Math.min(360, vh - rect.bottom - 12)

    filterDropdownStyle.value = preferAbove
      ? {
          position: 'fixed',
          bottom: `${vh - rect.top + 4}px`,
          left: `${result.left}px`,
          width: `${ddW}px`,
          maxHeight: `${maxH}px`,
          zIndex: 'var(--vcl-z-dropdown, 2000)',
          top: 'auto',
        }
      : {
          position: 'fixed',
          top: `${rect.bottom + 4}px`,
          left: `${result.left}px`,
          width: `${ddW}px`,
          maxHeight: `${maxH}px`,
          zIndex: 'var(--vcl-z-dropdown, 2000)',
        }
  }

  // ==================== 打开 / 关闭筛选 ====================
  let _filterTriggerEl: HTMLElement | null = null
  function toggleFilter(col: Column, event: MouseEvent) {
    event.stopPropagation()
    if (activeFilterKey.value === col.key) {
      closeFilter()
      return
    }
    for (const cb of _closeCallbacks) cb()
    closeContextMenu()
    _filterTriggerEl = event.currentTarget as HTMLElement
    markLayerOpen()
    activeFilterKey.value = col.key
    filterDraft.value = initFilterDraft(col.key)
    updateDropdownPosition(event)
    optionSort.value = 'name'
    // 键盘流：打开后自动聚焦搜索框
    nextTick(() => filterSearchRef.value?.focus())
  }

  function closeFilter() {
    activeFilterKey.value = null
    filterDraft.value = null
    filterDropdownAbove.value = false
    filterDropdownStyle.value = {}
    nextTick(() => _filterTriggerEl?.focus())
    _filterTriggerEl = null
  }

  // 外部筛选状态同步（服务端模式）：父组件传入 externalFilters 时自动同步到内部 filterState
  // 循环防护：仅在实际值不同时才更新，避免 emit → 父组件更新 → watch 再触发的死循环
  if (externalFilters) {
    /** 追踪外部是否曾有过非空筛选值，用于区分"初始空"与"显式清空" */
    let _hadExternalData = false
    watch(
      externalFilters,
      (ext) => {
        if (!ext) {
          // 外部清空筛选 → 同步清空内部状态
          if (Object.keys(filterState.value).length > 0) filterState.value = {}
          return
        }
        // 比较当前内部状态与外部状态是否一致（浅比 keys + values）
        const currentKeys = Object.keys(filterState.value)
        const extKeys = Object.keys(ext)
        // 外部为空对象 {}：若是初始态（未曾有过数据）→ 保留内部（可能来自持久化恢复）；若曾有过数据（显式清空）→ 同步清空
        if (extKeys.length === 0) {
          if (_hadExternalData) {
            if (currentKeys.length > 0) filterState.value = {}
          }
          return
        }
        _hadExternalData = true
        if (currentKeys.length === extKeys.length && extKeys.length === 0) return
        let same = currentKeys.length === extKeys.length
        if (same) {
          for (const ek of extKeys) {
            const cur = filterState.value[ek]
            const extVals = ext[ek]
            if (
              !cur ||
              cur.selectedValues.length !== extVals.length ||
              !extVals.every((v, i) => v === cur.selectedValues[i])
            ) {
              same = false
              break
            }
          }
        }
        if (same) return // 值未变化，跳过以避免循环
        const next: Record<string, ColumnFilterState> = {}
        for (const [key, vals] of Object.entries(ext)) {
          if (vals.length > 0) next[key] = { searchText: '', selectedValues: [...vals] }
        }
        filterState.value = next
      },
      { deep: true },
    )
  }

  return {
    filterState,
    filterDraft,
    activeFilterKey,
    filterDropdownStyle,
    filterDropdownAbove,
    optionSort,
    filterSearchRef,
    filterOptionsRef,
    filterOptionsScrollTop,
    filterOptionsScrollH,
    filterOptionsClientH,
    filterOptionsScrollable,
    filterOptionsScrollPct,
    onFilterOptionsScroll,
    isFilterActive,
    initFilterDraft,
    activeFilterOptions,
    filteredOptions,
    filterQuickAction,
    toggleFilterValue,
    applyFilter,
    resetFilter,
    removeFilter,
    clearAllFilters,
    toggleFilter,
    closeFilter,
    _closeCallbacks,
  }
}
