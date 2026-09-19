// 撤销栈的裁剪口径 —— 步数上限 50 与「单快照异常巨大时的内存预算」两条都要真的生效。
// 50 步本身有实测支撑（300 字段表单两条栈满打 ≈3.3MB），所以正常表单不会被预算裁到；
// 反过来，巨型快照（整段富文本/超长 options）必须被裁，否则历史栈会一路吃进几十 MB。
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useDesignerOps, type DesignerOpsHost } from '@/components/form-builder/designer/useDesignerOps'
import type { DesignerNode, FormMeta } from '@/components/form-builder/designer/types'

/** 直接造节点对象：createField 每次调用都要重建字段类型注册表（实测 3.6ms/次），
 *  用它造 5000 个字段会把测试时间花在夹具上，与撤销栈无关 */
const field = (i: number, label = `字段 ${i} —— 与实测快照体积同量级的真实结构`): DesignerNode =>
  ({ id: `n${i}`, key: `f${i}`, type: 'input', label }) as DesignerNode

function makeHost() {
  let nodes: DesignerNode[] = []
  let meta: FormMeta = {}
  const host: DesignerOpsHost = {
    nodes: () => nodes,
    meta: () => meta,
    patch: (l) => {
      nodes = l
    },
    patchAll: (l, m) => {
      nodes = l
      if (m) meta = m
    },
    selectedId: ref<string | null>(null),
    selectedIds: ref(new Set<string>()),
    showTip: () => {},
  }
  return {
    host,
    setNodes: (n: DesignerNode[]) => {
      nodes = n
    },
  }
}

/** 一直撤销到没得撤为止，返回可撤销步数 */
function undoDepth(ops: ReturnType<typeof useDesignerOps>): number {
  let n = 0
  while (ops.canUndo.value && n < 200) {
    ops.undo()
    n++
  }
  return n
}

describe('设计器撤销栈裁剪', () => {
  it('常规表单：保留 50 步，第 51 步之前已被挤掉', () => {
    const { host, setNodes } = makeHost()
    const ops = useDesignerOps(host)
    for (let i = 0; i < 60; i++) {
      setNodes([field(i)])
      ops.snapshot()
    }
    expect(undoDepth(ops)).toBe(50)
  })

  it('单快照 5MB 时按内存预算裁到只剩 1 步（不让历史栈无限吃内存）', () => {
    const { host, setNodes } = makeHost()
    const ops = useDesignerOps(host)
    const huge = 'x'.repeat(5 * 1024 * 1024)
    for (let i = 0; i < 3; i++) {
      setNodes([field(i, huge)])
      ops.snapshot()
    }
    expect(undoDepth(ops)).toBe(1)
  })

  it('正常大小快照不会被预算误伤：100 字段表单连做 50 步仍留满 50 步', () => {
    const { host, setNodes } = makeHost()
    const ops = useDesignerOps(host)
    for (let i = 0; i < 50; i++) {
      setNodes(Array.from({ length: 100 }, (_, k) => field(k)))
      ops.snapshot()
    }
    expect(undoDepth(ops)).toBe(50)
  })
})
