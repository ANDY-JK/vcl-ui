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
  /** 复制结果：true=系统剪贴板写入成功，false=失败（宿主据此提示"复制失败"） */
  onCopied?: (ok: boolean) => void
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

// ════════════════════════════════════════
// 「这列能不能写」的单一判据（TD-77 收口，2026-11-01 #274）
// ════════════════════════════════════════

/**
 * ## 为什么要有这一组
 *
 * 「列是否可写」这个判据在 data 域里分散过 **6 处**，每处各写一遍条件表达式：
 * `cell-clipboard`（粘贴/清空）、`cell-fill`、`cell-edit`（Tab 续编 / 内联编辑）、
 * `cell-select`（键盘导航）、`DataTable.onCellDblClick`、模板里的 `cell-readonly` class。
 * 已经因此漏判三次：第 177 轮 Tab 落进只读列、第 178 轮粘贴覆盖只读列、
 * **第 37 轮双击图片列进入内联编辑（图片被文本框替换）** —— 每次都是"另一处没跟上"。
 *
 * ## 三档语义（不是同一件事，必须分开命名）
 *
 * | 谓词 | 语义 | 用在哪 |
 * | --- | --- | --- |
 * | `isColumnReadonly` | 列级只读（`editable === false`） | 所有路径的第一道门 |
 * | `isTextWritable` | 能接受**文本值**（排除图片列） | 粘贴 / 填充 / 清空 |
 * | `isInlineEditable` | 能进**内联输入框**（再排除 options 列 —— 下拉列走弹层） | 双击进入编辑 / Tab 续编 / 键盘导航 |
 *
 * 三者是**包含关系**：`isInlineEditable ⊂ isTextWritable ⊂ !isColumnReadonly`。
 * 所以实现只写一次最严格的、其余由它组合，避免再出现"某处少排一个条件"。
 */
export function isColumnReadonly(col: Column | undefined): boolean {
  return col?.editable === false
}

/** 能接受文本值：非只读、且不是图片列（图片列的值是 URL，不能用键盘/粘贴的文本覆盖） */
export function isTextWritable(col: Column | undefined): boolean {
  if (!col) return false
  if (isColumnReadonly(col)) return false
  return col.accept !== 'image'
}

/**
 * 能进内联输入框：在 isTextWritable 基础上再排除 options 列（下拉列走 openOptDrop 弹层）。
 *
 * ⚠️ 用 `!col.options`（**有没有这个属性**）而不是 `!col.options?.length`：
 * `options: []` 也是「声明为下拉列」（选项可由数据源异步填充），它没有内联输入框。
 * 用 length 判会让空 options 数组的列变成可内联编辑 —— 那是另一种语义。
 */
export function isInlineEditable(col: Column | undefined): boolean {
  if (!isTextWritable(col)) return false
  return !col!.options
}
