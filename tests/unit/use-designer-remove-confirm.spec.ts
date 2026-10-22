/**
 * useDesignerRemoveConfirm — 删除确认流（2026-10-22）
 *
 * ## 为什么测它
 *
 * 此前覆盖率：**语句 12.9%** —— form 域最差的一个（31 条语句）。
 * 它决定「删除时要不要弹确认」，错了会直接**误删用户数据**：
 *
 *   · 容器带子节点删除 → **必须弹确认**（会连带删掉所有子字段）
 *   · 普通字段 → 直接删（弹确认是骚扰）
 *   · 多选删除 → 选中集合里有容器带子节点，或选中数 > 1，都要弹确认
 *   · 多选模式下删「不在选中集合里」的节点 → 走单选逻辑
 *
 * ## 最容易错的三个点
 *
 *   ① 多选分支的**前置条件**：`selectedIds.size > 0 && selectedIds.has(id)`
 *      —— 只判 size > 0 会让「多选状态下删别的节点」误走批量
 *   ② 多选集合里**任何一个**容器带子节点就要确认（`some`，不是 `every`）
 *   ③ 确认后必须**清空 pending 状态**，否则下次删除会用旧 id
 */
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useDesignerRemoveConfirm } from '@/components/form-builder/designer/useDesignerRemoveConfirm'
import type { DesignerNode } from '@/components/form-builder/designer/types'

/** 造一个 host，记录 doRemoveNodes 的调用 */
function makeHost(nodes: DesignerNode[], selected: string[] = []) {
  const doRemoveNodes = vi.fn()
  return {
    host: {
      getNodes: () => nodes,
      selectedIds: ref(new Set(selected)),
      doRemoveNodes,
    },
    doRemoveNodes,
  }
}

/** 普通字段节点 */
function field(id: string, key = 'f' + id): DesignerNode {
  return { id, key, type: 'input', label: '字段' + id } as DesignerNode
}

/** 容器节点（带/不带子节点） */
function container(id: string, children: DesignerNode[] = [], key = 'c' + id): DesignerNode {
  return { id, key, type: 'card', label: '容器' + id, children } as DesignerNode
}

describe('单选删除', () => {
  it('普通字段 → **直接删，不弹确认**', () => {
    const { host, doRemoveNodes } = makeHost([field('a')])
    const r = useDesignerRemoveConfirm(host)
    r.removeNode('a')
    expect(doRemoveNodes, '普通字段不该弹确认').toHaveBeenCalledWith(['a'])
    expect(r.pendingRemoveId.value, '不该有 pending').toBeNull()
  })

  it('容器带子节点 → **弹确认，不直接删**', () => {
    const { host, doRemoveNodes } = makeHost([container('c1', [field('s1'), field('s2')])])
    const r = useDesignerRemoveConfirm(host)
    r.removeNode('c1')
    expect(doRemoveNodes, '容器带子节点必须确认，不能直接删').not.toHaveBeenCalled()
    expect(r.pendingRemoveId.value).toBe('c1')
    expect(r.pendingRemoveLabel.value, '应记录容器名供确认文案用').toBe('容器c1')
  })

  it('容器**没有**子节点 → 直接删（空容器不危险）', () => {
    const { host, doRemoveNodes } = makeHost([container('c1', [])])
    const r = useDesignerRemoveConfirm(host)
    r.removeNode('c1')
    expect(doRemoveNodes).toHaveBeenCalledWith(['c1'])
    expect(r.pendingRemoveId.value).toBeNull()
  })

  it('节点不存在 → **静默返回**，不调 doRemoveNodes', () => {
    const { host, doRemoveNodes } = makeHost([field('a')])
    const r = useDesignerRemoveConfirm(host)
    r.removeNode('不存在')
    expect(doRemoveNodes, '找不到节点不该删').not.toHaveBeenCalled()
    expect(r.pendingRemoveId.value).toBeNull()
  })
})

describe('多选删除', () => {
  it('选中集合里有容器带子节点 → **弹批量确认**', () => {
    const nodes = [container('c1', [field('s1')]), field('a')]
    const { host, doRemoveNodes } = makeHost(nodes, ['c1', 'a'])
    const r = useDesignerRemoveConfirm(host)
    r.removeNode('a')
    expect(doRemoveNodes, '含危险容器必须确认').not.toHaveBeenCalled()
    expect(r.pendingRemoveIds.value, '应记录整批 id').toEqual(['c1', 'a'])
  })

  it('**混合场景**：只有部分选中项是危险容器 → 也要确认', () => {
    const nodes = [container('danger', [field('s1')]), field('safe1'), field('safe2')]
    const { host, doRemoveNodes } = makeHost(nodes, ['danger', 'safe1', 'safe2'])
    const r = useDesignerRemoveConfirm(host)
    r.removeNode('safe1')
    expect(doRemoveNodes, '只要有一个危险容器就必须确认').not.toHaveBeenCalled()
    expect(r.pendingRemoveIds.value).toEqual(['danger', 'safe1', 'safe2'])
  })

  /**
   * ⚠️ 关于 `some` → `every` 的负向对照**不会生效**，这是代码的等价性，不是测试缺陷
   *
   * 判断式是：`if (hasContainerWithChildren || ids.length > 1)`
   *
   *   · `ids.length > 1` 时：无论 some 还是 every，都会进确认分支（被第二项兜住）
   *   · `ids.length === 1` 时：`some` 与 `every` 对单个元素结果必然相同
   *
   * 也就是说 `hasContainerWithChildren` 这一项在当前逻辑里**恒被 `ids.length > 1` 覆盖**
   * （`hasContainerWithChildren` 为 true 必然意味着 ids 里至少有一个容器，
   *  但 ids 可以是 `['danger']` 单元素 —— 这时 some===every，
   *  而 `ids.length > 1` 为 false，两个版本都走 `doRemoveNodes`）。
   *
   * 结论：把 `some` 改成 `every` **不改变任何行为**，所以没有测试能抓到它。
   * 这属于代码里的**冗余条件**（可读性保留，无害），已在报告中记录。
   */

  it('**全安全的多选**：不含容器 → 因数量 > 1 仍要确认', () => {
    const nodes = [field('a'), field('b'), field('c')]
    const { host, doRemoveNodes } = makeHost(nodes, ['a', 'b', 'c'])
    const r = useDesignerRemoveConfirm(host)
    r.removeNode('a')
    expect(doRemoveNodes).not.toHaveBeenCalled()
    expect(r.pendingRemoveIds.value).toEqual(['a', 'b', 'c'])
  })

  it('选中数 > 1（都安全）→ **也弹批量确认**', () => {
    const nodes = [field('a'), field('b')]
    const { host, doRemoveNodes } = makeHost(nodes, ['a', 'b'])
    const r = useDesignerRemoveConfirm(host)
    r.removeNode('a')
    expect(doRemoveNodes, '批量删除要确认').not.toHaveBeenCalled()
    expect(r.pendingRemoveIds.value).toEqual(['a', 'b'])
  })

  it('选中数 = 1 且安全 → **直接删，不弹确认**', () => {
    const nodes = [field('a')]
    const { host, doRemoveNodes } = makeHost(nodes, ['a'])
    const r = useDesignerRemoveConfirm(host)
    r.removeNode('a')
    expect(doRemoveNodes).toHaveBeenCalledWith(['a'])
    expect(r.pendingRemoveIds.value).toEqual([])
  })

  it('多选状态下删**不在选中集合里**的节点 → 走单选逻辑', () => {
    // ⚠️ 关键分支：只判 `size > 0` 会误走批量删除
    const nodes = [field('a'), field('b')]
    const { host, doRemoveNodes } = makeHost(nodes, ['a']) // 选中 a，但删 b
    const r = useDesignerRemoveConfirm(host)
    r.removeNode('b')
    expect(doRemoveNodes, '删非选中节点应走单选路径').toHaveBeenCalledWith(['b'])
    expect(r.pendingRemoveIds.value, '不该进批量 pending').toEqual([])
  })
})

describe('确认回调', () => {
  it('onConfirmRemove → 删 pending 的 id，并**清空 pending 状态**', () => {
    const { host, doRemoveNodes } = makeHost([container('c1', [field('s1')])])
    const r = useDesignerRemoveConfirm(host)
    r.removeNode('c1') // 进入 pending
    expect(r.pendingRemoveId.value).toBe('c1')

    r.onConfirmRemove()
    expect(doRemoveNodes).toHaveBeenCalledWith(['c1'])
    // ⚠️ 不清空的话，下次删除会用旧 id 误删
    expect(r.pendingRemoveId.value, '确认后必须清空 id').toBeNull()
    expect(r.pendingRemoveLabel.value, '确认后必须清空 label').toBe('')
  })

  it('onConfirmRemove 在 pending 为 null 时 → 不调 doRemoveNodes', () => {
    const { host, doRemoveNodes } = makeHost([field('a')])
    const r = useDesignerRemoveConfirm(host)
    r.onConfirmRemove() // 没有 pending
    expect(doRemoveNodes).not.toHaveBeenCalled()
  })

  it('onConfirmRemoveBatch → 删整批，并清空 pendingRemoveIds', () => {
    const nodes = [field('a'), field('b')]
    const { host, doRemoveNodes } = makeHost(nodes, ['a', 'b'])
    const r = useDesignerRemoveConfirm(host)
    r.removeNode('a') // 进入批量 pending
    expect(r.pendingRemoveIds.value).toEqual(['a', 'b'])

    r.onConfirmRemoveBatch()
    expect(doRemoveNodes).toHaveBeenCalledWith(['a', 'b'])
    expect(r.pendingRemoveIds.value, '确认后必须清空').toEqual([])
  })

  it('onConfirmRemoveBatch 在空集合时 → 不调 doRemoveNodes', () => {
    const { host, doRemoveNodes } = makeHost([field('a')])
    const r = useDesignerRemoveConfirm(host)
    r.onConfirmRemoveBatch()
    expect(doRemoveNodes).not.toHaveBeenCalled()
  })
})

describe('嵌套容器', () => {
  it('嵌套在容器里的子字段也能被找到并删除', () => {
    const inner = field('deep')
    const nodes = [container('outer', [container('inner', [inner])])]
    const { host, doRemoveNodes } = makeHost(nodes)
    const r = useDesignerRemoveConfirm(host)
    r.removeNode('deep')
    expect(doRemoveNodes, '应能在嵌套层级里找到节点').toHaveBeenCalledWith(['deep'])
  })

  it('嵌套容器带子节点 → 弹确认', () => {
    const nodes = [container('outer', [container('inner', [field('deep')])])]
    const { host, doRemoveNodes } = makeHost(nodes)
    const r = useDesignerRemoveConfirm(host)
    r.removeNode('inner')
    expect(doRemoveNodes).not.toHaveBeenCalled()
    expect(r.pendingRemoveId.value).toBe('inner')
  })
})
