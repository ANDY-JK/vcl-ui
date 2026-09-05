// 设计器批量操作 · 单元锁定（真实使用审查余项 ⑥）
// moveNode/duplicateNode/copyNode/pasteNode 支持多选 id 数组：
// - 批量上移/下移按块移动（相邻选中节点不互相穿越）
// - 批量复制按原顺序成对插入
// - 多节点复制/粘贴保持顺序
// - 单 id 调用行为与旧版完全兼容
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useDesignerOps } from '@/components/form-builder/designer/useDesignerOps'
import { createField } from '@/components/form-builder/designer/types'
import type { DesignerNode } from '@/components/form-builder/designer/types'

function makeHost(initial: DesignerNode[]) {
  const state = { nodes: initial }
  const selectedId = ref<string | null>(null)
  const selectedIds = ref<Set<string>>(new Set())
  const host = {
    nodes: () => state.nodes,
    meta: () => ({ title: '' }),
    patch: (list: DesignerNode[]) => {
      state.nodes = list
    },
    patchAll: (list: DesignerNode[]) => {
      state.nodes = list
    },
    selectedId,
    selectedIds,
    showTip: vi.fn(),
  }
  return { host: host as never, state, selectedId, selectedIds }
}

function threeNodes(): DesignerNode[] {
  return [createField('text', 1), createField('number', 2), createField('textarea', 3)]
}

const byKey = (nodes: DesignerNode[]) => nodes.map((n) => n.key)

describe('批量移动（块移动语义）', () => {
  it('多选不连续节点 Ctrl+↑：无相邻穿越', () => {
    const { host, state } = makeHost(threeNodes())
    const ops = useDesignerOps(host)
    // A 与 C 同选：A 已在顶跳过，C 与 B 交换 → [A, C, B]
    ops.moveNode([state.nodes[0].id, state.nodes[2].id], -1)
    expect(byKey(state.nodes)).toEqual(['field1', 'field3', 'field2'])
  })

  it('多选不连续节点 Ctrl+↓：处理顺序降序，无相邻穿越', () => {
    const { host, state } = makeHost(threeNodes())
    const ops = useDesignerOps(host)
    // A 与 C 同选下移：C 已在底跳过，A 与 B 交换 → [B, A, C]
    ops.moveNode([state.nodes[0].id, state.nodes[2].id], 1)
    expect(byKey(state.nodes)).toEqual(['field2', 'field1', 'field3'])
  })

  it('相邻多选整块上移：块顶与上方非选中节点交换，块内不乱序', () => {
    const { host, state } = makeHost(threeNodes())
    const ops = useDesignerOps(host)
    // B、C 同选上移：B 与 A 交换，C 前是选中的 B 跳过 → [B, C, A]
    ops.moveNode([state.nodes[1].id, state.nodes[2].id], -1)
    expect(byKey(state.nodes)).toEqual(['field2', 'field3', 'field1'])
  })

  it('单 id 上移与旧版行为一致（相邻交换）', () => {
    const { host, state } = makeHost(threeNodes())
    const ops = useDesignerOps(host)
    ops.moveNode([state.nodes[1].id], -1)
    expect(byKey(state.nodes)).toEqual(['field2', 'field1', 'field3'])
  })
})

describe('批量复制（duplicate）', () => {
  it('多选两个节点 → 各自克隆插入原节点后，顺序保持', () => {
    const { host, state, selectedId } = makeHost(threeNodes())
    const ops = useDesignerOps(host)
    ops.duplicateNode([state.nodes[0].id, state.nodes[1].id])
    expect(state.nodes).toHaveLength(5)
    expect(byKey(state.nodes)).toEqual(['field1', 'field1_copy', 'field2', 'field2_copy', 'field3'])
    expect(selectedId.value).toBeTruthy()
    expect(selectedId.value).not.toBe(state.nodes[0].id)
  })

  it('单个复制与旧版一致', () => {
    const { host, state, selectedId } = makeHost(threeNodes())
    const ops = useDesignerOps(host)
    const before = state.nodes[0].id
    ops.duplicateNode([state.nodes[0].id])
    expect(state.nodes).toHaveLength(4)
    expect(state.nodes[1].id).toBe(selectedId.value)
    expect(state.nodes[1].id).not.toBe(before)
  })
})

describe('批量复制粘贴（clipboard）', () => {
  it('多选复制 → 粘贴到目标节点后，顺序保持', () => {
    const { host, state, selectedId } = makeHost(threeNodes())
    const ops = useDesignerOps(host)
    ops.copyNode([state.nodes[0].id, state.nodes[1].id])
    ops.pasteNode(state.nodes[2].id)
    expect(byKey(state.nodes)).toEqual(['field1', 'field2', 'field3', 'field1_copy', 'field2_copy'])
    expect(selectedId.value).toBe(state.nodes[4].id)
  })

  it('剪贴板为空粘贴 → 仅提示不写入', () => {
    const { host, state, selectedIds } = makeHost(threeNodes())
    const ops = useDesignerOps(host)
    ops.pasteNode(state.nodes[0].id)
    expect(state.nodes).toHaveLength(3)
    expect(selectedIds.value.size).toBe(0)
  })
})
