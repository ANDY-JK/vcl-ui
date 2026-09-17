// ==================== 撤销 / 重做历史栈 ====================
// 纯数据模块（无 Vue、无 DOM）：只在 useTableEdit 的写入漏斗里 push，
// 保证「所有写入路径都可撤销」这一不变量由漏斗而非各调用点维护。
//
// 关键约定：一条记录 = 一次用户动作（可能含多格）。
// 矩阵粘贴 / 整片填充 / 选区清空必须整批合成**一条**，否则撤销一次只回退一格。

export interface UndoChange {
  rowKey: string
  colKey: string
  /** 写入前的 override 值；undefined = 该格此前没有 override，撤销时需删除键以还原「未修改」态 */
  before: string | undefined
  /** 写入后的值 */
  after: string
}

export interface UndoRecord {
  changes: UndoChange[]
}

/** 历史栈容量上限：超出丢弃最旧记录，避免长时间编辑持续吃内存 */
export const UNDO_LIMIT = 200

export interface UndoStack {
  /** 记录一次写入（新写入会清空重做栈，与 Excel 一致） */
  push(record: UndoRecord): void
  /** 取出待撤销记录（调用方负责回写）；栈空返回 null */
  undo(): UndoRecord | null
  /** 取出待重做记录；栈空返回 null */
  redo(): UndoRecord | null
  canUndo(): boolean
  canRedo(): boolean
  /** 可撤销步数 */
  size(): number
  clear(): void
}

export function createUndoStack(limit: number = UNDO_LIMIT): UndoStack {
  let past: UndoRecord[] = []
  let future: UndoRecord[] = []

  return {
    push(record) {
      if (!record.changes.length) return
      past.push(record)
      if (past.length > limit) past.shift()
      future = []
    },
    undo() {
      const rec = past.pop()
      if (!rec) return null
      future.push(rec)
      return rec
    },
    redo() {
      const rec = future.pop()
      if (!rec) return null
      past.push(rec)
      return rec
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    size: () => past.length,
    clear() {
      past = []
      future = []
    },
  }
}
