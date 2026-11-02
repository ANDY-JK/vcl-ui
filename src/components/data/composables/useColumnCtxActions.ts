/**
 * 表头右键菜单的**动作处理器**（#373，从 DataTable.vue 下沉）
 *
 * ## 为什么下沉
 *
 * DataTable.vue 已连续多轮贴着 2760 行的止涨线（最低余量 8 行，0.3%），
 * `check:constants` 因此常驻「余量偏紧」警告。这一块是纯"菜单项 → 列操作 + 关菜单"的
 * 胶水，没有自己的状态，是最安全的第一刀。
 *
 * ## 形态说明
 *
 * · `colSettingsPanel` / `batchDialog` 两个区块实例仍由 DataTable 持有（模板 ref 所在），
 *   这里以 getter 形式接收，避免把 ref 的所有权也搬走
 * · `closeContextMenu` 由 useTableCellMenus 产出，但**晚于**本 composable 的调用点
 *   （#39 前向引用），所以同样用 getter 延迟解析 —— 与 DataTable 原来的
 *   `let closeContextMenu = () => {}` 回填手法语义一致
 */
import type { Ref } from 'vue'

interface ColumnCtxDeps {
  /** 当前的列右键菜单状态（columnKey 在列菜单项里必有值） */
  contextMenu: Ref<{ columnKey: string | null; rowKey: string | null } & Record<string, unknown>>
  /** 关闭菜单（useTableCellMenus 产出，前向引用 → getter） */
  closeMenu: () => void
  hideCurrentColumn: () => void
  fixLeftCascade: (colKey: string) => void
  fixRightCascade: (colKey: string) => void
  showAllColumns: () => void
  /** 列设置面板区块（unfixFromMenu 由它暴露）—— getter 避免搬 ref 所有权 */
  getColSettingsPanel: () => { unfixFromMenu: (colKey: string) => void } | null
}

export function useColumnCtxActions(deps: ColumnCtxDeps) {
  const { contextMenu, closeMenu, hideCurrentColumn, fixLeftCascade, fixRightCascade, showAllColumns } = deps

  /** 右键菜单 — 隐藏当前列 */
  function onCtxHideColumn() {
    hideCurrentColumn()
    closeMenu()
  }

  /** 右键菜单 — 固定到左侧 */
  function onCtxFixLeftCascade() {
    fixLeftCascade(contextMenu.value.columnKey!)
    closeMenu()
  }

  /** 右键菜单 — 固定到右侧 */
  function onCtxFixRightCascade() {
    fixRightCascade(contextMenu.value.columnKey!)
    closeMenu()
  }

  /** 右键菜单 — 取消固定（列设置区块持有固定区域逻辑） */
  function onCtxUnfixColumn() {
    deps.getColSettingsPanel()?.unfixFromMenu(contextMenu.value.columnKey!)
    closeMenu()
  }

  /** 右键菜单 — 显示全部列 */
  function onCtxShowAllColumns() {
    showAllColumns()
    closeMenu()
  }

  return { onCtxHideColumn, onCtxFixLeftCascade, onCtxFixRightCascade, onCtxUnfixColumn, onCtxShowAllColumns }
}
