// ⛔ 保护 — 禁止修改 Column 接口字段结构，禁止新增 width 等外部列宽字段
//    需我确认：字段增删、枚举值扩展
//    @approved 2026-09-17 `type` 字段经确认新增（Excel 输入习惯对齐，见 workspace 方案）
// ==================== DataTable 类型定义 ====================

import type { CellValueType } from './cell-input'

export interface Column {
  key: string
  title: string
  /** label 是 title 的别名，二选一即可，title 优先 */
  label?: string
  /** 列宽（支持 px 数字或 CSS 字符串如 '120px'） */
  width?: number | string
  sortable?: boolean
  filterable?: boolean
  align?: 'left' | 'center' | 'right'
  /** 表头对齐（不设则跟随 align） */
  headerAlign?: 'left' | 'center' | 'right'
  /** 单元格对齐（不设则跟随 align） */
  cellAlign?: 'left' | 'center' | 'right'
  /** 固定列 'left' 吸附左侧，'right' 吸附右侧 */
  fixed?: 'left' | 'right'
  /** 列内容约束：不设默认不限，可指定仅文本或仅图片 */
  accept?: 'text' | 'image' | 'all'
  /** 列值类型：声明后「双击编辑提交」会按类型归一化（如 date 列输入 9/12 → 2026-09-12）。
   *  未声明 = 不归一化、原样存字符串（存量表格行为完全不变）。
   *  number 非法值会被拒绝并保持编辑态，不落库。 */
  type?: CellValueType
  /** 列级编辑开关：默认 true（可编辑），显式设 false 后该列不进入编辑（仅 editable=true 时生效） */
  editable?: boolean
  /** 图片缩略图尺寸，默认 40px（该列含图片时生效） */
  imageSize?: number
  /** 自定义渲染，返回纯文本 */
  render?: (value: any, row: Record<string, any>, index: number) => string
  /** 预设下拉选项：存在时编辑模式渲染为下拉面板；支持 string 或 { value, label?, color? } */
  options?: (string | ColumnOption)[]
  /** 筛选候选值：服务端分页时由外部传入全量可选值，优先于从 data 提取 */
  filterValues?: string[]
  /** 自定义单元格渲染函数，返回 HTML 字符串（v-html 渲染）
   *  ⚠️ 安全：返回值经过内置消毒（剥离 script/style/事件处理器），但仍不建议传入不可信内容 */
  cell?: (value: any, row: Record<string, any>) => string
}

/** 下拉选项对象：列预设 options 可混用 string 与此对象 */
export interface ColumnOption {
  value: string
  /** 显示标签，不设则显示 value */
  label?: string
  /** 文本颜色 */
  color?: string
}

/** 行操作按钮定义 */
export interface RowAction {
  key: string
  label: string
  icon?: string
  variant?: 'default' | 'primary' | 'danger' | 'success' | 'warning' | 'outline' | 'info' | string
  /** 条件显示：返回 false 则该行不显示此按钮 */
  visible?: (row: Record<string, any>, index: number) => boolean
}

/** 行右键菜单项 */
export interface RowContextAction {
  key: string
  label: string
  icon?: string
  danger?: boolean
  /** 内联回调：绑定后直接执行，优先级高于 rowContextAction 事件 */
  onClick?: (row: Record<string, any>, index: number) => void
}

export interface ColumnFilterState {
  searchText: string
  selectedValues: string[]
}

export interface FilterOption {
  value: string
  count: number
  /** 显示用富文本标签（取自 column.render），为空时界面回退到 value */
  label?: string
}

export interface RowMeta {
  key: string
  texts: Record<string, string>
  truncated: Record<string, boolean>
  striped: boolean
}

export type OptionSort = 'name' | 'name-desc' | 'count' | 'count-desc'

/** 存储适配器：默认 localStorage，可替换为服务端/内存实现。
 *
 *  方法支持同步或异步（async 返回 Promise），内部统一用 await 兼容。
 *
 *  @example 服务端存储
 *  ```ts
 *  const remote: TableStorage = {
 *    async get(key) { const r = await fetch(`/api/prefs/${key}`); return r.ok ? r.text() : null },
 *    async set(key, val) { await fetch(`/api/prefs/${key}`, { method: 'PUT', body: val }) },
 *    async remove(key) { await fetch(`/api/prefs/${key}`, { method: 'DELETE' }) },
 *  }
 *  ```
 *
 *  @example 创建 localStorage 适配器（带前缀隔离）
 *  ```ts
 *  import { createLocalStorage } from 'vcl-ui'
 *  const storage = createLocalStorage('my-app')
 *  ```
 */
export interface TableStorage {
  get(key: string): string | null | Promise<string | null>
  set(key: string, value: string): void | Promise<void>
  remove(key: string): void | Promise<void>
}

/** 创建 localStorage 适配器（工厂函数，生产级：try-catch 保护 + 前缀隔离） */
export function createLocalStorage(prefix: string = 'dt'): TableStorage {
  const pfx = `saas_${prefix}-`
  return {
    get(key: string): string | null {
      try { return localStorage.getItem(pfx + key) } catch { return null }
    },
    set(key: string, value: string): void {
      try { localStorage.setItem(pfx + key, value) } catch { /* quota exceeded 等静默 */ }
    },
    remove(key: string): void {
      try { localStorage.removeItem(pfx + key) } catch { /* 静默 */ }
    },
  }
}

/**
 * 用 type 而非 interface：Vue 3.4 的 defineEmits<T>() 约束为 Record<string, any[]>，
 * interface 没有隐式索引签名会报 TS2344（Vue 3.5 放宽了该约束，只在本机 3.5 下看不出来）。
 */
export type Emits = {
  sort: [key: string, order: 'asc' | 'desc']
  filter: [filters: Record<string, string[]>]
  'update:filters': [filters: Record<string, string[]>]
  rowClick: [row: Record<string, any>, index: number]
  'update:selectedKeys': [keys: string[]]
  'update:currentPage': [page: number]
  pageChange: [page: number, pageSize: number]
  selectionChange: [keys: string[], rows: Record<string, any>[]]
  cellChange: [rowKey: string, colKey: string, newValue: string]
  cellNote: [rowKey: string, colKey: string, note: string]
  batchChange: [colKey: string, newValue: string, rowKeys: string[]]
  rowAction: [actionKey: string, row: Record<string, any>, index: number]
  rowContextAction: [actionKey: string, row: Record<string, any>, index: number]
  search: [term: string]
  fullscreenChange: [isFullscreen: boolean]
}
