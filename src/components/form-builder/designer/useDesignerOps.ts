/**
 * 设计器节点操作 — 撤销/重做 + 节点增删改/剪贴板/排序
 *
 * 从 FormDesigner 拆出（超 800 行约束整改）：
 * - 历史栈（undo/redo）与树操作收敛于此，组件只保留选中态与删除确认流
 * - 所有操作前调 snapshot()，快照上限 50 条
 * - 对同一字段的连续属性编辑合并为一个撤销单元（editingPropId 跟踪）
 */
import { computed, ref, type Ref } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { deepClone, uuid } from '@/components/_internal/utils'
import {
  createField,
  findNode,
  findParent,
  flattenNodes,
  insertChildNode,
  insertNode,
  moveNodeRelative,
  removeNodeFromTree,
  updateNodeInTree,
  type DesignerContainerConfig,
  type DesignerNode,
  type DesignerNodeType,
} from './types'

const t = useT()

export interface DesignerOpsHost {
  /** 当前画布节点（getter 保持响应） */
  nodes: () => DesignerNode[]
  /** 画布整体替换（受控组件经 emit 回写） */
  patch: (list: DesignerNode[]) => void
  /** 主选中节点 id */
  selectedId: Ref<string | null>
  /** 多选集合（Ctrl/Cmd+点选） */
  selectedIds: Ref<Set<string>>
  /** 轻提示 */
  showTip: (msg: string) => void
}

export function useDesignerOps(host: DesignerOpsHost) {
  // ════════════════════════════════════════
  // 撤销/重做
  // ════════════════════════════════════════

  const undoStack = ref<DesignerNode[][]>([])
  const redoStack = ref<DesignerNode[][]>([])
  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  /** 当前正在做「属性编辑」的字段 id（用于把连续属性编辑合并为一个撤销单元） */
  let editingPropId: string | null = null

  /** 记录快照（每次操作前调用） */
  function snapshot(): void {
    undoStack.value.push(deepClone(host.nodes()))
    if (undoStack.value.length > 50) undoStack.value.shift()
    redoStack.value = []
    // 结构操作打断了属性编辑的连续性，重置跟踪，下次属性编辑重新快照
    editingPropId = null
  }

  function undo(): void {
    if (!undoStack.value.length) return
    redoStack.value.push(deepClone(host.nodes()))
    const prev = undoStack.value.pop()!
    host.patch(prev)
  }

  function redo(): void {
    if (!redoStack.value.length) return
    undoStack.value.push(deepClone(host.nodes()))
    const next = redoStack.value.pop()!
    host.patch(next)
  }

  // ════════════════════════════════════════
  // 节点操作（不可变更新 + 快照）
  // ════════════════════════════════════════

  /** 生成不与现有节点冲突的字段 key 序号（避免删除中间节点后 fieldN 撞 key 串数据） */
  function nextFieldSeq(): number {
    const used = new Set(flattenNodes(host.nodes()).map((n) => n.key))
    let i = used.size + 1
    while (used.has(`field${i}`)) i++
    return i
  }

  function addNode(type: DesignerNodeType): void {
    snapshot()
    const f = createField(type, nextFieldSeq())
    host.patch([...host.nodes(), f])
    host.selectedId.value = f.id
  }

  function insertAt(type: DesignerNodeType, index: number): void {
    snapshot()
    const f = createField(type, nextFieldSeq())
    host.patch(insertNode(host.nodes(), f, index))
    host.selectedId.value = f.id
  }

  function insertIntoContainer(type: DesignerNodeType, containerId: string, index: number, slot?: number): void {
    snapshot()
    const f = createField(type, nextFieldSeq())
    // tabs/collapse/steps 容器：记录字段所在槽位（第几个 tab/折叠项/步骤）
    if (slot !== undefined && slot >= 0) f.containerSlot = slot
    const updated = insertChildNode(host.nodes(), containerId, f, index)
    if (updated !== host.nodes()) {
      host.patch(updated)
      host.selectedId.value = f.id
    }
  }

  /** 把字段移动到 tabs/collapse/steps 容器的指定槽位 */
  function assignSlot(sourceId: string, slot: number): void {
    snapshot()
    const updated = updateNodeInTree(host.nodes(), sourceId, { containerSlot: slot })
    host.patch(updated)
  }

  /** 批量删除多个节点（单次快照；确认弹层流程在宿主组件） */
  function doRemoveNodes(ids: string[]): void {
    snapshot()
    let next = host.nodes()
    for (const id of ids) {
      next = removeNodeFromTree(next, id)
    }
    host.patch(next)
    if (host.selectedId.value && ids.includes(host.selectedId.value)) host.selectedId.value = null
    host.selectedIds.value = new Set()
  }

  function duplicateNode(id: string): void {
    snapshot()
    const node = findNode(host.nodes(), id)
    if (!node) return
    const copy = cloneNode(node)
    // 找到原节点位置，插入到后面
    const flat = flattenNodes(host.nodes())
    const idx = flat.findIndex((f) => f.id === id)
    if (idx >= 0) {
      host.patch(insertNode(host.nodes(), copy, idx + 1))
    } else {
      host.patch([...host.nodes(), copy])
    }
    host.selectedId.value = copy.id
  }

  // ════════════════════════════════════════
  // 复制/粘贴（Ctrl+C / Ctrl+V 跨会话剪贴板）
  // ════════════════════════════════════════

  /** 被复制的节点（深拷贝，避免后续编辑污染剪贴板内容） */
  let clipboardNode: DesignerNode | null = null

  /** 深拷贝节点并生成新 id（key 加 _copy 后缀避免重复） */
  function cloneNode(node: DesignerNode): DesignerNode {
    const copy: DesignerNode = deepClone(node)
    copy.id = uuid('n')
    if (node.key) copy.key = node.key + '_copy'
    // 递归重生成子节点 id，避免与新节点 id 冲突
    if (copy.children?.length) {
      const rekey = (list: DesignerNode[]): void => {
        for (const child of list) {
          child.id = uuid('n')
          if (child.children?.length) rekey(child.children)
        }
      }
      rekey(copy.children)
    }
    return copy
  }

  /** 复制选中节点到剪贴板 */
  function copyNode(id: string): void {
    const node = findNode(host.nodes(), id)
    if (!node) return
    clipboardNode = deepClone(node)
    host.showTip(t('formBuilder.copied'))
  }

  /** 粘贴剪贴板节点到选中节点之后（同父级） */
  function pasteNode(id: string): void {
    if (!clipboardNode) {
      host.showTip(t('formBuilder.nothingToPaste'))
      return
    }
    snapshot()
    const copy = cloneNode(clipboardNode)
    // 找到选中节点的父级和索引，插入到其后
    const loc = findParent(host.nodes(), id)
    if (!loc) {
      host.patch([...host.nodes(), copy])
    } else {
      const siblings = [...loc.parent]
      siblings.splice(loc.index + 1, 0, copy)
      if (loc.parent === host.nodes()) {
        host.patch(siblings)
      } else {
        const rebuild = (list: DesignerNode[]): DesignerNode[] =>
          list.map((n) => {
            if (n.children === loc.parent) return { ...n, children: siblings }
            if (n.children?.length) return { ...n, children: rebuild(n.children) }
            return n
          })
        host.patch(rebuild(host.nodes()))
      }
    }
    host.selectedId.value = copy.id
  }

  function moveNode(id: string, dir: -1 | 1): void {
    snapshot()
    // 定位节点所在层级，在其父级（根级或某容器 children）内交换
    const loc = findParent(host.nodes(), id)
    if (!loc) return
    const i = loc.index
    const j = i + dir
    if (j < 0 || j >= loc.parent.length) return
    const siblings = [...loc.parent]
    ;[siblings[i], siblings[j]] = [siblings[j], siblings[i]]
    // 根级直接 patch；容器内需重建树
    if (loc.parent === host.nodes()) {
      host.patch(siblings)
    } else {
      const rebuild = (list: DesignerNode[]): DesignerNode[] =>
        list.map((n) => {
          if (n.children === loc.parent) return { ...n, children: siblings }
          if (n.children?.length) return { ...n, children: rebuild(n.children) }
          return n
        })
      host.patch(rebuild(host.nodes()))
    }
  }

  function reorderNode(from: number, to: number): void {
    snapshot()
    const list = [...host.nodes()]
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved!)
    host.patch(list)
  }

  /**
   * 拖拽排序：跨容器移动节点
   *
   * slot：拖入 tabs/collapse/steps 容器内部时，把节点归入当前激活的槽位
   * （画布容器交互化后只展示激活槽位，落点必须与之保持一致）。
   */
  function sortNode(sourceId: string, targetId: string, position: 'before' | 'after' | 'inside', slot?: number): void {
    snapshot()
    let updated = moveNodeRelative(host.nodes(), sourceId, targetId, position)
    if (slot !== undefined && slot >= 0 && position === 'inside') {
      updated = updateNodeInTree(updated, sourceId, { containerSlot: slot })
    }
    host.patch(updated)
  }

  /** 更新容器配置（画布「+ 添加」标签页等操作，进撤销栈） */
  function updateContainerConfig(id: string, config: DesignerContainerConfig): void {
    snapshot()
    host.patch(updateNodeInTree(host.nodes(), id, { containerConfig: config }))
  }

  function updateNode(id: string, patchObj: Partial<DesignerNode>): void {
    // 属性编辑进撤销栈：对同一字段的连续编辑合并为一个撤销单元（首次编辑时快照一次）
    if (editingPropId !== id) {
      snapshot()
      editingPropId = id
    }
    host.patch(updateNodeInTree(host.nodes(), id, patchObj))
  }

  function onLabelChange(id: string, label: string): void {
    const node = findNode(host.nodes(), id)
    if (!node) return
    const autoKey = /^field\d+$/.test(node.key ?? '') || !node.key
    updateNode(id, { label, ...(autoKey ? { key: label.trim() || node.key } : {}) })
  }

  return {
    canUndo,
    canRedo,
    snapshot,
    undo,
    redo,
    addNode,
    insertAt,
    insertIntoContainer,
    assignSlot,
    doRemoveNodes,
    duplicateNode,
    copyNode,
    pasteNode,
    moveNode,
    reorderNode,
    sortNode,
    updateContainerConfig,
    updateNode,
    onLabelChange,
  }
}
