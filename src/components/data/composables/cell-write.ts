// ==================== 写入漏斗 + 撤销/重做 + 修改追踪 ====================
// 所有单元格写入的**唯一入口**。统一三件事：
//   1. 记「已修改行」
//   2. emit cellChange
//   3. 整批合成**一条**撤销记录（矩阵粘贴 / 整片填充 / 选区清空必须一次撤销，不能逐格回退）
//
// 与选择模块的耦合通过 deps 可变对象注入（构造后由 facade 回填），
// 避免 cell-write ↔ cell-select 形成循环依赖。
import { ref, computed } from 'vue'
import { createUndoStack } from './useTableUndo'
import type { CellEditEmit, WriteEntry } from './cell-types'

export interface CellWriteDeps {
  /** 取某格「当前显示值」。返回 undefined = 该 hook 未提供，回落到本地 override */
  getDisplayValue: (rowKey: string, colKey: string) => string | undefined
  /** 历史回写完成后同步外部缓存（如选择态的复制缓存） */
  onAfterHistory: (changes: { rowKey: string; colKey: string }[]) => void
  /**
   * 该格是否允许写入（第 178 轮）。
   *
   * 漏斗自称「所有单元格写入的唯一入口」，但此前**不做只读校验**，于是各入口各自判：
   * 清空判了 `editable === false`，粘贴（7 个写入点）却没判，一个文件两套口径，
   * 只读列被 Excel 粘贴整列覆盖。这里补一道兜底闸口 —— 入口该判的照旧判（给出更早的
   * 用户提示），漏斗负责保证"无论如何不写进只读列"。
   * 省略该依赖 = 不设限（既有调用与测试保持原行为）。
   */
  isWritable?: (rowKey: string, colKey: string) => boolean
}

export function useCellWrite(emit: CellEditEmit, deps: CellWriteDeps) {
  const modifiedRows = ref<Set<string>>(new Set())
  const modifiedCount = computed(() => modifiedRows.value.size)
  /** 本地覆盖值：rowKey → { colKey: displayValue }，改后即时显示 */
  const overrides = ref<Record<string, Record<string, string>>>({})
  const undoStack = createUndoStack()
  // 历史栈是纯闭包状态（useTableUndo 零环境依赖设计），computed 读不到其变化。
  // 用一个 ref 触点：任何 push/undo/redo/clear 都自增，canUndo/canRedo 先读它建立响应依赖 ——
  // 否则工具栏「撤销/重做」按钮的 :disabled 会拿到一次求值的缓存结果，永远不变。
  const historyTouch = ref(0)

  function getCellValue(rowKey: string, colKey: string, original: string): string {
    return overrides.value[rowKey]?.[colKey] ?? original
  }

  /** 批量写入：先快照「写入前」状态再写，整批 push 成一条撤销记录 */
  function applyChanges(all: WriteEntry[]) {
    // 只读闸口（第 178 轮）：把不可写列的条目挡在漏斗口，防止任何入口漏判
    const entries = deps.isWritable ? all.filter((en) => deps.isWritable!(en.rowKey, en.colKey)) : all
    if (!entries.length) return
    // 全部条目按**写入前**口径取 before；同一格重复出现时也能被逆序回滚抹平
    const changes = entries.map((en) => ({
      rowKey: en.rowKey,
      colKey: en.colKey,
      before: overrides.value[en.rowKey]?.[en.colKey],
      after: en.value,
    }))
    for (const en of entries) {
      if (!overrides.value[en.rowKey]) overrides.value[en.rowKey] = {}
      overrides.value[en.rowKey][en.colKey] = en.value
      modifiedRows.value.add(en.rowKey)
      emit.cellChange(en.rowKey, en.colKey, en.value)
    }
    undoStack.push({ changes })
    historyTouch.value++
  }

  function applyChange(rowKey: string, colKey: string, value: string) {
    applyChanges([{ rowKey, colKey, value }])
  }

  /** 直接写 override（不走撤销栈、不 emit）：仅供撤销/重做回写。
   *  value === undefined 表示删除该格 override，还原「未修改」态 */
  function writeOverride(rowKey: string, colKey: string, value: string | undefined) {
    if (value === undefined) {
      const row = overrides.value[rowKey]
      if (!row) return
      delete row[colKey]
      if (Object.keys(row).length === 0) delete overrides.value[rowKey]
      return
    }
    if (!overrides.value[rowKey]) overrides.value[rowKey] = {}
    overrides.value[rowKey][colKey] = value
  }

  /** 撤销/重做后同步：emit 当前值让父组件数据跟上；某行不再有任何 override 时清掉「已修改」标记 */
  function syncAfterHistory(changes: { rowKey: string; colKey: string }[]) {
    for (const c of changes) {
      // cellChange 的契约是「该格现在是什么值」。override 被回滚删除时当前值是**原始值**
      // （hook 会回落到原始显示值），不能 emit 空串 —— 否则监听 cellChange 双向同步的父组件会把该格清空。
      const shown = deps.getDisplayValue(c.rowKey, c.colKey) ?? overrides.value[c.rowKey]?.[c.colKey] ?? ''
      emit.cellChange(c.rowKey, c.colKey, shown)
      if (Object.keys(overrides.value[c.rowKey] ?? {}).length === 0) modifiedRows.value.delete(c.rowKey)
    }
    // 选中格的复制缓存同步：否则撤销后 Ctrl+C 会复制到撤销前的旧值
    deps.onAfterHistory(changes)
  }

  /** 撤销一步：按记录**逆序**回写 before（同一格多次写入时逆序才能回到最初值） */
  function undo(): boolean {
    const rec = undoStack.undo()
    if (!rec) return false
    for (let i = rec.changes.length - 1; i >= 0; i--) {
      const c = rec.changes[i]
      writeOverride(c.rowKey, c.colKey, c.before)
    }
    syncAfterHistory(rec.changes)
    historyTouch.value++
    return true
  }

  /** 重做一步：按记录顺序回写 after */
  function redo(): boolean {
    const rec = undoStack.redo()
    if (!rec) return false
    for (const c of rec.changes) writeOverride(c.rowKey, c.colKey, c.after)
    syncAfterHistory(rec.changes.filter((c) => c.after !== undefined) as { rowKey: string; colKey: string }[])
    historyTouch.value++
    return true
  }

  return {
    modifiedRows,
    modifiedCount,
    overrides,
    getCellValue,
    applyChanges,
    applyChange,
    writeOverride,
    undo,
    redo,
    // 先读触点再读闭包栈：在 computed/模板里调用才具备响应性（工具栏按钮 disabled 态依赖它）
    canUndo: (): boolean => {
      void historyTouch.value
      return undoStack.canUndo()
    },
    canRedo: (): boolean => {
      void historyTouch.value
      return undoStack.canRedo()
    },
  }
}

export type CellWriteApi = ReturnType<typeof useCellWrite>
