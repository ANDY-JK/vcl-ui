/**
 * useDesignerOps.ts 的结构操作深水区 —— 插入 / 槽位 / 批量删除 / 重排 / 拖拽排序
 *
 * ## 为什么补（单文件口径 语句 79.2% / **分支 60.9%** / 函数 81%，50/259 行 + 8 个函数未覆盖）
 *
 * 这个 composable 是设计器的「唯一写入口」：所有节点增删改都从这里过，且每次操作都进撤销栈。
 * 既有 16 个 designer spec 覆盖了 moveNode/duplicateNode/copyNode/pasteNode 的主路径、
 * key 唯一性闸口、历史预算、undo/meta —— 但**下面 6 个导出函数一行都没测**：
 *
 *   `insertAt` / `insertIntoContainer` / `assignSlot` / `doRemoveNodes` /
 *   `reorderNode` / `sortNode`
 *
 * 它们不是边缘功能：拖拽落点（sortNode）、容器内插入（insertIntoContainer）、
 * tabs/折叠项归属（assignSlot）、多选删除（doRemoveNodes）都是设计器主交互。
 *
 * 另有 `replaceSiblings` 的树重建（L318-324）零覆盖 —— 容器内复制/粘贴才会走到，
 * 根级永远是 `parent === root` 的捷径分支。这是「容器内复制会跑到画布末尾」那类 bug 的现场。
 *
 * ## 这套测试真正想钉住的语义
 *
 * ① **单次快照**：批量删除 N 个节点只产生 1 步撤销（undo 一次全部回来）。
 *    如果实现里循环调用删除（每次都快照），用户要按 N 次 Ctrl+Z —— 这是可用性事故。
 * ② **槽位归属**：tabs/collapse/steps 里插字段必须带 containerSlot，否则字段会落到
 *    「看不见的槽位」里（画布只渲染激活槽位）。slot 只在 inside 落点才生效。
 * ③ **容器内操作不越级**：容器内子节点复制/粘贴后必须留在原容器，
 *    扁平索引插根级会让它跑到画布末尾（源码注释明确记录过这个 bug）。
 * ④ **不可变更新**：所有操作返回新数组，旧引用不被就地修改（撤销栈持有旧快照）。
 */
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useDesignerOps, type DesignerOpsHost } from '@/components/form-builder/designer/useDesignerOps'
import { createField } from '@/components/form-builder/designer/types'
import type { DesignerNode } from '@/components/form-builder/designer/types'

interface Harness {
  ops: ReturnType<typeof useDesignerOps>
  nodes: () => DesignerNode[]
  setNodes: (list: DesignerNode[]) => void
  selectedId: ReturnType<typeof ref<string | null>>
  selectedIds: ReturnType<typeof ref<Set<string>>>
  showTip: ReturnType<typeof vi.fn>
  patchAll: ReturnType<typeof vi.fn>
  patches: number
}

function makeHost(initial: DesignerNode[], meta: Record<string, unknown> = { title: '' }): Harness {
  let current = initial
  let metaCur = meta
  const selectedId = ref<string | null>(null)
  const selectedIds = ref<Set<string>>(new Set())
  const showTip = vi.fn()
  const patchAll = vi.fn((list: DesignerNode[], m: unknown) => {
    current = list
    if (m) metaCur = m as Record<string, unknown>
  })
  const h: Harness = {
    ops: null as never,
    nodes: () => current,
    setNodes: (l) => {
      current = l
    },
    selectedId,
    selectedIds,
    showTip,
    patchAll,
    patches: 0,
  }
  const host: DesignerOpsHost = {
    nodes: () => current,
    meta: () => metaCur as never,
    patch: (list) => {
      current = list
      h.patches++
    },
    patchAll,
    selectedId,
    selectedIds,
    showTip,
  }
  h.ops = useDesignerOps(host)
  return h
}

const keys = (list: DesignerNode[]) => list.map((n) => n.key ?? n.type)
const ids = (list: DesignerNode[]) => list.map((n) => n.id)

/** 三个平级字段 */
function flat3(): DesignerNode[] {
  return [createField('text', 1), createField('number', 2), createField('textarea', 3)]
}

/** card 容器 + 容器内两个字段（children 指针可用于验证「留在原容器」） */
function withCard() {
  const card = createField('card', 0)
  const a = createField('text', 1)
  const b = createField('number', 2)
  card.children = [a, b]
  const tail = createField('textarea', 3)
  return { list: [card, tail], card, a, b, tail }
}

/* ═══════════ ① insertAt ═══════════ */

describe('insertAt', () => {
  it('**插到中间：顺序 [f1, 新, f2, f3] 并选中新节点**', () => {
    const h = makeHost(flat3())
    h.ops.insertAt('switch', 1)
    expect(h.nodes()).toHaveLength(4)
    expect(h.nodes()[1]!.type).toBe('switch')
    expect(keys(h.nodes()).slice(0, 1)).toEqual(['field1'])
    expect(h.nodes()[2]!.key, '原第二项被顶到第三').toBe('field2')
    expect(h.selectedId.value, '选中新节点').toBe(h.nodes()[1]!.id)
  })

  it('**index=-1 → 追加到末尾**', () => {
    const h = makeHost(flat3())
    h.ops.insertAt('switch', -1)
    expect(h.nodes()).toHaveLength(4)
    expect(h.nodes()[3]!.type).toBe('switch')
  })

  it('**index 超出长度 → 追加到末尾**（insertNode 的兜底）', () => {
    const h = makeHost(flat3())
    h.ops.insertAt('switch', 99)
    expect(h.nodes()[3]!.type).toBe('switch')
  })

  it('**index=0 → 插到最前**', () => {
    const h = makeHost(flat3())
    h.ops.insertAt('switch', 0)
    expect(h.nodes()[0]!.type).toBe('switch')
    expect(h.nodes()[1]!.key).toBe('field1')
  })

  it('**可撤销：undo 回到插入前**', () => {
    const h = makeHost(flat3())
    expect(h.ops.canUndo.value).toBe(false)
    h.ops.insertAt('switch', 1)
    expect(h.ops.canUndo.value, '入栈了').toBe(true)
    h.ops.undo()
    expect(h.nodes()).toHaveLength(3)
    expect(h.nodes().map((n) => n.type)).toEqual(['text', 'number', 'textarea'])
  })

  it('**新字段 key 跳过已占用的序号**（field1/field2/field4 → 新的是 field5）', () => {
    // used.size=3 → i 从 4 起，但 field4 已存在 → 必须继续 +1
    const n1 = createField('text', 1)
    const n2 = createField('number', 2)
    const n4 = createField('textarea', 4)
    const h = makeHost([n1, n2, n4])
    h.ops.insertAt('switch', -1)
    expect(h.nodes()[3]!.key, '不能与既有 field4 撞 key').toBe('field5')
  })

  it('**不可变：旧数组引用不被就地修改**', () => {
    const before = flat3()
    const snapshotRef = before
    const h = makeHost(before)
    h.ops.insertAt('switch', 1)
    expect(snapshotRef, '原数组长度不变').toHaveLength(3)
    expect(h.nodes()).not.toBe(snapshotRef)
  })
})

/* ═══════════ ② insertIntoContainer ═══════════ */

describe('insertIntoContainer', () => {
  it('**插到容器 children 末尾**', () => {
    const { list, card } = withCard()
    const h = makeHost(list)
    h.ops.insertIntoContainer('switch', card.id, -1)
    const updated = h.nodes()[0]!
    expect(updated.children).toHaveLength(3)
    expect(updated.children![2]!.type).toBe('switch')
    expect(h.selectedId.value, '选中新节点').toBe(updated.children![2]!.id)
  })

  it('**插到容器 children 指定索引**', () => {
    const { list, card } = withCard()
    const h = makeHost(list)
    h.ops.insertIntoContainer('switch', card.id, 1)
    expect(h.nodes()[0]!.children!.map((n) => n.type)).toEqual(['text', 'switch', 'number'])
  })

  it('**slot>=0 → 写 containerSlot**（否则字段落到看不见的槽位）', () => {
    const { list, card } = withCard()
    const h = makeHost(list)
    h.ops.insertIntoContainer('text', card.id, -1, 2)
    expect(h.nodes()[0]!.children![2]!.containerSlot, '归入第 3 个槽位').toBe(2)
  })

  it('**slot=0 也要写**（0 是合法槽位，不能被当成「未传」）', () => {
    const { list, card } = withCard()
    const h = makeHost(list)
    h.ops.insertIntoContainer('text', card.id, -1, 0)
    expect(h.nodes()[0]!.children![2]!.containerSlot).toBe(0)
  })

  it('**slot 未传 → 不写 containerSlot**', () => {
    const { list, card } = withCard()
    const h = makeHost(list)
    h.ops.insertIntoContainer('text', card.id, -1)
    expect(h.nodes()[0]!.children![2]).not.toHaveProperty('containerSlot')
  })

  it('**slot 为负数 → 也不写**', () => {
    const { list, card } = withCard()
    const h = makeHost(list)
    h.ops.insertIntoContainer('text', card.id, -1, -1)
    expect(h.nodes()[0]!.children![2]).not.toHaveProperty('containerSlot')
  })

  it('**容器不存在 → 树内容不变，但会留下悬空选中**（P3，见附录 #142）', () => {
    const h = makeHost(flat3())
    h.ops.insertIntoContainer('switch', 'ghost', -1)
    expect(h.nodes()).toHaveLength(3)
    expect(h.nodes().map((n) => n.type)).toEqual(['text', 'number', 'textarea'])
    // ⚠️ 实测行为：insertChildNode 内部是 `nodes.map(...)`，容器找不到时**仍返回新数组**，
    // 于是 `if (updated !== host.nodes())` 恒真 → 照样 patch + 写 selectedId。
    // 结果：树没变，但 selectedId 指向一个**不在树里的 id**（悬空选中）。
    // 不弱化断言 —— 按实测钉死这个事实，并在报告里作为 P3 记录。
    expect(h.selectedId.value, '选中被写成一个不存在的节点').not.toBeNull()
    const allIds = h.nodes().flatMap((n) => [n.id, ...(n.children ?? []).map((c) => c.id)])
    expect(allIds, '该 id 确实不在树里（悬空）').not.toContain(h.selectedId.value)
  })

  it('**非容器节点（无 children）→ 不接收子节点**（insertChildNode 要求 children !== undefined）', () => {
    const h = makeHost(flat3())
    const target = h.nodes()[0]!
    expect(target.children, '前置：字段节点没有 children').toBeUndefined()
    h.ops.insertIntoContainer('switch', target.id, -1)
    expect(h.nodes()[0]!.children, '仍然没有 children').toBeUndefined()
    expect(h.nodes()[0]!.children, '子节点没被塞进字段').toBeUndefined()
    // 同上：没插进去，选中却指向新字段 id（悬空）
    expect(h.selectedId.value).not.toBeNull()
    expect(h.nodes().map((n) => n.id)).not.toContain(h.selectedId.value)
  })

  it('**可撤销**', () => {
    const { list, card } = withCard()
    const h = makeHost(list)
    h.ops.insertIntoContainer('switch', card.id, -1)
    h.ops.undo()
    expect(h.nodes()[0]!.children).toHaveLength(2)
  })
})

/* ═══════════ ③ assignSlot ═══════════ */

describe('assignSlot', () => {
  it('**设置节点槽位**', () => {
    const { list } = withCard()
    const h = makeHost(list)
    const child = h.nodes()[0]!.children![0]!
    h.ops.assignSlot(child.id, 3)
    expect(h.nodes()[0]!.children![0]!.containerSlot).toBe(3)
  })

  it('**覆盖已有槽位**', () => {
    const { list } = withCard()
    const h = makeHost(list)
    const child = h.nodes()[0]!.children![0]!
    h.ops.assignSlot(child.id, 1)
    h.ops.assignSlot(child.id, 5)
    expect(h.nodes()[0]!.children![0]!.containerSlot).toBe(5)
  })

  it('**节点不存在 → 树内容不变**', () => {
    const { list } = withCard()
    const h = makeHost(list)
    h.ops.assignSlot('ghost', 2)
    expect(h.nodes()[0]!.children!.map((n) => n.containerSlot)).toEqual([undefined, undefined])
  })

  it('**可撤销：undo 后槽位恢复原状**', () => {
    const { list } = withCard()
    const h = makeHost(list)
    const child = h.nodes()[0]!.children![0]!
    h.ops.assignSlot(child.id, 4)
    expect(h.ops.canUndo.value).toBe(true)
    h.ops.undo()
    expect(h.nodes()[0]!.children![0]).not.toHaveProperty('containerSlot')
  })
})

/* ═══════════ ④ doRemoveNodes ═══════════ */

describe('doRemoveNodes', () => {
  it('**批量删除两个节点**', () => {
    const h = makeHost(flat3())
    const [a, b] = ids(h.nodes())
    h.ops.doRemoveNodes([a!, b!])
    expect(h.nodes()).toHaveLength(1)
    expect(h.nodes()[0]!.key).toBe('field3')
  })

  it('**只产生 1 步撤销：undo 一次全部回来**（若循环删除则要按 N 次）', () => {
    const h = makeHost(flat3())
    const [a, , c] = ids(h.nodes())
    h.ops.doRemoveNodes([a!, c!])
    expect(h.nodes()).toHaveLength(1)
    h.ops.undo()
    expect(h.nodes(), '一次 undo 两个都回来').toHaveLength(3)
    expect(h.ops.canUndo.value, '撤销栈已空').toBe(false)
  })

  it('**selectedId 在被删列表里 → 清为 null**', () => {
    const h = makeHost(flat3())
    const first = h.nodes()[0]!
    h.selectedId.value = first.id
    h.ops.doRemoveNodes([first.id])
    expect(h.selectedId.value).toBeNull()
  })

  it('**selectedId 不在被删列表里 → 保留**（不能误清无关选中）', () => {
    const h = makeHost(flat3())
    const nodes = h.nodes()
    h.selectedId.value = nodes[2]!.id
    h.ops.doRemoveNodes([nodes[0]!.id])
    expect(h.selectedId.value, '选中的 field3 没被删').toBe(nodes[2]!.id)
  })

  it('**selectedIds 多选集合被清空**', () => {
    const h = makeHost(flat3())
    h.selectedIds.value = new Set([h.nodes()[0]!.id])
    h.ops.doRemoveNodes([h.nodes()[1]!.id])
    expect(h.selectedIds.value.size, '删完清多选').toBe(0)
  })

  it('**删除容器内的子节点**（不是只删根级）', () => {
    const { list } = withCard()
    const h = makeHost(list)
    const childId = h.nodes()[0]!.children![0]!.id
    h.ops.doRemoveNodes([childId])
    expect(h.nodes()[0]!.children, '容器还在').toHaveLength(1)
    expect(h.nodes()[0]!.children![0]!.key).toBe('field2')
  })

  it('**删除容器本身连同子节点**', () => {
    const { list, card } = withCard()
    const h = makeHost(list)
    h.ops.doRemoveNodes([card.id])
    expect(h.nodes()).toHaveLength(1)
    expect(h.nodes()[0]!.key).toBe('field3')
  })

  it('**空数组 → 树不变**（但实现仍会入一次快照，行为如此）', () => {
    const h = makeHost(flat3())
    h.ops.doRemoveNodes([])
    expect(h.nodes()).toHaveLength(3)
    // 如实记录：snapshot() 在循环之前无条件执行，所以空删除也会占一步撤销
    expect(h.ops.canUndo.value, '空删除也入栈（现状）').toBe(true)
  })

  it('**不存在的 id → 跳过，不抛错**', () => {
    const h = makeHost(flat3())
    expect(() => h.ops.doRemoveNodes(['ghost'])).not.toThrow()
    expect(h.nodes()).toHaveLength(3)
  })
})

/* ═══════════ ⑤ 容器内复制 / 粘贴（replaceSiblings 树重建） ═══════════ */

describe('容器内复制与粘贴', () => {
  it('**复制容器内子节点 → 副本留在原容器，不跑到画布末尾**', () => {
    const { list } = withCard()
    const h = makeHost(list)
    const childId = h.nodes()[0]!.children![0]!.id
    h.ops.duplicateNode([childId])
    expect(h.nodes(), '根级仍是 2 项（没多出副本）').toHaveLength(2)
    expect(h.nodes()[0]!.children, '容器内 +1').toHaveLength(3)
    expect(h.nodes()[0]!.children![1]!.key, '副本紧跟原节点').toBe('field1_copy')
  })

  it('**粘贴到容器内节点之后 → 也留在该容器**', () => {
    const { list } = withCard()
    const h = makeHost(list)
    const childA = h.nodes()[0]!.children![0]!
    h.ops.copyNode([childA.id])
    h.ops.pasteNode(childA.id)
    expect(h.nodes(), '根级没有新增').toHaveLength(2)
    expect(h.nodes()[0]!.children!.map((n) => n.key)).toEqual(['field1', 'field1_copy', 'field2'])
  })

  it('**粘贴到不存在的锚点 → 追加到根级末尾**（findParent 为 null 的兜底）', () => {
    const { list } = withCard()
    const h = makeHost(list)
    h.ops.copyNode([h.nodes()[0]!.children![0]!.id])
    h.ops.pasteNode('ghost')
    expect(h.nodes(), '根级 +1').toHaveLength(3)
    expect(h.nodes()[2]!.key, '副本落在根级末尾').toBe('field1_copy')
  })

  it('**多层嵌套：孙节点 key 也被重排**（否则两份相同子 key 让 formData 互相覆盖）', () => {
    const outer = createField('card', 0)
    const inner = createField('card', 0)
    const leaf = createField('text', 1)
    inner.children = [leaf]
    outer.children = [inner]
    const h = makeHost([outer])
    h.ops.duplicateNode([outer.id])
    const copies = h.nodes()
    expect(copies).toHaveLength(2)
    const cloneOuter = copies[1]!
    const cloneInner = cloneOuter.children![0]!
    const cloneLeaf = cloneInner.children![0]!
    expect(cloneLeaf.key, '孙节点 key 已重排').toBe('field1_copy')
    expect(cloneLeaf.key).not.toBe(leaf.key)
    expect(cloneLeaf.id).not.toBe(leaf.id)
    expect(cloneInner.children![0]!.id, '孙 id 也换了').not.toBe(leaf.id)
  })

  it('**两层嵌套：复制内层容器里的字段 → replaceSiblings 递归重建**（L321）', () => {
    // root → cardA → cardB → leaf。复制 leaf 时 findParent 返回的是 cardB.children，
    // replaceSiblings 必须递归穿过 cardA 才能在 cardB 内换掉兄弟数组；
    // 若只做一层（不递归），新数组会被塞到 root 级以外的地方 → 树结构错乱
    const cardA = createField('card', 0)
    const cardB = createField('card', 0)
    const leaf = createField('text', 1)
    cardB.children = [leaf]
    cardA.children = [cardB]
    const h = makeHost([cardA])
    h.ops.duplicateNode([leaf.id])

    expect(h.nodes(), '根级没变').toHaveLength(1)
    expect(h.nodes()[0]!.children, 'cardA 仍只有一个子容器').toHaveLength(1)
    const inner = h.nodes()[0]!.children![0]!
    expect(inner.children, 'cardB 内 +1').toHaveLength(2)
    expect(inner.children!.map((n) => n.key)).toEqual(['field1', 'field1_copy'])
    expect(h.nodes()[0]!.children![0]!.id, 'cardB 本身仍是同一逻辑容器').toBe(inner.id)
  })

  it('**三层嵌套：粘贴到最内层节点之后 → 副本留在最内层**', () => {
    const cardA = createField('card', 0)
    const cardB = createField('card', 0)
    const leafX = createField('text', 1)
    cardB.children = [leafX]
    cardA.children = [cardB]
    const h = makeHost([cardA])
    h.ops.copyNode([leafX.id])
    h.ops.pasteNode(leafX.id)
    expect(h.nodes(), '根级没变').toHaveLength(1)
    const inner = h.nodes()[0]!.children![0]!
    expect(inner.children, '仍在 cardB 内').toHaveLength(2)
    expect(inner.children![1]!.key).toBe('field1_copy')
  })

  it('**容器复制后子节点 key 与原件不冲突**', () => {
    const { list } = withCard()
    const h = makeHost(list)
    h.ops.duplicateNode([h.nodes()[0]!.id])
    const all = h.nodes().flatMap((n) => [n.key, ...(n.children ?? []).map((c) => c.key)])
    const nonEmpty = all.filter((k): k is string => typeof k === 'string')
    expect(new Set(nonEmpty).size, '所有 key 唯一').toBe(nonEmpty.length)
  })
})

/* ═══════════ ⑥ reorderNode ═══════════ */

describe('reorderNode', () => {
  it('**从 0 移到 2：f1 到末尾**', () => {
    const h = makeHost(flat3())
    h.ops.reorderNode(0, 2)
    expect(keys(h.nodes())).toEqual(['field2', 'field3', 'field1'])
  })

  it('**从 2 移到 0：f3 到最前**', () => {
    const h = makeHost(flat3())
    h.ops.reorderNode(2, 0)
    expect(keys(h.nodes())).toEqual(['field3', 'field1', 'field2'])
  })

  it('**相邻交换**', () => {
    const h = makeHost(flat3())
    h.ops.reorderNode(1, 0)
    expect(keys(h.nodes())).toEqual(['field2', 'field1', 'field3'])
  })

  it('**可撤销**', () => {
    const h = makeHost(flat3())
    h.ops.reorderNode(0, 2)
    h.ops.undo()
    expect(keys(h.nodes())).toEqual(['field1', 'field2', 'field3'])
  })

  it('**不可变：返回新数组**', () => {
    const before = flat3()
    const h = makeHost(before)
    h.ops.reorderNode(0, 1)
    expect(before.map((n) => n.key)).toEqual(['field1', 'field2', 'field3'])
    expect(h.nodes()).not.toBe(before)
  })

  it('**只重排根级，不动容器内子节点**', () => {
    const { list } = withCard()
    const h = makeHost(list)
    h.ops.reorderNode(0, 1)
    expect(h.nodes()[1]!.type, 'card 被移到最后').toBe('card')
    expect(h.nodes()[1]!.children, '容器内子节点顺序不变').toHaveLength(2)
    expect(h.nodes()[1]!.children!.map((n) => n.key)).toEqual(['field1', 'field2'])
  })
})

/* ═══════════ ⑦ sortNode（拖拽落点） ═══════════ */

describe('sortNode', () => {
  it('**before：移到目标之前**', () => {
    const h = makeHost(flat3())
    const [a, , c] = h.nodes()
    h.ops.sortNode(c!.id, a!.id, 'before')
    expect(keys(h.nodes())).toEqual(['field3', 'field1', 'field2'])
  })

  it('**after：移到目标之后**', () => {
    const h = makeHost(flat3())
    const [a, , c] = h.nodes()
    h.ops.sortNode(a!.id, c!.id, 'after')
    expect(keys(h.nodes())).toEqual(['field2', 'field3', 'field1'])
  })

  it('**inside：拖进容器内部**', () => {
    const { list, card, tail } = withCard()
    const h = makeHost(list)
    h.ops.sortNode(tail.id, card.id, 'inside')
    expect(h.nodes(), '根级只剩 card').toHaveLength(1)
    expect(h.nodes()[0]!.children, 'tail 进了容器').toHaveLength(3)
    expect(h.nodes()[0]!.children![2]!.key).toBe('field3')
  })

  it('**inside + slot>=0 → 同时写 containerSlot**（落点要与激活槽位一致）', () => {
    const { list, card, tail } = withCard()
    const h = makeHost(list)
    h.ops.sortNode(tail.id, card.id, 'inside', 1)
    expect(h.nodes()[0]!.children![2]!.containerSlot).toBe(1)
  })

  it('**inside + slot=0 也要写**', () => {
    const { list, card, tail } = withCard()
    const h = makeHost(list)
    h.ops.sortNode(tail.id, card.id, 'inside', 0)
    expect(h.nodes()[0]!.children![2]!.containerSlot).toBe(0)
  })

  it('**before + slot → 忽略 slot**（只有 inside 落点才归属槽位）', () => {
    const h = makeHost(flat3())
    const [a, , c] = h.nodes()
    h.ops.sortNode(c!.id, a!.id, 'before', 2)
    expect(h.nodes()[0], 'before 落点不写槽位').not.toHaveProperty('containerSlot')
  })

  it('**after + slot → 也忽略**', () => {
    const h = makeHost(flat3())
    const [a, , c] = h.nodes()
    h.ops.sortNode(a!.id, c!.id, 'after', 3)
    expect(h.nodes(), '根级顺序正确').toHaveLength(3)
    expect(h.nodes().some((n) => n.containerSlot !== undefined), '没有任何节点被写槽位').toBe(false)
  })

  it('**源节点不存在 → 树不变**', () => {
    const h = makeHost(flat3())
    h.ops.sortNode('ghost', h.nodes()[0]!.id, 'before')
    expect(keys(h.nodes())).toEqual(['field1', 'field2', 'field3'])
  })

  it('**可撤销**', () => {
    const { list, card, tail } = withCard()
    const h = makeHost(list)
    h.ops.sortNode(tail.id, card.id, 'inside')
    expect(h.nodes()).toHaveLength(1)
    h.ops.undo()
    expect(h.nodes(), '恢复到根级两项').toHaveLength(2)
  })

  it('**跨容器移动**：把容器 A 的子节点拖到容器 B 内', () => {
    const c1 = createField('card', 0)
    const a = createField('text', 1)
    c1.children = [a]
    const c2 = createField('card', 0)
    c2.children = []
    const h = makeHost([c1, c2])
    h.ops.sortNode(a.id, c2.id, 'inside')
    expect(h.nodes()[0]!.children, 'A 空了').toHaveLength(0)
    expect(h.nodes()[1]!.children, 'B 收到').toHaveLength(1)
    expect(h.nodes()[1]!.children![0]!.key).toBe('field1')
  })
})

/* ═══════════ ⑧ 历史栈的边界 ═══════════ */

describe('历史栈空栈/空操作', () => {
  it('**undo 空栈 → 不 patchAll**', () => {
    const h = makeHost(flat3())
    h.ops.undo()
    expect(h.patchAll, '空栈不该回写').not.toHaveBeenCalled()
    expect(h.nodes()).toHaveLength(3)
  })

  it('**redo 空栈 → 不 patchAll**', () => {
    const h = makeHost(flat3())
    h.ops.redo()
    expect(h.patchAll).not.toHaveBeenCalled()
    expect(h.nodes()).toHaveLength(3)
  })

  it('**undo → redo 回到操作后状态**', () => {
    const h = makeHost(flat3())
    h.ops.addNode('switch')
    expect(h.nodes()).toHaveLength(4)
    h.ops.undo()
    expect(h.nodes()).toHaveLength(3)
    h.ops.redo()
    expect(h.nodes(), 'redo 回来').toHaveLength(4)
    expect(h.nodes()[3]!.type).toBe('switch')
  })

  it('**新操作作废重做链**', () => {
    const h = makeHost(flat3())
    h.ops.addNode('switch')
    h.ops.undo()
    expect(h.ops.canRedo.value).toBe(true)
    h.ops.addNode('slider')
    expect(h.ops.canRedo.value, '新操作后不能重做').toBe(false)
  })

  it('**duplicateNode 传空数组 → 不快照不变更**', () => {
    const h = makeHost(flat3())
    h.ops.duplicateNode([])
    expect(h.nodes()).toHaveLength(3)
    expect(h.ops.canUndo.value, '空操作不入栈').toBe(false)
  })

  it('**moveNode 传空数组 → 不快照不变更**', () => {
    const h = makeHost(flat3())
    h.ops.moveNode([], 1)
    expect(h.nodes()).toHaveLength(3)
    expect(h.ops.canUndo.value).toBe(false)
  })

  it('**moveNode 传不存在的 id → 跳过**', () => {
    const h = makeHost(flat3())
    h.ops.moveNode(['ghost'], -1)
    expect(keys(h.nodes())).toEqual(['field1', 'field2', 'field3'])
  })
})

/* ═══════════ ⑨ copyNode / onLabelChange 的空值守卫 ═══════════ */

describe('空值守卫', () => {
  it('**copyNode 传不存在的 id → 不提示、剪贴板不变**', () => {
    const h = makeHost(flat3())
    h.ops.copyNode(['ghost'])
    expect(h.showTip, '没有可复制内容就不该提示「已复制」').not.toHaveBeenCalled()
    // 剪贴板仍为空 → 粘贴无作用
    h.ops.pasteNode(h.nodes()[0]!.id)
    expect(h.nodes()).toHaveLength(3)
  })

  it('**copyNode 部分命中 → 只复制命中的**', () => {
    const h = makeHost(flat3())
    h.ops.copyNode([h.nodes()[0]!.id, 'ghost'])
    expect(h.showTip, '有命中就提示').toHaveBeenCalled()
    h.ops.pasteNode(h.nodes()[2]!.id)
    expect(h.nodes(), '只粘贴 1 个').toHaveLength(4)
  })

  it('**onLabelChange 传不存在的 id → 无操作**', () => {
    const h = makeHost(flat3())
    h.ops.onLabelChange('ghost', '新标签')
    expect(h.nodes()).toHaveLength(3)
    expect(h.ops.canUndo.value, '不该入栈').toBe(false)
  })

  it('**onLabelChange 自动 key 字段：英文标签同步进 key**', () => {
    const h = makeHost(flat3())
    const id = h.nodes()[0]!.id
    h.ops.onLabelChange(id, 'userName')
    expect(h.nodes()[0]!.key).toBe('userName')
    expect(h.nodes()[0]!.label).toBe('userName')
  })

  it('**onLabelChange 中文标签不再产出中文 key**（extractFields 的 {{key}} 依赖 \\w+）', () => {
    const h = makeHost(flat3())
    const id = h.nodes()[0]!.id
    h.ops.onLabelChange(id, '用户名')
    expect(h.nodes()[0]!.label).toBe('用户名')
    expect(h.nodes()[0]!.key, 'key 保持自动 fieldN').toBe('field1')
  })

  it('**onLabelChange 目标 key 已被占用 → 不同步**', () => {
    const h = makeHost(flat3())
    const id = h.nodes()[0]!.id
    h.ops.onLabelChange(id, 'field2') // field2 已被第二个字段占用
    expect(h.nodes()[0]!.key, '冲突则保持原 key').toBe('field1')
    expect(h.nodes()[0]!.label, 'label 照常更新').toBe('field2')
  })

  it('**onLabelChange 手动改过 key 的字段 → 不再联动**', () => {
    const h = makeHost(flat3())
    const id = h.nodes()[0]!.id
    h.ops.updateNode(id, { key: 'customKey' })
    h.ops.onLabelChange(id, 'anotherName')
    expect(h.nodes()[0]!.key, '非自动 key 不再联动').toBe('customKey')
    expect(h.nodes()[0]!.label).toBe('anotherName')
  })
})

/* ═══════════ ⑩ 负向对照加固（第一轮 13 条存活的补断言） ═══════════ */

describe('负向对照加固', () => {
  it('**snapshot 重置编辑跟踪：结构操作后同字段编辑要重新快照**', () => {
    const h = makeHost(flat3())
    const id = h.nodes()[0]!.id
    h.ops.updateNode(id, { label: 'A' }) // 首次编辑 → 快照 1
    h.ops.updateNode(id, { label: 'B' }) // 同字段合并 → 仍 1
    h.ops.reorderNode(0, 1) // 结构操作 → 跟踪重置
    h.ops.updateNode(id, { label: 'C' }) // 重新快照 → 2
    h.ops.undo() // 撤销 C → label 回到 B
    expect(h.nodes().find((n) => n.id === id)!.label).toBe('B')
  })

  it('**同字段连续编辑只占一步撤销**（不同字段各占一步）', () => {
    const h = makeHost(flat3())
    const a = h.nodes()[0]!.id
    const b = h.nodes()[1]!.id
    h.ops.updateNode(a, { label: 'A1' })
    h.ops.updateNode(a, { label: 'A2' })
    h.ops.updateNode(b, { label: 'B1' })
    h.ops.undo() // 撤销 B1
    expect(h.nodes().find((n) => n.id === b)!.label).not.toBe('B1')
    h.ops.undo() // 撤销 A2+A1 整组（合并为一步）
    expect(h.nodes().find((n) => n.id === a)!.label).toBe('单行输入')
    expect(h.ops.canUndo.value, '两步撤完').toBe(false)
  })

  it('**duplicate 后再插入的新字段不与副本 key 撞**', () => {
    const h = makeHost(flat3())
    h.ops.duplicateNode([h.nodes()[0]!.id]) // 产出 field1_copy
    h.ops.addNode('text')
    const all = h.nodes().map((n) => n.key)
    expect(new Set(all).size, '全树 key 唯一').toBe(all.length)
  })

  it('**copyNode 深拷贝：复制后改原节点不污染剪贴板**', () => {
    const h = makeHost(flat3())
    const src = h.nodes()[0]!
    h.ops.copyNode([src.id])
    h.ops.updateNode(src.id, { label: 'changed' })
    h.ops.pasteNode(h.nodes()[2]!.id)
    const pasted = h.nodes()[3]!
    expect(pasted.label, '副本还是复制时的标签').toBe('单行输入')
  })

  it('**moveNode 也产生快照（可撤销）**', () => {
    const h = makeHost(flat3())
    h.ops.moveNode([h.nodes()[1]!.id], -1)
    expect(keys(h.nodes())).toEqual(['field2', 'field1', 'field3'])
    expect(h.ops.canUndo.value, 'moveNode 要入栈').toBe(true)
    h.ops.undo()
    expect(keys(h.nodes())).toEqual(['field1', 'field2', 'field3'])
  })

  it('**moveNode 块语义：相邻选中下移不互相穿越**', () => {
    const h = makeHost(flat3())
    h.ops.moveNode([h.nodes()[0]!.id, h.nodes()[1]!.id], 1)
    expect(keys(h.nodes())).toEqual(['field3', 'field1', 'field2'])
  })

  it('**moveNode 升序/降序语义不同**', () => {
    const h = makeHost(flat3())
    h.ops.moveNode([h.nodes()[0]!.id, h.nodes()[2]!.id], -1)
    expect(keys(h.nodes())).toEqual(['field1', 'field3', 'field2'])
    h.ops.undo()
    h.ops.moveNode([h.nodes()[0]!.id, h.nodes()[2]!.id], 1)
    expect(keys(h.nodes())).toEqual(['field2', 'field1', 'field3'])
  })

  it('**label 联动查冲突：目标 key 已占用时保持原 key**', () => {
    const h = makeHost(flat3())
    const id = h.nodes()[0]!.id
    h.ops.onLabelChange(id, 'field3') // field3 已被第三个字段占用
    expect(h.nodes()[0]!.key, '不抢占').toBe('field1')
    expect(h.nodes()[0]!.label, 'label 照常').toBe('field3')
  })

  it('**undo→redo 链路在多次操作后仍一致**', () => {
    const h = makeHost(flat3())
    h.ops.addNode('switch')
    h.ops.undo()
    h.ops.redo()
    expect(h.nodes()).toHaveLength(4)
  })

  it('**死守卫等价性：insertChildNode 恒返回新数组 → 判断恒真**（记录现状）', () => {
    const h = makeHost(flat3())
    h.ops.insertIntoContainer('switch', 'ghost', -1)
    expect(h.selectedId.value).not.toBeNull()
    expect(h.nodes().flatMap((n) => [n.id])).not.toContain(h.selectedId.value)
  })
})
