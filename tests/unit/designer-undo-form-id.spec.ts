/**
 * 撤销必须连"当前编辑的是哪份表单"一起恢复（第 149 轮）。
 *
 * 打开确认弹窗明确写着「将替换画布**（可撤销）**，确定继续？」—— 撤销能恢复画布，
 * 但 `currentFormId` 由 `useFormManager` 单独持有，撤销完全不碰它。于是：
 *
 * ```
 * 打开表单B  → currentFormId=B, 画布=B
 * 撤销       → currentFormId=B, 画布=A   ← 内容与身份错位
 * 保存       → 把 A 的内容写进 B          ← 静默覆盖刚打开的那份表单
 * ```
 *
 * 这是**数据损坏**，不是显示问题；而且它发生在弹窗承诺过的操作路径上。
 * 修法：快照带上 formId，撤销/重做一并恢复（历史与身份同进同退）。
 */
import { describe, it, expect } from 'vitest'
import { useFormManager } from '@/components/form-builder/designer/useFormManager'
import { useDesignerOps } from '@/components/form-builder/designer/useDesignerOps'
import type { DesignerNode, FormMeta } from '@/components/form-builder/designer/types'

const node = (id: string): DesignerNode => ({ id, type: 'text', label: id }) as unknown as DesignerNode

/** 把「画布 + meta + 当前表单 id」三者接到一起，等价于真实 FormDesigner 的装配 */
function setup() {
  let nodes: DesignerNode[] = [node('A1'), node('A2')]
  const meta: { v: FormMeta } = { v: { title: '表单A' } as FormMeta }
  const saves: Array<{ id: string | null; nodeCount: number; title: string }> = []

  // 两个 composable 互相引用，只能分两步装配。用持有对象而非"两步 let"：
  // 属性赋值不受 `prefer-const` 约束，语义也更直白（"这两个引用同一个 manager"）
  const holder: { m: ReturnType<typeof useFormManager> | null } = { m: null }

  const ops = useDesignerOps({
    nodes: () => nodes,
    meta: () => meta.v,
    patch: (list) => {
      nodes = list
    },
    patchAll: (n, mm) => {
      nodes = n
      if (mm) meta.v = mm
    },
    // 第 149 轮新增：历史记录要能读到/写回"当前表单身份"
    formId: () => holder.m?.currentFormId ?? null,
    restoreFormId: (id) => {
      if (holder.m) holder.m.currentFormId = id
    },
    selectedId: { value: null } as never,
    selectedIds: { value: new Set() } as never,
    showTip: () => {},
  } as never)

  const store = {
    listForms: async () => [],
    loadForm: async (id: string) => ({ nodes: [node(`${id.toUpperCase()}1`)], meta: { title: `表单${id}` } }),
    saveForm: async (id: string | null) => {
      saves.push({ id, nodeCount: nodes.length, title: meta.v.title })
      return { id: id ?? 'new-1', name: 'x', updatedAt: '', collectKey: 'k' }
    },
    renameForm: async () => {},
    deleteForm: async () => {},
    loadRecords: async () => [],
    appendRecord: async () => {},
    updateRecord: async () => {},
    removeRecord: async () => {},
    clearRecords: async () => {},
    stats: async () => ({ forms: 0, records: 0 }),
  } as never

  holder.m = useFormManager({
    nodes: () => nodes,
    meta: () => meta.v,
    updateMeta: (v) => {
      meta.v = v
    },
    applyNodes: (list) => {
      nodes = list
    },
    snapshot: () => ops.snapshot(),
    injectedStore: () => store,
    showTip: () => {},
  } as never)

  return {
    ops,
    manager: holder.m as ReturnType<typeof useFormManager>,
    saves,
    canvas: () => nodes.map((n) => n.id),
    title: () => meta.v.title,
  }
}

const B = { id: 'b', name: '表单b', updatedAt: '', collectKey: 'k' }

describe('撤销 / 重做 · 当前表单身份要跟着历史走', () => {
  it('**打开 B 后撤销 → currentFormId 回到打开前**（否则内容与身份错位）', async () => {
    const { ops, manager, canvas } = setup()
    expect(manager.currentFormId, '起始是未命名新表单').toBeNull()

    await manager.doOpenForm(B as never)
    expect(manager.currentFormId).toBe('b')

    ops.undo()
    expect(canvas(), '画布回到 A').toEqual(['A1', 'A2'])
    expect(manager.currentFormId, '身份也要回到 A（这里是 null=未命名）').toBeNull()
  })

  it('**撤销后再保存 → 不会写进 B**（这是数据损坏那条路径）', async () => {
    const { ops, manager, saves } = setup()
    await manager.doOpenForm(B as never)
    ops.undo()
    await manager.saveForm('表单A')

    expect(saves.length).toBe(1)
    expect(saves[0].id, '不能写到刚打开的 B 上').not.toBe('b')
  })

  it('保存过 A 再打开 B → 撤销 → 身份回到 A', async () => {
    const { ops, manager } = setup()
    await manager.saveForm('表单A')
    const idA = manager.currentFormId
    expect(idA, '保存后应有 id').toBeTruthy()

    await manager.doOpenForm(B as never)
    expect(manager.currentFormId).toBe('b')

    ops.undo()
    expect(manager.currentFormId, '撤销应回到 A 的身份').toBe(idA)
  })

  it('重做 → 身份回到 B', async () => {
    const { ops, manager } = setup()
    await manager.doOpenForm(B as never)
    ops.undo()
    expect(manager.currentFormId).toBeNull()
    ops.redo()
    expect(manager.currentFormId, '重做要回到 B').toBe('b')
  })

  it('**普通编辑（加字段）的撤销不影响身份**（历史与身份同进同退，但不是盲目覆盖）', async () => {
    const { ops, manager, canvas } = setup()
    await manager.saveForm('表单A')
    const idA = manager.currentFormId
    ops.snapshot()
    // 模拟"加了一个字段"：真实组件里 patch 会替换画布
    const before = canvas().length
    expect(before).toBe(2)

    ops.undo()
    expect(manager.currentFormId, '同一份表单内的撤销不该改身份').toBe(idA)
  })
})
