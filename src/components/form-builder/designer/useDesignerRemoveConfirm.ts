/**
 * useDesignerRemoveConfirm — 删除确认流（拆分自 FormDesigner.vue，超 800 行整改）
 *
 * 职责：容器带子节点 / 多选删除前弹确认。实际移除仍走 host.doRemoveNodes（useDesignerOps）。
 */
import { ref, type Ref } from 'vue'
import { findNode, isContainerNode, type DesignerNode } from './types'

export interface DesignerRemoveHost {
  /** 当前节点列表（getter 保持响应） */
  getNodes: () => DesignerNode[]
  /** 多选集合（Ctrl/Cmd+点选；空 = 单选模式） */
  selectedIds: Ref<Set<string>>
  /** 执行移除（来自 useDesignerOps，含撤销栈） */
  doRemoveNodes: (ids: string[]) => void
}

export function useDesignerRemoveConfirm(opts: DesignerRemoveHost) {
  /** 待删除节点 id（容器带子节点时需确认） */
  const pendingRemoveId = ref<string | null>(null)
  const pendingRemoveLabel = ref('')
  /** 待批量删除的 id 集合（多选删除确认用） */
  const pendingRemoveIds = ref<string[]>([])

  function removeNode(id: string): void {
    // 多选模式下：删除整个选中集合（含当前 id）
    if (opts.selectedIds.value.size > 0 && opts.selectedIds.value.has(id)) {
      const ids = [...opts.selectedIds.value]
      const hasContainerWithChildren = ids.some((nid) => {
        const n = findNode(opts.getNodes(), nid)
        return n && isContainerNode(n) && !!n.children?.length
      })
      if (hasContainerWithChildren || ids.length > 1) {
        pendingRemoveIds.value = ids
        return
      }
      opts.doRemoveNodes(ids)
      return
    }

    const node = findNode(opts.getNodes(), id)
    if (!node) return
    // 容器节点带子节点时，删除会连带删掉子字段，弹确认
    if (isContainerNode(node) && node.children?.length) {
      pendingRemoveId.value = id
      pendingRemoveLabel.value = node.label
      return
    }
    opts.doRemoveNodes([id])
  }

  function onConfirmRemove(): void {
    const id = pendingRemoveId.value
    pendingRemoveId.value = null
    pendingRemoveLabel.value = ''
    if (id) opts.doRemoveNodes([id])
  }

  function onConfirmRemoveBatch(): void {
    const ids = pendingRemoveIds.value
    pendingRemoveIds.value = []
    if (ids.length) opts.doRemoveNodes(ids)
  }

  return { pendingRemoveId, pendingRemoveLabel, pendingRemoveIds, removeNode, onConfirmRemove, onConfirmRemoveBatch }
}
