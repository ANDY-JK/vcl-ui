/**
 * canvas-utils — 设计器画布的纯函数辅助（拆分自 DesignerCanvas.vue，超 800 行整改）
 *
 * 收三类纯逻辑：拖拽落点计算（网格跨度/容器定位/鼠标分区）、选中与指示线判定、
 * 预览假数据按字段类型的初始值归一。全部无副作用、无组件状态，可按域单测独立覆盖。
 */
import { isContainerNode, type DesignerNode } from './types'

/** 选中态判定：单选命中 或 在多选集合内 */
export function isSelected(
  id: string,
  selectedId: string | null,
  selectedIds: string[],
): boolean {
  return id === selectedId || selectedIds.includes(id)
}

/** 节点是否显示指定位置的落点指示线 */
export function showIndicator(
  id: string,
  pos: 'before' | 'after',
  dropTargetId: string | null,
  dropPos: 'before' | 'after' | 'inside' | null,
): boolean {
  return dropTargetId === id && dropPos === pos
}

/** 子卡片应显示的落点（未命中该子卡片时为 null） */
export function childDropPos(
  id: string,
  dropTargetId: string | null,
  dropPos: 'before' | 'after' | 'inside' | null,
): 'before' | 'after' | 'inside' | null {
  return dropTargetId === id ? dropPos : null
}

/** 网格容器栅格跨度换算：24 栏制按容器列数折算 */
export function gridColSpan(node: DesignerNode, child: DesignerNode): number {
  const columns = Math.max(1, node.containerConfig?.columns ?? 2)
  const raw = Math.min(Math.max(1, child.span ?? 24), 24)
  return Math.max(1, Math.min(columns, Math.round((raw / 24) * columns)))
}

/** 找到 children 数组 === 目标数组的容器节点（面板字段拖到嵌套子字段上时，定位应插入的容器） */
export function findContainerOfChildren(
  list: DesignerNode[],
  children: DesignerNode[],
): DesignerNode | null {
  for (const n of list) {
    if (n.children === children) return n
    if (n.children?.length) {
      const found = findContainerOfChildren(n.children, children)
      if (found) return found
    }
  }
  return null
}

/**
 * 根据鼠标纵向位置算出落点：容器 25/50/25 分三区，字段 50/50 分两区。
 * sortDrag = 字段排序拖拽（true）还是面板新字段拖入（false）。
 */
export function resolveDropPos(
  e: DragEvent,
  node: DesignerNode,
  sortDrag: boolean,
): 'before' | 'after' | 'inside' {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const ratio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0
  if (isContainerNode(node)) {
    // 面板拖入容器：一律放进容器内；排序拖拽才区分容器前后
    if (!sortDrag) return 'inside'
    if (ratio < 0.25) return 'before'
    if (ratio > 0.75) return 'after'
    return 'inside'
  }
  return ratio < 0.5 ? 'before' : 'after'
}

/**
 * 预览用的假数据：按字段类型生成可渲染的初始值（含容器递归）。
 * 与 FormRenderer 的默认值口径保持一致，改这里先跑 designer 预览回归。
 */
export function previewFakeData(nodes: DesignerNode[]): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  // 递归遍历所有节点（包括容器子节点）
  function walkAll(list: DesignerNode[]): void {
    for (const f of list) {
      if (isContainerNode(f)) {
        if (f.children?.length) walkAll(f.children)
        continue
      }
      const key = f.key ?? f.id
      if (f.type === 'text' || f.type === 'textarea') data[key] = f.placeholder ?? ''
      else if (f.type === 'number' || f.type === 'slider') data[key] = f.min ?? 0
      else if (f.type === 'select' || f.type === 'cascader') data[key] = null
      else if (f.type === 'radio') data[key] = f.options?.[0] ?? ''
      else if (f.type === 'checkbox') data[key] = (f.options?.length ?? 0) > 1 ? [f.options![0]] : []
      else if (f.type === 'switch') data[key] = false
      else if (f.type === 'rate') data[key] = Math.ceil((f.rateMax ?? 5) / 2)
      else if (f.type === 'date' || f.type === 'time') data[key] = null
      else if (f.type === 'upload') data[key] = []
      // v3 高级字段初始值
      else if (f.type === 'subform') data[key] = []
      else if (f.type === 'relate') data[key] = null
      else if (f.type === 'richtext') data[key] = ''
      else if (f.type === 'signature') data[key] = ''
      else if (f.type === 'address') data[key] = ''
      else if (f.type === 'idcard') data[key] = ''
      else if (f.type === 'matrix') data[key] = {}
      else if (f.type === 'serial') data[key] = null
      else data[key] = null
    }
  }
  walkAll(nodes)
  return data
}
