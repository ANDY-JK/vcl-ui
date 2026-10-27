/**
 * 设计器节点操作 — 撤销/重做 + 节点增删改/剪贴板/排序
 *
 * 从 FormDesigner 拆出（超 800 行约束整改）：
 * - 历史栈（undo/redo）与树操作收敛于此，组件只保留选中态与删除确认流
 * - 所有操作前调 snapshot()，历史按「步数上限 50 + 内存预算 8MB」两条裁（见 snapshot 节注释）
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
  type FormMeta,
} from './types'
import { collectFieldKeys, uniquifyFieldKey } from './key-utils'

const t = useT()

/** 快照条目：meta=null 表示该历史操作不涉及表单设置（恢复时不动 meta） */
export interface DesignerSnapshot {
  nodes: DesignerNode[]
  meta: FormMeta | null
  /**
   * 快照生成时"正在编辑哪份表单"（第 149 轮）。
   *
   * 为什么历史要记它：打开确认弹窗写着「将替换画布（可撤销）」，而 `currentFormId`
   * 由 `useFormManager` 单独持有 —— 撤销只恢复画布、不碰身份，就会出现
   * **画布是 A、身份是 B** 的错位，接着点保存就把 A 的内容写进 B（静默数据损坏）。
   * 历史与身份必须同进同退。
   */
  formId: string | null
}

export interface DesignerOpsHost {
  /** 当前画布节点（getter 保持响应） */
  nodes: () => DesignerNode[]
  /** 当前表单元信息（撤销覆盖 meta 用） */
  meta: () => FormMeta
  /** 画布整体替换（受控组件经 emit 回写） */
  patch: (list: DesignerNode[]) => void
  /** 画布 + meta 整体替换（undo/redo 恢复用；meta=null 时不动 meta） */
  patchAll: (nodes: DesignerNode[], meta: FormMeta | null) => void
  /** 主选中节点 id */
  selectedId: Ref<string | null>
  /** 多选集合（Ctrl/Cmd+点选） */
  selectedIds: Ref<Set<string>>
  /** 轻提示 */
  showTip: (msg: string) => void
  /** 读取"当前正在编辑哪份表单"（可空 = 未命名新表单）；不传则历史不记身份 */
  formId?: () => string | null
  /** 恢复表单身份（撤销/重做到跨表单的那一步时调用） */
  restoreFormId?: (id: string | null) => void
}

export function useDesignerOps(host: DesignerOpsHost) {
  // ════════════════════════════════════════
  // 撤销/重做
  // ════════════════════════════════════════

  // 栈本体刻意留在响应式之外：快照是整棵节点树的深对象，放进 ref 会被逐层代理，
  // 实测同一份 100 字段数组 JSON.stringify 在原始对象上 0.8ms、被代理后 17.4ms（22 倍），
  // 而撤销/重做每步都要整树序列化 + 反序列化各一趟。
  // UI 只关心"还能不能撤/还能不能重做"，所以用一个深度计数驱动 computed。
  const undoStack: DesignerSnapshot[] = []
  const redoStack: DesignerSnapshot[] = []
  const historyDepth = ref({ undo: 0, redo: 0 })
  const canUndo = computed(() => historyDepth.value.undo > 0)
  const canRedo = computed(() => historyDepth.value.redo > 0)

  /** 当前正在做「属性编辑」的字段 id（用于把连续属性编辑合并为一个撤销单元） */
  let editingPropId: string | null = null
  /** 当前正在连续编辑的 meta 键（同键合并为一个撤销单元） */
  let editingMetaKey: string | null = null

  /**
   * 撤销深度 —— 产品口径的「能往回退几步」，不是内存约束。
   * 实测代价（300 字段表单、真实 createField 结构）：单快照 ≈34KB，两条栈满打 ≈3.3MB，
   * 也就是说 50 步在内存上完全负担得起，收窄步数省不出有意义的资源。
   */
  const HISTORY_STEPS = 50
  /**
   * 历史栈内存预算 —— 兜的是「单快照异常巨大」那种表单（整段富文本、超长 options 列表）。
   * 正常表单撞不到它（预算是上面实测满栈量的 2 倍多），所以实际起作用的一般只有步数一条。
   */
  const HISTORY_BUDGET_BYTES = 8 * 1024 * 1024
  /** 快照序列化长度只量一次，入栈时记下、出栈时取回，避免每次裁剪重复 stringify */
  const _sizes = new WeakMap<DesignerSnapshot, number>()

  let _undoBytes = 0
  let _redoBytes = 0

  function _sizeOf(s: DesignerSnapshot): number {
    let n = _sizes.get(s)
    if (n === undefined) {
      try {
        n = JSON.stringify(s).length
      } catch {
        n = HISTORY_BUDGET_BYTES // 循环引用等极端情况按「巨大」处理，保证预算裁得到它
      }
      _sizes.set(s, n)
    }
    return n
  }

  /** 栈内容不参与响应式，改完显式同步一次深度给 canUndo/canRedo */
  const _syncDepth = () => {
    historyDepth.value = { undo: undoStack.length, redo: redoStack.length }
  }

  const _pushUndo = (s: DesignerSnapshot) => {
    undoStack.push(s)
    _undoBytes += _sizeOf(s)
  }
  const _pushRedo = (s: DesignerSnapshot) => {
    redoStack.push(s)
    _redoBytes += _sizeOf(s)
  }
  const _popUndo = () => {
    const s = undoStack.pop()
    if (s) _undoBytes -= _sizeOf(s)
    return s
  }
  const _popRedo = () => {
    const s = redoStack.pop()
    if (s) _redoBytes -= _sizeOf(s)
    return s
  }
  /** 新操作会作废重做链，整条清掉（计数同步归零，不留悬空累计） */
  const _clearRedo = () => {
    redoStack.length = 0
    _redoBytes = 0
  }
  const _dropOldestUndo = () => {
    const dropped = undoStack.shift()
    if (dropped) _undoBytes -= _sizeOf(dropped)
  }
  /** 先按步数裁、再按两条栈合计的预算裁；按预算裁时留住最新一条，不把栈清空 */
  function _trimHistory() {
    while (undoStack.length > HISTORY_STEPS) _dropOldestUndo()
    while (undoStack.length > 1 && _undoBytes + _redoBytes > HISTORY_BUDGET_BYTES) _dropOldestUndo()
  }

  /** 记录快照（每次结构操作前调用；nodes+meta 整组入栈） */
  function snapshot(): void {
    _pushUndo({
      nodes: deepClone(host.nodes()),
      meta: deepClone(host.meta()),
      formId: host.formId?.() ?? null,
    })
    _clearRedo()
    _trimHistory()
    _syncDepth()
    // 结构操作打断了连续编辑，重置跟踪，下次编辑重新快照
    editingPropId = null
    editingMetaKey = null
  }

  /**
   * meta 编辑专用快照（表单设置面板 patchMeta 调用）：
   * 同一键的连续输入合并为一个撤销单元（首次编辑时快照一次）
   */
  function snapshotMeta(key: string): void {
    if (editingMetaKey !== key) {
      snapshot()
      editingMetaKey = key
    }
  }

  function undo(): void {
    if (!undoStack.length) return
    _pushRedo({
      nodes: deepClone(host.nodes()),
      meta: deepClone(host.meta()),
      formId: host.formId?.() ?? null,
    })
    const prev = _popUndo()!
    // 重做链变长后两条栈合计可能超预算 → 挤掉最老的撤销步
    _trimHistory()
    _syncDepth()
    host.patchAll(prev.nodes, prev.meta)
    // 身份跟着历史走：否则"画布是 A、身份还是 B"，一保存就写错表单
    host.restoreFormId?.(prev.formId)
  }

  function redo(): void {
    if (!redoStack.length) return
    _pushUndo({
      nodes: deepClone(host.nodes()),
      meta: deepClone(host.meta()),
      formId: host.formId?.() ?? null,
    })
    const next = _popRedo()!
    _syncDepth()
    host.patchAll(next.nodes, next.meta)
    host.restoreFormId?.(next.formId)
  }

  // ════════════════════════════════════════
  // 节点操作（不可变更新 + 快照）
  // ════════════════════════════════════════

  /** 生成不与现有节点冲突的字段 key 序号（避免删除中间节点后 fieldN 撞 key 串数据） */
  function nextFieldSeq(): number {
    const used = collectFieldKeys(host.nodes())
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

  function duplicateNode(ids: string | string[]): void {
    const idList = Array.isArray(ids) ? ids : [ids]
    if (!idList.length) return
    snapshot()
    const flat = flattenNodes(host.nodes())
    const order = new Map(flat.map((n, i) => [n.id, i]))
    // 一次性构造目标树：对每个源节点（升序），克隆件插在「原节点或前一个克隆件」之后。
    // 不能循环逐个 patch——受控 props 回写是异步的，循环内 host.nodes() 拿不到上一轮结果，
    // 第二次插入会基于旧树覆盖第一次写入（表现为多选批量复制只 +1）。
    let next = host.nodes()
    const used = collectFieldKeys(next)
    const copyIds: string[] = []
    const ordered = idList.filter((id) => order.has(id)).sort((a, b) => order.get(a)! - order.get(b)!)
    for (const id of ordered) {
      const node = findNode(next, id)
      if (!node) continue
      const copy = cloneNode(node, used)
      // 插入到源节点的同父级之后：容器内子字段复制后仍留在原容器（扁平索引插根级会跑到画布末尾）
      const loc = findParent(next, id)
      if (!loc) {
        next = [...next, copy]
      } else {
        const siblings = [...loc.parent]
        siblings.splice(loc.index + 1, 0, copy)
        next = replaceSiblings(next, loc.parent, siblings)
      }
      copyIds.push(copy.id)
    }
    host.patch(next)
    if (copyIds.length) host.selectedId.value = copyIds[0]!
  }

  // ════════════════════════════════════════
  // 复制/粘贴（Ctrl+C / Ctrl+V 跨会话剪贴板）
  // ════════════════════════════════════════

  /** 被复制的节点（深拷贝数组，避免后续编辑污染剪贴板；id 在粘贴时重新生成） */
  let clipboardNodes: DesignerNode[] = []

  /** 深拷贝节点并生成新 id / 新 key（key 经 uniquifyFieldKey 去重；子字段 key 同样重排——
   *  旧实现只重排 id，复制带子字段的容器会出现两份相同子 key，formData 互相覆盖） */
  function cloneNode(node: DesignerNode, used: Set<string>): DesignerNode {
    const copy: DesignerNode = deepClone(node)
    copy.id = uuid('n')
    if (copy.key) {
      copy.key = uniquifyFieldKey(copy.key + '_copy', used)
      used.add(copy.key)
    }
    // 递归重生成子节点 id 与 key，避免与新节点冲突
    const rekey = (list: DesignerNode[]): void => {
      for (const child of list) {
        child.id = uuid('n')
        if (child.key) {
          child.key = uniquifyFieldKey(child.key + '_copy', used)
          used.add(child.key)
        }
        if (child.children?.length) rekey(child.children)
      }
    }
    if (copy.children?.length) rekey(copy.children)
    return copy
  }

  /** 复制节点到剪贴板（支持多选数组，保持传入顺序） */
  function copyNode(ids: string | string[]): void {
    const idList = Array.isArray(ids) ? ids : [ids]
    const nodes: DesignerNode[] = []
    for (const id of idList) {
      const node = findNode(host.nodes(), id)
      if (node) nodes.push(deepClone(node))
    }
    if (!nodes.length) return
    clipboardNodes = nodes
    host.showTip(t('formBuilder.copied'))
  }

  /** 兄弟数组替换后的树重建（纯函数：根级返回新数组，容器内按引用回填） */
  function replaceSiblings(root: DesignerNode[], parent: DesignerNode[], siblings: DesignerNode[]): DesignerNode[] {
    if (parent === root) return siblings
    const rebuild = (list: DesignerNode[]): DesignerNode[] =>
      list.map((n) => {
        if (n.children === parent) return { ...n, children: siblings }
        if (n.children?.length) return { ...n, children: rebuild(n.children) }
        return n
      })
    return rebuild(root)
  }

  /** 粘贴剪贴板节点到选中节点之后（同父级，多个按序排列；单次 patch——受控回写异步，循环内不可多次 patch） */
  function pasteNode(id: string): void {
    if (!clipboardNodes.length) {
      host.showTip(t('formBuilder.nothingToPaste'))
      return
    }
    snapshot()
    let next = host.nodes()
    const used = collectFieldKeys(next)
    let anchor = id
    let lastId = ''
    for (const raw of clipboardNodes) {
      const copy = cloneNode(raw, used)
      const loc = findParent(next, anchor)
      if (!loc) {
        next = [...next, copy]
      } else {
        const siblings = [...loc.parent]
        siblings.splice(loc.index + 1, 0, copy)
        next = replaceSiblings(next, loc.parent, siblings)
      }
      anchor = copy.id
      lastId = copy.id
    }
    host.patch(next)
    host.selectedId.value = lastId || null
  }

  /** 批量上移/下移：块移动语义——选中块与外部邻居交换，相邻选中节点间不互相穿越（单次 patch） */
  function moveNode(ids: string | string[], dir: -1 | 1): void {
    const idList = Array.isArray(ids) ? ids : [ids]
    if (!idList.length) return
    snapshot()
    const idSet = new Set(idList)
    // dir=-1 升序处理（顶部块先交换）；dir=+1 降序（底部块先交换）
    const flat = flattenNodes(host.nodes())
    const order = new Map(flat.map((n, i) => [n.id, i]))
    const ordered = idList
      .filter((id) => order.has(id))
      .sort((a, b) => (dir === -1 ? order.get(a)! - order.get(b)! : order.get(b)! - order.get(a)!))
    let next = host.nodes()
    for (const id of ordered) {
      const loc = findParent(next, id)
      if (!loc) continue
      const i = loc.index
      const j = i + dir
      const neighbor = loc.parent[j]
      if (!neighbor || idSet.has(neighbor.id)) continue
      const siblings = [...loc.parent]
      ;[siblings[i], siblings[j]] = [siblings[j], siblings[i]]
      next = replaceSiblings(next, loc.parent, siblings)
    }
    host.patch(next)
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
    // key 统一闸口：非空 + 全树唯一（重复 key 会让 formData 互相覆盖）。
    // 冲突时丢弃本次 key 修改并提示，其余属性照常写入；label 联动改名路径
    // 在 onLabelChange 自行降级，不会把冲突 key 递到这里
    let patch = patchObj
    if (patch.key !== undefined) {
      const node = findNode(host.nodes(), id)
      const nextKey = String(patch.key).trim()
      const changed = nextKey !== (node?.key ?? '')
      if (changed && (!nextKey || collectFieldKeys(host.nodes()).has(nextKey))) {
        host.showTip(nextKey ? t('fbd.keyDuplicate') : t('fbd.keyRequired'))
        const rest = { ...patch }
        delete rest.key
        if (!Object.keys(rest).length) return
        patch = rest
      } else if (changed) {
        patch = { ...patch, key: nextKey }
      }
    }
    // 属性编辑进撤销栈：对同一字段的连续编辑合并为一个撤销单元（首次编辑时快照一次）
    if (editingPropId !== id) {
      snapshot()
      editingPropId = id
    }
    host.patch(updateNodeInTree(host.nodes(), id, patch))
  }

  function onLabelChange(id: string, label: string): void {
    const node = findNode(host.nodes(), id)
    if (!node) return
    const autoKey = /^field\d+$/.test(node.key ?? '') || !node.key
    const patch: Partial<DesignerNode> = { label }
    if (autoKey) {
      // 标签同步进 key 仅限 \w+（extractFields 的 {{key}} 依赖此格式，中文/连字符 key 会断联动），
      // 且不与其它字段冲突；不满足则保持自动 key（fieldN）——中文标签不再产出中文 key
      const candidate = label.trim()
      if (/^\w+$/.test(candidate)) {
        const used = collectFieldKeys(host.nodes())
        used.delete(node.key ?? '')
        if (!used.has(candidate)) patch.key = candidate
      }
    }
    updateNode(id, patch)
  }

  return {
    canUndo,
    canRedo,
    snapshot,
    snapshotMeta,
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
