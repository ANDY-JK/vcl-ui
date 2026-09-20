/**
 * useDesignerShortcuts — 设计器画布键盘快捷键（拆分自 FormDesigner.vue，超 800 行整改）
 *
 * 职责：画布聚焦时的 ?/Delete/Ctrl+Z/Y/D/C/V/方向键 快捷键分发。
 * 具体操作仍走 useDesignerOps / useDesignerRemoveConfirm，本 composable 只做按键 → 动作映射。
 */
import type { Ref } from 'vue'

export interface DesignerShortcutsHost {
  /** 撤销 / 重做 */
  undo: () => void
  redo: () => void
  /** 删除（含容器/多选确认流，来自 useDesignerRemoveConfirm） */
  removeNode: (id: string) => void
  /** 结构操作（来自 useDesignerOps；dir = -1 上移 / 1 下移，沿用 ops 的窄类型） */
  duplicateNode: (ids: string[]) => void
  copyNode: (ids: string[]) => void
  pasteNode: (id: string) => void
  moveNode: (ids: string[], dir: -1 | 1) => void
  /** 快捷键帮助弹层开关 */
  showShortcuts: Ref<boolean>
  /** 主选中节点 */
  selectedId: Ref<string | null>
  /** 多选集合（Ctrl/Cmd+点选；空 = 单选模式） */
  selectedIds: Ref<Set<string>>
}

export function useDesignerShortcuts(opts: DesignerShortcutsHost) {
  function onCanvasKeydown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    // ? 键呼出快捷键帮助（无需选中节点）
    if (e.key === '?') {
      e.preventDefault()
      opts.showShortcuts.value = !opts.showShortcuts.value
      return
    }

    // 撤销/重做不依赖选中节点
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      opts.undo()
      return
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault()
      opts.redo()
      return
    }

    if (!opts.selectedId.value) return
    const id = opts.selectedId.value
    // 多选模式下结构操作作用于整个选中集合（删除在上游 removeNode 已处理）
    const ids = opts.selectedIds.value.size ? [...opts.selectedIds.value] : [id]

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      opts.removeNode(id)
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault()
      opts.duplicateNode(ids)
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault()
      opts.copyNode(ids)
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault()
      opts.pasteNode(id)
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp') {
      e.preventDefault()
      opts.moveNode(ids, -1)
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowDown') {
      e.preventDefault()
      opts.moveNode(ids, 1)
    }
  }

  return { onCanvasKeydown }
}
