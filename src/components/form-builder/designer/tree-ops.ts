/**
 * 设计器节点树的操作函数 —— 从 `types/domain.ts` 拆出（2026-11-01，TD-54 前置）
 *
 * ## 为什么拆
 *
 * `domain.ts` 曾是「类型定义 + 运行时树操作」的混合体，809 行贴着 form-builder 域
 * 止涨线 810（余量 **1 行**）。下次任何人加一个字段都要先拆，否则 check:constants 直接红。
 * 树操作（扁平化/查找/增删改/移动，257 行）与类型定义没有耦合 ——
 * 抽出来既释放了余量，也让「数据结构的形状」与「对结构做手术的算法」各归其位。
 *
 * ## 边界
 *
 * 只依赖 `DesignerNode` 一个类型；不碰任何 UI、store、i18n。
 */
import type { DesignerNode } from './types/domain'
// ════════════════════════════════════════
// 树操作工具函数
// ════════════════════════════════════════

/**
 * 深度优先遍历节点树，返回所有节点（扁平化）
 */
export function flattenNodes(nodes: DesignerNode[]): DesignerNode[] {
  const result: DesignerNode[] = []
  function walk(list: DesignerNode[]): void {
    for (const node of list) {
      result.push(node)
      if (node.children?.length) walk(node.children)
    }
  }
  walk(nodes)
  return result
}

/**
 * 查找节点（深度优先）
 */
export function findNode(nodes: DesignerNode[], id: string): DesignerNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children?.length) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

/**
 * 查找节点的父节点和索引
 */
export function findParent(nodes: DesignerNode[], id: string): { parent: DesignerNode[]; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return { parent: nodes, index: i }
    if (nodes[i].children?.length) {
      const found = findParent(nodes[i].children!, id)
      if (found) return found
    }
  }
  return null
}

/**
 * 获取节点的路径链（从根到目标节点），用于面包屑导航
 * @returns 路径上的所有节点，从根容器到目标节点；找不到返回空数组
 */
export function getNodePath(nodes: DesignerNode[], id: string): DesignerNode[] {
  const path: DesignerNode[] = []
  function walk(list: DesignerNode[]): boolean {
    for (const node of list) {
      path.push(node)
      if (node.id === id) return true
      if (node.children?.length && walk(node.children)) return true
      path.pop()
    }
    return false
  }
  walk(nodes)
  return path
}

/**
 * 源节点能否移动到目标位置（第 176 轮）
 *
 * 两种非法移动都是"先移除再插入"顺序下的**数据丢失**来源，必须拒绝：
 *   ① 移到自己身上 —— 移除后目标消失，插入无处可去；
 *   ② 移进自己的子树 —— 源被移除时目标随之消失，实测整棵子树被丢弃（树变空）。
 */
function canMoveTo(nodes: DesignerNode[], sourceId: string, targetId: string): boolean {
  if (sourceId === targetId) return false
  const source = findNode(nodes, sourceId)
  if (!source) return false
  return !findNode(source.children ?? [], targetId)
}

/** 在容器内插入子节点；**容器不存在时退回根级追加**（否则"先移除"后节点再不会被插回） */
function insertChildOrRoot(
  nodes: DesignerNode[],
  containerId: string,
  child: DesignerNode,
  index: number,
): DesignerNode[] {
  if (!findNode(nodes, containerId)) return insertNode(nodes, child, -1)
  return insertChildNode(nodes, containerId, child, index)
}

/**
 * 不可变更新：将源节点移动到目标节点的 before/after/inside 位置
 * 支持跨容器移动
 */
export function moveNodeRelative(
  nodes: DesignerNode[],
  sourceId: string,
  targetId: string,
  position: 'before' | 'after' | 'inside',
): DesignerNode[] {
  if (!canMoveTo(nodes, sourceId, targetId)) return nodes // 非法移动见 canMoveTo 注释
  const sourceNode = findNode(nodes, sourceId)
  if (!sourceNode) return nodes
  let result = removeNodeFromTree(nodes, sourceId)

  // 2. 根据位置插入
  if (position === 'inside') {
    // 插入到目标容器内（末尾）
    result = insertChildOrRoot(result, targetId, sourceNode, -1)
  } else {
    // before/after：找到目标节点的父级和索引
    const targetParent = findParent(result, targetId)
    if (!targetParent) {
      // 目标找不到，追加到根级末尾
      result = insertNode(result, sourceNode, -1)
    } else {
      const insertIdx = position === 'before' ? targetParent.index : targetParent.index + 1
      // 如果目标是根级
      if (targetParent.parent === result) {
        result = insertNode(result, sourceNode, insertIdx)
      } else {
        // 目标在某个容器内 — 需要重建路径
        result = moveNodeRelativeInTree(result, sourceNode, targetId, insertIdx)
      }
    }
  }

  return result
}

/**
 * 辅助：沿"目标所在的那条路径"重建树并插入源节点
 *
 * 第 176 轮修掉一处复制缺陷：原实现对**不含目标**的分支也 `insertNode(..., -1)`，
 * 把源节点追加进了每一个无关容器（实测一次拖拽字段同时出现在两个容器里）。
 */
function moveNodeRelativeInTree(
  nodes: DesignerNode[],
  sourceNode: DesignerNode,
  targetId: string,
  insertIdx: number,
): DesignerNode[] {
  const targetParent = findParent(nodes, targetId)
  if (!targetParent) return nodes // 目标不在这棵子树里：什么都不做，绝不插入

  if (targetParent.parent === nodes) {
    return insertNode(nodes, sourceNode, insertIdx)
  }

  // 只在"直接包含目标父级数组"的那个容器上重建，其余分支原样返回
  return nodes.map((node) => {
    if (node.children === targetParent.parent) {
      return { ...node, children: insertNode(node.children, sourceNode, insertIdx) }
    }
    if (node.children?.length && findParent(node.children, targetId)) {
      return { ...node, children: moveNodeRelativeInTree(node.children, sourceNode, targetId, insertIdx) }
    }
    return node
  })
}

/**
 * 不可变更新：替换节点树中指定 id 的节点
 */
export function updateNodeInTree(nodes: DesignerNode[], id: string, patch: Partial<DesignerNode>): DesignerNode[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return { ...node, ...patch }
    }
    if (node.children?.length) {
      return { ...node, children: updateNodeInTree(node.children, id, patch) }
    }
    return node
  })
}

/**
 * 不可变更新：删除节点树中指定 id 的节点
 */
export function removeNodeFromTree(nodes: DesignerNode[], id: string): DesignerNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => {
      if (node.children?.length) {
        return { ...node, children: removeNodeFromTree(node.children, id) }
      }
      return node
    })
}

/**
 * 不可变更新：在指定位置插入节点
 * @param nodes 节点列表
 * @param node 要插入的节点
 * @param index 插入位置（-1 或超出长度则追加到末尾）
 */
export function insertNode(nodes: DesignerNode[], node: DesignerNode, index: number): DesignerNode[] {
  const list = [...nodes]
  if (index < 0 || index >= list.length) {
    list.push(node)
  } else {
    list.splice(index, 0, node)
  }
  return list
}

/**
 * 不可变更新：在容器节点的 children 中插入子节点
 */
export function insertChildNode(
  nodes: DesignerNode[],
  containerId: string,
  child: DesignerNode,
  index: number = -1,
): DesignerNode[] {
  return nodes.map((node) => {
    if (node.id === containerId && node.children !== undefined) {
      return { ...node, children: insertNode(node.children, child, index) }
    }
    if (node.children?.length) {
      return { ...node, children: insertChildNode(node.children, containerId, child, index) }
    }
    return node
  })
}

/**
 * 不可变更新：移动节点（从原位置移到新位置）
 */
export function moveNodeInTree(
  nodes: DesignerNode[],
  fromId: string,
  toParentId: string | null,
  toIndex: number,
): DesignerNode[] {
  // 0. 非法移动（移进自己的子树 / 移到自己所在的容器自身）直接拒绝（第 176 轮）
  //    与 moveNodeRelative 同口径：先移除再插入，目标若随源一起被移除就必然丢数据
  if (toParentId !== null && !canMoveTo(nodes, fromId, toParentId)) return nodes

  // 1. 找到并移除原节点
  const movingNode = findNode(nodes, fromId)
  if (!movingNode) return nodes

  let result = removeNodeFromTree(nodes, fromId)

  // 2. 插入到目标位置
  if (toParentId === null) {
    // 插入到根级
    result = insertNode(result, movingNode, toIndex)
  } else {
    // 插入到目标容器；容器不存在时退回根级追加，绝不丢节点
    result = insertChildOrRoot(result, toParentId, movingNode, toIndex)
  }

  return result
}
