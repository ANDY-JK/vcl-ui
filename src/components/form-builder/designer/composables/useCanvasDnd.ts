/**
 * useCanvasDnd — DesignerCanvas 的拖拽编排层（#453 从 DesignerCanvas.vue 下沉）
 *
 * 之前 canvas-utils.ts 收的是**纯函数**（落点判定/选中态/指示线），这里收**带状态的编排**：
 * 拖拽会话（dragSource/sortDragId/dropTargetId/dropPos）、画布级 drop、节点级 dragover/drop、
 * 槽位级 drop —— 三层落点的分发与「谁清拖拽态」的收口。
 *
 * emit 通过 handlers 注入（对象里的 5 个事件 + select），拖拽态归本文件所有。
 */
import { ref, type Ref } from 'vue'
import type { DesignerNode, DesignerNodeType } from '../types'
import { findContainerOfChildren, resolveDropPos as resolveDropPosPure } from '../canvas-utils'
import { findParent } from '../tree-ops'

export interface CanvasDndOptions {
  nodes: Ref<DesignerNode[]>
  isContainerNode: (n: DesignerNode) => boolean
  activeSlotOf: (n: DesignerNode) => number | undefined
  emit: {
    'insert-at': (type: DesignerNodeType, index: number) => void
    'insert-into-container': (type: DesignerNodeType, containerId: string, index: number, slot?: number) => void
    'sort-node': (...args: [string, string, 'before' | 'after' | 'inside', number?]) => void
    'assign-slot': (sourceId: string, slot: number) => void
    select: (id: string, multi?: boolean) => void
  }
}

export function useCanvasDnd(o: CanvasDndOptions) {
  const dragSource = ref<'panel' | 'sort' | null>(null)
  const sortDragId = ref<string | null>(null)
  const dropTargetId = ref<string | null>(null)
  /** 落点位置：before/after 显示指示线，inside 显示容器内高亮 */
  const dropPos = ref<'before' | 'after' | 'inside' | null>(null)
  const canvasDragOver = ref(false)

  function resetDrag(): void {
    dragSource.value = null
    sortDragId.value = null
    dropTargetId.value = null
    dropPos.value = null
    canvasDragOver.value = false
  }

  // ── 槽位层 ──
  function onSlotDropFromPanel(e: DragEvent, node: DesignerNode, slot: number): void {
    const type = e.dataTransfer?.getData('application/x-field-type') || e.dataTransfer?.getData('text/plain')
    if (!type) return
    e.preventDefault()
    e.stopPropagation()
    o.emit['insert-into-container'](type as DesignerNodeType, node.id, -1, slot)
    resetDrag()
  }

  function onSlotDropFromSort(e: DragEvent, _node: DesignerNode, slot: number): void {
    e.preventDefault()
    e.stopPropagation()
    const sourceId = sortDragId.value
    if (sourceId) o.emit['assign-slot'](sourceId, slot)
    resetDrag()
  }

  function onSlotDrop(e: DragEvent, node: DesignerNode, slot: number): void {
    if (dragSource.value === 'sort' && sortDragId.value) {
      onSlotDropFromSort(e, node, slot)
    } else if (e.dataTransfer?.types.includes('application/x-field-type')) {
      onSlotDropFromPanel(e, node, slot)
    }
  }

  function onSlotDragOver(e: DragEvent): void {
    if (e.dataTransfer?.types.includes('application/x-field-type') || dragSource.value === 'sort') {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    }
  }

  // ── 画布层 ──
  function onCanvasDragOver(e: DragEvent): void {
    if (e.dataTransfer?.types.includes('application/x-field-type')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      canvasDragOver.value = true
    }
  }

  function onCanvasDragLeave(e: DragEvent): void {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) {
      resetDrag()
    }
  }

  function onCanvasDrop(e: DragEvent): void {
    e.preventDefault()
    e.stopPropagation()
    const type = e.dataTransfer?.getData('application/x-field-type') || e.dataTransfer?.getData('text/plain')
    if (type) o.emit['insert-at'](type as DesignerNodeType, -1)
    resetDrag()
  }

  // ── 节点层 ──
  function onNodeDragStart(e: DragEvent, node: DesignerNode): void {
    dragSource.value = 'sort'
    sortDragId.value = node.id
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/sort', node.id)
    }
  }

  function onNodeDragOver(e: DragEvent, node: DesignerNode): void {
    if (dragSource.value === 'sort' && sortDragId.value !== node.id) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer!.dropEffect = 'move'
      dropTargetId.value = node.id
      dropPos.value = resolveDropPosPure(e, node, true)
    } else if (e.dataTransfer?.types.includes('application/x-field-type')) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
      dropTargetId.value = node.id
      dropPos.value = resolveDropPosPure(e, node, false)
    }
  }

  function onNodeDrop(e: DragEvent, node: DesignerNode): void {
    e.preventDefault()
    e.stopPropagation()
    const pos = dropPos.value ?? resolveDropPosPure(e, node, dragSource.value === 'sort')

    if (dragSource.value === 'sort' && sortDragId.value && sortDragId.value !== node.id) {
      if (o.isContainerNode(node)) {
        if (pos === 'inside') o.emit['sort-node'](sortDragId.value, node.id, 'inside', o.activeSlotOf(node))
        else o.emit['sort-node'](sortDragId.value, node.id, pos)
      } else {
        o.emit['sort-node'](sortDragId.value, node.id, pos === 'after' ? 'after' : 'before')
      }
      o.emit.select(sortDragId.value)
    } else {
      const type = e.dataTransfer?.getData('application/x-field-type') || e.dataTransfer?.getData('text/plain')
      if (type) {
        if (o.isContainerNode(node)) {
          o.emit['insert-into-container'](type as DesignerNodeType, node.id, -1, o.activeSlotOf(node))
        } else {
          const before = pos !== 'after'
          const loc = findParent(o.nodes.value, node.id)
          // 嵌套子字段：插到它所在容器内的相对位置；否则会落到根级末尾
          const container =
            loc && loc.parent !== o.nodes.value ? findContainerOfChildren(o.nodes.value, loc.parent) : null
          if (container) {
            o.emit['insert-into-container'](
              type as DesignerNodeType,
              container.id,
              before ? loc!.index : loc!.index + 1,
              node.containerSlot,
            )
          } else {
            const index = o.nodes.value.findIndex((n) => n.id === node.id)
            o.emit['insert-at'](type as DesignerNodeType, before ? index : index + 1)
          }
        }
      }
    }
    resetDrag()
  }

  function onNodeDragEnd(): void {
    resetDrag()
  }

  return {
    dragSource,
    sortDragId,
    dropTargetId,
    dropPos,
    canvasDragOver,
    resetDrag,
    onSlotDrop,
    onSlotDropFromPanel,
    onSlotDropFromSort,
    onSlotDragOver,
    onCanvasDragOver,
    onCanvasDragLeave,
    onCanvasDrop,
    onNodeDragStart,
    onNodeDragOver,
    onNodeDrop,
    onNodeDragEnd,
  }
}
