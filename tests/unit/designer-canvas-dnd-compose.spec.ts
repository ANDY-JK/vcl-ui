/* useCanvasDnd 编排层 · 状态与会话（#453）
 *
 * 从 DesignerCanvas.vue 下沉的拖拽编排层：拖拽会话状态 + 画布/节点/槽位三层落点分发。
 * 本 spec 在最小 harness 上钉住：resetDrag 是唯一收口、会话态跨层共享。
 */
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useCanvasDnd } from '@/components/form-builder/designer/composables/useCanvasDnd'
import type { DesignerNode } from '@/components/form-builder/designer/types'

function node(id: string, type: string): DesignerNode {
  return { id, type, label: id } as unknown as DesignerNode
}

/** 拖拽事件桩：落点判定读 currentTarget 的矩形 */
function ev(over: Record<string, unknown> = {}): DragEvent {
  return {
    preventDefault: () => {},
    stopPropagation: () => {},
    currentTarget: { getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 100 }) },
    ...over,
  } as unknown as DragEvent
}

function dt(kind: 'field' | 'empty'): DataTransfer {
  return {
    getData: () => (kind === 'field' ? 'input' : ''),
    types: kind === 'field' ? ['application/x-field-type'] : ['text/plain'],
    dropEffect: 'copy',
    setData: () => {},
  } as unknown as DataTransfer
}

function harness() {
  const nodes = ref<DesignerNode[]>([])
  const calls: string[] = []
  const dnd = useCanvasDnd({
    nodes,
    isContainerNode: (n) => n.type === 'tabs' || n.type === 'card',
    activeSlotOf: () => 0,
    emit: {
      'insert-at': () => calls.push('insert-at'),
      'insert-into-container': () => calls.push('insert-into-container'),
      'sort-node': () => calls.push('sort-node'),
      'assign-slot': () => calls.push('assign-slot'),
      select: () => calls.push('select'),
    },
  })
  return { ...dnd, nodes, calls }
}

describe('useCanvasDnd · 会话状态', () => {
  it('resetDrag 是唯一收口：dragover 置位后 drop 归零', () => {
    const h = harness()
    h.onNodeDragStart(ev({ dataTransfer: dt('field') }), node('a', 'input'))
    expect(h.dragSource.value).toBe('sort')
    h.onNodeDragOver(ev({ dataTransfer: dt('field') }), node('b', 'input'))
    expect(h.dropTargetId.value).toBe('b')
    h.onNodeDrop(ev({ dataTransfer: dt('field') }), node('b', 'input'))
    expect(h.dragSource.value).toBe(null)
    expect(h.dropTargetId.value).toBe(null)
    expect(h.dropPos.value).toBe(null)
  })

  it('画布级 dragleave 越界才清会话（未越界不动）', () => {
    const h = harness()
    h.onNodeDragStart(ev({ dataTransfer: dt('field') }), node('a', 'input'))
    const inside = ev({ currentTarget: { getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 100 }) }, clientX: 50, clientY: 50 })
    h.onCanvasDragLeave(inside)
    expect(h.dragSource.value).toBe('sort')
    h.onCanvasDragLeave(ev({ clientX: 500, clientY: 50 }))
    expect(h.dragSource.value).toBe(null)
  })

  it('面板字段拖到容器 → insert-into-container', () => {
    const h = harness()
    h.onNodeDrop(ev({ dataTransfer: dt('field') }), node('c', 'tabs'))
    expect(h.calls).toEqual(['insert-into-container'])
  })

  it('槽位 drop：无来源不派发；排序源 → assign-slot', () => {
    const h = harness()
    h.onSlotDrop(ev({ dataTransfer: dt('empty') }), node('c', 'tabs'), 2)
    expect(h.calls).toEqual([])
    h.onNodeDragStart(ev({ dataTransfer: dt('field') }), node('a', 'input'))
    h.onSlotDrop(ev({ dataTransfer: dt('empty') }), node('c', 'tabs'), 2)
    expect(h.calls).toEqual(['assign-slot'])
  })

  it('反向保护：drop 无类型且非排序 → 不派发任何事件', () => {
    const h = harness()
    h.onNodeDrop(ev({ dataTransfer: dt('empty') }), node('b', 'input'))
    expect(h.calls).toEqual([])
  })

  it('会话泄漏保护：drop 后 canvasDragOver 一并复位', () => {
    const h = harness()
    h.canvasDragOver.value = true
    h.onNodeDragEnd()
    expect(h.canvasDragOver.value).toBe(false)
    expect(h.dragSource.value).toBe(null)
  })
})
