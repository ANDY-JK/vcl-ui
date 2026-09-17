// ==================== DataTable 单元格编辑：跨子模块共享类型 ====================
// 从原 useTableEdit.ts 抽出，供 cell-write / cell-select / cell-fill / cell-clipboard / cell-edit / cell-note 共用。
// ⛔ 保护 — EditState 结构不可改（外部按此结构读写编辑态）。
import type { Column } from './types'
import type { DateOrder } from './cell-input'

/** 编辑态：当前正在内联编辑的单元格 */
export interface EditState {
  rowKey: string
  colKey: string
  value: string
}

/** 矩形选区（拖选结果）：行/列均为「显示顺序」快照，anchor 为起始格 */
export interface RangeSelection {
  anchor: {
    rowKey: string
    colKey: string
    rowIndex: number
    colIndex: number
    value: string
  }
  focus: { rowIndex: number; colIndex: number }
  /** 当前显示行的 rowKey（按显示顺序） */
  rows: string[]
  /** 当前显示列的 colKey（按显示顺序） */
  cols: string[]
  /** rowKey → 显示行索引：拖选 mousemove 高频判格用 O(1)，避免 rows.indexOf 的 O(n) 逐格扫描 */
  rowIndexOf: (rowKey: string) => number
}

/** 一条写入记录（写入漏斗的基本单位；批量写入整批合成一条撤销记录） */
export interface WriteEntry {
  rowKey: string
  colKey: string
  value: string
}

export interface TableEditHooks {
  /** 获取矩形选区某格显示值（复制时使用） */
  getCellDisplayValue?: (rowKey: string, colKey: string) => string
  /** 滚动到某单元格（键盘导航时保持可见） */
  scrollCellIntoView?: (rowKey: string, colKey: string) => void
  /** 复制成功后的轻提示回调 */
  onCopied?: () => void
  /** 失焦（blur）提交时输入归一化失败且**值已丢弃**：回调方负责全局提示。
   *  Enter/Tab 提交失败不走此 hook（保持编辑态，失败原因由 editInvalidKey 在 cell 级就地呈现） */
  onNormalizeError?: (errorKey: string) => void
}

/** useTableEdit 需要的 props 子集（DataTable 传入自身 props，结构兼容） */
export interface CellEditProps {
  columns?: Column[]
  editable?: boolean
  /** 键盘导航开关：false 时方向键/Enter/Delete/Ctrl+Home/End 不拦截（Ctrl+C/V 仍可用） */
  keyboardNav?: boolean
  noteMode?: boolean
  /** 外部传入的备注数据 */
  notes?: Record<string, Record<string, string>>
  /** @patch 2026-07-15 原始值气泡：hover 已编辑单元格时弹出原始值供对比 */
  originalTooltip?: boolean
  /** 两段数字日期的月日顺序（如 9/12 是 9月12日还是 12月9日），默认 'MDY'；仅 Column.type='date'/'datetime' 生效 */
  dateInputOrder?: DateOrder
}

/** useTableEdit 需要的事件 */
export interface CellEditEmit {
  cellChange: (rowKey: string, colKey: string, newValue: string) => void
  cellNote: (rowKey: string, colKey: string, note: string) => void
}
