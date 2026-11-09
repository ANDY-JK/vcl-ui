// ==================== DataTable 区块子组件共享上下文（provide/inject） ====================
// 设计：主文件 provide 一次，区块子组件（列设置/批量弹窗/分页/工具栏等）inject 所需分片。
// 泛型 T 不下传——区块组件只接触列配置、状态引用与行为函数（any 化内部通道），外部类型面不受影响。
import { inject, provide, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import type { Column, ColumnFilterState } from './types'
import type { TableRow } from '@/components/_internal/api-any'

/** 列设置面板区块对外暴露的实例契约（defineExpose 对齐） */
export interface ColumnSettingsPanelExpose {
  show: boolean
  toggle: (e?: MouseEvent) => void
  close: () => void
  unfixFromMenu: (colKey: string) => void
}

/** 批量修改弹窗区块对外暴露的实例契约（defineExpose 对齐） */
export interface BatchDialogExpose {
  show: boolean
  open: () => void
  close: () => void
}

/** DataTable 区块共享上下文（随区块拆分逐步扩展分片） */
export interface DataTableContext {
  // ---- 列状态（与主文件共享同一引用，子组件可直接读写触发响应） ----
  hiddenColumns: Ref<Set<string>>
  columnWidths: Ref<Record<string, number>>
  columnOrder: Ref<string[]>
  userResizedCols: Ref<Set<string>>
  dynamicFixedLeft: Ref<Set<string>>
  dynamicFixedRight: Ref<Set<string>>
  visibleColumns: ComputedRef<Column[]>
  // ---- 列行为（useTableColumns 产出） ----
  isColumnFixed: (col: Column) => 'left' | 'right' | false
  fixLeftCascade: (colKey: string) => void
  fixRightCascade: (colKey: string) => void
  headerMinW: (col: Column) => number
  // ---- 杂项行为 ----
  clearPersisted: (key: string) => void
  applyAutoFit: () => void
  notify: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  closeFilter: () => void
  // ---- 行选择（批量修改等区块消费） ----
  selectedKeys: Ref<string[]>
  /** 选中键 Set：模板逐行/逐格 O(1) 判选中（数组 includes 大表 O(n²)） */
  selectedKeySet: ComputedRef<Set<string>>
  // ---- 备注输入框引用（备注编辑弹窗 / 批量修改弹窗共用焦点目标） ----
  noteInputEl: Ref<HTMLInputElement | null>
  setNoteInputEl: (el: unknown) => void
  // ---- 分页（useTableCore 产出） ----
  /** 当前页（**已夹紧到 [1,totalPages] 的只读视图**；改页码请用 setPage，避免写入越界值） */
  currentPage: ComputedRef<number>
  displayPages: ComputedRef<(number | string)[]>
  setPage: (p: number) => void
  // ---- 工具栏 ----
  activeFilters: ComputedRef<[string, ColumnFilterState][]>
  sortState: Ref<{ key: string; order: 'asc' | 'desc' }>
  /** 全局搜索关键词（子组件 v-model 直写，主文件 watch 防抖过滤） */
  globalSearch: Ref<string>
  showGlobalSearch: Ref<boolean>
  /** 筛选 chip 单项移除（useTableFilter） */
  removeFilter: (key: string) => void
  /** 清除筛选/排序（含持久化清理，由工具栏子组件组合） */
  clearAllFilters: () => void
  clearSort: () => void
  /** 密度切换（dense 引用归主文件，行高/表格类名多处消费；切换函数由子组件本地实现） */
  dense: Ref<boolean>
  /** 缩放（引用归主文件，表头宽度/表格 CSS 变量多处消费） */
  zoomX: Ref<number>
  zoomY: Ref<number>
  resetZoom: () => void
  /** 导出结果：false = 未能触发下载（SSR / DOM 异常），宿主据此提示失败 */
  exportCSV: () => boolean
  exportExcel: () => void
  isFullscreen: Ref<boolean>
  toggleFullscreen: () => void
  captureScreenshot: () => void
  copyTableData: () => void
  // ---- 编辑撤销/重做（工具栏按钮消费） ----
  canUndo: ComputedRef<boolean>
  canRedo: ComputedRef<boolean>
  undoFromToolbar: () => void
  redoFromToolbar: () => void
  isCardViewEffective: ComputedRef<boolean>
  toggleCardMode: () => void
  /** 行数统计（displayData/displayTotal） */
  displayData: ComputedRef<TableRow[]>
  displayTotal: ComputedRef<number>
  /** 区块实例（列设置面板 / 批量弹窗，工具栏按钮驱动） */
  colSettingsPanel: Ref<ColumnSettingsPanelExpose | null>
  batchDialog: Ref<BatchDialogExpose | null>
  // ---- 滚动进度条 ----
  scrollable: Ref<boolean>
  scrollProgress: Ref<number>
  cardViewHeight: Ref<string>
  onProgressMouseDown: (e: MouseEvent) => void
  pinnedRowPcts: ComputedRef<{ key: string; pct: number }[]>
  scrollToPinnedRow: (key: string) => void
}

const DATA_TABLE_CONTEXT_KEY: InjectionKey<DataTableContext> = Symbol('DataTableContext')

/** 主文件在 setup 内调用：向区块子组件提供共享上下文 */
export function provideDataTableContext(ctx: DataTableContext): void {
  provide(DATA_TABLE_CONTEXT_KEY, ctx)
}

/** 区块子组件在 setup 内调用：注入共享上下文（必须在 DataTable 内使用） */
export function injectDataTableContext(): DataTableContext {
  const ctx = inject(DATA_TABLE_CONTEXT_KEY)
  if (!ctx) throw new Error('[DataTable] 区块子组件必须在 DataTable 内使用（缺少 provide 上下文）')
  return ctx
}
