<script setup lang="ts" generic="T extends Record<string, any> = Record<string, any>">
// ⛔ 保护 — 禁止：clamp() → px，table-layout:fixed 删除，列宽计算链路，结构层级
//    允许：autoFit 开启时外部 col.width 已被禁止，列宽完全由内部动态管理
//    需我确认：props 增删、默认值修改、模板结构变更、CSS 变量替换
import { ref, watch, computed, onMounted, onUnmounted, onErrorCaptured, nextTick, inject, toRef, type ComputedRef } from 'vue'
import { useT } from '@/components/_internal/i18n'
import IconSvg from '@/components/basic/IconSvg.vue'
import Result from '@/components/feedback/Result.vue'
import Loading from '@/components/feedback/Loading.vue'
import ModalBox from '@/components/layout/ModalBox.vue'
import { downloadScreenshot, copyScreenshotToClipboard } from '@/components/_internal/useScreenshot'
import { copyText } from '@/components/_internal/useCopy'
import Toast from '@/components/feedback/Toast.vue'
import { boostZTop } from '@/components/_internal/z-top'
import ImagePreview from './ImagePreview.vue'
import type { Column, ColumnOption, Emits, RowAction, RowContextAction, TableStorage } from './composables/types'
import { useTableCore, matchPinyin } from './composables/useTableCore'
import { useTableColumns } from './composables/useTableColumns'
import { useTableFilter } from './composables/useTableFilter'
import { useTableExtras } from './composables/useTableExtras'
import { useTableEdit } from './composables/useTableEdit'
import './composables/data-table-global.css'
import { sanitizeHTML } from './composables/sanitize'
import { clampFloatingPosition, isLayerFresh, markLayerOpen } from './composables/utils'
import { useTableTooltip } from './composables/useTableTooltip'
import { computeFloatingPosition } from '@/components/_internal/useFloating'
import { useDebounceFn } from '@/components/_internal/useDebounce'

// 内部异常兜底 — 单组件出错不导致页面崩溃
const _internalError = ref<Error | null>(null)

onErrorCaptured((err: Error) => {
  console.error('[DataTable] 内部异常已隔离:', err.message)
  _internalError.value = err
  return false // 阻止向上传播
})

const props = withDefaults(
  defineProps<{
    columns: Column[]
    data: T[]
    rowKey?: string
    striped?: boolean
    bordered?: boolean
    hoverable?: boolean
    isLoading?: boolean
    emptyText?: string
    sortKey?: string
    sortOrder?: 'asc' | 'desc'
    pinyinSearch?: boolean
    truncateThreshold?: number
    selectable?: boolean
    selectedKeys?: string[]
    exportable?: boolean
    exportFileName?: string
    excelExportable?: boolean
    /** 导出范围：'all' 筛选后全量（默认），'page' 仅当前页 */
    exportScope?: 'all' | 'page'
    pageSize?: number
    currentPage?: number
    total?: number
    cardBreakpoint?: number
    maxHeight?: string
    /** 自适应高度：填充父容器剩余空间（需父容器有明确高度） */
    autoHeight?: boolean
    virtualScroll?: boolean
    autoFit?: boolean
    truncateMode?: 'ellipsis' | 'wrap' | 'none'
    dense?: boolean
    /** 列设置按钮（默认显示，false 可隐藏） */
    colSettings?: boolean
    /** 单元格矩形选区：长按/拖拽框选 + 拖选自动滚动（默认开启） */
    cellSelection?: boolean
    /** 键盘导航：方向键移动/Shift 扩展/Enter 编辑/Delete 清空/Ctrl+Home/End（默认开启） */
    keyboardNav?: boolean
    /** 单元格右键菜单：复制/粘贴/清空（默认开启） */
    cellContextMenu?: boolean
    /** 汇总行：函数形式用 props.data 计算（仅客户端模式可用）；服务端分页请传对象（后端算好汇总值） */
    summary?: ((rows: T[]) => Record<string, string | number>) | Record<string, string | number>
    /** 存储适配器，默认 localStorage；SaaS 场景可传入按账号隔离的实现 */
    storage?: TableStorage
    /** 存储命名空间，同页面多实例时用于隔离持久化数据 */
    namespace?: string
    /** 持久化模式：'auto' 自动判断（sortKey 受控/searchMode='server'/filterMode='server' → 禁用），'none' 强制禁用内部 IndexedDB */
    persistence?: 'auto' | 'none'
    /** 单元格编辑模式：双击进入编辑，Enter 确认，Escape 取消 */
    editable?: boolean
    /** 备注提示模式：hover 显示备注，点击填写 */
    noteMode?: boolean
    /** 外部传入的备注数据 */
    notes?: Record<string, Record<string, string>>
    /** 行操作按钮：添加后在每行末尾渲染操作列 */
    rowActions?: RowAction[]
    /** 行右键菜单项：右键点击数据行时显示的自定义操作 */
    rowContextActions?: RowContextAction[]
    /** @patch 2026-07-15 原始值气泡：hover 已编辑单元格时弹出原始值供对比（需 editable 开启） */
    originalTooltip?: boolean
    /** @patch 2026-07-15 已编辑标记：被修改过的单元格右上角显示三角角标 */
    modifiedMark?: boolean
    /** 图片域名白名单，isImageUrl 判图用。默认覆盖常见 CDN */
    imageDomains?: string[]
    /** 搜索模式：'client' 客户端本地过滤，'server' 抛 search 事件由后端处理 */
    searchMode?: 'client' | 'server'
    /** 筛选模式：'client' 客户端本地过滤，'server' 只抛 filter 事件由后端处理 */
    filterMode?: 'client' | 'server'
    /** 外部筛选状态（v-model:filters）：服务端模式下父组件可程序化控制筛选，变化时自动同步到内部 filterState */
    filters?: Record<string, string[]>
    /** 服务端导出回调：存在时点击导出按钮调用此函数（后端返全量数据下载），不执行内置 CSV 导出 */
    onExport?: () => void
    rowClass?: (row: T, index: number) => string
    rowStyle?: (row: T, index: number) => Record<string, string>
    cellClass?: (colKey: string, row: T, index: number) => string
    cellStyle?: (colKey: string, row: T, index: number) => Record<string, string>
    /** 截图行为模式：'preview' 弹窗预览 | 'download' 直接下载 | 'copy' 直接复制到剪贴板 */
    shotMode?: 'preview' | 'download' | 'copy'
    /** 截图最大行数（超过提醒用户先筛选，避免生成超大 canvas 卡死） */
    screenshotMaxRows?: number
    /** 全屏时收起宿主侧边栏的回调（不传则尝试 inject('toggleCollapse') 降级） */
    onToggleSidebar?: () => void
  }>(),
  {
    rowKey: 'seq',
    striped: true,
    bordered: true,
    hoverable: true,
    isLoading: false,
    emptyText: '',
    pinyinSearch: true,
    truncateThreshold: 0,
    selectable: false,
    selectedKeys: () => [],
    exportable: false,
    exportFileName: 'export',
    excelExportable: false,
    pageSize: 0,
    currentPage: 1,
    cardBreakpoint: 768,
    maxHeight: '',
    autoHeight: true,
    virtualScroll: true,
    autoFit: true,
    truncateMode: 'ellipsis',
    dense: false,
    editable: false,
    noteMode: false,
    colSettings: true,
    cellSelection: true,
    keyboardNav: true,
    cellContextMenu: true,
    notes: () => ({}),
    searchMode: 'client',
    filterMode: 'client',
    persistence: 'auto' as 'auto' | 'none',
    imageDomains: () => [],
    originalTooltip: false,
    modifiedMark: false,
    shotMode: 'preview' as 'preview' | 'download' | 'copy',
    screenshotMaxRows: 400,
  },
)

const emit = defineEmits<Emits>()

const t = useT()

/** 类型安全包装：composable 返回的 row 是 Record<string, any>，通过断言转为 T 传给用户回调 */
const _rowClass = (row: Record<string, any>, idx: number) => props.rowClass?.(row as T, idx) ?? ''
const _rowStyle = (row: Record<string, any>, idx: number) => props.rowStyle?.(row as T, idx) ?? {}
const _cellClass = (colKey: string, row: Record<string, any>, idx: number) =>
  props.cellClass?.(colKey, row as T, idx) ?? ''
const _cellStyle = (colKey: string, row: Record<string, any>, idx: number) =>
  props.cellStyle?.(colKey, row as T, idx) ?? {}

// ── 命名事件处理器（替代多行内联表达式，兼容测试环境解析） ──

/** 表格滚动 */
function onScrollTable(e: Event) {
  onTableScroll(e)
  onScrollProgress(e)
}

/** 卡片视图滚动 */
function onScrollCardView(e: Event) {
  onTableScroll(e)
  onScrollProgress(e)
  onCardScroll(e)
}

/** 表头单元格点击 */
function onHeaderCellClick(e: MouseEvent, col: Column) {
  if (_resizeJustEnded) return
  if (e.ctrlKey && props.editable) toggleSelectColumn(col.key)
  else toggleSort(col)
}

/** 单元格 mouseenter */
function onCellMouseEnter(e: MouseEvent, row: Record<string, any>, colKey: string) {
  const rowMeta = rowMetaMap.value.get(row)
  showTooltip(e, rowMeta?.texts[colKey] ?? '')
  showNoteTooltip(e, rowMeta?.key ?? '', colKey)
  showOriginalTooltip(e, rowMeta?.key ?? '', colKey, rowMeta?.texts[colKey] ?? '')
}

/** 单元格 mouseleave */
function onCellMouseLeave() {
  hideTooltip()
  hideNoteTooltip()
  hideOriginalTooltip()
}

/** 图片加载失败 */
function onImgError(e: Event) {
  ;(e.target as HTMLImageElement).style.display = 'none'
}

/** 右键菜单 — 隐藏当前列 */
function onCtxHideColumn() {
  hideCurrentColumn()
  closeContextMenu()
}

/** 右键菜单 — 固定到左侧 */
function onCtxFixLeftCascade() {
  fixLeftCascade(contextMenu.value.columnKey!)
  closeContextMenu()
}

/** 右键菜单 — 固定到右侧 */
function onCtxFixRightCascade() {
  fixRightCascade(contextMenu.value.columnKey!)
  closeContextMenu()
}

/** 右键菜单 — 取消固定 */
function onCtxUnfixColumn() {
  onUnfixFromMenu(contextMenu.value.columnKey!)
  closeContextMenu()
}

/** 右键菜单 — 显示全部列 */
function onCtxShowAllColumns() {
  showAllColumns()
  closeContextMenu()
}

/** emptyText 回退：未传入时用 i18n */
const effectiveEmptyText = computed(() => props.emptyText || t('table.noData'))

/** Column 标题：title 优先，label 别名兜底，key 最终兜底 */
function colTitle(col: Column): string {
  return col.title || col.label || col.key
}

const tableWrapRef = ref<HTMLElement | null>(null)
let closeContextMenu: () => void = () => {}

/** 右键菜单项点击：优先执行内联回调，否则 emit 事件，最后关闭菜单 */
function onContextItemClick(act: RowContextAction) {
  const ctx = contextMenu.value
  if (act.onClick) {
    act.onClick(ctx.row!, ctx.rowIndex)
  } else {
    emit('rowContextAction', act.key, ctx.row!, ctx.rowIndex)
  }
  closeContextMenu()
}

// 前向引用：useTableCore 产出 displayData 后回填，解决与 useTableColumns 的循环依赖
const _displayDataRef = ref<Record<string, any>[]>([])

// 操作按钮列是否可见 + 动态宽度
const _hasActions = computed(() => (props.rowActions?.length ?? 0) > 0)
const _totalCols = computed(
  () => (props.selectable ? 1 : 0) + visibleColumns.value.length + (_hasActions.value ? 1 : 0),
)
// 操作列宽度：表头"操作"(28px) + 每个按钮(icon16 + gap4 + 文字12*字数 + 内边距20) + 间距6 + 单元格边距8*2
const _actionColWidth = computed(() => {
  if (!_hasActions.value || !props.rowActions) return 0
  let btnsW = 0
  for (const act of props.rowActions) {
    const iconW = act.icon ? 16 + 4 : 0
    const textW = act.label.length * 13
    btnsW += iconW + textW + 20 + 6
  }
  if (btnsW > 0) btnsW -= 6 // 减最后一个按钮的间距
  return Math.max(60, btnsW + 16) // 不低于 60px + 单元格内边距
})

// 1. 列管理（含拖拽排序）
const {
  hiddenColumns,
  visibleColumns,
  displayColumns: _displayColumns,
  columnWidths,
  startResize,
  resizing,
  onResizeMove,
  onResizeEnd,
  fixedLeftOffsets,
  fixedRightOffsets,
  applyAutoFit,
  isCardView,
  onWindowResizeCard,
  fixLeftCascade,
  fixRightCascade,
  isColumnFixed,
  autoFitColumn,
  headerMinW,
  _userResizedCols,
  _resizeJustEnded,
  dynamicFixedLeft,
  dynamicFixedRight,
  _columnOrder,
  _dragCol,
  _dragOverCol,
  onColDragStart,
  onColDragOver,
  onColDragLeave,
  onColDrop,
  onColDragEnd,
} = useTableColumns(props, tableWrapRef, _displayDataRef as ComputedRef<Record<string, any>[]>, _actionColWidth)
/** 存在左侧固定列时，选择框列并入左侧固定（未开启固定则随内容滚动） */
const _hasFixedLeftCol = computed(() => _displayColumns.value.some((c) => isColumnFixed(c) === 'left'))
/** 存在右侧固定列时，操作列并入右侧固定（未开启固定则随内容滚动） */
const _hasFixedRightCol = computed(() => _displayColumns.value.some((c) => isColumnFixed(c) === 'right'))

// 3. 筛选
const {
  filterState,
  filterDraft,
  activeFilterKey,
  filterDropdownStyle,
  filterDropdownAbove,
  optionSort,
  filterSearchRef,
  filterOptionsRef,
  filterOptionsScrollable,
  filterOptionsScrollPct,
  onFilterOptionsScroll,
  isFilterActive,
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
} = useTableFilter(
  props,
  (e, f) => {
    emit(e, f)
    emit('update:filters', f)
  },
  tableWrapRef,
  hiddenColumns,
  () => closeContextMenu(),
  () => props.filters,
)

// 4. 杂项
// 全局搜索（组件本地状态）
const globalSearch = ref('')
const showGlobalSearch = ref(false)
const globalSearchRef = ref<HTMLInputElement | null>(null)
function toggleGlobalSearch() {
  showGlobalSearch.value = !showGlobalSearch.value
  if (!showGlobalSearch.value) globalSearch.value = ''
  else nextTick(() => globalSearchRef.value?.focus())
}

// 全局搜索 200ms 防抖 — v-model 即时更新但数据过滤延迟触发
const searchTerm = ref('')
const { run: _doSearch, cancel: _cancelSearchDebounce } = useDebounceFn((val: string) => {
  searchTerm.value = val
  // 服务端搜索模式：抛出事件让后端处理
  if (props.searchMode === 'server') emit('search', val)
}, 200)
watch(globalSearch, (val) => {
  _doSearch(val)
})

// 4. 数据核心：排序 + 数据管道 + 分页/虚拟滚动
// 服务端模式：搜索由后端处理，客户端跳过 searchTerm 过滤（避免只搜当前页）
const _effectiveSearchTerm = computed(() => (props.searchMode === 'server' ? '' : searchTerm.value))
// 实际渲染行高 = 基础行高 × 缩放系数（保底 32/26px：缩小到 50% 时文字仍可读、虚拟滚动不溢出）
// 注：_dense / _zoomY 在此之后声明，computed 回调惰性求值，首次渲染时已初始化
const _effectiveRowHeight = computed(() => Math.max((_dense.value ? 32 : 40) * _zoomY.value, _dense.value ? 26 : 32))
const {
  sortState,
  sortHistory,
  toggleSort,
  clearSort,
  sortArrowClass,
  activeFilters,
  displayData,
  totalCount,
  rowMetaMap,
  _currentPage,
  setPage,
  pagedData,
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
} = useTableCore(
  props,
  emit as (...args: unknown[]) => void,
  filterState,
  hiddenColumns,
  visibleColumns,
  _effectiveSearchTerm,
  () => _effectiveRowHeight.value,
)
// 回填前向引用，供 useTableColumns/useTableExtras 使用
watch(
  displayData,
  (val) => {
    _displayDataRef.value = val
  },
  { immediate: true },
)
// 外部 total 覆盖内部 totalCount（服务端分页场景）
const displayTotal = computed(() => props.total ?? totalCount.value)
const displayTotalPages = computed(() => {
  if (!props.pageSize || props.pageSize <= 0) return 1
  return Math.max(1, Math.ceil(displayTotal.value / props.pageSize))
})

// 行点击高亮（支持多选，再次点击取消）
const _clickedRowKeys = ref<Set<string>>(new Set())

// 密度切换
const _dense = ref(props.dense)
function toggleDense() {
  _dense.value = !_dense.value
}

// 缩放（Ctrl+滚轮 / Ctrl+±）
const _zoomX = ref(1)
const _zoomY = ref(1)
const ZOOM_STEP = 0.1
const ZOOM_MIN = 0.5
const ZOOM_MAX = 3.0
function zoomIn() {
  _zoomX.value = Math.min(_zoomX.value + ZOOM_STEP, ZOOM_MAX)
  _zoomY.value = Math.min(_zoomY.value + ZOOM_STEP, ZOOM_MAX)
}
/** 当前活跃滚动容器是否有横向溢出（有溢出的列才需要“缩小放下更多列”） */
function hasHScroll(): boolean {
  const el = isCardViewEffective.value
    ? (tableWrapRef.value?.querySelector('.card-view-scroll') as HTMLElement | null)
    : scrollContainerRef.value
  if (!el) return false
  return el.scrollWidth > el.clientWidth + 1
}
function zoomOut() {
  // 等比缩放（X/Y 始终同步），下限 50%。
  // 缩小只为“放下更多列”：已放大（>100%）时允许缩回；低于 100% 必须有横向溢出，
  // 否则列已全部放下，继续缩小只会缩文字/行高（autoFit 下列宽甚至不变）。
  const canShrink = _zoomX.value > 1 + 1e-6 || hasHScroll()
  if (!canShrink) return
  const next = Math.max(_zoomX.value - ZOOM_STEP, ZOOM_MIN)
  _zoomX.value = next
  _zoomY.value = next
}
function resetZoom() {
  _zoomX.value = 1
  _zoomY.value = 1
}
function onTableWheel(e: WheelEvent) {
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  if (e.deltaY < 0) zoomIn()
  else if (e.deltaY > 0) zoomOut()
}

// 操作反馈：组件内 Toast 实例（不依赖全局单例约定）
const toastRef = ref<InstanceType<typeof Toast>>()
function notify(msg: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  toastRef.value?.show(msg, type)
}
// 截图反馈可能发生在全屏态（全屏层级高于全局 Toast）：挂载期间提升 --z-top
let _releaseZTop: (() => void) | null = null

// 全屏切换
const _isFullscreen = ref(false)
const _lockedMaxH = ref('')
const _fullscreenParent = ref<HTMLElement | null>(null)
const _fullscreenNext = ref<ChildNode | null>(null)
const _toggleCollapse = props.onToggleSidebar ?? inject<() => void>('toggleCollapse', () => {})
const _sidebarToggledByUs = ref(false)
let _fsTimer: ReturnType<typeof setTimeout> | null = null
let _fsResizeRaf = 0
let _fsPending = false
const _cleanups: (() => void)[] = []

function toggleFullscreen() {
  if (_isFullscreen.value) {
    _isFullscreen.value = false
  } else if (_fsPending) {
    // 正在等待进入全屏 → 取消，还原导航
    if (_fsTimer) {
      clearTimeout(_fsTimer)
      _fsTimer = null
    }
    _fsPending = false
    if (_sidebarToggledByUs.value) {
      _toggleCollapse()
      _sidebarToggledByUs.value = false
    }
  } else {
    const sidebar = document.querySelector('.sidebar')
    const needCollapse = sidebar && !sidebar.classList.contains('collapsed')
    if (needCollapse) {
      _toggleCollapse()
      _sidebarToggledByUs.value = true
    }
    _fsPending = true
    _fsTimer = setTimeout(
      () => {
        _fsTimer = null
        _fsPending = false
        _isFullscreen.value = true
      },
      needCollapse ? 250 : 0,
    )
  }
}
function onFullscreenKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && _isFullscreen.value) {
    // 优先关闭子组件：筛选 → 详情弹窗 → 截图弹窗 → 右键菜单 → 批量编辑 → 笔记编辑 → 退出全屏
    if (activeFilterKey.value) {
      closeFilter()
      return
    }
    if (_cellDetailModal.value.visible) {
      _cellDetailModal.value.visible = false
      return
    }
    if (_screenshotModal.value.visible) {
      _screenshotModal.value.visible = false
      return
    }
    if (contextMenu.value.visible) {
      closeContextMenu()
      return
    }
    if (_batchShow.value) {
      _batchShow.value = false
      return
    }
    if (noteEditing.value) {
      noteEditing.value = null
      return
    }
    _isFullscreen.value = false
  }
}
// 全屏时点击外部区域关闭（排除 Teleport 到 body 的筛选/菜单/提示等子元素）
function onFullscreenBodyClick(e: MouseEvent) {
  if (!tableWrapRef.value) return
  const target = e.target as HTMLElement
  if (tableWrapRef.value.contains(target)) return
  // Teleport 到 body 的元素不触发退出
  if (
    target.closest(
      '.dt-filter-dropdown,.dt-context-menu,.dt-cell-tooltip,.opt-drop-panel,.note-editor,.note-tooltip,.modal-overlay',
    )
  )
    return
  // 有子组件打开时，让它们处理，不退出全屏
  if (activeFilterKey.value) {
    closeFilter()
    return
  }
  if (contextMenu.value.visible) {
    closeContextMenu()
    return
  }
  if (_cellDetailModal.value.visible) return
  if (_screenshotModal.value.visible) return
  _isFullscreen.value = false
}
// 全屏时窗口 resize 更新边界（rAF 节流）
function onFullscreenResize() {
  if (_fsResizeRaf) return
  _fsResizeRaf = requestAnimationFrame(() => {
    _fsResizeRaf = 0
    if (!_isFullscreen.value || !tableWrapRef.value) return
    const cb = document.querySelector('.content-body')
    if (cb) {
      const r = cb.getBoundingClientRect()
      tableWrapRef.value.style.top = r.top + 'px'
      tableWrapRef.value.style.left = r.left + 'px'
      tableWrapRef.value.style.width = r.width + 'px'
      tableWrapRef.value.style.height = r.height + 'px'
    }
  })
}
watch(_isFullscreen, async (v) => {
  _lockedMaxH.value = '' // 全屏模式由内部 flex 布局接管，释放 JS 锁高
  if (v) {
    document.addEventListener('keydown', onFullscreenKeydown, true)
    document.removeEventListener('keydown', _onKeydown, true)
    document.addEventListener('keydown', _onKeydown, true) // 重新注册，排在 onFullscreenKeydown 后面
    document.addEventListener('click', onFullscreenBodyClick, true)
    window.addEventListener('resize', onFullscreenResize)
    document.body.classList.add('dt-fullscreen-active')
    // 移到 body 下，脱离弹窗/父容器的 overflow/display 限制
    if (tableWrapRef.value && tableWrapRef.value.parentElement) {
      _fullscreenParent.value = tableWrapRef.value.parentElement
      _fullscreenNext.value = tableWrapRef.value.nextSibling
      document.body.appendChild(tableWrapRef.value)
    }
    // 动态计算内容区边界，不受滚动影响；无 .content-body 时回退为视口
    await nextTick()
    const cb = document.querySelector('.content-body')
    if (tableWrapRef.value) {
      if (cb) {
        const r = cb.getBoundingClientRect()
        tableWrapRef.value.style.top = r.top + 'px'
        tableWrapRef.value.style.left = r.left + 'px'
        tableWrapRef.value.style.width = r.width + 'px'
        tableWrapRef.value.style.height = r.height + 'px'
      } else {
        tableWrapRef.value.style.top = '0'
        tableWrapRef.value.style.left = '0'
        tableWrapRef.value.style.width = '100vw'
        tableWrapRef.value.style.height = '100vh'
      }
    }
  } else {
    // 清理 pending 状态
    if (_fsTimer) {
      clearTimeout(_fsTimer)
      _fsTimer = null
    }
    _fsPending = false
    document.removeEventListener('keydown', onFullscreenKeydown, true)
    document.removeEventListener('click', onFullscreenBodyClick, true)
    window.removeEventListener('resize', onFullscreenResize)
    document.body.classList.remove('dt-fullscreen-active')
    // 还原导航栏
    if (_sidebarToggledByUs.value) {
      _toggleCollapse()
      _sidebarToggledByUs.value = false
      await new Promise((r) => setTimeout(r, 250))
    }
    // 还原到原始父容器
    if (tableWrapRef.value && _fullscreenParent.value) {
      _fullscreenParent.value.insertBefore(tableWrapRef.value, _fullscreenNext.value)
      _fullscreenParent.value = null
      _fullscreenNext.value = null
    }
    if (tableWrapRef.value) {
      tableWrapRef.value.style.top = ''
      tableWrapRef.value.style.left = ''
      tableWrapRef.value.style.width = ''
      tableWrapRef.value.style.height = ''
    }
  }
  await nextTick()
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  applyAutoFit()
  emit('fullscreenChange', v)
})

// 截图导出
const _screenshotModal = ref({ visible: false, dataUrl: '', blob: null as Blob | null })
async function captureScreenshot() {
  // 关闭其他内部弹窗（避免与 ModalManager 冲突）
  if (_cellDetailModal.value.visible) _cellDetailModal.value.visible = false
  // 内容过多限制：避免几千行生成超大 canvas 卡死/黑屏（浏览器 canvas 高度上限约 16383px@2x）
  const shotEl = tableWrapRef.value?.querySelector('.table-scroll') as HTMLElement | null
  const shotTable = shotEl?.querySelector('table.data-table')
  const rowCount = shotTable?.querySelectorAll('tr').length ?? 0
  if (rowCount > props.screenshotMaxRows || (shotTable?.scrollHeight ?? 0) > 8000) {
    notify(`内容过多（${rowCount} 行），请先筛选或分页后再截图`, 'warning')
    return
  }
  const result = await captureTableCanvas()
  if (!result) {
    notify('截图失败，请重试', 'error')
    return
  }

  if (props.shotMode === 'download') {
    downloadScreenshot(result.dataUrl)
    notify('截图已下载', 'success')
  } else if (props.shotMode === 'copy') {
    const ok = await copyScreenshotToClipboard(result.blob, result.dataUrl)
    notify(ok ? '截图已复制' : '复制失败（当前环境可能不支持图片复制），请使用「下载 PNG」', ok ? 'success' : 'error')
  } else {
    // preview 模式：弹窗预览
    _screenshotModal.value = { visible: true, dataUrl: result.dataUrl, blob: result.blob }
  }
}

/** Canvas 自绘表格截图：绕开 html2canvas 对 <table> 行高的渲染缺陷（行内空白/行高翻倍/底部裁剪） */
async function captureTableCanvas(): Promise<{ dataUrl: string; blob: Blob; canvas: HTMLCanvasElement } | null> {
  const el = tableWrapRef.value?.querySelector('.table-scroll') as HTMLElement | null
  const table = el?.querySelector('table.data-table') as HTMLTableElement | null
  if (!table) return null
  const scale = 2
  const width = Math.max(1, table.scrollWidth)
  const height = Math.max(1, table.scrollHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(scale, scale)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  const rows = [...table.querySelectorAll('tr')]
  let y = 0
  for (const tr of rows) {
    const cells = [...tr.querySelectorAll<HTMLElement>('th, td')]
    const rowH = tr.getBoundingClientRect().height || 40
    let x = 0
    for (const cell of cells) {
      const w = cell.getBoundingClientRect().width || 120
      const cs = getComputedStyle(cell)
      // 背景（行样式/斑马纹/表头底色直接来自计算样式）
      ctx.fillStyle = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : '#ffffff'
      ctx.fillRect(x, y, w, rowH)
      // 边框
      ctx.strokeStyle = '#d8dee9'
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, rowH - 1))
      // 文本（支持最多 3 行）
      const text = (cell.innerText || '').trim()
      if (text) {
        ctx.fillStyle = cs.color
        ctx.font = '13px "Microsoft YaHei", "PingFang SC", sans-serif'
        ctx.textAlign = (cs.textAlign || 'left') as CanvasTextAlign
        ctx.textBaseline = 'middle'
        const pad = 8
        const maxW = Math.max(0, w - pad * 2)
        const lines: string[] = text.split('\n').slice(0, 3)
        const lh = Math.min(18, rowH / lines.length)
        lines.forEach((line, i) => {
          const tx = cs.textAlign === 'center' ? x + w / 2 : cs.textAlign === 'right' ? x + w - pad : x + pad
          ctx.fillText(truncateCanvasText(ctx, line, maxW), tx, y + rowH / 2 + (i - (lines.length - 1) / 2) * lh)
        })
      }
      x += w
    }
    y += rowH
  }

  const dataUrl = canvas.toDataURL('image/png')
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  )
  return { dataUrl, blob, canvas }
}

/** Canvas 文本截断（按像素宽度） */
function truncateCanvasText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (maxW <= 0 || ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}
function downloadScreenshotFromModal() {
  downloadScreenshot(_screenshotModal.value.dataUrl)
  notify('截图已下载', 'success')
  _screenshotModal.value.visible = false
}
async function copyScreenshotFromModal() {
  const ok = _screenshotModal.value.blob
    ? await copyScreenshotToClipboard(_screenshotModal.value.blob, _screenshotModal.value.dataUrl)
    : false
  notify(ok ? '截图已复制' : '复制失败（当前环境可能不支持图片复制），请使用「下载 PNG」', ok ? 'success' : 'error')
  _screenshotModal.value.visible = false
}

// 复制表格数据（TSV 格式，可粘贴到 Excel）
function copyTableData() {
  const cols = visibleColumns.value.filter((c) => !hiddenColumns.value.has(c.key))
  const header = cols.map((c) => c.title).join('\t')
  const source = props.exportScope === 'page' ? pagedData.value : displayData.value
  const rows = source.map((row) => {
    const meta = rowMetaMap.value.get(row)
    return cols
      .map((c) => {
        // 与导出一致：优先显示值（含本地编辑 override）
        const s = String(cellVal(row, c.key, meta?.texts[c.key] ?? '') ?? '')
        // 公式注入防护：以 = + - @ 或制表符/回车开头时加单引号前缀，Excel 按文本打开
        return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
      })
      .join('\t')
  })
  copyText(header + '\n' + rows.join('\n'))
  notify('已复制表格数据')
}

// 视图模式切换（手动覆盖响应式断点）
// 'auto' → 跟随 cardBreakpoint 响应式断点；'card' → 强制卡片；'list' → 强制列表
const _viewMode = ref<'auto' | 'list' | 'card'>('auto')
// 卡片容器高度：切换前从表格偷取实际可见高度，弹性无硬编码
const _cardViewHeight = ref('')
async function toggleCardMode() {
  const currentCard = isCardViewEffective.value // 基于 _viewMode + isCardView 的有效值
  // 切到卡片模式前，捕获当前表格可见高度（切后表格 display:none，clientHeight=0）
  if (!currentCard && scrollContainerRef.value) {
    _cardViewHeight.value = scrollContainerRef.value.clientHeight + 'px'
  }
  _viewMode.value = currentCard ? 'list' : 'card'
  await nextTick()
  // 双 RAF 等待浏览器完成 display:none → visible 的布局重算
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  applyAutoFit()
  if (_viewMode.value === 'list' && scrollContainerRef.value) {
    containerHeight.value = scrollContainerRef.value.clientHeight
  }
}
const isCardViewEffective = computed(() => {
  if (_viewMode.value === 'card') return true
  if (_viewMode.value === 'list') return false
  return isCardView.value // 'auto' → 跟随响应式断点
})

// 卡片模式渐进加载：首批 50 张，滚到底自动追加，避免大批量渲染卡死
const _cardBatchSize = 50
const _cardRenderLimit = ref(_cardBatchSize)
watch(isCardViewEffective, (v) => {
  if (v) _cardRenderLimit.value = _cardBatchSize
})
const _effectivePagedData = computed(() => {
  // 全屏 + 分页模式：忽略分页限制，展示全部过滤后数据
  if (_isFullscreen.value && props.pageSize && props.pageSize > 0) return displayData.value
  return pagedData.value
})
const _cardVisibleData = computed(() => _effectivePagedData.value.slice(0, _cardRenderLimit.value))
function onCardScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
    _cardRenderLimit.value = Math.min(_effectivePagedData.value.length, _cardRenderLimit.value + _cardBatchSize)
  }
}

// 滚动进度条（可点击跳转 + 可拖拽滚动，替代隐藏的纵向滚动条）
// 滚动状态：进度百分比 + 是否可滚动（溢出检测驱动进度条显隐）
const _scrollProgress = ref(0)
const _scrollable = ref(false)
let _progressRafId = 0
function onScrollProgress(e: Event) {
  if (_progressRafId) return
  _progressRafId = requestAnimationFrame(() => {
    _progressRafId = 0
    const el = e.target as HTMLElement
    const max = el.scrollHeight - el.clientHeight
    _scrollable.value = max > 0
    _scrollProgress.value = max > 0 ? Math.round((el.scrollTop / max) * 100) : 0
  })
}

/** 从进度条向上找到 .table-wrap，再向下找当前活跃的滚动容器 */
function findScrollEl(barEl: HTMLElement): HTMLElement | null {
  const wrap = barEl.closest('.table-wrap')
  if (!wrap) return null
  // 卡片模式用卡片滚动容器，表格模式用表格滚动容器
  return wrap.querySelector('.card-view-scroll') ?? wrap.querySelector('.table-scroll')
}
function seekScroll(clientX: number, barEl: HTMLElement) {
  const el = findScrollEl(barEl)
  if (!el) return
  const rect = barEl.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  const target = Math.round(pct * (el.scrollHeight - el.clientHeight))
  el.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior })
  // 拖拽时直接更新 DOM，跳过 Vue 响应式延迟
  const progress = barEl.querySelector('.table-progress') as HTMLElement
  if (progress) progress.style.width = Math.round(pct * 100) + '%'
}

let _dragBar: HTMLElement | null = null
function onProgressDragMove(e: MouseEvent) {
  if (_dragBar) seekScroll(e.clientX, _dragBar)
}
function onProgressDragEnd() {
  _dragBar = null
  document.removeEventListener('mousemove', onProgressDragMove)
  document.removeEventListener('mouseup', onProgressDragEnd)
}

function onProgressMouseDown(e: MouseEvent) {
  _dragBar = e.currentTarget as HTMLElement
  seekScroll(e.clientX, _dragBar)
  document.addEventListener('mousemove', onProgressDragMove)
  document.addEventListener('mouseup', onProgressDragEnd)
}
/** 主动检测当前活跃滚动容器是否有纵向溢出，驱动进度条显隐 */
function checkScrollable() {
  nextTick(() => {
    const el = isCardViewEffective.value
      ? (tableWrapRef.value?.querySelector('.card-view-scroll') as HTMLElement | null)
      : scrollContainerRef.value
    if (el) {
      _scrollable.value = el.scrollHeight > el.clientHeight
    }
  })
}
// 挂载 + 数据变更后重新检测
watch([displayData, isCardViewEffective], () => checkScrollable())
// 缩放后重新检测，滚动条消失即停止缩小
watch([_zoomX, _zoomY], () => {
  nextTick(() => checkScrollable())
})
onMounted(() => checkScrollable())
onUnmounted(() => {
  if (_progressRafId) cancelAnimationFrame(_progressRafId)
})

// 5. 编辑 & 备注（放在 useTableExtras 之前，确保导出能直接读到 _cellOverrides）
const {
  editingCell,
  editValue,
  startEdit,
  commitEdit,
  onEditKeydown,
  noteEditing,
  noteDraft,
  noteTooltip,
  hasNote,
  showNoteTooltip,
  hideNoteTooltip,
  startNoteEdit,
  commitNote,
  cancelNote,
  onNoteKeydown,
  onCellPaste,
  onImageDrop,
  onImageDragOver,
  onImageDragLeave,
  getCellValue,
  _cellOverrides,
  _pasteRowKeys,
  selectedCell,
  selectCell,
  toggleSelectColumn,
  isCellSelected,
  onCellKeydown,
  // @patch 2026-08-09 矩形选区：长按/拖拽多选 + 矩阵粘贴
  rangeSel,
  startRange,
  updateRange,
  clearRange,
  isRangeAnchor,
  setDisplayMatrix,
  setEditInputEl,
  setNoteInputEl,
  noteInputEl,
  clearSelection,
  copySelectedCell,
  pasteToSelection,
  pasteText,
  // @patch 2026-07-15 原始值气泡
  originalTooltip,
  showOriginalTooltip,
  hideOriginalTooltip,
} = useTableEdit(
  props,
  {
    cellChange: (rk, ck, nv) => emit('cellChange', rk, ck, nv),
    cellNote: (rk, ck, n) => emit('cellNote', rk, ck, n),
  },
  {
    // 复制矩形选区时读取某格显示值
    getCellDisplayValue: (rk, ck) => {
      const row = _effectivePagedData.value.find((r) => rowMetaMap.value.get(r)?.key === rk)
      return row ? cellVal(row, ck, rowMetaMap.value.get(row)?.texts[ck] ?? '') : ''
    },
    scrollCellIntoView: (rk, ck) => {
      nextTick(() => {
        const ri = _effectivePagedData.value.findIndex((r) => rowMetaMap.value.get(r)?.key === rk)
        const ci = _displayColumns.value.findIndex((c) => c.key === ck)
        if (ri < 0 || ci < 0 || !tableWrapRef.value) return
        const td = tableWrapRef.value.querySelector(
          `td[data-row-idx="${ri}"][data-col-idx="${ci}"]`,
        ) as HTMLElement | null
        td?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
    },
    onCopied: () => notify('已复制到剪贴板'),
  },
)
watch(
  displayData,
  (val) => {
    _pasteRowKeys.value = val.map((r) => rowMetaMap.value.get(r)?.key ?? '').filter(Boolean)
  },
  { immediate: true },
)

// ==================== @patch 2026-08-09 矩形选区：长按/拖拽多选 ====================
// 选区行/列快照与显示数据一致：筛选/排序/分页后数据变化 → 自动清空，防止误改隐藏行
let _rangeTimer: ReturnType<typeof setTimeout> | null = null
let _rangeCandidate: { ri: number; ci: number; rk: string; ck: string; value: string } | null = null
let _rangeActive = false
let _rangeSuppressClick = false
const RANGE_LONGPRESS_MS = 300
const RANGE_DRAG_THRESHOLD = 6
let _rangeStartX = 0
let _rangeStartY = 0
let _rangeLastX = 0
let _rangeLastY = 0
let _rangeScrollTimer: ReturnType<typeof setInterval> | null = null

/** 渲染行显示索引（虚拟滚动/全屏时与 pagedData 对齐） */
function rowDisplayIndex(idx: number): number {
  if (_isFullscreen.value) return idx
  if (isVirtual.value) return virtualStartIndex.value + idx
  return idx
}

/** 当前显示行/列快照（与模板渲染顺序一致） */
function rangeRowsSnapshot(): string[] {
  return _effectivePagedData.value.map((r) => rowMetaMap.value.get(r)?.key ?? '').filter(Boolean)
}
function rangeColsSnapshot(): string[] {
  return _displayColumns.value.map((c) => c.key)
}

function onCellMouseDown(e: MouseEvent, row: Record<string, any>, col: Column, ri: number, ci: number) {
  // cellSelection=false 时不做拖选，也不阻止文本选择（保留浏览器默认行为）
  if (!props.editable || editingCell.value || !props.cellSelection) return
  if (e.button !== 0) return
  // 可交互元素（输入框/按钮/图片/图标等）不参与拖选
  const t = e.target as HTMLElement
  if (t.closest('input,button,select,textarea,a,.cell-expand-icon,.cell-note-dot,.cell-options-arrow,.cell-image'))
    return
  // 阻止文本选择（click/dblclick 仍正常触发）
  e.preventDefault()
  clearRange()
  _rangeCandidate = {
    ri,
    ci,
    rk: rowMetaMap.value.get(row)?.key ?? '',
    ck: col.key,
    value: cellVal(row, col.key, rowMetaMap.value.get(row)?.texts[col.key] ?? ''),
  }
  _rangeStartX = e.clientX
  _rangeStartY = e.clientY
  _rangeActive = false
  document.addEventListener('mousemove', onRangeMove)
  document.addEventListener('mouseup', onRangeUp)
  _rangeTimer = setTimeout(() => activateRange(), RANGE_LONGPRESS_MS)
}

/** 长按触发 / 拖拽超过阈值立即激活选区 */
function activateRange() {
  if (_rangeTimer) {
    clearTimeout(_rangeTimer)
    _rangeTimer = null
  }
  if (_rangeActive || !_rangeCandidate) return
  _rangeActive = true
  document.body.classList.add('dt-range-selecting')
  startRange(_rangeCandidate.ri, _rangeCandidate.ci, rangeRowsSnapshot(), rangeColsSnapshot(), _rangeCandidate.value)
  // 长按未移动时也选中锚点格
  updateRange(_rangeCandidate.ri, _rangeCandidate.ci)
}

function onRangeMove(e: MouseEvent) {
  if (!_rangeCandidate) return
  _rangeLastX = e.clientX
  _rangeLastY = e.clientY
  if (!_rangeActive) {
    // 按下后直接拖动（无需等长按）：超过阈值即进入选区模式
    const dx = Math.abs(e.clientX - _rangeStartX)
    const dy = Math.abs(e.clientY - _rangeStartY)
    if (Math.max(dx, dy) >= RANGE_DRAG_THRESHOLD) activateRange()
    if (!_rangeActive) return
  }
  if (!rangeSel.value) return
  const td = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest(
    'td[data-row-idx][data-col-idx]',
  ) as HTMLElement | null
  if (!td) return
  const ri = Number(td.dataset.rowIdx)
  const ci = Number(td.dataset.colIdx)
  if (!Number.isFinite(ri) || !Number.isFinite(ci)) return
  updateRange(ri, ci)
  // 拖到滚动容器边缘 → 自动滚动（继续扩展选区）
  const el = scrollContainerRef.value
  if (el) {
    const rect = el.getBoundingClientRect()
    const nearEdge =
      _rangeLastY < rect.top + 30 ||
      _rangeLastY > rect.bottom - 30 ||
      _rangeLastX < rect.left + 30 ||
      _rangeLastX > rect.right - 30
    if (nearEdge && !_rangeScrollTimer) {
      _rangeScrollTimer = setInterval(onRangeAutoScrollTick, 50)
    } else if (!nearEdge && _rangeScrollTimer) {
      stopRangeAutoScroll()
    }
  }
}

/** 拖选自动滚动：每帧滚动容器 + 重新定位 focus */
function onRangeAutoScrollTick() {
  const el = scrollContainerRef.value
  if (!el || !_rangeActive) {
    stopRangeAutoScroll()
    return
  }
  const rect = el.getBoundingClientRect()
  const speed = 16
  let dy = 0
  let dx = 0
  if (_rangeLastY < rect.top + 30) dy = -speed
  else if (_rangeLastY > rect.bottom - 30) dy = speed
  if (_rangeLastX < rect.left + 30) dx = -speed
  else if (_rangeLastX > rect.right - 30) dx = speed
  if (!dy && !dx) {
    stopRangeAutoScroll()
    return
  }
  el.scrollTop += dy
  el.scrollLeft += dx
  const td = (document.elementFromPoint(_rangeLastX, _rangeLastY) as HTMLElement | null)?.closest(
    'td[data-row-idx][data-col-idx]',
  ) as HTMLElement | null
  if (td) {
    const ri = Number(td.dataset.rowIdx)
    const ci = Number(td.dataset.colIdx)
    if (Number.isFinite(ri) && Number.isFinite(ci)) updateRange(ri, ci)
  }
}

function stopRangeAutoScroll() {
  if (_rangeScrollTimer) {
    clearInterval(_rangeScrollTimer)
    _rangeScrollTimer = null
  }
}

function onRangeUp() {
  document.removeEventListener('mousemove', onRangeMove)
  document.removeEventListener('mouseup', onRangeUp)
  stopRangeAutoScroll()
  if (_rangeTimer) {
    clearTimeout(_rangeTimer)
    _rangeTimer = null
  }
  if (_rangeActive) {
    document.body.classList.remove('dt-range-selecting')
    // 抑制紧随 mouseup 的 click，避免把刚形成的选区清成单选
    _rangeSuppressClick = true
  }
  _rangeCandidate = null
  _rangeActive = false
  setTimeout(() => {
    _rangeSuppressClick = false
  }, 200)
}

/** 数据变化（筛选/排序/分页/列显隐/原地增删行）后旧选区失效，必须清空；
 *  同时维护显示行列快照，供无矩形选区时的矩阵粘贴定位 */
watch(
  [() => _effectivePagedData.value.length, _effectivePagedData, _displayColumns],
  () => {
    if (rangeSel.value) clearRange()
    setDisplayMatrix(
      _effectivePagedData.value.map((r) => rowMetaMap.value.get(r)?.key ?? '').filter(Boolean),
      _displayColumns.value.map((c) => c.key),
    )
  },
  { immediate: true },
)

// 6. 周边功能：导出 / 右键菜单 / 行选择 / 持久化 / 全局事件
// _cellOverrides 直接传入，导出时无需桥接同步
const {
  exportCSV,
  exportExcel,
  contextMenu,
  contextMenuStyle,
  showContextMenu,
  showRowContextMenu,
  closeContextMenu: _closeCtxMenu,
  hideCurrentColumn,
  showAllColumns,
  filterFocusIndex,
  onFilterKeydown,
  _selectedKeys,
  isAllSelected,
  toggleSelectAll,
  toggleRowSelect,
  onGlobalKeydown,
  onDocumentClick,
  onScrollClose,
  _clearPersisted,
  restoreColWidths,
  flushWidths,
} = useTableExtras(props, emit as (...args: unknown[]) => void, {
  displayData: _displayDataRef as ComputedRef<Record<string, any>[]>,
  tableWrapRef,
  filteredOptions,
  filterDraft,
  hiddenColumns,
  filterState,
  filterOptionsRef,
  displayColumns: _displayColumns,
  cellOverrides: _cellOverrides,
  sortState,
  sortHistory,
  _columnOrder,
  columnWidths,
  _userResizedCols,
  _dense,
  dynamicFixedLeft,
  dynamicFixedRight,
  pagedData,
})

/** 清除筛选（同时清除持久化） */
function handleClearFilters(): void {
  clearAllFilters()
  _clearPersisted('filter')
}
/** 清除排序（同时清除持久化） */
function handleClearSort(): void {
  clearSort()
  _clearPersisted('sort')
}
closeContextMenu = _closeCtxMenu

// 图片预览灯箱（单击打开，支持缩放拖拽）
let _lightboxTimer: ReturnType<typeof setTimeout> | null = null
const _lightboxSrc = ref('')
function onImageClick(_e: MouseEvent, src: string) {
  if (_lightboxTimer) {
    clearTimeout(_lightboxTimer)
    _lightboxTimer = null
    return
  }
  _lightboxTimer = setTimeout(() => {
    _lightboxSrc.value = src
    _lightboxTimer = null
  }, 280)
}
function closeLightbox() {
  _lightboxSrc.value = ''
}

// 选项列自定义下拉面板
// options 支持 string | object 两种形式，运行时 typeof 判分
const _optDrop = ref<{
  rowKey: string
  colKey: string
  options: (string | ColumnOption)[]
  currentVal: string
  top: number
  left: number
  width: number
  above: boolean
} | null>(null)
function openOptDrop(row: Record<string, any>, col: Column, event: MouseEvent) {
  // 防御：非编辑模式或列级禁用不允许打开选项面板
  if (!col.options || !props.editable || col.editable === false) return
  markLayerOpen()
  const rk = rowMetaMap.value.get(row)?.key ?? ''
  // 点同一格则关闭
  if (_optDrop.value?.rowKey === rk && _optDrop.value?.colKey === col.key) {
    _optDrop.value = null
    return
  }
  const td = event.currentTarget as HTMLElement
  const rect = td.getBoundingClientRect()
  _optDropTriggerRect = rect
  // 预估下拉面板高度：每项 32px + 内边距
  const estMenuH = Math.min(320, Math.max(120, col.options.length * 32 + 12))
  const result = computeFloatingPosition({
    rect,
    floatingW: Math.max(rect.width, 100),
    floatingH: estMenuH,
    offset: 4,
    defaultDirection: 'down',
  })
  _optDrop.value = {
    rowKey: rk,
    colKey: col.key,
    options: col.options,
    currentVal: cellVal(row, col.key, rowMetaMap.value.get(row)?.texts[col.key] ?? ''),
    top: result.top,
    left: result.left,
    width: Math.max(rect.width, 100),
    above: result.above,
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
    const next = { ..._cellOverrides.value }
    if (!next[rowKey]) next[rowKey] = {}
    next[rowKey] = { ...next[rowKey], [colKey]: val }
    _cellOverrides.value = next
    emit('cellChange', rowKey, colKey, val)
  }
}

function optColor(col: Column, val: string): string {
  if (!col.options) return 'inherit'
  const opt = col.options.find((o) => (typeof o === 'string' ? o : o.value) === val)
  return opt && typeof opt === 'object' && opt.color ? opt.color : 'inherit'
}
// 判断选项面板值是否为当前值

/** 单元格单击：选项列弹出面板，否则走选择逻辑
 *  @patch 2026-07-15 Ctrl+单击 → 行高亮+进度条标记；普通单击 → 仅单元格选中 */
function onCellClick(row: Record<string, any>, col: Column, event: MouseEvent) {
  // @patch 2026-08-09 拖选结束的 click 不改变选区（长按/拖拽已建立矩形选区）
  if (_rangeSuppressClick) {
    _rangeSuppressClick = false
    return
  }
  const rk = rowMetaMap.value.get(row)?.key ?? ''
  // 行高亮/进度条标记：仅 Ctrl+单击时切换
  if (event.ctrlKey || event.metaKey) {
    const next = new Set(_clickedRowKeys.value)
    if (next.has(rk)) next.delete(rk)
    else next.add(rk)
    _clickedRowKeys.value = next
  }
  // 仅编辑模式且列级开关未禁用时弹出选项面板；否则与普通列一致只做选中
  if (col.options && props.editable && col.editable !== false) {
    openOptDrop(row, col, event)
  } else {
    selectCell(
      rk,
      col.key,
      cellVal(row, col.key, rowMetaMap.value.get(row)?.texts[col.key] ?? ''),
      event.ctrlKey || event.metaKey,
    )
  }
}

/** 单元格双击：编辑模式且列可编辑 → 进入编辑；否则仅保留单元格选中态，清除浏览器双击产生的文本全选 */
function onCellDblClick(row: Record<string, any>, col: Column, e?: MouseEvent) {
  const canEdit = props.editable && col.editable !== false
  // options 列双击：打开选项面板（不进入无输入框的内联编辑）
  if (canEdit && col.options && e) {
    openOptDrop(row, col, e)
    return
  }
  if (canEdit) {
    startEdit(
      rowMetaMap.value.get(row)?.key ?? '',
      col.key,
      cellVal(row, col.key, rowMetaMap.value.get(row)?.texts[col.key] ?? ''),
    )
    return
  }
  // 两次 click 已完成单元格选中（selectCell），这里只清除文本选择，避免误以为可编辑
  window.getSelection()?.removeAllRanges()
}

/** 表头键盘排序：Enter/Space 触发（避开筛选图标/排序图标/拖拽手柄等子元素） */
function onThKeydown(e: KeyboardEvent, col: Column) {
  if (e.key !== 'Enter' && e.key !== ' ') return
  const t = e.target as HTMLElement
  if (t.closest('.resize-handle') || t.closest('.th-filter-icon') || t.closest('.sort-arrows')) return
  e.preventDefault()
  toggleSort(col)
}

/** 筛选图标键盘触发：用图标位置构造伪鼠标事件（toggleFilter 依赖 clientX/currentTarget 定位下拉） */
function onFilterKeyTrigger(col: Column, e: KeyboardEvent) {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const fake = {
    currentTarget: el,
    clientX: rect.left + rect.width / 2,
    clientY: rect.bottom + 4,
    stopPropagation() {},
  } as unknown as MouseEvent
  toggleFilter(col, fake)
}

// ==================== 列设置面板（显隐 / 顺序 / 固定） ====================
const _colSettingsShow = ref(false)
const _colSettingsAbove = ref(false)
const _colSettingsStyle = ref<Record<string, string>>({})
const colSettingsRef = ref<HTMLElement | null>(null)
const _colSettingsWidth = 380
/** 面板列列表：全部列（含隐藏列），按当前拖拽顺序 */
const _settingsColumns = computed(() => {
  const orderMap = new Map(_columnOrder.value.map((k, i) => [k, i]))
  return [...props.columns].sort((a, b) => (orderMap.get(a.key) ?? 999) - (orderMap.get(b.key) ?? 999))
})
/** 列名搜索关键词 */
const colKeyword = ref('')
/** 过滤后的列列表（保留全量索引，固定/顺序判断不受过滤影响） */
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
  markLayerOpen()
  closeFilter()
  const btn = (e?.currentTarget as HTMLElement | null) ?? null
  const rect = btn?.getBoundingClientRect()
  if (!rect) {
    _colSettingsStyle.value = { top: '56px', right: '16px' }
    return
  }
  // 用通用算法预估方向和位置
  const result = computeFloatingPosition({
    rect,
    floatingW: _colSettingsWidth,
    floatingH: 300,
    offset: 4,
    defaultDirection: 'down',
  })
  _colSettingsAbove.value = result.direction === 'up'
  _colSettingsStyle.value = result.direction === 'up'
    ? { bottom: `${window.innerHeight - rect.top + 4}px`, left: `${result.left}px` }
    : { top: `${rect.bottom + 4}px`, left: `${result.left}px` }
  // 渲染后按实际高度修正方向
  nextTick(() => {
    const el = colSettingsRef.value
    if (!el) return
    const h = el.offsetHeight
    const fitsBelow = rect.bottom + 4 + h <= window.innerHeight - 8
    const spaceAbove = rect.top - 8
    const spaceBelow = window.innerHeight - rect.bottom
    if (!fitsBelow && spaceAbove > spaceBelow) {
      _colSettingsAbove.value = true
      _colSettingsStyle.value = { bottom: `${window.innerHeight - rect.top + 4}px`, left: `${result.left}px` }
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
/** 全部显示 / 全部隐藏（保留第一列） */
function toggleAllColsVisible(show: boolean) {
  if (show) {
    hiddenColumns.value = new Set()
  } else {
    hiddenColumns.value = new Set(props.columns.map((c) => c.key).slice(1))
  }
}
/** 当前是否全部列可见（驱动「全部隐藏/全部显示」切换按钮文案） */
const allColumnsVisible = computed(() => hiddenColumns.value.size === 0)
/** 是否已存在手动调整的列宽（驱动「重置列宽」按钮亮起/置灰） */
const _userResizeTick = ref(0)
watch(columnWidths, () => {
  _userResizeTick.value++
})
const hasManualWidths = computed(() => {
  void _userResizeTick.value
  return _userResizedCols.value.size > 0
})
/** 重置列宽：清除手动调整的列宽与持久化存储，恢复 autoFit 自动列宽 */
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
/** 面板列宽显示（与表头渲染一致的回退） */
function colWidthPx(col: Column): number {
  return Math.round(columnWidths.value[col.key] || Math.max(headerMinW(col), 60))
}
/** 面板列宽微调（步进 10px，下限表头最小宽），写入 columnWidths 自动持久化 */
function adjustColWidth(colKey: string, delta: number) {
  const col = props.columns.find((c) => c.key === colKey)
  const minW = col ? Math.max(headerMinW(col), 30) : 30
  const cur = columnWidths.value[colKey] || minW
  columnWidths.value = { ...columnWidths.value, [colKey]: Math.max(minW, Math.round(cur + delta)) }
  _userResizedCols.value.add(colKey)
}
/** 当前左侧连续固定列数（与右键菜单/表头右键状态同步） */
const _leftFixedCount = computed(() => {
  const keys = _settingsColumns.value.map((c) => c.key)
  let n = 0
  while (n < keys.length && dynamicFixedLeft.value.has(keys[n])) n++
  return n
})
/** 当前右侧连续固定列数 */
const _rightFixedCount = computed(() => {
  const keys = _settingsColumns.value.map((c) => c.key)
  let n = 0
  while (n < keys.length && dynamicFixedRight.value.has(keys[keys.length - 1 - n])) n++
  return n
})
/** 设置固定前 N 列（0 = 不固定） */
function setLeftFixedCount(n: number) {
  const keys = _settingsColumns.value.map((c) => c.key)
  dynamicFixedLeft.value = new Set(n > 0 ? keys.slice(0, n) : [])
}
/** 设置固定后 N 列（0 = 不固定） */
function setRightFixedCount(n: number) {
  const keys = _settingsColumns.value.map((c) => c.key)
  dynamicFixedRight.value = new Set(n > 0 ? keys.slice(keys.length - n) : [])
}
/** 每列固定按钮：左 = 该列及左侧所有列；右 = 该列及右侧所有列；无 = 从该列断开区域（保留外侧） */
function setColFixed(col: Column, pos: 'left' | 'right' | null) {
  if (pos === 'left') fixLeftCascade(col.key)
  else if (pos === 'right') fixRightCascade(col.key)
  else {
    const keys = _settingsColumns.value.map((c) => c.key)
    const idx = keys.indexOf(col.key)
    if (idx < 0) return
    const l = new Set(dynamicFixedLeft.value)
    const r = new Set(dynamicFixedRight.value)
    if (l.has(col.key)) {
      // 左侧区域从该列断开：取消该列及其右侧的左侧固定
      for (const k of keys.slice(idx)) l.delete(k)
    }
    if (r.has(col.key)) {
      // 右侧区域从该列断开：取消该列及其左侧的右侧固定
      for (const k of keys.slice(0, idx + 1)) r.delete(k)
    }
    dynamicFixedLeft.value = l
    dynamicFixedRight.value = r
  }
}
/** 固定快捷操作：全部固定左 / 全部固定右 / 取消全部固定 */
function setAllFixed(side: 'left' | 'right' | null) {
  const keys = _settingsColumns.value.map((c) => c.key)
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
/** 全部固定左/右：当前所有列已动态固定到该侧时激活（驱动切换按钮） */
const allFixedLeft = computed(() => {
  const keys = visibleColumns.value.map((c) => c.key)
  return keys.length > 0 && keys.every((k) => dynamicFixedLeft.value.has(k))
})
const allFixedRight = computed(() => {
  const keys = visibleColumns.value.map((c) => c.key)
  return keys.length > 0 && keys.every((k) => dynamicFixedRight.value.has(k))
})
/** 是否没有任何动态固定（驱动「取消固定」置灰；静态 fixed 由 props 决定，不受本按钮影响） */
const nothingFixed = computed(() => dynamicFixedLeft.value.size === 0 && dynamicFixedRight.value.size === 0)
/** 固定开关：激活时再点取消，未激活时全部固定到该侧 */
function toggleAllFixed(side: 'left' | 'right') {
  const active = side === 'left' ? allFixedLeft.value : allFixedRight.value
  setAllFixed(active ? null : side)
}
/** 列头右键「取消固定」：从该列断开区域（保留外侧固定） */
function onUnfixFromMenu(colKey: string) {
  const keys = _settingsColumns.value.map((c) => c.key)
  const idx = keys.indexOf(colKey)
  if (idx < 0) return
  if (dynamicFixedLeft.value.has(colKey)) setLeftFixedCount(Math.max(0, idx))
  if (dynamicFixedRight.value.has(colKey)) setRightFixedCount(Math.max(0, keys.length - 1 - idx))
}
/** 面板固定区域摘要：固定前 N 列 / 固定后 M 列 */
const _fixedSummary = computed(() => {
  const parts: string[] = []
  if (_leftFixedCount.value > 0) parts.push(`左侧 ${_leftFixedCount.value} 列`)
  if (_rightFixedCount.value > 0) parts.push(`右侧 ${_rightFixedCount.value} 列`)
  return parts.length ? parts.join('，') : ''
})

// ==================== 右键菜单 / 选项面板键盘导航 ====================
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

const optDropRef = ref<HTMLElement | null>(null)
const _optFocusIndex = ref(0)
// 面板打开时的触发单元格 rect 快照，用于渲染后精确重定位
let _optDropTriggerRect: DOMRect | null = null
watch(_optDrop, (v) => {
  if (!v) return
  _optFocusIndex.value = 0
  nextTick(() => {
    optDropRef.value?.focus()
    // 渲染后用实际高度重新计算位置，修复预估高度不精确导致的向上弹出重叠问题
    // 直接操作 DOM 避免修改 _optDrop.value 触发 watch 循环
    if (optDropRef.value && _optDropTriggerRect) {
      const panelEl = optDropRef.value
      const panelH = panelEl.offsetHeight
      const triggerRect = _optDropTriggerRect
      const vh = window.innerHeight
      const offset = 4
      const spaceDown = vh - triggerRect.bottom - offset
      const spaceUp = triggerRect.top - offset
      let newTop: number
      if (spaceDown >= panelH) {
        newTop = triggerRect.bottom + offset
      } else if (spaceUp >= panelH) {
        newTop = triggerRect.top - panelH - offset
      } else {
        // 上下都不够：选空间大的方向
        newTop = spaceDown >= spaceUp
          ? triggerRect.bottom + offset
          : Math.max(8, triggerRect.top - panelH - offset)
      }
      // 边界裁剪：不超出视口
      if (newTop < 8) newTop = 8
      if (newTop + panelH > vh - 8) newTop = Math.max(8, vh - panelH - 8)
      panelEl.style.top = newTop + 'px'
    }
  })
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

// ==================== 单元格右键菜单（复制 / 粘贴 / 清空） ====================
/** 单元格右键守卫：cellContextMenu=false 时不拦截，冒泡到行右键/浏览器默认 */
function onCellContextMenuGuard(row: Record<string, any>, col: Column, e: MouseEvent) {
  if (!props.cellContextMenu) return
  e.preventDefault()
  e.stopPropagation()
  onCellContextMenu(row, col, e)
}

function onCellContextMenu(row: Record<string, any>, col: Column, event: MouseEvent) {
  // 右键格设为当前选中（清空旧选区），菜单操作基于该格
  markLayerOpen()
  const rk = rowMetaMap.value.get(row)?.key ?? ''
  selectCell(rk, col.key, cellVal(row, col.key, rowMetaMap.value.get(row)?.texts[col.key] ?? ''), false)
  closeContextMenu()
  const idx = _effectivePagedData.value.findIndex((r) => rowMetaMap.value.get(r)?.key === rk)
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    above: false,
    columnKey: col.key,
    rowKey: rk,
    row,
    rowIndex: idx,
  }
  // 菜单边界（3 项 + 分隔线）
  const pos = clampFloatingPosition(event.clientX, event.clientY, 140, 150, tableWrapRef.value)
  contextMenu.value.x = pos.left
  contextMenu.value.y = pos.above ? event.clientY : pos.top
  contextMenu.value.above = pos.above
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

/** 获取单元格即时显示值（本地覆盖优先） */
function cellVal(row: Record<string, any>, colKey: string, metaVal: string): string {
  const rk = rowMetaMap.value.get(row)?.key ?? ''
  return getCellValue(rk, colKey, metaVal)
}

/** 判断值是否为图片（dataURL 或以常见图片扩展名结尾，或来自知名图片 CDN） */
const _defaultImageDomains = [
  'pravatar.cc',
  'placeholder.com',
  'picsum.photos',
  'unsplash.com',
  'via.placeholder',
  'dummyimage.com',
]
function isImageUrl(val: unknown): boolean {
  if (!val) return false
  if (typeof val !== 'string') return false
  if (val.startsWith('data:image/')) return true
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?|#|$)/i.test(val)) return true
  const domains = props.imageDomains?.length ? props.imageDomains : _defaultImageDomains
  const pattern = new RegExp(domains.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')
  if (pattern.test(val)) return true
  // 启发式 URL 路径匹配 — 可能误判，优先依赖域名白名单 + 扩展名
  if (new RegExp('^https?://.+[/=](img|image|photo|avatar|pic|thumb)', 'i').test(val)) return true
  return false
}

// 11. 批量修改
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

// 12. 汇总行
const _summaryData = computed(() => {
  if (!props.summary) return null
  if (typeof props.summary === 'function') return props.summary(props.data)
  return props.summary
})
function handleRowClick(row: Record<string, any>, idx: number) {
  const key = rowMetaMap.value.get(row)?.key ?? ''
  const next = new Set(_clickedRowKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  _clickedRowKeys.value = next
  emit('rowClick', row, idx)
}

const _onClick = (e: Event) => {
  onDocumentClick(e as MouseEvent, closeFilter)
  const t = e.target as HTMLElement
  if (!t.closest('.dt-col-settings') && !t.closest('.col-settings-btn')) _colSettingsShow.value = false
  if (!t.closest('.cell-has-options') && !t.closest('.opt-drop-panel')) closeOptDrop()
}
const _onKeydown = (e: Event) => {
  const ke = e as KeyboardEvent
  if (ke.key === 'Escape' && _colSettingsShow.value) {
    _colSettingsShow.value = false
    return
  }
  // 缩放快捷键：Ctrl+Plus/Minus/0（不拦截输入框内的操作）
  if (ke.ctrlKey || ke.metaKey) {
    const tag = (ke.target as HTMLElement)?.tagName
    const isInput =
      tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (ke.target as HTMLElement)?.isContentEditable
    if (!isInput) {
      if (ke.key === '=' || ke.key === '+' || ke.code === 'NumpadAdd') {
        ke.preventDefault()
        zoomIn()
        return
      }
      if (ke.key === '-' || ke.code === 'NumpadSubtract') {
        ke.preventDefault()
        zoomOut()
        return
      }
      if (ke.key === '0' || ke.code === 'Numpad0') {
        ke.preventDefault()
        resetZoom()
        return
      }
    }
  }
  onGlobalKeydown(ke, activeFilterKey, contextMenu, closeFilter)
}
const _onScroll = (e: Event) => {
  // 打开瞬间的布局滚动不关闭浮层（冷却 200ms）
  if (isLayerFresh()) return
  onScrollClose(e as Event, activeFilterKey, closeFilter)
  // 与筛选下拉一致：滚动时关闭轻量浮层（面板内部滚动不关闭）
  const t = e.target as HTMLElement | null
  if (_colSettingsShow.value && !(t instanceof HTMLElement && t.closest('.dt-col-settings'))) {
    _colSettingsShow.value = false
  }
  if (_optDrop.value && !(t instanceof HTMLElement && t.closest('.opt-drop-panel'))) closeOptDrop()
}

onMounted(() => {
  _releaseZTop = boostZTop()
  document.addEventListener('click', _onClick, true)
  document.addEventListener('keydown', _onKeydown, true)
  document.addEventListener('keydown', onCellKeydown, true)
  document.addEventListener('scroll', _onScroll, true)
  window.addEventListener('resize', onWindowResizeCard)
  // 锁定初始容器高度，防止缩放后内容撑大父控件
  nextTick(() => {
    if (props.autoHeight && !props.maxHeight && tableWrapRef.value) {
      _lockedMaxH.value = tableWrapRef.value.clientHeight + 'px'
    }
  })
  if (isVirtual.value) {
    nextTick(() => {
      if (scrollContainerRef.value) containerHeight.value = scrollContainerRef.value.clientHeight
    })
  }
  _closeCallbacks.add(closeFilter)

  // 检测弹窗等受限容器：让父容器变成 flex 列，表格 flex:1 填满剩余
  if (props.autoHeight && scrollContainerRef.value && !_isFullscreen.value) {
    let el: HTMLElement | null = tableWrapRef.value?.parentElement ?? null
    while (el && el !== document.body) {
      const ovY = window.getComputedStyle(el).overflowY
      // 跳过主内容区（不受限），只处理弹窗等真正受限的容器
      if ((ovY === 'auto' || ovY === 'scroll') && !el.classList.contains('content-body')) {
        // 只处理高度受限的容器（如弹窗），跳过主内容区
        el.style.display = 'flex'
        el.style.flexDirection = 'column'
        el.style.minHeight = '0'
        el.style.overflowY = 'hidden'
        if (tableWrapRef.value) {
          tableWrapRef.value.style.flex = '1'
          tableWrapRef.value.style.minHeight = '0'
        }
        _cleanups.push(() => {
          el!.style.display = ''
          el!.style.flexDirection = ''
          el!.style.minHeight = ''
          el!.style.overflowY = ''
          if (tableWrapRef.value) {
            tableWrapRef.value.style.flex = ''
            tableWrapRef.value.style.minHeight = ''
          }
        })
        break
      }
      el = el.parentElement
    }
  }

  // 数据异步加载后重新 autoFit（首次挂载时 data 可能为空）
  // 恢复持久化列宽（必须在 autoFit 之前，否则 autoFit 触发 persist 会覆盖）
  let _firstDataReady = false
  let _lastAutoFitLen = 0
  watch(
    _displayDataRef,
    (val: Record<string, any>[]) => {
      const len = (val && val.length) || 0
      if (!_firstDataReady && len > 0) {
        _firstDataReady = true
        _lastAutoFitLen = len
        nextTick(async () => {
          restoreColWidths()
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
          applyAutoFit()
        })
      } else if (len > 0 && Math.abs(len - _lastAutoFitLen) > len * 0.3) {
        _lastAutoFitLen = len
        nextTick(async () => {
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
          applyAutoFit()
        })
      }
    },
    { immediate: true },
  )

  // 初始挂载 autoFit
  nextTick(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    applyAutoFit()
  })
})

onUnmounted(() => {
  _releaseZTop?.()
  flushWidths()
  _cancelSearchDebounce()
  // @patch 2026-08-09 清理拖选残留状态
  if (_rangeTimer) clearTimeout(_rangeTimer)
  stopRangeAutoScroll()
  document.removeEventListener('mousemove', onRangeMove)
  document.removeEventListener('mouseup', onRangeUp)
  document.body.classList.remove('dt-range-selecting')
  _closeCallbacks.delete(closeFilter)
  // 清理列宽拖拽事件（防止悬空监听）
  if (resizing.value) {
    document.removeEventListener('mousemove', onResizeMove)
    document.removeEventListener('mouseup', onResizeEnd)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.removeEventListener('click', _onClick, true)
  document.removeEventListener('keydown', _onKeydown, true)
  document.removeEventListener('keydown', onCellKeydown, true)
  document.removeEventListener('scroll', _onScroll, true)
  window.removeEventListener('resize', onWindowResizeCard)
  // 全屏清理：防止组件销毁后残留 DOM/事件/样式
  if (_isFullscreen.value) {
    document.body.classList.remove('dt-fullscreen-active')
    document.removeEventListener('keydown', onFullscreenKeydown, true)
    document.removeEventListener('click', onFullscreenBodyClick, true)
    window.removeEventListener('resize', onFullscreenResize)
    if (_fsTimer) {
      clearTimeout(_fsTimer)
      _fsTimer = null
    }
    _fsPending = false
    if (_fsResizeRaf) {
      cancelAnimationFrame(_fsResizeRaf)
      _fsResizeRaf = 0
    }
    // 还原侧边栏
    if (_sidebarToggledByUs.value) {
      _toggleCollapse()
      _sidebarToggledByUs.value = false
    }
    // 清理 inline 样式
    if (tableWrapRef.value) {
      tableWrapRef.value.style.top = ''
      tableWrapRef.value.style.left = ''
      tableWrapRef.value.style.width = ''
      tableWrapRef.value.style.height = ''
    }
  }
  _cleanups.forEach((fn) => fn())
})

// ==================== 截断气泡 ====================
const { _tooltipText, _tooltipVisible, _tooltipStyle, showTooltip, hideTooltip, onTooltipKeydown } = useTableTooltip({
  truncateMode: toRef(props, 'truncateMode'),
})

// ==================== 截断单元格弹窗 — 长文本点击展开完整版 ====================
const _cellDetailModal = ref<{ visible: boolean; title: string; content: string }>({
  visible: false,
  title: '',
  content: '',
})
function openCellDetail(colTitle: string, text: string) {
  // 关闭截图弹窗（避免两个内部 ModalBox 通过 ModalManager 互相踢）
  if (_screenshotModal.value.visible) _screenshotModal.value.visible = false
  _cellDetailModal.value = { visible: true, title: colTitle, content: text }
}

// ==================== 多行锚点（点击行高亮 → 进度条标记 → 点击跳回） ====================
const _pinnedRowPcts = computed(() => {
  const keys = _clickedRowKeys.value
  if (keys.size === 0) return [] as { key: string; pct: number }[]
  const data = pagedData.value
  const total = data.length
  if (total === 0) return []
  const result: { key: string; pct: number }[] = []
  for (let i = 0; i < total; i++) {
    const rk = rowMetaMap.value.get(data[i])?.key ?? ''
    if (keys.has(rk)) result.push({ key: rk, pct: Math.round(((i + 0.5) / total) * 100) })
  }
  return result
})
/** 锚点跳回：计算目标行的 scrollTop 并平滑滚动 */
function scrollToPinnedRow(key: string) {
  if (!key) return
  const container = scrollContainerRef.value
  if (!container) return
  const data = pagedData.value
  const rowH = _effectiveRowHeight.value
  for (let i = 0; i < data.length; i++) {
    if ((rowMetaMap.value.get(data[i])?.key ?? '') === key) {
      const targetTop = i * rowH - container.clientHeight / 2 + rowH / 2
      container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
      return
    }
  }
}

/** 筛选选项：仅文本溢出时显示 title */
function onFilterOptionEnter(e: MouseEvent) {
  const span = e.currentTarget as HTMLElement
  if (span.scrollWidth > span.clientWidth) {
    span.setAttribute('title', span.textContent || '')
  }
}
function onFilterOptionLeave(e: MouseEvent) {
  ;(e.currentTarget as HTMLElement).removeAttribute('title')
}
</script>

<template>
  <Toast ref="toastRef" variant="toast" position="bottom-right" />
  <div
    ref="tableWrapRef"
    class="table-wrap"
    :class="{ 'auto-height': autoHeight, fullscreen: _isFullscreen }"
    :style="_lockedMaxH ? { maxHeight: _lockedMaxH } : undefined"
    @wheel="onTableWheel"
  >
    <!-- 内部异常兜底 — 组件内部异常不导致页面崩溃 -->
    <div v-if="_internalError" style="padding: 40px 20px; text-align: center">
      <h3 style="color: var(--color-danger); margin-bottom: 8px">表格渲染异常</h3>
      <p style="color: var(--color-text-muted); font-size: 13px; margin-bottom: 16px">
        {{ _internalError.message }}
      </p>
      <button class="base-btn btn-primary btn-md" @click="_internalError = null">重试</button>
    </div>
    <div v-else style="display: contents">
      <!-- ========== 工具栏 ========== -->
      <div class="table-top-bar">
        <div class="table-toolbar">
          <span class="toolbar-count">
            <template v-if="activeFilters.length > 0 || globalSearch">
              已筛选 <strong>{{ displayData.length }}</strong> / 共 {{ displayTotal }} 行
            </template>
            <template v-else> 共 {{ displayTotal }} 行 </template>
          </span>
          <template v-if="activeFilters.length > 0">
            <span v-for="[key, s] in activeFilters" :key="key" class="filter-chip">
              {{ colTitle(columns.find((c) => c.key === key)!) || key }}
              <span class="filter-chip-count">({{ s.selectedValues.length }})</span>
              <IconSvg type="x" size="sm" class="filter-chip-close" @click="removeFilter(key)" />
            </span>
          </template>
          <!-- 清除操作居中 -->
          <div class="toolbar-center">
            <button v-if="activeFilters.length > 0" class="toolbar-clear" @click="handleClearFilters">清除筛选</button>
            <button v-if="sortState.key" class="toolbar-clear" @click="handleClearSort">清除排序</button>
          </div>
          <!-- 功能按钮靠右 -->
          <div class="toolbar-right">
            <!-- 全局搜索 -->
            <div class="global-search-wrap" :class="{ active: showGlobalSearch }">
              <input
                v-if="showGlobalSearch"
                ref="globalSearchRef"
                v-model="globalSearch"
                type="text"
                class="global-search-input"
                placeholder="搜索所有列..."
                @keydown.escape="toggleGlobalSearch"
              />
              <button
                class="global-search-toggle"
                :title="showGlobalSearch ? '关闭搜索' : '全局搜索'"
                @click="toggleGlobalSearch"
              >
                <IconSvg :type="showGlobalSearch ? 'x' : 'search'" size="sm" />
              </button>
            </div>
            <!-- 密度切换 -->
            <button
              v-if="!isCardViewEffective"
              class="toolbar-export-btn"
              :title="_dense ? '默认密度' : '紧凑模式'"
              @click="toggleDense"
            >
              <IconSvg :type="_dense ? 'chevron-up' : 'list'" size="sm" />
            </button>
            <!-- 缩放指示器 -->
            <button
              class="toolbar-export-btn toolbar-zoom-btn"
              :title="_zoomX !== 1 || _zoomY !== 1 ? '点击重置缩放 (Ctrl+0)' : 'Ctrl+滚轮 / Ctrl± 缩放'"
              @click="resetZoom"
            >
              {{ Math.round(_zoomY * 100) }}%
            </button>
            <!-- CSV 导出 -->
            <button v-if="exportable" class="toolbar-export-btn" title="下载 CSV" @click="exportCSV">
              <IconSvg type="download" size="sm" />
            </button>
            <!-- Excel 导出 -->
            <button v-if="excelExportable" class="toolbar-export-btn" title="下载 Excel" @click="exportExcel">
              <IconSvg type="file-spreadsheet" size="sm" />
            </button>
            <!-- 全屏 -->
            <button
              class="toolbar-export-btn"
              :title="_isFullscreen ? '退出全屏' : '全屏显示'"
              @click="toggleFullscreen"
            >
              <IconSvg
                :type="_isFullscreen ? 'full-screen-square-linear' : 'full-screen-linear'"
                provider="solar"
                size="sm"
              />
            </button>
            <!-- 截图 -->
            <button class="toolbar-export-btn" title="截图导出" @click="captureScreenshot">
              <IconSvg type="camera" size="sm" />
            </button>
            <!-- 复制 -->
            <button class="toolbar-export-btn" title="复制表格数据" @click="copyTableData">
              <IconSvg type="copy" size="sm" />
            </button>
            <!-- 视图切换 -->
            <button
              class="toolbar-export-btn"
              :title="isCardViewEffective ? '切换为列表模式' : '切换为卡片模式'"
              @click="toggleCardMode"
            >
              <IconSvg :type="isCardViewEffective ? 'table' : 'layout-grid'" size="sm" />
            </button>
            <!-- 列设置 -->
            <button
              v-if="colSettings"
              class="toolbar-export-btn col-settings-btn"
              :class="{ active: _colSettingsShow }"
              title="列设置"
              @click.stop="toggleColSettings($event)"
            >
              <IconSvg type="settings" size="sm" />
            </button>
            <!-- 批量修改 -->
            <button v-if="selectable && _selectedKeys.length > 0" class="toolbar-clear" @click="openBatchEdit">
              批量修改 ({{ _selectedKeys.length }})
            </button>
            <!-- 自定义工具栏按钮（使用方扩展：刷新/导入等） -->
            <slot name="toolbar-actions" />
          </div>
        </div>

        <!-- 滚动进度条：有高度约束 + 实际溢出时自动显示，无溢出则隐藏 -->
        <div
          v-if="_scrollable && (maxHeight || autoHeight || (isCardViewEffective && _cardViewHeight))"
          class="table-progress-track"
          @mousedown="onProgressMouseDown"
        >
          <div class="table-progress" :style="{ width: _scrollProgress + '%' }" />
          <!-- 固定行锚点（支持多处标记） -->
          <div
            v-for="anchor in _pinnedRowPcts"
            :key="anchor.key"
            class="table-progress-anchor"
            :style="{ left: anchor.pct + '%' }"
            :title="'点击跳回标记行'"
            @mousedown.stop
            @click.stop="scrollToPinnedRow(anchor.key)"
          />
        </div>
      </div>

      <div class="table-hscroll" :class="{ 'card-view-hidden': isCardViewEffective }">
        <div
          ref="scrollContainerRef"
          class="table-scroll"
          :class="{ 'table-scroll-fixed': !!maxHeight }"
          :style="
            maxHeight ? { maxHeight } : autoHeight ? { '--dt-scroll-min': (_dense ? 32 : 40) * 10 + 'px' } : undefined
          "
          @scroll="onScrollTable"
        >
          <table
            class="data-table"
            :class="{ bordered, striped, hoverable, dense: _dense }"
            :style="{
              ...(autoFit ? { tableLayout: 'fixed', width: '100%' } : {}),
              '--dt-zoom-y': _zoomY,
              '--dt-zoom-x': _zoomX,
            }"
            :aria-busy="isLoading"
            aria-label="数据表格"
          >
            <!-- ========== 表头 ========== -->
            <thead>
              <tr>
                <!-- 选择框列 -->
                <th v-if="selectable" class="th-checkbox" :class="{ 'col-fixed-left': _hasFixedLeftCol }">
                  <input type="checkbox" :checked="isAllSelected" @click.stop="toggleSelectAll" />
                </th>
                <th
                  v-for="col in _displayColumns"
                  :key="col.key"
                  draggable="true"
                  tabindex="0"
                  role="button"
                  :style="{
                    width: columnWidths[col.key]
                      ? Math.max(columnWidths[col.key], 30) * _zoomX + 'px'
                      : Math.max(headerMinW(col), 60) * _zoomX + 'px',
                    textAlign: col.headerAlign || col.align || 'left',
                    left:
                      isColumnFixed(col) === 'left'
                        ? Number(fixedLeftOffsets[col.key] ?? 0) * _zoomX + 'px'
                        : undefined,
                    right:
                      isColumnFixed(col) === 'right'
                        ? Number(fixedRightOffsets[col.key] ?? 0) * _zoomX + 'px'
                        : undefined,
                  }"
                  :class="{
                    sortable: col.sortable,
                    'sort-active': sortState.key === col.key,
                    'filter-active': isFilterActive(col.key),
                    'col-fixed-left': isColumnFixed(col) === 'left',
                    'col-fixed-right': isColumnFixed(col) === 'right',
                    'drag-over': _dragOverCol === col.key && _dragCol !== col.key,
                    'drag-source': _dragCol === col.key,
                  }"
                  :aria-sort="
                    sortState.key === col.key ? (sortState.order === 'asc' ? 'ascending' : 'descending') : undefined
                  "
                  @click="onHeaderCellClick($event, col)"
                  @keydown="(e) => onThKeydown(e, col)"
                  @contextmenu.prevent="showContextMenu(col, $event)"
                  @dragstart="onColDragStart($event, col.key)"
                  @dragover="onColDragOver($event, col.key)"
                  @dragleave="onColDragLeave($event, col.key)"
                  @drop="onColDrop($event, col.key)"
                  @dragend="onColDragEnd"
                >
                  <div class="th-inner">
                    <slot name="header-cell" :column="col">
                      <span class="th-title">{{ colTitle(col) }}</span>
                    </slot>
                    <span v-if="col.sortable !== false || col.filterable !== false" class="th-actions">
                      <span v-if="col.sortable !== false" class="sort-arrows" aria-label="排序">
                        <IconSvg
                          type="chevron-up"
                          size="sm"
                          class="sort-icon sort-asc"
                          :class="sortArrowClass(col, 'asc')"
                          aria-hidden="true"
                        />
                        <IconSvg
                          type="chevron-down"
                          size="sm"
                          class="sort-icon sort-desc"
                          :class="sortArrowClass(col, 'desc')"
                          aria-hidden="true"
                        />
                      </span>
                      <span
                        v-if="col.filterable !== false"
                        class="th-filter-icon"
                        :class="{
                          'has-filter': isFilterActive(col.key),
                        }"
                        tabindex="0"
                        role="button"
                        aria-label="筛选"
                        @click.stop="toggleFilter(col, $event)"
                        @keydown.enter.prevent.stop="onFilterKeyTrigger(col, $event)"
                        @keydown.space.prevent.stop="onFilterKeyTrigger(col, $event)"
                      >
                        <IconSvg type="list" size="sm" />
                        <span v-if="isFilterActive(col.key)" class="filter-dot" />
                      </span>
                    </span>
                  </div>
                  <!-- 列宽拖拽手柄 -->
                  <span
                    class="resize-handle"
                    @mousedown.prevent="startResize(col, $event)"
                    @dblclick.stop.prevent="autoFitColumn(col)"
                    @click.stop
                  />
                </th>
                <!-- 操作列 -->
                <th
                  v-if="_hasActions"
                  class="th-actions-col"
                  :class="{ 'col-fixed-right': _hasFixedRightCol }"
                  :style="{ width: _actionColWidth * _zoomX + 'px', minWidth: 60 * _zoomX + 'px', textAlign: 'center' }"
                >
                  操作
                </th>
              </tr>
            </thead>

            <!-- ========== 加载中 ========== -->
            <tbody v-if="isLoading">
              <tr v-for="n in 4" :key="'skel-' + n">
                <td v-if="selectable" class="td-checkbox" :class="{ 'col-fixed-left': _hasFixedLeftCol }" />
                <td
                  v-for="col in _displayColumns"
                  :key="col.key"
                  :style="{
                    left:
                      isColumnFixed(col) === 'left'
                        ? Number(fixedLeftOffsets[col.key] ?? 0) * _zoomX + 'px'
                        : undefined,
                    right:
                      isColumnFixed(col) === 'right'
                        ? Number(fixedRightOffsets[col.key] ?? 0) * _zoomX + 'px'
                        : undefined,
                  }"
                  :class="{
                    'col-fixed-left': isColumnFixed(col) === 'left',
                    'col-fixed-right': isColumnFixed(col) === 'right',
                  }"
                >
                  <Loading variant="skeleton-text" width="80%" />
                </td>
                <td v-if="_hasActions" />
              </tr>
            </tbody>

            <!-- ========== 空状态 ========== -->
            <tbody v-else-if="isVirtual && !_isFullscreen ? !virtualTotal : !_effectivePagedData.length">
              <tr>
                <td :colspan="_totalCols || 1">
                  <slot name="empty" :filtered="!!(activeFilters.length || globalSearch)">
                    <Result
                      :status="activeFilters.length || globalSearch ? 'info' : 'empty'"
                      :title="
                        globalSearch
                          ? '搜索无结果，尝试其他关键词'
                          : activeFilters.length
                            ? '筛选结果为空，尝试调整筛选条件'
                            : effectiveEmptyText
                      "
                      description=""
                    />
                  </slot>
                </td>
              </tr>
            </tbody>

            <!-- ========== 数据行 ========== -->
            <tbody v-else>
              <!-- 虚拟滚动：顶部占位 -->
              <tr v-if="isVirtual && !_isFullscreen && virtualTopOffset > 0" aria-hidden="true">
                <td :colspan="_totalCols" :style="{ height: virtualTopOffset + 'px', padding: 0, border: 'none' }" />
              </tr>

              <tr
                v-for="(row, idx) in _isFullscreen
                  ? _effectivePagedData
                  : isVirtual
                    ? virtualVisibleData
                    : _effectivePagedData"
                :key="rowMetaMap.get(row)?.key ?? idx"
                :data-row-key="rowMetaMap.get(row)?.key"
                :class="[
                  {
                    'row-selected': _selectedKeys.includes(rowMetaMap.get(row)?.key ?? ''),
                    'row-striped': rowMetaMap.get(row)?.striped ?? false,
                    'row-clicked': _clickedRowKeys.has(rowMetaMap.get(row)?.key ?? ''),
                  },
                  _rowClass(row, rowDisplayIndex(idx)) ?? '',
                ]"
                :style="[
                  isVirtual ? { height: _effectiveRowHeight + 'px' } : {},
                  _rowStyle(row, rowDisplayIndex(idx)) ?? {},
                ]"
                @click="handleRowClick(row, idx)"
                @contextmenu.prevent="showRowContextMenu(row, $event)"
              >
                <td v-if="selectable" class="td-checkbox" :class="{ 'col-fixed-left': _hasFixedLeftCol }" @click.stop>
                  <input
                    type="checkbox"
                    :checked="_selectedKeys.includes(rowMetaMap.get(row)?.key ?? '')"
                    @change="toggleRowSelect(row)"
                  />
                </td>
                <td
                  v-for="(col, ci) in _displayColumns"
                  :key="col.key"
                  :data-row-idx="rowDisplayIndex(idx)"
                  :data-col-idx="ci"
                  :style="[
                    {
                      textAlign: col.cellAlign || col.align || 'left',
                      left:
                        isColumnFixed(col) === 'left'
                          ? Number(fixedLeftOffsets[col.key] ?? 0) * _zoomX + 'px'
                          : undefined,
                      right:
                        isColumnFixed(col) === 'right'
                          ? Number(fixedRightOffsets[col.key] ?? 0) * _zoomX + 'px'
                          : undefined,
                      maxWidth: columnWidths[col.key] ? columnWidths[col.key] * _zoomX + 'px' : undefined,
                    },
                    _cellStyle(col.key, row, rowDisplayIndex(idx)) ?? {},
                  ]"
                  :class="[
                    {
                      'col-fixed-left': isColumnFixed(col) === 'left',
                      'col-fixed-right': isColumnFixed(col) === 'right',
                      'cell-editing':
                        editingCell?.rowKey === (rowMetaMap.get(row)?.key ?? '') && editingCell?.colKey === col.key,
                      'cell-has-note': noteMode && hasNote(rowMetaMap.get(row)?.key ?? '', col.key),
                      'cell-selected': isCellSelected(rowMetaMap.get(row)?.key ?? '', col.key),
                      'cell-range-anchor': isRangeAnchor(rowMetaMap.get(row)?.key ?? '', col.key),
                      'cell-has-options': col.options,
                      'cell-modified':
                        (props.modifiedMark || props.originalTooltip) &&
                        (_cellOverrides[rowMetaMap.get(row)?.key ?? ''] ?? {})[col.key] !== undefined,
                      'cell-readonly': !editable || col.editable === false,
                    },
                    _cellClass(col.key, row, rowDisplayIndex(idx)) ?? '',
                  ]"
                  @mousedown="(e) => onCellMouseDown(e, row, col, rowDisplayIndex(idx), ci)"
                  @contextmenu="(e) => onCellContextMenuGuard(row, col, e)"
                  @mouseenter="onCellMouseEnter($event, row, col.key)"
                  @mouseleave="onCellMouseLeave"
                  @click.stop="onCellClick(row, col, $event)"
                  @dblclick.stop="onCellDblClick(row, col, $event)"
                  @paste="(e) => onCellPaste(e, rowMetaMap.get(row)?.key ?? '', col.key, col.accept || 'all')"
                  @drop="(e) => onImageDrop(e, rowMetaMap.get(row)?.key ?? '', col.key)"
                  @dragover="onImageDragOver"
                  @dragleave="onImageDragLeave"
                >
                  <!-- 编辑模式：文本输入（选项列走弹出面板，不在此显示控件） -->
                  <input
                    v-if="
                      editable &&
                        !col.options &&
                        editingCell?.rowKey === (rowMetaMap.get(row)?.key ?? '') &&
                        editingCell?.colKey === col.key
                    "
                    :ref="setEditInputEl"
                    v-model="editValue"
                    class="cell-edit-input"
                    @keydown="(e) => onEditKeydown(e, _displayColumns, rowMetaMap.get(row)?.key ?? '')"
                    @blur="commitEdit"
                    @click.stop
                  />
                  <!-- 编辑中仅显示输入框（选项列不走内联编辑，始终显示内容+箭头） -->
                  <template
                    v-if="
                      !(
                        editable &&
                        !col.options &&
                        editingCell?.rowKey === (rowMetaMap.get(row)?.key ?? '') &&
                        editingCell?.colKey === col.key
                      )
                    "
                  >
                    <img
                      v-if="
                        col.accept !== 'text' &&
                          isImageUrl(cellVal(row, col.key, rowMetaMap.get(row)?.texts[col.key] ?? ''))
                      "
                      :src="cellVal(row, col.key, rowMetaMap.get(row)?.texts[col.key] ?? '')"
                      class="cell-image"
                      :style="{ width: (col.imageSize || 40) + 'px', height: (col.imageSize || 40) + 'px' }"
                      @error="onImgError"
                      @click.stop="
                        onImageClick($event, cellVal(row, col.key, rowMetaMap.get(row)?.texts[col.key] ?? ''))
                      "
                      @dblclick.stop="onCellDblClick(row, col, $event)"
                    />
                    <!-- @patch 2026-07-15 移除空值图片占位符，空单元格直接显示空文本，拖入/粘贴图片仍可用 -->
                    <span
                      v-else-if="col.accept !== 'image'"
                      class="cell-text"
                      :class="{
                        truncated:
                          truncateMode === 'ellipsis' &&
                          (autoFit || (rowMetaMap.get(row)?.truncated[col.key] ?? false)),
                        'cell-wrap': truncateMode === 'wrap',
                        'cell-nowrap': truncateMode === 'none',
                      }"
                      :style="
                        autoFit && columnWidths[col.key]
                          ? { maxWidth: columnWidths[col.key] * _zoomX + 'px' }
                          : undefined
                      "
                    >
                      <span class="cell-text-inner">
                        <slot
                          name="cell"
                          :column="col"
                          :row="row"
                          :value="cellVal(row, col.key, rowMetaMap.get(row)?.texts[col.key] ?? '')"
                        >
                          <span
                            v-if="typeof col.cell === 'function'"
                            v-html="
                              sanitizeHTML(
                                col.cell(cellVal(row, col.key, rowMetaMap.get(row)?.texts[col.key] ?? ''), row),
                              )
                            "
                          />
                          <span
                            v-else-if="col.options && col.options.length && typeof col.options[0] === 'object'"
                            :style="{
                              color: optColor(col, cellVal(row, col.key, rowMetaMap.get(row)?.texts[col.key] ?? '')),
                            }"
                          >{{ cellVal(row, col.key, rowMetaMap.get(row)?.texts[col.key] ?? '') }}</span>
                          <template v-else>{{
                            cellVal(row, col.key, rowMetaMap.get(row)?.texts[col.key] ?? '')
                          }}</template>
                        </slot>
                      </span>
                      <!-- 截断长文本展开图标：50字以上 + 被截断 → 可点击弹窗 -->
                      <span
                        v-if="
                          truncateMode === 'ellipsis' &&
                            (autoFit || (rowMetaMap.get(row)?.truncated[col.key] ?? false)) &&
                            (rowMetaMap.get(row)?.texts[col.key]?.length || 0) > 50
                        "
                        class="cell-expand-icon"
                        title="点击查看完整内容"
                        @click.stop="openCellDetail(colTitle(col), rowMetaMap.get(row)?.texts[col.key] ?? '')"
                      >
                        <IconSvg type="external-link" size="sm" />
                      </span>
                    </span>
                    <!-- 下拉选项列指示器 -->
                    <span v-if="col.options" class="cell-options-arrow">
                      <IconSvg type="chevron-down" size="sm" />
                    </span>
                  </template>
                  <!-- 备注指示器 -->
                  <span
                    v-if="noteMode && hasNote(rowMetaMap.get(row)?.key ?? '', col.key)"
                    class="cell-note-dot"
                    title="点击编辑备注"
                    @click.stop="startNoteEdit($event, rowMetaMap.get(row)?.key ?? '', col.key)"
                  />
                </td>
                <!-- 操作按钮列 -->
                <td v-if="_hasActions" class="td-actions" :class="{ 'col-fixed-right': _hasFixedRightCol }" @click.stop>
                  <button
                    v-for="act in rowActions!"
                    v-show="!act.visible || act.visible(row, (isVirtual ? virtualStartIndex : 0) + idx)"
                    :key="act.key"
                    :class="['row-action-btn', `row-action-${act.variant || 'default'}`]"
                    :title="act.label"
                    @click="emit('rowAction', act.key, row, (isVirtual ? virtualStartIndex : 0) + idx)"
                  >
                    <IconSvg v-if="act.icon" :type="act.icon" size="sm" />
                    {{ act.label }}
                  </button>
                </td>
              </tr>

              <!-- 虚拟滚动：底部占位 -->
              <tr v-if="isVirtual && !_isFullscreen && virtualBottomOffset > 0" aria-hidden="true">
                <td :colspan="_totalCols" :style="{ height: virtualBottomOffset + 'px', padding: 0, border: 'none' }" />
              </tr>
            </tbody>

            <!-- 汇总行 -->
            <tfoot v-if="_summaryData && !isLoading && _effectivePagedData.length">
              <tr>
                <th v-if="selectable" class="th-checkbox" :class="{ 'col-fixed-left': _hasFixedLeftCol }" />
                <th
                  v-for="col in _displayColumns"
                  :key="col.key"
                  :style="{
                    textAlign: col.cellAlign || col.align || 'left',
                    left:
                      isColumnFixed(col) === 'left'
                        ? Number(fixedLeftOffsets[col.key] ?? 0) * _zoomX + 'px'
                        : undefined,
                    right:
                      isColumnFixed(col) === 'right'
                        ? Number(fixedRightOffsets[col.key] ?? 0) * _zoomX + 'px'
                        : undefined,
                  }"
                  :class="{
                    'col-fixed-left': isColumnFixed(col) === 'left',
                    'col-fixed-right': isColumnFixed(col) === 'right',
                  }"
                >
                  {{ _summaryData[col.key] ?? '' }}
                </th>
                <th v-if="_hasActions" :class="{ 'col-fixed-right': _hasFixedRightCol }" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- ========== 移动端卡片视图 ========== -->
      <!-- 卡片模式大数据自动启用分页（避免一次性渲染数万 DOM 节点） -->
      <template v-if="isCardViewEffective && !isLoading && _cardVisibleData.length">
        <div
          class="card-view-scroll"
          :class="{ 'card-scroll-fixed': !!maxHeight }"
          :style="
            maxHeight
              ? { maxHeight }
              : autoHeight
                ? { '--dt-scroll-min': (_dense ? 32 : 40) * 10 + 'px', maxHeight: _lockedMaxH || undefined }
                : _cardViewHeight
                  ? { maxHeight: _cardViewHeight }
                  : undefined
          "
          @scroll="onScrollCardView"
        >
          <div
            v-for="(row, idx) in _cardVisibleData"
            :key="rowMetaMap.get(row)?.key ?? idx"
            :data-row-key="String(row[props.rowKey] ?? '')"
            class="card-view-item"
            :class="{ 'card-selected': _selectedKeys.includes(String(row[props.rowKey] ?? '')) }"
            @click="emit('rowClick', row, idx)"
            @contextmenu.prevent="showRowContextMenu(row, $event)"
          >
            <div v-if="selectable" class="card-checkbox" @click.stop>
              <input
                type="checkbox"
                :checked="_selectedKeys.includes(String(row[props.rowKey] ?? ''))"
                @change="toggleRowSelect(row)"
              />
            </div>
            <div
              v-for="col in _displayColumns"
              :key="col.key"
              class="card-field"
              :class="{
                'card-field-editing':
                  editingCell?.rowKey === (rowMetaMap.get(row)?.key ?? '') && editingCell?.colKey === col.key,
                'cell-readonly': !editable || col.editable === false,
              }"
              @contextmenu.prevent="showContextMenu(col, $event)"
            >
              <span class="card-field-label" @click.stop="col.sortable !== false && toggleSort(col)">
                {{ colTitle(col) }}
                <span
                  v-if="col.sortable !== false"
                  class="sort-arrows card-sort-arrows"
                  :class="{ 'sort-active': sortState.key === col.key }"
                >
                  <IconSvg type="chevron-up" size="sm" class="sort-icon sort-asc" :class="sortArrowClass(col, 'asc')" />
                  <IconSvg
                    type="chevron-down"
                    size="sm"
                    class="sort-icon sort-desc"
                    :class="sortArrowClass(col, 'desc')"
                  />
                </span>
                <span
                  v-if="col.filterable !== false"
                  class="card-filter-icon"
                  :class="{ 'has-filter': isFilterActive(col.key) }"
                  @click.stop="toggleFilter(col, $event)"
                >
                  <IconSvg type="list" size="sm" />
                  <span v-if="isFilterActive(col.key)" class="filter-dot" />
                </span>
              </span>
              <span class="card-field-value-wrap">
                <!-- 编辑输入框 -->
                <input
                  v-if="
                    editable &&
                      !col.options &&
                      editingCell?.rowKey === (rowMetaMap.get(row)?.key ?? '') &&
                      editingCell?.colKey === col.key
                  "
                  :ref="setEditInputEl"
                  v-model="editValue"
                  class="cell-edit-input card-edit-input"
                  @keydown="(e) => onEditKeydown(e, _displayColumns, rowMetaMap.get(row)?.key ?? '')"
                  @blur="commitEdit"
                  @click.stop
                />
                <!-- 下拉选项编辑（H5 用原生 select） -->
                <select
                  v-else-if="
                    editable &&
                      col.options &&
                      editingCell?.rowKey === (rowMetaMap.get(row)?.key ?? '') &&
                      editingCell?.colKey === col.key
                  "
                  v-model="editValue"
                  class="card-edit-select"
                  @change="commitEdit()"
                  @blur="commitEdit"
                  @click.stop
                >
                  <option
                    v-for="opt in col.options"
                    :key="typeof opt === 'string' ? opt : opt.value"
                    :value="typeof opt === 'string' ? opt : opt.value"
                  >
                    {{ typeof opt === 'string' ? opt : opt.label || opt.value }}
                  </option>
                </select>
                <!-- 显示值 -->
                <span
                  v-else
                  class="card-field-value"
                  :class="{ 'cell-has-note': noteMode && hasNote(rowMetaMap.get(row)?.key ?? '', col.key) }"
                  @click.stop="col.options && editable && openOptDrop(row, col, $event)"
                  @dblclick.stop="onCellDblClick(row, col, $event)"
                >
                  <span
                    v-if="typeof col.cell === 'function'"
                    v-html="
                      sanitizeHTML(
                        col.cell(
                          getCellValue(
                            rowMetaMap.get(row)?.key ?? '',
                            col.key,
                            rowMetaMap.get(row)?.texts[col.key] ?? '',
                          ),
                          row,
                        ),
                      )
                    "
                  />
                  <template v-else>{{
                    getCellValue(rowMetaMap.get(row)?.key ?? '', col.key, rowMetaMap.get(row)?.texts[col.key] ?? '')
                  }}</template>
                </span>
              </span>
              <!-- 备注指示器 -->
              <span
                v-if="noteMode && hasNote(rowMetaMap.get(row)?.key ?? '', col.key)"
                class="cell-note-dot card-note-dot"
                title="点击编辑备注"
                @click.stop="startNoteEdit($event, rowMetaMap.get(row)?.key ?? '', col.key)"
              />
            </div>
            <!-- 卡片视图操作按钮 -->
            <div v-if="_hasActions" class="card-actions" @click.stop>
              <button
                v-for="act in rowActions!"
                v-show="!act.visible || act.visible(row, idx)"
                :key="act.key"
                :class="['row-action-btn', `row-action-${act.variant || 'default'}`]"
                :title="act.label"
                @click="emit('rowAction', act.key, row, idx)"
              >
                <IconSvg v-if="act.icon" :type="act.icon" size="sm" />
                {{ act.label }}
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- ========== 移动端空状态 ========== -->
      <div v-if="isCardViewEffective && !isLoading && !_cardVisibleData.length" class="card-view-empty">
        <Result
          :status="activeFilters.length || globalSearch ? 'info' : 'empty'"
          :title="globalSearch ? '搜索无结果' : activeFilters.length ? '筛选结果为空' : effectiveEmptyText"
        />
      </div>

      <!-- ========== 分页控件 ========== -->
      <div v-if="!_isFullscreen && pageSize > 0 && displayTotalPages > 1" class="table-pagination">
        <span class="pagination-status">
          <template v-if="selectable && _selectedKeys.length > 0">已选 <strong>{{ _selectedKeys.length }}</strong> 行 - </template>第 {{ _currentPage }} / {{ displayTotalPages }} 页
        </span>
        <button class="page-btn" :disabled="_currentPage <= 1" @click="setPage(_currentPage - 1)">
          <IconSvg type="chevron-left" size="sm" />
        </button>
        <template v-for="p in displayPages" :key="p">
          <button
            v-if="p !== '...'"
            class="page-btn"
            :class="{ active: p === _currentPage }"
            @click="setPage(p as number)"
          >
            {{ p }}
          </button>
          <span v-else class="page-ellipsis">...</span>
        </template>
        <button class="page-btn" :disabled="_currentPage >= displayTotalPages" @click="setPage(_currentPage + 1)">
          <IconSvg type="chevron-right" size="sm" />
        </button>
      </div>

      <!-- ========== 筛选下拉框（H5 Teleport 到 body，小程序直接渲染） ========== -->
      <Teleport to="body">
        <div
          v-if="activeFilterKey"
          class="dt-filter-dropdown"
          :class="{ 'dt-dropdown-above': filterDropdownAbove }"
          :style="filterDropdownStyle"
          tabindex="-1"
          @click.stop
          @keydown="onFilterKeydown"
        >
          <template v-if="activeFilterKey && filterDraft">
            <!-- 搜索框 -->
            <input
              ref="filterSearchRef"
              v-model="filterDraft.searchText"
              type="text"
              class="dt-filter-search"
              :placeholder="props.pinyinSearch ? '拼音/中文搜索...' : '搜索...'"
              @click.stop
            />

            <!-- 选项排序 -->
            <div class="dt-filter-option-sort">
              <span class="dt-filter-option-sort-label">排序：</span>
              <button
                class="dt-filter-option-sort-btn"
                :class="{ active: optionSort === 'name' || optionSort === 'name-desc' }"
                @click="optionSort = optionSort === 'name' ? 'name-desc' : 'name'"
              >
                名称
                <span class="dt-filter-option-sort-arrow">{{
                  optionSort === 'name' ? '↑' : optionSort === 'name-desc' ? '↓' : '↕'
                }}</span>
              </button>
              <button
                class="dt-filter-option-sort-btn"
                :class="{ active: optionSort === 'count' || optionSort === 'count-desc' }"
                @click="optionSort = optionSort === 'count' ? 'count-desc' : 'count'"
              >
                数量
                <span class="dt-filter-option-sort-arrow">{{
                  optionSort === 'count' ? '↑' : optionSort === 'count-desc' ? '↓' : '↕'
                }}</span>
              </button>
            </div>

            <!-- 快捷操作 -->
            <div class="dt-filter-quick-actions">
              <button class="dt-filter-quick-btn" @click="filterQuickAction('all')">
                全选 <span class="dt-filter-quick-count">({{ filteredOptions.length }})</span>
              </button>
              <button class="dt-filter-quick-btn" @click="filterQuickAction('none')">反选</button>
              <button class="dt-filter-quick-btn" @click="filterQuickAction('duplicates')">重复项</button>
              <button class="dt-filter-quick-btn" @click="filterQuickAction('unique')">唯一项</button>
            </div>

            <!-- 选项列表 -->
            <div ref="filterOptionsRef" class="dt-filter-options-list" @scroll="onFilterOptionsScroll">
              <div
                v-for="(opt, idx) in filteredOptions"
                :key="opt.value"
                class="dt-filter-option"
                :class="{
                  selected: filterDraft.selectedValues.includes(opt.value),
                  focused: filterFocusIndex === idx,
                }"
                @click="toggleFilterValue(opt.value)"
              >
                <span
                  class="dt-filter-option-text"
                  @mouseenter="onFilterOptionEnter"
                  @mouseleave="onFilterOptionLeave"
                >{{ opt.label || opt.value || '空白' }}</span>
                <span class="dt-filter-option-count">{{ opt.count }}</span>
              </div>
              <div v-if="filteredOptions.length === 0" class="dt-filter-no-result">无匹配结果</div>
            </div>

            <!-- 滚动进度条：贴列表底部，可滚动时显示 -->
            <div v-if="filterOptionsScrollable" class="dt-filter-scroll-progress">
              <div class="dt-filter-scroll-progress-bar" :style="{ width: filterOptionsScrollPct + '%' }" />
            </div>

            <!-- 操作按钮 -->
            <div class="dt-filter-actions">
              <button class="dt-filter-btn dt-filter-btn-apply" @click="applyFilter">应用</button>
              <button class="dt-filter-btn dt-filter-btn-reset" @click="resetFilter">重置</button>
            </div>
          </template>
        </div>
      </Teleport>

      <!-- ========== 列设置面板 ========== -->
      <Teleport to="body">
        <div
          v-if="_colSettingsShow"
          ref="colSettingsRef"
          class="dt-col-settings"
          :class="{ 'dt-dropdown-above': _colSettingsAbove }"
          :style="_colSettingsStyle"
          @click.stop
        >
          <input v-model="colKeyword" class="dt-col-search" placeholder="搜索列名..." />
          <div class="dt-col-quick-actions">
            <button
              :title="allColumnsVisible ? '全部隐藏（保留第一列）' : '全部显示'"
              @click="allColumnsVisible ? toggleAllColsVisible(false) : toggleAllColsVisible(true)"
            >
              {{ allColumnsVisible ? '全部隐藏' : '全部显示' }}
            </button>
            <button
              class="dt-reset-width-btn"
              :disabled="!hasManualWidths"
              title="清除手动调整的列宽存储，恢复自动列宽"
              @click="resetColumnWidths"
            >
              重置列宽
            </button>
            <button
              :class="{ active: allFixedLeft }"
              :title="allFixedLeft ? '取消全部固定左' : '全部列固定到左侧'"
              @click="toggleAllFixed('left')"
            >
              全部固定左
            </button>
            <button
              :class="{ active: allFixedRight }"
              :title="allFixedRight ? '取消全部固定右' : '全部列固定到右侧'"
              @click="toggleAllFixed('right')"
            >
              全部固定右
            </button>
            <button :disabled="nothingFixed" title="清除全部固定" @click="setAllFixed(null)">取消固定</button>
          </div>
          <div class="dt-col-list">
            <div
              v-for="{ col, i } in _filteredSettingsColumns"
              :key="col.key"
              class="dt-col-item"
              :class="{
                hidden: hiddenColumns.has(col.key),
                'in-left-fixed': i < _leftFixedCount,
                'in-right-fixed': i >= _settingsColumns.length - _rightFixedCount,
              }"
            >
              <input
                type="checkbox"
                :checked="!hiddenColumns.has(col.key)"
                :aria-label="`显示 ${colTitle(col)}`"
                @change="toggleColVisible(col.key)"
              />
              <span class="dt-col-title" :title="colTitle(col)">{{ colTitle(col) }}</span>
              <span class="dt-col-width">
                <button
                  :disabled="colWidthPx(col) <= Math.max(headerMinW(col), 30)"
                  title="变窄 10px"
                  @click="adjustColWidth(col.key, -10)"
                >
                  −
                </button>
                <span :title="`列宽 ${colWidthPx(col)}px`">{{ colWidthPx(col) }}</span>
                <button title="加宽 10px" @click="adjustColWidth(col.key, 10)">+</button>
              </span>
              <span class="dt-col-ops">
                <button :disabled="i === 0" title="上移" @click="moveCol(col.key, -1)">↑</button>
                <button :disabled="i === _settingsColumns.length - 1" title="下移" @click="moveCol(col.key, 1)">
                  ↓
                </button>
                <span class="dt-col-fixed-group" :class="{ disabled: hiddenColumns.has(col.key) }">
                  <button
                    :class="{ active: !isColumnFixed(col) }"
                    title="不固定（从该列断开，外侧保留）"
                    :disabled="hiddenColumns.has(col.key)"
                    @click="setColFixed(col, null)"
                  >
                    无
                  </button>
                  <button
                    :class="{ active: isColumnFixed(col) === 'left' }"
                    title="固定左：该列及左侧所有列一起固定"
                    :disabled="hiddenColumns.has(col.key)"
                    @click="setColFixed(col, 'left')"
                  >
                    左
                  </button>
                  <button
                    :class="{ active: isColumnFixed(col) === 'right' }"
                    title="固定右：该列及右侧所有列一起固定"
                    :disabled="hiddenColumns.has(col.key)"
                    @click="setColFixed(col, 'right')"
                  >
                    右
                  </button>
                </span>
              </span>
            </div>
            <div v-if="!_filteredSettingsColumns.length" class="dt-col-no-result">无匹配列</div>
          </div>
          <div class="dt-col-footer">
            <span class="dt-col-footer-fixed">固定：{{ _fixedSummary || '未固定' }}</span>
            <span class="dt-col-footer-hint">左 = 该列及左侧；右 = 该列及右侧；无 = 断开</span>
          </div>
        </div>
      </Teleport>

      <!-- ========== 右键菜单（H5 Teleport，小程序直接渲染） ========== -->
      <Teleport to="body">
        <div
          v-if="contextMenu.visible"
          ref="contextMenuRef"
          class="dt-context-menu"
          :style="contextMenuStyle"
          role="menu"
          tabindex="-1"
          @click.stop
          @keydown="onContextMenuKeydown"
        >
          <!-- 行右键菜单：自定义操作（单元格右键时与复制/粘贴/清空合并显示） -->
          <template v-if="contextMenu.rowKey && rowContextActions?.length">
            <div
              v-for="act in rowContextActions"
              :key="act.key"
              class="dt-context-item"
              :class="{ 'ctx-danger': act.danger }"
              role="menuitem"
              @click="onContextItemClick(act)"
            >
              <IconSvg v-if="act.icon" :type="act.icon" size="sm" />
              <span>{{ act.label }}</span>
            </div>
            <div class="dt-context-divider" />
          </template>
          <!-- 单元格右键菜单：复制 / 粘贴 / 清空 -->
          <template v-if="contextMenu.rowKey && contextMenu.columnKey">
            <div class="dt-context-item" role="menuitem" @click="onContextCopyCell">复制</div>
            <div class="dt-context-item" role="menuitem" @click="onContextPasteCell">粘贴</div>
            <div class="dt-context-item" role="menuitem" @click="onContextClearCell">清空</div>
            <div class="dt-context-divider" />
          </template>
          <template v-if="contextMenu.columnKey && !contextMenu.rowKey">
            <div
              class="dt-context-item"
              :class="{ disabled: visibleColumns.length <= 1 }"
              role="menuitem"
              @click="onCtxHideColumn"
            >
              隐藏该列
            </div>
            <div class="dt-context-divider" />
            <div
              class="dt-context-item"
              role="menuitem"
              @click="onCtxFixLeftCascade"
            >
              固定到左侧（含之前所有列）
            </div>
            <div
              class="dt-context-item"
              role="menuitem"
              @click="onCtxFixRightCascade"
            >
              固定到右侧（含之后所有列）
            </div>
            <div
              v-if="isColumnFixed(visibleColumns.find((c) => c.key === contextMenu.columnKey)!)"
              class="dt-context-item"
              role="menuitem"
              @click="onCtxUnfixColumn"
            >
              取消固定
            </div>
            <div class="dt-context-divider" />
            <div
              class="dt-context-item"
              :class="{ disabled: hiddenColumns.size === 0 }"
              role="menuitem"
              @click="onCtxShowAllColumns"
            >
              显示全部
            </div>
          </template>
        </div>
      </Teleport>

      <!-- ========== 截断气泡 & 行内编辑原始值气泡（H5 Teleport，小程序直接渲染） ========== -->
      <Teleport to="body">
        <div class="dt-overlay-root">
          <!-- 截断文本气泡 -->
          <div
            v-if="_tooltipVisible"
            class="dt-cell-tooltip"
            :style="_tooltipStyle"
            @mouseenter="hideTooltip"
            @click.stop
            @keydown="onTooltipKeydown"
          >
            <span v-html="sanitizeHTML(_tooltipText)" />
          </div>

          <!-- 备注浮窗 -->
          <div
            v-if="noteMode && noteTooltip"
            class="note-tooltip"
            :style="{
              position: 'fixed',
              left: noteTooltip.x + 'px',
              top: noteTooltip.y - 8 + 'px',
              transform: 'translateY(-100%)',
              zIndex: 'var(--z-tooltip, 3000)',
            }"
          >
            {{ noteTooltip.text }}
          </div>

          <!-- @patch 2026-07-15 原始值气泡 -->
          <div
            v-if="originalTooltip"
            class="original-tooltip"
            :style="{
              position: 'fixed',
              left: originalTooltip.x + 'px',
              top: originalTooltip.y - 8 + 'px',
              transform: 'translateY(-100%)',
              zIndex: 'var(--z-tooltip, 3000)',
            }"
          >
            <span class="original-tooltip-label">原始值：</span>{{ originalTooltip.text }}
          </div>

          <!-- 备注编辑弹窗 -->
          <div
            v-if="noteMode && noteEditing"
            class="note-editor"
            :style="{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%,-50%)',
              zIndex: 'var(--z-tooltip, 3000)',
            }"
            role="dialog"
            aria-modal="true"
            @click.stop
          >
            <div class="note-editor-title">编辑备注</div>
            <input
              :ref="setNoteInputEl"
              v-model="noteDraft"
              class="note-editor-input"
              placeholder="输入备注内容..."
              @keydown="onNoteKeydown"
            />
            <div class="note-editor-actions">
              <button class="dt-filter-btn dt-filter-btn-apply" @click="commitNote">确定</button>
              <button class="dt-filter-btn dt-filter-btn-reset" @click="cancelNote">取消</button>
            </div>
          </div>

          <!-- 图片灯箱 -->
          <ImagePreview :src="_lightboxSrc" @close="closeLightbox" />

          <!-- 选项列下拉面板 -->
          <div
            v-if="_optDrop"
            ref="optDropRef"
            class="opt-drop-panel"
            :style="{
              position: 'fixed',
              top: _optDrop.top + 'px',
              left: _optDrop.left + 'px',
              minWidth: _optDrop.width + 'px',
              maxHeight: '320px',
              zIndex: 'var(--z-tooltip, 3000)',
            }"
            role="listbox"
            tabindex="-1"
            @click.stop
            @keydown="onOptDropKeydown"
          >
            <div
              v-for="(opt, idx) in _optDrop.options"
              :key="typeof opt === 'string' ? opt : opt.value"
              class="opt-drop-item"
              :class="{
                active: (typeof opt === 'string' ? opt : opt.value) === _optDrop.currentVal,
                focused: idx === _optFocusIndex,
              }"
              role="option"
              :aria-selected="(typeof opt === 'string' ? opt : opt.value) === _optDrop.currentVal"
              @click="pickOption(typeof opt === 'string' ? opt : opt.value)"
            >
              <span class="opt-drop-item-text" :style="{ color: typeof opt === 'object' ? opt.color : undefined }">{{
                typeof opt === 'string' ? opt : opt.label
              }}</span>
              <IconSvg
                v-if="(typeof opt === 'string' ? opt : opt.value) === _optDrop.currentVal"
                type="check"
                size="sm"
                class="opt-drop-check"
              />
            </div>
          </div>

          <!-- 批量修改弹窗 -->
          <div
            v-if="selectable && _batchShow"
            class="note-editor"
            :style="{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%,-50%)',
              zIndex: 'var(--z-tooltip, 3000)',
            }"
            role="dialog"
            aria-modal="true"
            @click.stop
            @keydown.escape="_batchShow = false"
          >
            <div class="note-editor-title">批量修改 — 已选 {{ _selectedKeys.length }} 行</div>
            <select v-model="_batchCol" class="note-editor-input">
              <option v-for="col in visibleColumns" :key="col.key" :value="col.key">
                {{ colTitle(col) }}
              </option>
            </select>
            <input
              :ref="setNoteInputEl"
              v-model="_batchValue"
              class="note-editor-input"
              placeholder="输入新值..."
              @keydown.enter="confirmBatchEdit"
            />
            <div class="note-editor-actions">
              <button class="dt-filter-btn dt-filter-btn-apply" @click="confirmBatchEdit">确定</button>
              <button class="dt-filter-btn dt-filter-btn-reset" @click="_batchShow = false">取消</button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- 截断单元格详情弹窗 -->
      <ModalBox
        :visible="_cellDetailModal.visible"
        :title="_cellDetailModal.title"
        size="md"
        :z-index="'var(--z-tooltip, 3000)'"
        internal
        @update:visible="_cellDetailModal.visible = $event"
      >
        <pre class="cell-detail-content">{{ _cellDetailModal.content }}</pre>
      </ModalBox>

      <!-- 截图预览（ImagePreview：全屏 + 缩放/拖拽 + ESC 关闭 + 底部固定按钮） -->
      <ImagePreview
        v-if="_screenshotModal.visible"
        :src="_screenshotModal.dataUrl"
        @close="_screenshotModal.visible = false"
      >
        <template #actions>
          <button class="lightbox-action" @click.stop="downloadScreenshotFromModal">
            <IconSvg type="download" size="sm" /> 下载 PNG
          </button>
          <button class="lightbox-action" @click.stop="copyScreenshotFromModal">
            <IconSvg type="copy" size="sm" /> 复制图片
          </button>
        </template>
      </ImagePreview>
    </div>
  </div>
</template>

<style src="./composables/data-table-scoped.css" scoped></style>
