// ⛔ 保护 — 禁止修改排序/筛选/分页管道逻辑，禁止删除虚拟滚动
//    需我确认：sortHistory 行为、truncateThreshold 默认值、pageSize 逻辑
// ==================== 数据核心：排序 + 数据管道 + 分页/虚拟滚动 ====================
import { ref, computed, watch, onUnmounted, getCurrentInstance, type Ref, type ComputedRef } from 'vue'
import type { Column, ColumnFilterState, RowMeta } from './types'
import { getCellText } from './utils'
import { createPinyinMatcher } from '@/components/_internal/usePinyinSearch'
import { useTableWindowScroll } from './useTableWindowScroll'

/** 无 rowKey 行分配稳定递增 id（WeakMap 键为行对象引用，增删/排序/筛选均不改变，
 *  行对象被 GC 后条目自动清除，无泄漏） */
const _rowIdMap = new WeakMap<object, string>()
let _rowIdSeq = 0
export function stableRowId(row: object): string {
  let id = _rowIdMap.get(row)
  if (!id) {
    id = `__row_${++_rowIdSeq}`
    _rowIdMap.set(row, id)
  }
  return id
}

/** 行唯一键：优先 rowKey 字段值，空/缺省则回退 stableRowId。
 *  行 key、行选择、右键定位、编辑 override、导出取值必须全部走这里——
 *  否则 rowKey 字段缺失的行会共用空串 ''，一次选中即串成整表。 */
export function resolveRowKey(row: Record<string, any>, rowKeyField?: string): string {
  const rawKey = row[rowKeyField ?? 'seq']
  return rawKey != null && String(rawKey) !== '' ? String(rawKey) : stableRowId(row)
}

// ==================== 主组合式函数 ====================

export function useTableCore(
  props: {
    // Sort
    sortKey?: string
    sortOrder?: 'asc' | 'desc'
    // Data
    data: Record<string, any>[]
    rowKey?: string
    striped?: boolean
    truncateThreshold?: number
    pinyinSearch?: boolean
    // Pages
    pageSize?: number
    currentPage?: number
    total?: number
    virtualScroll?: boolean
    maxHeight?: string
    /** 页面滚动虚拟化阈值：无 maxHeight 时，行数超过它才按页面滚动开窗口 */
    pageVirtualMin?: number
    // Modes
    filterMode?: 'client' | 'server'
  },
  emit: (...args: unknown[]) => void,
  filterState: Ref<Record<string, ColumnFilterState>>,
  hiddenColumns: Ref<Set<string>>,
  visibleColumns: ComputedRef<Column[]>,
  globalSearch: Ref<string>,
  rowHeight?: () => number,
  // 全屏时表格忽略分页展示全量且容器有界 → 虚拟滚动需对全量数据开窗
  virtualOpts?: { fullscreen?: () => boolean; pageVirtual?: () => boolean },
) {
  const _rowH = rowHeight ?? (() => 40)
  // 拼音匹配器（实例级，带缓存）：同一文本只做一次拼音转换，避免每行每列重复转换
  const _pinyinMatcher = createPinyinMatcher(() => props.pinyinSearch !== false)
  // ==================== 1. 排序 ====================
  const sortState = ref<{ key: string; order: 'asc' | 'desc' }>({
    key: props.sortKey || '',
    order: props.sortOrder || 'asc',
  })
  const sortHistory = ref<Record<string, 'asc' | 'desc'>>({})

  watch([() => props.sortKey, () => props.sortOrder], ([key, order]) => {
    sortState.value = { key: key || '', order: order || 'asc' }
    if (key) sortHistory.value[key] = order || 'asc'
  })

  function toggleSort(col: Column) {
    if (col.sortable === false) return
    if (sortState.value.key === col.key) {
      if (sortState.value.order === 'asc') {
        sortState.value = { key: col.key, order: 'desc' }
        sortHistory.value[col.key] = 'desc'
        emit('sort', col.key, 'desc')
      } else {
        sortState.value = { key: '', order: 'asc' }
        delete sortHistory.value[col.key]
        emit('sort', '', 'asc')
      }
    } else {
      sortState.value = { key: col.key, order: 'asc' }
      sortHistory.value[col.key] = 'asc'
      emit('sort', col.key, 'asc')
    }
  }

  function clearSort() {
    sortState.value = { key: '', order: 'asc' }
    sortHistory.value = {}
    emit('sort', '', 'asc')
  }

  function sortArrowClass(col: Column, arrow: 'asc' | 'desc'): string {
    if (sortState.value.key === col.key) return sortState.value.order === arrow ? 'active' : ''
    return sortHistory.value[col.key] === arrow ? 'history' : ''
  }

  // ==================== 2. 数据管道 ====================
  const activeFilters = computed(() => {
    const entries = Object.entries(filterState.value).filter(
      ([key, s]) => s.selectedValues.length > 0 && !hiddenColumns.value.has(key),
    )
    return entries as [string, ColumnFilterState][]
  })

  const totalCount = computed(() => props.data.length)

  const displayData = computed(() => {
    let result = props.data

    // 服务端筛选模式：跳过客户端过滤，后端已按 filter 事件中的条件处理
    if (props.filterMode !== 'server' && activeFilters.value.length > 0) {
      result = result.filter((row) =>
        activeFilters.value.every(([key, s]) => s.selectedValues.includes(String(row[key] ?? ''))),
      )
    }

    // 外部受控排序时跳过客户端排序 — sortKey 存在表示父组件已接管排序，数据由服务端排好
    if (sortState.value.key && !props.sortKey) {
      const { key, order } = sortState.value
      result = [...result].sort((a, b) => {
        const va = String(a[key] ?? '')
        const vb = String(b[key] ?? '')
        // 数字值快速比较（localeCompare 慢 ~100 倍）：纯数字字符串用数值比较，
        // 其余走 localeCompare（含中文等 Unicode 排序）。空串视为最小
        let cmp: number
        if (va === '') cmp = vb === '' ? 0 : -1
        else if (vb === '') cmp = 1
        else if (/^-?\d+(\.\d+)?$/.test(va) && /^-?\d+(\.\d+)?$/.test(vb)) {
          cmp = Number(va) - Number(vb)
        } else {
          cmp = va.localeCompare(vb, undefined, { numeric: true })
        }
        return order === 'asc' ? cmp : -cmp
      })
    }

    const term = globalSearch.value.trim()
    if (term) {
      const lowerTerm = term.toLowerCase()
      // 两阶段搜索：先纯文本匹配（快路径，字符串 includes），有结果即返回；
      // 文本无结果才做拼音匹配（慢路径，兜底"拼音搜中文"）。避免每行每列都做拼音转换
      const textHits = result.filter((row) =>
        visibleColumns.value.some((col) => {
          const rendered = getCellText(row[col.key], col, row, 0)
          return rendered.toLowerCase().includes(lowerTerm)
        }),
      )
      result =
        textHits.length > 0
          ? textHits
          : result.filter((row) =>
              visibleColumns.value.some((col) => {
                const rendered = getCellText(row[col.key], col, row, 0)
                return _pinyinMatcher.match(rendered, lowerTerm)
              }),
            )
    }

    return result
  })

  const rowMetaMap = computed<Map<Record<string, any>, RowMeta>>(() => {
    const map = new Map<Record<string, any>, RowMeta>()
    const cols = visibleColumns.value
    const threshold = props.truncateThreshold ?? 0
    const doStripe = props.striped ?? true
    const data = displayData.value
    const rowKey = props.rowKey ?? 'seq'
    for (let idx = 0; idx < data.length; idx++) {
      const row = data[idx]
      const texts: Record<string, string> = {}
      const truncated: Record<string, boolean> = {}
      for (let ci = 0; ci < cols.length; ci++) {
        const col = cols[ci]
        const t = getCellText(row[col.key], col, row, idx)
        texts[col.key] = t
        truncated[col.key] = threshold > 0 && t.length > threshold
      }
      // 行唯一键：优先 rowKey 字段值，空则用 WeakMap 分配的稳定 id（增删/排序/筛选均不变）
      const stableKey = resolveRowKey(row, rowKey)
      map.set(row, {
        key: stableKey,
        texts,
        truncated,
        striped: doStripe && idx % 2 === 1,
      })
    }
    return map
  })

  // ==================== 3. 分页 + 虚拟滚动 ====================
  const _currentPage = ref(props.currentPage || 1)
  watch(
    () => props.currentPage,
    (v) => {
      if (v !== undefined && v !== _currentPage.value) _currentPage.value = v
    },
  )

  function setPage(p: number) {
    _currentPage.value = p
    emit('update:currentPage', p)
    emit('pageChange', p, props.pageSize || 0)
  }

  const pagedData = computed(() => {
    if (!props.pageSize || props.pageSize <= 0) return displayData.value
    // 服务端分页：data 已是对应页数据，直接返回不切
    if (props.total !== undefined) return displayData.value
    // 客户端分页：从全量 data 中切当前页
    const start = (_currentPage.value - 1) * props.pageSize
    return displayData.value.slice(start, start + props.pageSize)
  })

  const totalPages = computed(() => {
    if (!props.pageSize || props.pageSize <= 0) return 1
    // 服务端分页用外部 total，客户端分页用 data 长度
    const total = props.total ?? displayData.value.length
    return Math.max(1, Math.ceil(total / props.pageSize))
  })

  const displayPages = computed(() => {
    const tp = totalPages.value
    const cp = _currentPage.value
    const pages: (number | string)[] = []
    if (tp <= 9) {
      for (let i = 1; i <= tp; i++) pages.push(i)
      return pages
    }
    pages.push(1)
    if (cp > 4) pages.push('...')
    const start = Math.max(2, cp - 1)
    const end = Math.min(tp - 1, cp + 1)
    for (let i = start; i <= end; i++) pages.push(i)
    if (cp < tp - 3) pages.push('...')
    pages.push(tp)
    return pages
  })

  /** 无 maxHeight 时是否真的找到了可滚源（由 useTableWindowScroll 挂载后测出）。
   *  测不到就必须退回全量渲染 —— 只渲染十行又没人能滚到剩下的行，比慢更糟。 */
  const windowScrollReady = ref(false)

  // 虚拟滚动生效条件：
  // - 显式 maxHeight（表格自身是滚动容器，才能按窗口渲染）
  // - 或全屏态（容器有界且忽略分页展示全量，全量行必须虚拟化否则卡死）
  // - 或"行数无上限 + 实测确有可滚源"（autoHeight 锁出的内层滚动条 / 祖先或页面滚动）
  const isVirtual = computed(() => {
    if (!props.virtualScroll) return false
    const fullscreen = virtualOpts?.fullscreen?.() ?? false
    if (fullscreen) return true
    if (props.maxHeight) return !props.pageSize || props.pageSize <= 0
    return !!virtualOpts?.pageVirtual?.() && windowScrollReady.value && windowPaysOff.value
  })
  // 页面滚动态还要过一道"实测真的有得省"的闸：可视行数 + 上下 overscan 是无论如何都要渲染的，
  // 只有总行数超过这个必渲染量才值得开窗口 —— 判据全用实测值，不拍固定行数常量。
  const windowPaysOff = computed(() => {
    const rh = _rowH()
    if (rh <= 0) return false
    return virtualTotal.value > Math.ceil(containerHeight.value / rh) + overscan * 2
  })

  // 虚拟窗口数据源：普通态按当前页；全屏态忽略分页 → 对全量开窗
  const virtualSourceData = computed(() => (virtualOpts?.fullscreen?.() ? displayData.value : pagedData.value))

  const scrollContainerRef = ref<HTMLElement | null>(null)
  const scrollTop = ref(0)
  const containerHeight = ref(0)
  const overscan = 10

  const virtualTotal = computed(() => virtualSourceData.value.length)
  const virtualStartIndex = computed(() => {
    if (!isVirtual.value) return 0
    return Math.max(0, Math.floor(scrollTop.value / _rowH()) - overscan)
  })
  const virtualEndIndex = computed(() => {
    if (!isVirtual.value) return virtualTotal.value
    const visible = Math.ceil(containerHeight.value / _rowH())
    return Math.min(virtualTotal.value, Math.ceil(scrollTop.value / _rowH()) + visible + overscan)
  })
  const virtualVisibleData = computed(() => {
    if (!isVirtual.value) return virtualSourceData.value
    return virtualSourceData.value.slice(virtualStartIndex.value, virtualEndIndex.value)
  })
  const virtualTopOffset = computed(() => {
    if (!isVirtual.value) return 0
    return virtualStartIndex.value * _rowH()
  })
  const virtualBottomOffset = computed(() => {
    if (!isVirtual.value) return 0
    const rendered = virtualEndIndex.value - virtualStartIndex.value
    return Math.max(0, (virtualTotal.value - virtualStartIndex.value - rendered) * _rowH())
  })

  // 页面滚动虚拟化：无 maxHeight 时由它每帧反推等效 scrollTop / containerHeight，喂给上面那组 computeds
  useTableWindowScroll({
    active: () => !!virtualOpts?.pageVirtual?.(),
    container: () => scrollContainerRef.value,
    sourceLength: () => virtualTotal.value,
    scrollTop,
    containerHeight,
    ready: windowScrollReady,
  })

  let _rafId = 0
  function onTableScroll(e: Event) {
    if (!isVirtual.value) return
    if (_rafId) return
    const el = e.target as HTMLElement
    _rafId = requestAnimationFrame(() => {
      _rafId = 0
      scrollTop.value = el.scrollTop
      containerHeight.value = el.clientHeight
    })
  }

  // 组件上下文才注册 rAF 清理（非组件调用如测试/工具场景跳过，避免 Vue warn）
  if (getCurrentInstance()) {
    onUnmounted(() => {
      if (_rafId) {
        cancelAnimationFrame(_rafId)
        _rafId = 0
      }
    })
  }

  return {
    // Sort
    sortState,
    sortHistory,
    toggleSort,
    clearSort,
    sortArrowClass,
    // Data
    activeFilters,
    totalCount,
    displayData,
    rowMetaMap,
    // Pages
    _currentPage,
    setPage,
    pagedData,
    totalPages,
    displayPages,
    isVirtual,
    virtualTotal,
    virtualStartIndex,
    virtualVisibleData,
    virtualTopOffset,
    virtualBottomOffset,
    scrollContainerRef,
    containerHeight,
    onTableScroll,
  }
}
