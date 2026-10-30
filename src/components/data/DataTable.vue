<script setup lang="ts" generic="T extends Record<string, any> = Record<string, any>">
import { reportError } from '@/components/_internal/runtime-observer'
// ⛔ 保护 — 禁止：clamp() → px，table-layout:fixed 删除，列宽计算链路，结构层级
//    允许：autoFit 开启时外部 col.width 已被禁止，列宽完全由内部动态管理
//    需我确认：props 增删、默认值修改、模板结构变更、CSS 变量替换
import {
  ref,
  watch,
  computed,
  onMounted,
  onUnmounted,
  onDeactivated,
  onErrorCaptured,
  nextTick,
  inject,
  getCurrentInstance,
  toRef,
  type ComputedRef,
} from 'vue'
import { useT } from '@/components/_internal/i18n'
import IconSvg from '@/components/basic/IconSvg.vue'
import Result from '@/components/feedback/Result.vue'
import Loading from '@/components/feedback/Loading.vue'
import ModalBox from '@/components/layout/ModalBox.vue'
import { copyText } from '@/components/_internal/useCopy'
import Toast from '@/components/feedback/Toast.vue'
import { boostZTop } from '@/components/_internal/z-top'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'
import { useToastNotify } from '@/components/_internal/useToastNotify'
import ImagePreview from './ImagePreview.vue'
import DataTableColumnSettings from './DataTableColumnSettings.vue'
import DataTableBatchDialog from './DataTableBatchDialog.vue'
import DataTablePagination from './DataTablePagination.vue'
import DataTableToolbar from './DataTableToolbar.vue'
import { provideDataTableContext, type ColumnSettingsPanelExpose, type BatchDialogExpose } from './composables/context'
import type { Column, Emits, RowAction, RowContextAction, RowLineColor, TableStorage } from './composables/types'
import type { DateOrder } from './composables/cell-input'
import { useTableCore } from './composables/useTableCore'
import { useTableColumns } from './composables/useTableColumns'
import { useTableFilter } from './composables/useTableFilter'
import { useTableExtras } from './composables/useTableExtras'
import { useTableEdit } from './composables/useTableEdit'
import { useFillHandleDrag } from './composables/useFillHandleDrag'
// 矩形选区的指针编排（长按判定/拖拽阈值/边缘自动滚动/click 抑制）—— M3 第十二刀下沉
import { useRangePointer } from './composables/useRangePointer'
import './composables/data-table-global.css'
import { sanitizeHTML } from '../_internal/sanitize'
import { BP_MD } from '@/components/_internal/breakpoints'
import {
  isLayerFresh,
  markLayerOpen,
  colTitle,
  optColor,
  blankPlaceholder,
  isImageUrl as _isImageUrl,
  EXPAND_ICON_TEXT_MIN,
  calcTableTotalPages,
} from './composables/utils'
import { useTableScreenshot, buildTsv } from './composables/useTableScreenshot'
import {
  useFullscreenNodeRelocation,
  useFullscreenBounds,
  waitForSidebarCollapse,
} from './composables/useTableFullscreen'
import { useTableTooltip } from './composables/useTableTooltip'
import { useTableCellMenus } from './composables/useTableCellMenus'
import { useDebounceFn } from '@/components/_internal/useDebounce'

// 内部异常兜底 — 单组件出错不导致页面崩溃
const _internalError = ref<Error | null>(null)

onErrorCaptured((err: Error) => {
  reportError('[DataTable] 内部异常已隔离:', err.message)
  _internalError.value = err
  return false // 阻止向上传播
})

const props = withDefaults(
  // ⛔ Q5 契约：props 按下列分组维护（新增能力优先收进已有分组；交互类布尔开关已 14 个，
  //    再加应先考虑并入对象 prop）。v2（Q5）已收敛：onExport / onToggleSidebar 两个
  //    回调 prop 删了，宿主联动统一走 @export / @toggle-sidebar 事件（见 Emits 契约注释）。
  defineProps<{
    // ────────────────────────────── 数据与列 ──────────────────────────────
    /** 列定义数组：key/label/type/width/sortable/filterable/cell 等（见 Column 类型） */
    columns: Column[]
    /** 行数据数组（泛型 T，行对象需含 rowKey 指定的键字段） */
    data: T[]
    /** 行唯一键字段名（默认 'seq'）：选中/编辑/备注/持久化都以此键定位行 */
    rowKey?: string
    // ────────────────────────────── 外观与布局 ──────────────────────────────
    /** 斑马纹（默认开） */
    striped?: boolean
    /** 单元格边框（默认开） */
    bordered?: boolean
    /** 行悬停高亮（默认开） */
    hoverable?: boolean
    /** 加载态：表格蒙层，期间禁用交互 */
    isLoading?: boolean
    /** 空数据提示文案；空串（默认）用内置 i18n 文案 */
    emptyText?: string
    /** 单元格空白占位：null/undefined/空串/纯空白串 → 该文本（默认 '-'）；传空串关闭。仅展示层，不影响导出 */
    blankText?: string
    // ────────────────────────────── 排序 · 筛选 · 搜索 ──────────────────────────────
    /** 初始/受控排序字段：传入后外部驱动排序状态（变化经 @sort 抛出）；不传则组件内部自由排序 */
    sortKey?: string
    /** 受控排序方向，'asc' | 'desc'（默认 'asc'），与 sortKey 成对使用 */
    sortOrder?: 'asc' | 'desc'
    /** 全局搜索是否启用拼音匹配（默认开） */
    pinyinSearch?: boolean
    /** 单元格截断判定的字符数下限：0（默认）全部单元格按 truncateMode 处理；>0 时仅文本超过该长度的单元格截断 */
    truncateThreshold?: number
    // ────────────────────────────── 行选择与导出 ──────────────────────────────
    /** 行首选择列（复选框）开关 */
    selectable?: boolean
    /** 受控选中行键集合（v-model:selectedKeys） */
    selectedKeys?: string[]
    /** CSV 导出按钮；有 @export 监听时抛事件由宿主自理，无监听时内置导出 */
    exportable?: boolean
    /** 导出文件名（不含扩展名，默认 'export'） */
    exportFileName?: string
    /** Excel(.xlsx) 导出按钮（导出范围同 exportScope） */
    excelExportable?: boolean
    /** 导出范围：'all' 筛选后全量（默认），'page' 仅当前页 */
    exportScope?: 'all' | 'page'
    // ────────────────────────────── 分页与虚拟化 ──────────────────────────────
    /** 每页行数；0（默认）不分页 */
    pageSize?: number
    /** 受控当前页（v-model:currentPage）。越界（>总页数 / <1）时自动夹到 [1,totalPages] 并 emit 纠正值——宿主把页码存 URL 后恢复、或筛选后总数变小都靠它兜住 */
    currentPage?: number
    /** 总行数：传入即按服务端分页处理（分页器用它算页数，数据由父组件按页提供；不传=客户端分页） */
    total?: number
    /** 卡片视图断点（px）：容器实测宽度低于该值时自动切卡片视图（视图模式 auto 下生效） */
    cardBreakpoint?: number
    /** 表格区最大高度（CSS 高度值，如 '400px'）；空串不限高 */
    maxHeight?: string
    /** 自适应高度：填充父容器剩余空间（需父容器有明确高度） */
    autoHeight?: boolean
    /** 虚拟滚动（默认开）：行数超过可视范围时只渲染窗口内行，容器滚动/页面滚动都会自动接管 */
    virtualScroll?: boolean
    /** 页面滚动虚拟化的**额外**行数下限（默认 0 = 不设人工下限）。
     *  实际判据是实测的：总行数 > 可视行数 + 上下 overscan（那些行无论如何都要渲染），
     *  所以面板高矮、dense、缩放都自适应，不靠猜常量。设 >0 只用于强制提前/推迟启用。 */
    pageVirtualMin?: number
    /** 列宽自适应（默认开）：忽略列的 width 声明，列宽由内部按容器宽度动态分配（防抖 + 冷却） */
    autoFit?: boolean
    // ────────────────────────────── 外观补充（截断/密度） ──────────────────────────────
    /** 单元格文本截断：'ellipsis' 省略号（默认）| 'wrap' 换行 | 'none' 不截断 */
    truncateMode?: 'ellipsis' | 'wrap' | 'none'
    /** 紧凑密度（更小的行高与内边距） */
    dense?: boolean
    // ────────────────────────────── 交互开关 ──────────────────────────────
    /** 列设置按钮（默认显示，false 可隐藏） */
    colSettings?: boolean
    /** 单元格矩形选区：长按/拖拽框选 + 拖选自动滚动（默认开启） */
    cellSelection?: boolean
    /** 键盘导航：方向键移动/Shift 扩展/Enter 编辑/Delete 清空/Ctrl+Home/End（默认开启） */
    keyboardNav?: boolean
    /** 单元格右键菜单：复制/粘贴/清空（默认开启） */
    cellContextMenu?: boolean
    // ────────────────────────────── 汇总与持久化 ──────────────────────────────
    /** 汇总行：函数形式用 props.data 计算（仅客户端模式可用）；服务端分页请传对象（后端算好汇总值） */
    summary?: ((rows: T[]) => Record<string, string | number>) | Record<string, string | number>
    /** 存储适配器，默认 localStorage；SaaS 场景可传入按账号隔离的实现 */
    storage?: TableStorage
    /** 存储命名空间，同页面多实例时用于隔离持久化数据 */
    namespace?: string
    /** 持久化模式：'auto' 自动判断（sortKey 受控/searchMode='server'/filterMode='server' → 禁用），'none' 强制禁用内部 IndexedDB */
    persistence?: 'auto' | 'none'
    // ────────────────────────────── 编辑与备注 ──────────────────────────────
    /** 单元格编辑模式：双击进入编辑，Enter 确认，Escape 取消 */
    editable?: boolean
    /** 日期列（Column.type='date'/'datetime'）两段数字输入的月日顺序：
     *  'MDY'（默认，9/12 → 9月12日）| 'DMY'（9/12 → 12月9日）。
     *  ⚠️ 当月日都 ≤12 时无法自动消歧，必须由使用方声明。 */
    dateInputOrder?: DateOrder
    /** 备注提示模式：hover 显示备注，点击填写 */
    noteMode?: boolean
    /** 外部传入的备注数据 */
    notes?: Record<string, Record<string, string>>
    // ────────────────────────────── 行 / 单元格自定义 ──────────────────────────────
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
    // ────────────────────────────── 排序 · 筛选 · 搜索（续：服务端模式三件） ──────────────────────────────
    /** 搜索模式：'client' 客户端本地过滤，'server' 抛 search 事件由后端处理 */
    searchMode?: 'client' | 'server'
    /** 筛选模式：'client' 客户端本地过滤，'server' 只抛 filter 事件由后端处理 */
    filterMode?: 'client' | 'server'
    /** 外部筛选状态（v-model:filters）：服务端模式下父组件可程序化控制筛选，变化时自动同步到内部 filterState */
    filters?: Record<string, string[]>
    /** 行类名回调：(row, index) => class 串，每行渲染时调用 */
    rowClass?: (row: T, index: number) => string
    /** 行内联样式回调：(row, index) => 样式对象 */
    rowStyle?: (row: T, index: number) => Record<string, string>
    /** 单元格类名回调：(colKey, row, index) => class 串 */
    cellClass?: (colKey: string, row: T, index: number) => string
    /** 单元格内联样式回调：(colKey, row, index) => 样式对象 */
    cellStyle?: (colKey: string, row: T, index: number) => Record<string, string>
    /** 行级左边线回调：(row, index) => 语义色名，该行最左缘画对应颜色竖线；返回 undefined 不显示。
     *  与 rowLineKey 并存时本回调优先（设置了即接管整行判定，返回 undefined 也不会回落到字段映射） */
    rowLine?: (row: T, index: number) => RowLineColor | undefined
    /** 行线字段名：取行数据该字段值查 lineColors 映射，命中语义色名才画线（rowLine 未设置时生效） */
    rowLineKey?: string
    /** 行线字段值 → 语义色名映射（配合 rowLineKey） */
    lineColors?: Record<string, RowLineColor>
    // ────────────────────────────── 截图 ──────────────────────────────
    /** 截图行为模式：'preview' 弹窗预览 | 'download' 直接下载 | 'copy' 直接复制到剪贴板 */
    shotMode?: 'preview' | 'download' | 'copy'
    /** 截图最大行数（超过提醒用户先筛选，避免生成超大 canvas 卡死） */
    screenshotMaxRows?: number
    // ────────────────────────────── 宿主联动 ──────────────────────────────
    /** v2（Q5）起宿主联动改走事件：@export（服务端导出）、@toggle-sidebar（全屏时收/还宿主侧边栏），
     *  原 onExport / onToggleSidebar 回调 prop 已移除（见 Emits 契约注释） */
  }>(),
  {
    rowKey: 'seq',
    striped: true,
    bordered: true,
    hoverable: true,
    isLoading: false,
    emptyText: '',
    blankText: '-',
    pinyinSearch: true,
    truncateThreshold: 0,
    selectable: false,
    selectedKeys: () => [],
    exportable: false,
    exportFileName: 'export',
    excelExportable: false,
    pageSize: 0,
    currentPage: 1,
    cardBreakpoint: BP_MD,
    maxHeight: '',
    autoHeight: true,
    virtualScroll: true,
    pageVirtualMin: 0,
    autoFit: true,
    truncateMode: 'ellipsis',
    dense: false,
    editable: false,
    dateInputOrder: 'MDY' as DateOrder,
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
    rowLineKey: '',
    lineColors: () => ({}),
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

/** 行级左边线：rowLine 回调优先，未设置回调时走 rowLineKey+lineColors 字段映射；
 *  无命中返回空串（不渲染线）。非法色名照原样返回——CSS 类不命中即无线，天然兜底。
 *  参数收 object（v-for 行与泛型 T 的公共可赋值面），回调面在内部断言回 T */
const _rowLineClass = (row: object, idx: number): string => {
  let color: RowLineColor | undefined
  if (props.rowLine) {
    color = props.rowLine(row as T, idx) ?? undefined
  } else if (props.rowLineKey) {
    const v = (row as Record<string, unknown>)[props.rowLineKey]
    color = v == null ? undefined : props.lineColors[String(v)]
  }
  return color ? `row-line row-line-${color}` : ''
}

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
  if (_resizeJustEnded.value) return
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

/** 右键菜单 — 取消固定（列设置区块持有固定区域逻辑） */
function onCtxUnfixColumn() {
  colSettingsPanel.value?.unfixFromMenu(contextMenu.value.columnKey!)
  closeContextMenu()
}

/** 右键菜单 — 显示全部列 */
function onCtxShowAllColumns() {
  showAllColumns()
  closeContextMenu()
}

/** emptyText 回退：未传入时用 i18n */
const effectiveEmptyText = computed(() => props.emptyText || t('table.noData'))

const tableWrapRef = ref<HTMLElement | null>(null)
/** 列设置面板区块实例（show/toggle/close/unfixFromMenu 经 defineExpose 暴露） */
const colSettingsPanel = ref<ColumnSettingsPanelExpose | null>(null)
/** 批量修改弹窗区块实例（show/open/close 经 defineExpose 暴露） */
const batchDialog = ref<BatchDialogExpose | null>(null)
let closeContextMenu: () => void = () => {}

/** 右键菜单项点击：优先执行内联回调，否则 emit 事件，最后关闭菜单 */
function onContextItemClick(act: RowContextAction) {
  const ctx = contextMenu.value
  if (act.onClick) {
    act.onClick(ctx.row!, ctx.rowIndex)
  } else {
    emit('row-context-action', act.key, ctx.row!, ctx.rowIndex)
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
// 全局搜索（组件本地状态；输入框与焦点在工具栏区块内，关键词归主文件驱动防抖过滤）
const globalSearch = ref('')
const showGlobalSearch = ref(false)

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
  safePage,
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
  // 全屏忽略分页展示全量且容器有界 → 虚拟窗口须对全量数据开窗（_isFullscreen 声明在后，惰性求值安全）
  {
    fullscreen: () => _isFullscreen.value,
    // 页面滚动态：无 maxHeight、无分页兜底、行数超过阈值才接管滚动
    // （阈值以下是旧行为 —— 少量行的表格渲染结果逐字节不变）。
    // 不读 _isFullscreen：isVirtual 里全屏分支在其之前已 return，本谓词只可能在非全屏时被调用，
    // 读了会撞 setup 期的 TDZ。
    pageVirtual: () =>
      !props.maxHeight && (!props.pageSize || props.pageSize <= 0) && props.data.length > (props.pageVirtualMin ?? 0),
  },
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
const displayTotalPages = computed(() => calcTableTotalPages(displayTotal.value, props.pageSize))

// 行点击高亮（支持多选，再次点击取消）
const _clickedRowKeys = ref<Set<string>>(new Set())

// 密度切换（切换函数在工具栏区块内；引用归主文件，行高/表格类名多处消费）
const _dense = ref(props.dense)

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

// 操作反馈：组件内 Toast 实例（不依赖全局单例约定，复用共享 notify）
const { toastRef, notify } = useToastNotify()
// 截图反馈可能发生在全屏态（全屏层级高于全局 Toast）：挂载期间提升 --vcl-z-top
let _releaseZTop: (() => void) | null = null

// 全屏切换
const _isFullscreen = ref(false)
const _lockedMaxH = ref('')
/** v2（Q5）：onToggleSidebar 回调 prop 收敛为 @toggle-sidebar 事件——宿主联动统一事件面。
 *  有监听=通知宿主收/还侧边栏；无监听=降级 inject('toggleCollapse')（与 v1 语义一致）。
 *  监听在否读 vnode.props：defineEmits 不提供 hasListeners 查询，且调用期判定比 setup 期
 *  取值更稳（父组件条件渲染监听器时不会钉死在旧状态）。 */
const _dtInstance = getCurrentInstance()
const _injectedToggleCollapse = inject<() => void>('toggleCollapse', () => {})
const _toggleCollapse = () => {
  if (_dtInstance?.vnode.props?.onToggleSidebar) emit('toggle-sidebar')
  else _injectedToggleCollapse()
}
const _sidebarToggledByUs = ref(false)
/** 进入全屏的等待：_fsSeq 只头发号，_fsPendingRun 记录当前在飞的那个号（0 = 没有在飞）。
 *  为什么要两个数：共享布尔会让"取消后再点"被上一条抢先放行；只留一个自增计数又表达不出
 *  "现在没在等"，于是退出时顺手 ++ 就把按钮变成永久"取消一条不存在的等待"（实测第二次进全屏点不动）。 */
let _fsSeq = 0
let _fsPendingRun = 0
const _cleanups: (() => void)[] = []

// 全屏机械层下沉 useTableFullscreen.ts：节点搬迁/归还、边界监听（RO+resize 合帧）、
// 侧栏收起等待（动画优先宽度实测兜底）。Escape 优先级链等业务编排留在本文件。
const { moveToBody: _moveFullscreenNodeToBody, returnToOrigin: returnFullscreenNode } =
  useFullscreenNodeRelocation(tableWrapRef)
const _fsBounds = useFullscreenBounds(tableWrapRef, () => _isFullscreen.value)

/** 放弃进行中的进入全屏，并把被本组件收起的侧栏还原（三条中断路径共用：再次点击 / 退出 / 卸载） */
function cancelFullscreenEnter() {
  _fsPendingRun = 0 // 在飞的那条等待落地时比不过号，自己作废
  if (_sidebarToggledByUs.value) {
    _toggleCollapse()
    _sidebarToggledByUs.value = false
  }
}

function toggleFullscreen() {
  if (_isFullscreen.value) {
    _isFullscreen.value = false
    return
  }
  if (_fsPendingRun) {
    // 正在等待进入全屏 → 取消并还原导航栏；下一次点击重新开始
    cancelFullscreenEnter()
    return
  }
  const sidebar = document.querySelector<HTMLElement>('.sidebar')
  const needCollapse = !!sidebar && !sidebar.classList.contains('collapsed')
  if (needCollapse) {
    _toggleCollapse()
    _sidebarToggledByUs.value = true
  }
  const run = ++_fsSeq
  _fsPendingRun = run
  // 先让侧栏收起动画跑完再进场，全屏框量的才是最终边界（过去这里等 250ms，见 waitForWidthSettle）。
  // 进场后仍有 ResizeObserver 持续纠正，所以这一步只是让入场观感稳定，不再是唯一的一次测量。
  void _enterFullscreenAfterSettle(needCollapse ? sidebar : null, needCollapse, run)
}

async function _enterFullscreenAfterSettle(sidebar: HTMLElement | null, needCollapse: boolean, run: number) {
  if (needCollapse && sidebar) await waitForSidebarCollapse(sidebar)
  if (_fsPendingRun !== run) return // 等待期间被取消/退出/卸载过 → 本条作废，不再改任何状态
  _fsPendingRun = 0
  _isFullscreen.value = true
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
      closeScreenshotModal()
      return
    }
    if (contextMenu.value.visible) {
      closeContextMenu()
      return
    }
    if (batchDialog.value?.show) {
      batchDialog.value.close()
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

onDeactivated(() => {
  // KeepAlive 失活时不能把全屏态带进缓存：表格节点挂在 body 上、body 的全屏类与全局监听都还在生效，
  // 宿主切过去的新一页既被盖住又被 overflow:hidden 锁住。退出复用同一条归还路径。
  if (_isFullscreen.value) _isFullscreen.value = false
})
watch(_isFullscreen, async (v) => {
  _lockedMaxH.value = '' // 全屏模式由内部 flex 布局接管，释放 JS 锁高
  if (v) {
    document.addEventListener('keydown', onFullscreenKeydown, true)
    document.removeEventListener('keydown', _onKeydown, true)
    document.addEventListener('keydown', _onKeydown, true) // 重新注册，排在 onFullscreenKeydown 后面
    document.addEventListener('click', onFullscreenBodyClick, true)
    window.addEventListener('resize', _fsBounds.onWindowResize)
    document.body.classList.add('dt-fullscreen-active')
    // 移到 body 下，脱离弹窗/父容器的 overflow/display 限制
    _moveFullscreenNodeToBody()
    // 动态计算内容区边界，并在整个全屏期间跟着它变（侧栏收起不触发 window resize）
    await nextTick()
    _fsBounds.apply()
    _fsBounds.start()
  } else {
    // 作废仍在等待的进入流程（不还原侧栏 —— 下面的归还流程统一处理）
    _fsPendingRun = 0
    _fsBounds.stop()
    document.removeEventListener('keydown', onFullscreenKeydown, true)
    document.removeEventListener('click', onFullscreenBodyClick, true)
    window.removeEventListener('resize', _fsBounds.onWindowResize)
    document.body.classList.remove('dt-fullscreen-active')
    // 先归还节点并清掉全屏内联尺寸，最后才还原侧栏。
    // 归还后表格回到普通流，宽度自然跟着父容器变，不需要等侧栏动画收尾；
    // 反过来（先等再归还）会把整张表以"定宽定高的静态块"留在 body 末尾直到等待结束，
    // 把宿主页面内容顶开 —— 那正是过去这里等固定毫秒埋下的雷。
    returnFullscreenNode()
    if (_sidebarToggledByUs.value) {
      _toggleCollapse()
      _sidebarToggledByUs.value = false
    }
  }
  await nextTick()
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  applyAutoFit()
  // 全屏切换后容器尺寸变化 → 重测虚拟滚动窗口高度（进出全屏都要测）
  if (scrollContainerRef.value) containerHeight.value = scrollContainerRef.value.clientHeight
  emit('fullscreen-change', v)
})

// 截图导出（编排下沉 useTableScreenshot；本文件只保留取表元素与关闭其它弹窗的接线）
const {
  modal: _screenshotModal,
  capture: captureScreenshot,
  downloadFromModal: downloadScreenshotFromModal,
  copyFromModal: copyScreenshotFromModal,
  closeModal: closeScreenshotModal,
} = useTableScreenshot({
  getShotTable: () =>
    (tableWrapRef.value?.querySelector('.table-scroll') as HTMLElement | null)?.querySelector(
      'table.data-table',
    ) as HTMLTableElement | null,
  maxRows: () => props.screenshotMaxRows,
  shotMode: () => props.shotMode,
  notify,
  t,
  closeOtherModals: () => {
    if (_cellDetailModal.value.visible) _cellDetailModal.value.visible = false
  },
})

// 复制表格数据（TSV 格式，可粘贴到 Excel；公式注入防护在 buildTsv）
function copyTableData() {
  const cols = visibleColumns.value.filter((c) => !hiddenColumns.value.has(c.key))
  const source = props.exportScope === 'page' ? pagedData.value : displayData.value
  const meta = rowMetaMap.value
  const header = cols.map((c) => c.title)
  const rows = source.map((row) => {
    const rm = meta.get(row)
    // 与导出一致：优先显示值（含本地编辑 override）
    return cols.map((c) => String(cellVal(row, c.key, rm?.texts[c.key] ?? '') ?? ''))
  })
  copyText(buildTsv(header, rows))
  notify(t('table.tableDataCopied'))
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

// 卡片模式渐进加载：每批补到「还能再滚 _CARD_SCREENS 屏才需要等」，批大小由卡片实测间距换算。
// 固定 50 张在矮卡片上一次补了七八屏（白渲染一堆 DOM）、在高卡片上不到一屏（滚两下又要等）。
const _CARD_SCREENS = 2
/** 卡片很高时「两屏」换算出来可能只有一两张，兜底批保证每次至少推进这么多，避免反复滚反复补 */
const _CARD_BATCH_FLOOR = 10
let _cardBatchSize = 50
const _cardRenderLimit = ref(_cardBatchSize)

/** 相邻两张卡片的 offsetTop 差 = 卡片高度 + 间距；只有一张时退到自身高度。
 *  返回 0 表示量不出来（容器隐藏 / 无布局），此时调用方保留上一次的批大小 ——
 *  把 0 当 1 用会让批算成「整表一次渲染」，正好触发这段渐进加载要防的卡顿。
 *  只取前两张（卡片是容器的直接子元素），滚动事件里不能整棵子树 querySelectorAll。 */
function _cardPitch(el: HTMLElement): number {
  const first = el.firstElementChild as HTMLElement | null
  const second = first?.nextElementSibling as HTMLElement | null
  if (first && second) {
    const pitch = second.offsetTop - first.offsetTop
    return pitch > 0 ? pitch : 0
  }
  return first ? Math.max(0, first.offsetHeight) : 0
}

function _remeasureCardBatch(el: HTMLElement) {
  const pitch = _cardPitch(el)
  if (pitch > 0) _cardBatchSize = Math.max(_CARD_BATCH_FLOOR, Math.ceil((el.clientHeight * _CARD_SCREENS) / pitch))
}

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
  _remeasureCardBatch(el)
  // 预取提前量按容器实测高度取「还剩一屏」：写死像素在矮容器里太早补、在高屏容器里太晚补
  if (el.scrollHeight - el.scrollTop - el.clientHeight < el.clientHeight) {
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
  applyChanges,
  markEditActive,
  cancelEdit,
  undo,
  redo,
  canUndo,
  canRedo,
  editInvalidKey,
  fillHandleRange,
  fillable,
  isFillCorner,
  applyFill,
  // @patch 2026-07-15 原始值气泡
  originalTooltip,
  showOriginalTooltip,
  hideOriginalTooltip,
} = useTableEdit(
  props,
  {
    cellChange: (rk, ck, nv) => emit('cell-change', rk, ck, nv),
    cellNote: (rk, ck, n) => emit('cell-note', rk, ck, n),
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
    onCopied: () => notify(t('imagePreview.copyOk')),
    // 归一化失败（仅失焦提交、值已被丢弃时触发）：全局提示一次。
    // Enter/Tab 提交失败不走这里——由 editInvalidKey 在编辑格上就地呈现（红圈 + 气泡），
    // 用户视线就在格子里，右下角 toast 够不着
    onNormalizeError: (key) => notify(t(key), 'warning'),
  },
)

// ── 填充柄拖拽（M3 第十一刀下沉）：只做「拖了几格、朝哪拖」，填什么值仍在 applyFill 里 ──
const { isInFillPreview, onFillHandleMouseDown, cancelFillDrag } = useFillHandleDrag({
  fillable,
  fillHandleRange,
  markLayerOpen,
  applyFill,
})

// ==================== 2026-09-17 交互体验第二批：撤销/重做按钮 · 归一化失败 cell 级提示 · 数字列呈现 ====================

/** 工具栏撤销/重做按钮：先取消进行中的内联编辑（避免撤销后旧编辑框把旧值写回去）。
 *  键盘路径（Ctrl+Z 带 dirty 分流）在 composable 内自行处理，不受这里影响。 */
function undoFromToolbar() {
  if (editingCell.value) cancelEdit()
  undo()
}
function redoFromToolbar() {
  if (editingCell.value) cancelEdit()
  redo()
}

/** 指定格上是否正显示「归一化失败」cell 级提示（Enter/Tab 提交被拒后挂起，随输入/成功/取消自动清除） */
function isEditingInvalid(rowKey: string, colKey: string): boolean {
  const c = editingCell.value
  return !!editInvalidKey.value && !!c && c.rowKey === rowKey && c.colKey === colKey
}

/** 移动端键盘提示：number 列弹数字键盘（decimal），日期/时间列弹数字键盘（紧凑写法 1430/20260912 可直输）。
 *  未声明 type 的列返回 undefined → 不渲染 inputmode，行为不变。 */
function editInputMode(col: Column): 'decimal' | 'numeric' | undefined {
  switch (col.type) {
    case 'number':
      return 'decimal'
    case 'date':
    case 'datetime':
    case 'time':
      return 'numeric'
    default:
      return undefined
  }
}

/** 值类型驱动的默认对齐：number 列默认右对齐（Excel 习惯）；显式 cellAlign/align 永远优先 */
function defaultAlignFor(col: Column): 'left' | 'center' | 'right' {
  return col.type === 'number' ? 'right' : 'left'
}
// aria-modal 备注编辑弹层的 Tab 循环（打开自动激活，输入框为首个可聚焦项；
// 关闭时 trap 归还焦点到备注指示器）
const _noteEditorRef = ref<HTMLElement | null>(null)
const _noteTrapVisible = computed(() => !!noteEditing.value)
useFocusTrap({ visible: _noteTrapVisible, getContainer: () => _noteEditorRef.value })
watch(
  displayData,
  (val) => {
    _pasteRowKeys.value = val.map((r) => rowMetaMap.value.get(r)?.key ?? '').filter(Boolean)
  },
  { immediate: true },
)

// ==================== @patch 2026-08-09 矩形选区：长按/拖拽多选 ====================
// 指针编排（长按判定 / 拖拽阈值 / 边缘自动滚动 / click 抑制）已下沉 → useRangePointer（M3 第十二刀）
// 选区数据状态机仍在 cell-select.ts（rangeSel / startRange / updateRange / clearRange）。
// 这里只保留两件事：① 提供给 composable 的快照与取值钩子；② 行显示索引换算。

/** 渲染行显示索引（虚拟滚动/全屏时与 pagedData 对齐） */
function rowDisplayIndex(idx: number): number {
  if (_isFullscreen.value) return idx
  if (isVirtual.value) return virtualStartIndex.value + idx
  return idx
}

/** 行 key 快照（与模板渲染顺序一致） */
function rangeRowsSnapshot(): string[] {
  return _effectivePagedData.value.map((r) => rowMetaMap.value.get(r)?.key ?? '').filter(Boolean)
}
/** 列 key 快照（与模板渲染顺序一致） */
function rangeColsSnapshot(): string[] {
  return _displayColumns.value.map((c) => c.key)
}

const { onCellMouseDown, shouldSuppressClick } = useRangePointer({
  editable: () => props.editable,
  editing: () => !!editingCell.value,
  cellSelection: () => !!props.cellSelection,
  rowDisplayIndex,
  rowsSnapshot: rangeRowsSnapshot,
  colsSnapshot: rangeColsSnapshot,
  cellValue: (row, colKey) => cellVal(row, colKey, rowMetaMap.value.get(row)?.texts[colKey] ?? ''),
  rowKeyOf: (row) => rowMetaMap.value.get(row)?.key,
  rangeSel,
  startRange,
  updateRange,
  clearRange,
  scrollContainer: scrollContainerRef,
})

// ==================== 填充柄拖拽 → useFillHandleDrag（M3 第十一刀下沉） ====================
// 指针/预览状态机已下沉；此处只保留**取消时机**的编排 ——
// 数据变化（筛选/排序/分页/列显隐/原地增删行）后旧选区失效必须清空，
// 同时维护显示行列快照供无矩形选区时的矩阵粘贴定位。
// ⚠️ 这个 watch 是 immediate 的（setup 期间同步执行），所以它引用的 composable
// 必须在**此处之前**完成初始化 —— 否则会踩 TDZ（Cannot access before initialization）。
watch(
  [() => _effectivePagedData.value.length, _effectivePagedData, _displayColumns],
  () => {
    if (rangeSel.value) clearRange()
    // 拖拽填充中行/列集合变了 → 拖拽起始索引已失效，取消本次拖拽（不落库）
    cancelFillDrag()
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
  _selectedKeySet,
  isAllSelected,
  isIndeterminateSelection,
  toggleSelectAll,
  toggleRowSelect,
  onGlobalKeydown,
  onDocumentClick,
  onScrollClose,
  _clearPersisted,
  restoreColWidths,
  flushWidths,
} = useTableExtras(props, emit as (...args: unknown[]) => void, {
  // v2（Q5）：@export 监听在否决定服务端导出还是内置 CSV/Excel
  hasExportListener: () => !!_dtInstance?.vnode.props?.onExport,
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

closeContextMenu = _closeCtxMenu

// 7. 单元格浮层菜单：图片灯箱 / 选项下拉面板 / 单元格右键菜单 / 两块键盘导航（M3 第十刀下沉）
const {
  _lightboxSrc,
  onImageClick,
  closeLightbox,
  _optDrop,
  optDropRef,
  _optFocusIndex,
  isOptionDroppable,
  openOptDrop,
  closeOptDrop,
  pickOption,
  onOptDropKeydown,
  onCellContextMenuGuard,
  onContextCopyCell,
  onContextPasteCell,
  onContextClearCell,
  contextMenuRef,
  onContextMenuKeydown,
} = useTableCellMenus(
  // props 直接传入：editable / cellContextMenu 的响应式由模块内闭包读取保持
  props,
  {
    rowMetaMap,
    cellVal,
    selectCell,
    effectivePagedData: _effectivePagedData,
    tableWrapRef,
    contextMenu,
    closeContextMenu,
    applyChanges,
    markEditActive,
    copySelectedCell,
    pasteText,
    pasteToSelection,
    clearSelection,
    selectedCell,
  },
)

/** 单元格单击：选项列弹出面板，否则走选择逻辑
 *  @patch 2026-07-15 Ctrl+单击 → 行高亮+进度条标记；普通单击 → 仅单元格选中 */
function onCellClick(row: Record<string, any>, col: Column, event: MouseEvent) {
  // @patch 2026-08-09 拖选结束的 click 不改变选区（长按/拖拽已建立矩形选区）
  // 抑制标志由 useRangePointer 内部管理（M3 第十二刀下沉后不再暴露可变变量）
  if (shouldSuppressClick()) return
  const rk = rowMetaMap.value.get(row)?.key ?? ''
  // 行高亮/进度条标记：仅 Ctrl+单击时切换
  if (event.ctrlKey || event.metaKey) {
    const next = new Set(_clickedRowKeys.value)
    if (next.has(rk)) next.delete(rk)
    else next.add(rk)
    _clickedRowKeys.value = next
  }
  // 仅编辑模式且列级开关未禁用时弹出选项面板；否则与普通列一致只做选中
  if (isOptionDroppable(col)) {
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

/** 卡片视图字段点击：options 列打开选项面板，其余列仅标记活动表格。
 *  卡片视图没有 <td>，也就不会走 selectCell —— 不标记的话该表的 Ctrl+Z/C/V 会静默失效。 */
function onCardFieldClick(row: Record<string, any>, col: Column, event: MouseEvent) {
  markEditActive()
  if (isOptionDroppable(col)) openOptDrop(row, col, event)
}

/** 单元格双击：编辑模式且列可编辑 → 进入编辑；否则仅保留单元格选中态，清除浏览器双击产生的文本全选 */
function onCellDblClick(row: Record<string, any>, col: Column, e?: MouseEvent) {
  const canEdit = props.editable && col.editable !== false
  // options 列双击：打开选项面板（不进入无输入框的内联编辑）
  if (isOptionDroppable(col) && e) {
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

// ==================== 单元格右键菜单 → useTableCellMenus（复制 / 粘贴 / 清空动作已下沉） ====================
/** 获取单元格即时显示值（本地覆盖优先） */
function cellVal(row: Record<string, any>, colKey: string, metaVal: string): string {
  const rk = rowMetaMap.value.get(row)?.key ?? ''
  return getCellValue(rk, colKey, metaVal)
}

/** 展示层文本：空白 → blankText 占位。包在 cellVal 最外层，确保编辑清空后同样占位。
 *  cellVal / rowMetaMap.texts 保持原值供导出、筛选、列宽测量使用 */
function cellShow(row: Record<string, any>, col: Column): string {
  return blankPlaceholder(cellVal(row, col.key, rowMetaMap.value.get(row)?.texts[col.key] ?? ''), props.blankText)
}

/** 单元格**取值**（本地覆盖优先）—— 供"按取值匹配列配置"用（选项列着色等）。
 *  与 cellVal 的区别：cellVal 走 getCellText，会套用 col.render 的显示文本。
 *  第 190 轮：着色若拿显示文本去比选项 value，`options + render`（状态列配徽标
 *  的常规写法，显示"待办"而非 1）就永远匹配不上，颜色静默丢失。
 *  实现上复用 cellVal（把**原值**当作 metaVal 传入），不新增带 any 的函数。 */
function cellRaw(row: Record<string, unknown>, colKey: string): string {
  return cellVal(row as never, colKey, String(row[colKey] ?? ''))
}

/** 图片判定（域名单归 props.imageDomains；纯函数在 composables/utils） */
function isImageUrl(val: unknown): boolean {
  return _isImageUrl(val, props.imageDomains)
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
  emit('row-click', row, idx)
}

const _onClick = (e: Event) => {
  onDocumentClick(e as MouseEvent, closeFilter)
  const t = e.target as HTMLElement
  if (!t.closest('.dt-col-settings') && !t.closest('.col-settings-btn')) colSettingsPanel.value?.close()
  if (!t.closest('.cell-has-options') && !t.closest('.opt-drop-panel')) closeOptDrop()
}
const _onKeydown = (e: Event) => {
  const ke = e as KeyboardEvent
  if (ke.key === 'Escape' && colSettingsPanel.value?.show) {
    colSettingsPanel.value.close()
    return
  }
  // 缩放快捷键：Ctrl+Plus/Minus/0（不拦截输入框内的操作）
  // 仅当焦点位于本表格内部才拦截 — 否则会偷走整页浏览器缩放（无障碍硬伤）
  if (ke.ctrlKey || ke.metaKey) {
    const tag = (ke.target as HTMLElement)?.tagName
    const isInput =
      tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (ke.target as HTMLElement)?.isContentEditable
    const inTable = tableWrapRef.value?.contains(ke.target as Node) ?? false
    if (!isInput && inTable) {
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
  if (colSettingsPanel.value?.show && !(t instanceof HTMLElement && t.closest('.dt-col-settings'))) {
    colSettingsPanel.value.close()
  }
  if (_optDrop.value && !(t instanceof HTMLElement && t.closest('.opt-drop-panel'))) closeOptDrop()
}

onMounted(() => {
  _releaseZTop = boostZTop()
  // 原先这里有一条「virtualScroll 需配合 maxHeight」提示：无 maxHeight 的行数无上限表格
  // 确实会静默全量渲染。现在该场景由 useTablePageVirtual 按页面滚动接管，提示已无成立场景。
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
  // @patch 2026-08-09 拖选残留状态
  // 清理已并入 useRangePointer 的 onUnmounted（第十二刀下沉），此处不再重复
  // 清理填充拖拽残留（监听器 / body 类 / 预览状态）
  cancelFillDrag()
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
  // 无条件先作废"等待进入全屏"并还原侧栏：等待期间切路由时 _isFullscreen 还是 false，
  // 若把这两件事留在下面的 if 里，等待落地会把已卸载组件置为全屏，
  // 而导航栏被本组件收起后再无人复原（用户到新页面仍是收起态）。
  cancelFullscreenEnter()
  if (_isFullscreen.value) {
    document.body.classList.remove('dt-fullscreen-active')
    document.removeEventListener('keydown', onFullscreenKeydown, true)
    document.removeEventListener('click', onFullscreenBodyClick, true)
    window.removeEventListener('resize', _fsBounds.onWindowResize)
    _fsBounds.stop()
    _fsBounds.cancelRaf()
    // 归还节点并清理 inline 尺寸：onUnmounted 跑在 Vue 摘除根节点之后，此时根节点（连同原父
    // 容器）已脱离文档，而模板 ref 也已被置空 —— 被搬到 body 的 .table-wrap 不在那棵子树里，
    // 不显式放回去就永久游离在页面上。
    returnFullscreenNode()
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
  if (_screenshotModal.value.visible) closeScreenshotModal()
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

// 区块子组件共享上下文（列设置/批量弹窗/分页/工具栏等区块 inject；
// 引用与主文件同一份，行为零变化。置于 setup 末尾：所有被引用状态均已声明）
provideDataTableContext({
  hiddenColumns,
  columnWidths,
  columnOrder: _columnOrder,
  userResizedCols: _userResizedCols,
  dynamicFixedLeft,
  dynamicFixedRight,
  visibleColumns,
  isColumnFixed,
  fixLeftCascade,
  fixRightCascade,
  headerMinW,
  clearPersisted: _clearPersisted,
  applyAutoFit,
  notify,
  closeFilter,
  selectedKeys: _selectedKeys,
  selectedKeySet: _selectedKeySet,
  noteInputEl,
  setNoteInputEl,
  currentPage: safePage,
  displayPages,
  setPage,
  // ---- 工具栏 ----
  activeFilters,
  sortState,
  globalSearch,
  showGlobalSearch,
  removeFilter,
  clearAllFilters,
  clearSort,
  dense: _dense,
  zoomX: _zoomX,
  zoomY: _zoomY,
  resetZoom,
  exportCSV,
  exportExcel,
  isFullscreen: _isFullscreen,
  toggleFullscreen,
  captureScreenshot,
  copyTableData,
  canUndo,
  canRedo,
  undoFromToolbar,
  redoFromToolbar,
  isCardViewEffective,
  toggleCardMode,
  displayData,
  displayTotal,
  colSettingsPanel,
  batchDialog,
  scrollable: _scrollable,
  scrollProgress: _scrollProgress,
  cardViewHeight: _cardViewHeight,
  onProgressMouseDown,
  pinnedRowPcts: _pinnedRowPcts,
  scrollToPinnedRow,
})
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
    <div
      v-if="_internalError"
      style="padding: calc(40px * var(--vcl-scale)) calc(20px * var(--vcl-scale)); text-align: center"
    >
      <h3 style="color: var(--vcl-color-danger-on-surface); margin-bottom: calc(8px * var(--vcl-scale))">
        {{ t('table.renderError') }}
      </h3>
      <p
        style="
          color: var(--vcl-color-text-muted);
          font-size: var(--vcl-fs-13);
          margin-bottom: calc(16px * var(--vcl-scale));
        "
      >
        {{ _internalError.message }}
      </p>
      <button class="base-btn btn-primary btn-md" @click="_internalError = null">{{ t('common.retry') }}</button>
    </div>
    <div v-else style="display: contents">
      <!-- ========== 工具栏（区块组件，含筛选 chip 行与滚动进度条；toolbar-actions 插槽转发） ========== -->
      <DataTableToolbar
        :columns="columns"
        :exportable="exportable"
        :excel-exportable="excelExportable"
        :col-settings="colSettings"
        :selectable="selectable"
        :max-height="maxHeight"
        :auto-height="autoHeight"
        :editable="editable"
      >
        <!-- @slot toolbar-actions: 工具栏右侧自定义操作区（使用方扩展：刷新/导入等） -->
        <template #toolbar-actions><slot name="toolbar-actions" /></template>
      </DataTableToolbar>

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
            :aria-label="t('table.dataGridLabel')"
          >
            <!-- ========== 表头 ========== -->
            <thead>
              <tr>
                <!-- 选择框列 -->
                <th
                  v-if="selectable"
                  class="th-checkbox"
                  :class="{ 'col-fixed-left': _hasFixedLeftCol }"
                  :aria-label="t('table.selectAll')"
                >
                  <input
                    type="checkbox"
                    :checked="isAllSelected"
                    :indeterminate="isIndeterminateSelection"
                    @click.stop="toggleSelectAll"
                  />
                </th>
                <th
                  v-for="col in _displayColumns"
                  :key="col.key"
                  draggable="true"
                  tabindex="0"
                  :style="{
                    width: columnWidths[col.key]
                      ? Math.max(columnWidths[col.key], 30) * _zoomX + 'px'
                      : Math.max(headerMinW(col), 60) * _zoomX + 'px',
                    textAlign: col.headerAlign || col.align || defaultAlignFor(col),
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
                    <!-- @slot header-cell: 表头单元格自定义渲染（作用域：column） -->
                    <slot name="header-cell" :column="col">
                      <span class="th-title">{{ colTitle(col) }}</span>
                    </slot>
                    <span v-if="col.sortable !== false || col.filterable !== false" class="th-actions">
                      <!-- 排序指示：纯装饰（内部图标 aria-hidden）。排序语义由 th 上的
                           aria-sort 与 onThKeydown 承载——aria-label 放这个无角色 span 上
                           会被 axe 判 aria-prohibited-attr（无效属性） -->
                      <span v-if="col.sortable !== false" class="sort-arrows">
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
                        :aria-label="t('table.filter')"
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
                  {{ t('table.actions') }}
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
            <tbody v-else-if="isVirtual ? !virtualTotal : !_effectivePagedData.length">
              <tr>
                <td :colspan="_totalCols || 1">
                  <!-- @slot empty: 空状态自定义内容（作用域：filtered 当前是否处于筛选态）；不传则回退内置插图 + Result 组合 -->
                  <slot name="empty" :filtered="!!(activeFilters.length || searchTerm)">
                    <!-- 用防抖后的 searchTerm：与实际过滤口径一致，且逐键输入不再触发整表重渲染 -->
                    <Result
                      :status="activeFilters.length || searchTerm ? 'info' : 'empty'"
                      :title="
                        searchTerm
                          ? t('table.searchNoResultHint')
                          : activeFilters.length
                            ? t('table.filterNoResultHint')
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
              <!-- 虚拟滚动：顶部占位（全屏态同样虚拟化 — 全量行一次性渲染会卡死） -->
              <tr v-if="isVirtual && virtualTopOffset > 0" aria-hidden="true">
                <td :colspan="_totalCols" :style="{ height: virtualTopOffset + 'px', padding: 0, border: 'none' }" />
              </tr>

              <tr
                v-for="(row, idx) in isVirtual ? virtualVisibleData : _effectivePagedData"
                :key="rowMetaMap.get(row)?.key ?? idx"
                :data-row-key="rowMetaMap.get(row)?.key"
                :class="[
                  {
                    'row-selected': _selectedKeySet.has(rowMetaMap.get(row)?.key ?? ''),
                    'row-striped': rowMetaMap.get(row)?.striped ?? false,
                    'row-clicked': _clickedRowKeys.has(rowMetaMap.get(row)?.key ?? ''),
                  },
                  _rowClass(row, rowDisplayIndex(idx)) ?? '',
                  _rowLineClass(row, rowDisplayIndex(idx)),
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
                    :aria-label="t('table.selectRow')"
                    :checked="_selectedKeySet.has(rowMetaMap.get(row)?.key ?? '')"
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
                      textAlign: col.cellAlign || col.align || defaultAlignFor(col),
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
                      'cell-edit-invalid': isEditingInvalid(rowMetaMap.get(row)?.key ?? '', col.key),
                      'cell-numeric': col.type === 'number',
                      'cell-has-note': noteMode && hasNote(rowMetaMap.get(row)?.key ?? '', col.key),
                      'cell-selected': isCellSelected(rowMetaMap.get(row)?.key ?? '', col.key),
                      'cell-range-anchor': isRangeAnchor(rowMetaMap.get(row)?.key ?? '', col.key),
                      // 仅「可下拉」时挂上：该类附加 cursor:pointer，属「可下拉」暗示
                      'cell-has-options': isOptionDroppable(col),
                      'cell-fill-preview': isInFillPreview(rowDisplayIndex(idx), ci),
                      'cell-fill-corner': fillable && isFillCorner(rowMetaMap.get(row)?.key ?? '', col.key),
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
                    :inputmode="editInputMode(col)"
                    :aria-invalid="isEditingInvalid(rowMetaMap.get(row)?.key ?? '', col.key)"
                    @keydown="(e) => onEditKeydown(e, _displayColumns, rowMetaMap.get(row)?.key ?? '')"
                    @blur="commitEdit('blur')"
                    @click.stop
                  />
                  <!-- 归一化失败就地提示（Enter/Tab 提交被拒：红圈 + 气泡，用户视线在格子里；继续输入即消失） -->
                  <span
                    v-if="isEditingInvalid(rowMetaMap.get(row)?.key ?? '', col.key)"
                    class="cell-edit-invalid-hint"
                    role="alert"
                  >
                    {{ editInvalidKey ? t(editInvalidKey) : '' }}
                  </span>
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
                      :alt="colTitle(col)"
                      class="cell-image"
                      loading="lazy"
                      decoding="async"
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
                        <!-- @slot cell: 单元格内容自定义渲染（作用域：column、row、value） -->
                        <slot name="cell" :column="col" :row="row" :value="cellShow(row, col)">
                          <span
                            v-if="typeof col.cell === 'function'"
                            v-html="sanitizeHTML(col.cell(cellShow(row, col), row))"
                          />
                          <span
                            v-else-if="col.options && col.options.length && typeof col.options[0] === 'object'"
                            :style="{
                              color: optColor(col, cellRaw(row, col.key)),
                            }"
                            >{{ cellShow(row, col) }}</span
                          >
                          <template v-else>{{ cellShow(row, col) }}</template>
                        </slot>
                      </span>
                      <!-- 截断长文本展开图标：50字以上 + 被截断 → 可点击弹窗 -->
                      <span
                        v-if="
                          truncateMode === 'ellipsis' &&
                          (autoFit || (rowMetaMap.get(row)?.truncated[col.key] ?? false)) &&
                          (rowMetaMap.get(row)?.texts[col.key]?.length || 0) > EXPAND_ICON_TEXT_MIN
                        "
                        class="cell-expand-icon"
                        :title="t('table.viewFullContent')"
                        @click.stop="openCellDetail(colTitle(col), rowMetaMap.get(row)?.texts[col.key] ?? '')"
                      >
                        <IconSvg type="external-link" size="sm" />
                      </span>
                    </span>
                    <!-- 下拉选项列指示器：仅「可下拉」时渲染（不可编辑列不显示任何可下拉暗示） -->
                    <span v-if="isOptionDroppable(col)" class="cell-options-arrow">
                      <IconSvg type="chevron-down" size="sm" />
                    </span>
                  </template>
                  <!-- 备注指示器 -->
                  <span
                    v-if="noteMode && hasNote(rowMetaMap.get(row)?.key ?? '', col.key)"
                    class="cell-note-dot"
                    :title="t('table.editNote')"
                    @click.stop="startNoteEdit($event, rowMetaMap.get(row)?.key ?? '', col.key)"
                  />
                  <!-- 填充柄：选区右下角小方块，拖拽批量填充（Excel 行为） -->
                  <span
                    v-if="fillable && isFillCorner(rowMetaMap.get(row)?.key ?? '', col.key)"
                    class="cell-fill-handle"
                    :title="t('table.fillHandle')"
                    @mousedown="onFillHandleMouseDown"
                  />
                </td>
                <!-- 操作按钮列 -->
                <td v-if="_hasActions" class="td-actions" :class="{ 'col-fixed-right': _hasFixedRightCol }" @click.stop>
                  <button
                    v-for="act in rowActions!"
                    v-show="!act.visible || act.visible(row, rowDisplayIndex(idx))"
                    :key="act.key"
                    :class="['row-action-btn', `row-action-${act.variant || 'default'}`]"
                    :title="act.label"
                    @click="emit('row-action', act.key, row, rowDisplayIndex(idx))"
                  >
                    <IconSvg v-if="act.icon" :type="act.icon" size="sm" />
                    {{ act.label }}
                  </button>
                </td>
              </tr>

              <!-- 虚拟滚动：底部占位 -->
              <tr v-if="isVirtual && virtualBottomOffset > 0" aria-hidden="true">
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
                    textAlign: col.cellAlign || col.align || defaultAlignFor(col),
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
                  {{ blankPlaceholder(_summaryData[col.key], blankText) }}
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
            :data-row-key="rowMetaMap.get(row)?.key ?? ''"
            class="card-view-item"
            :class="{ 'card-selected': _selectedKeySet.has(rowMetaMap.get(row)?.key ?? '') }"
            @click="emit('row-click', row, idx)"
            @contextmenu.prevent="showRowContextMenu(row, $event)"
          >
            <div v-if="selectable" class="card-checkbox" @click.stop>
              <input
                type="checkbox"
                :aria-label="t('table.selectRow')"
                :checked="_selectedKeySet.has(rowMetaMap.get(row)?.key ?? '')"
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
                'card-field-invalid': isEditingInvalid(rowMetaMap.get(row)?.key ?? '', col.key),
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
                  :inputmode="editInputMode(col)"
                  :aria-invalid="isEditingInvalid(rowMetaMap.get(row)?.key ?? '', col.key)"
                  @keydown="(e) => onEditKeydown(e, _displayColumns, rowMetaMap.get(row)?.key ?? '')"
                  @blur="commitEdit('blur')"
                  @click.stop
                />
                <!-- 归一化失败就地提示（卡片视图与表格视图同一套 editInvalidKey 状态） -->
                <span
                  v-if="isEditingInvalid(rowMetaMap.get(row)?.key ?? '', col.key)"
                  class="cell-edit-invalid-hint"
                  role="alert"
                >
                  {{ editInvalidKey ? t(editInvalidKey) : '' }}
                </span>
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
                  @change="commitEdit('blur')"
                  @blur="commitEdit('blur')"
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
                  @click.stop="onCardFieldClick(row, col, $event)"
                  @dblclick.stop="onCellDblClick(row, col, $event)"
                >
                  <span
                    v-if="typeof col.cell === 'function'"
                    v-html="sanitizeHTML(col.cell(cellShow(row, col), row))"
                  />
                  <template v-else>{{ cellShow(row, col) }}</template>
                </span>
              </span>
              <!-- 备注指示器 -->
              <span
                v-if="noteMode && hasNote(rowMetaMap.get(row)?.key ?? '', col.key)"
                class="cell-note-dot card-note-dot"
                :title="t('table.editNote')"
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
                @click="emit('row-action', act.key, row, idx)"
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
          :status="activeFilters.length || searchTerm ? 'info' : 'empty'"
          :title="
            searchTerm
              ? t('table.searchNoResult')
              : activeFilters.length
                ? t('table.filterNoResult')
                : effectiveEmptyText
          "
        />
      </div>

      <!-- ========== 分页控件（区块组件） ========== -->
      <DataTablePagination
        :fullscreen="_isFullscreen"
        :page-size="pageSize"
        :total-pages="displayTotalPages"
        :selectable="selectable"
      />

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
              :placeholder="props.pinyinSearch ? t('table.pinyinSearchPlaceholder') : t('table.searchPlaceholder')"
              @click.stop
            />

            <!-- 选项排序 -->
            <div class="dt-filter-option-sort">
              <span class="dt-filter-option-sort-label">{{ t('table.sortLabel') }}</span>
              <button
                class="dt-filter-option-sort-btn"
                :class="{ active: optionSort === 'name' || optionSort === 'name-desc' }"
                @click="optionSort = optionSort === 'name' ? 'name-desc' : 'name'"
              >
                {{ t('table.byName') }}
                <span class="dt-filter-option-sort-arrow">
                  <IconSvg
                    :type="
                      optionSort === 'name' ? 'arrow-up' : optionSort === 'name-desc' ? 'arrow-down' : 'arrow-up-down'
                    "
                    size="xs"
                  />
                </span>
              </button>
              <button
                class="dt-filter-option-sort-btn"
                :class="{ active: optionSort === 'count' || optionSort === 'count-desc' }"
                @click="optionSort = optionSort === 'count' ? 'count-desc' : 'count'"
              >
                {{ t('table.byCount') }}
                <span class="dt-filter-option-sort-arrow">
                  <IconSvg
                    :type="
                      optionSort === 'count' ? 'arrow-up' : optionSort === 'count-desc' ? 'arrow-down' : 'arrow-up-down'
                    "
                    size="xs"
                  />
                </span>
              </button>
            </div>

            <!-- 快捷操作 -->
            <div class="dt-filter-quick-actions">
              <button class="dt-filter-quick-btn" @click="filterQuickAction('all')">
                {{ t('table.selectAll') }} <span class="dt-filter-quick-count">({{ filteredOptions.length }})</span>
              </button>
              <button class="dt-filter-quick-btn" @click="filterQuickAction('none')">
                {{ t('table.invertSelection') }}
              </button>
              <button class="dt-filter-quick-btn" @click="filterQuickAction('duplicates')">
                {{ t('table.duplicates') }}
              </button>
              <button class="dt-filter-quick-btn" @click="filterQuickAction('unique')">
                {{ t('table.uniqueOnly') }}
              </button>
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
                  >{{ opt.label || opt.value || t('table.blank') }}</span
                >
                <span class="dt-filter-option-count">{{ opt.count }}</span>
              </div>
              <div v-if="filteredOptions.length === 0" class="dt-filter-no-result">{{ t('table.noMatchResult') }}</div>
            </div>

            <!-- 滚动进度条：贴列表底部，可滚动时显示 -->
            <div v-if="filterOptionsScrollable" class="dt-filter-scroll-progress">
              <div class="dt-filter-scroll-progress-bar" :style="{ width: filterOptionsScrollPct + '%' }" />
            </div>

            <!-- 操作按钮 -->
            <div class="dt-filter-actions">
              <button class="dt-filter-btn dt-filter-btn-apply" @click="applyFilter">{{ t('table.apply') }}</button>
              <button class="dt-filter-btn dt-filter-btn-reset" @click="resetFilter">{{ t('table.reset') }}</button>
            </div>
          </template>
        </div>
      </Teleport>

      <!-- ========== 列设置面板（区块组件） ========== -->
      <DataTableColumnSettings ref="colSettingsPanel" :columns="columns" />

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
            <div class="dt-context-item" role="menuitem" @click="onContextCopyCell">{{ t('common.copy') }}</div>
            <div class="dt-context-item" role="menuitem" @click="onContextPasteCell">{{ t('table.paste') }}</div>
            <div class="dt-context-item" role="menuitem" @click="onContextClearCell">{{ t('table.clearCell') }}</div>
            <div class="dt-context-divider" />
          </template>
          <template v-if="contextMenu.columnKey && !contextMenu.rowKey">
            <div
              class="dt-context-item"
              :class="{ disabled: visibleColumns.length <= 1 }"
              role="menuitem"
              @click="onCtxHideColumn"
            >
              {{ t('table.hideCol') }}
            </div>
            <div class="dt-context-divider" />
            <div class="dt-context-item" role="menuitem" @click="onCtxFixLeftCascade">
              {{ t('table.fixLeftCascade') }}
            </div>
            <div class="dt-context-item" role="menuitem" @click="onCtxFixRightCascade">
              {{ t('table.fixRightCascade') }}
            </div>
            <div
              v-if="isColumnFixed(visibleColumns.find((c) => c.key === contextMenu.columnKey)!)"
              class="dt-context-item"
              role="menuitem"
              @click="onCtxUnfixColumn"
            >
              {{ t('table.unfixAll') }}
            </div>
            <div class="dt-context-divider" />
            <div
              class="dt-context-item"
              :class="{ disabled: hiddenColumns.size === 0 }"
              role="menuitem"
              @click="onCtxShowAllColumns"
            >
              {{ t('table.showAllMenu') }}
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
              zIndex: 'var(--vcl-z-tooltip, 3000)',
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
              zIndex: 'var(--vcl-z-tooltip, 3000)',
            }"
          >
            <span class="original-tooltip-label">{{ t('table.originalValue') }}</span
            >{{ originalTooltip.text }}
          </div>

          <!-- 备注编辑弹窗 -->
          <div
            v-if="noteMode && noteEditing"
            ref="_noteEditorRef"
            class="note-editor"
            :style="{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%,-50%)',
              zIndex: 'var(--vcl-z-tooltip, 3000)',
            }"
            role="dialog"
            aria-modal="true"
            @click.stop
          >
            <div class="note-editor-title">{{ t('table.noteEditorTitle') }}</div>
            <input
              :ref="setNoteInputEl"
              v-model="noteDraft"
              class="note-editor-input"
              :placeholder="t('table.notePlaceholder')"
              @keydown="onNoteKeydown"
            />
            <div class="note-editor-actions">
              <button class="dt-filter-btn dt-filter-btn-apply" @click="commitNote">{{ t('common.ok') }}</button>
              <button class="dt-filter-btn dt-filter-btn-reset" @click="cancelNote">{{ t('common.cancel') }}</button>
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
              zIndex: 'var(--vcl-z-tooltip, 3000)',
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

          <!-- 批量修改弹窗（区块组件，batchChange 事件转发） -->
          <DataTableBatchDialog
            ref="batchDialog"
            :selectable="selectable"
            @batch-change="(ck, nv, keys) => emit('batch-change', ck, nv, keys)"
          />
        </div>
      </Teleport>

      <!-- 截断单元格详情弹窗 -->
      <ModalBox
        :visible="_cellDetailModal.visible"
        :title="_cellDetailModal.title"
        size="md"
        :z-index="'var(--vcl-z-tooltip, 3000)'"
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
            <IconSvg type="download" size="sm" /> {{ t('table.downloadPng') }}
          </button>
          <button class="lightbox-action" @click.stop="copyScreenshotFromModal">
            <IconSvg type="copy" size="sm" /> {{ t('table.copyImage') }}
          </button>
        </template>
      </ImagePreview>
    </div>
  </div>
</template>

<style src="./composables/data-table-scoped.css" scoped></style>
