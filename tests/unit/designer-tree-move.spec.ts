/**
 * `form-builder/designer/types/domain.ts` · 树移动（第 176 轮）
 *
 * 覆盖率实测：`isFieldNode`、`moveNodeRelativeInTree`、`moveNodeInTree` **从未被调用**，
 * `moveNodeRelative` 的嵌套分支也未执行。而这三个函数正是设计器里「拖拽字段到新位置」
 * 的全部实现 —— 低代码用户搭表单时最常用的动作，出错即字段丢失/重复。
 *
 * 读码发现一处高危缺陷：`moveNodeRelativeInTree` 在 `nodes.map()` 里递归，
 * 对**不含目标**的分支也执行 `insertNode(nodes, sourceNode, -1)`，
 * 于是源节点会被追加进每一个无关容器 → 一次拖拽把字段复制到多个容器。
 */
import { describe, it, expect } from 'vitest'
import {
  moveNodeRelative,
  moveNodeInTree,
  findNode,
  flattenNodes,
  type DesignerNode,
} from '@/components/form-builder/designer/tree-ops'

/** 造一个容器节点 */
function card(id: string, children: DesignerNode[] = []): DesignerNode {
  return { id, type: 'card', children } as DesignerNode
}
/** 造一个叶子字段节点 */
function field(id: string): DesignerNode {
  return { id, type: 'input', key: id } as DesignerNode
}

const ids = (nodes: DesignerNode[]): string[] => flattenNodes(nodes).map((n) => n.id)

describe('domain · moveNodeRelative：根级 before / after', () => {
  it('根级 after：把 a 移到 b 之后', () => {
    const tree = [field('a'), field('b'), field('c')]
    const out = moveNodeRelative(tree, 'a', 'b', 'after')
    expect(out.map((n) => n.id)).toEqual(['b', 'a', 'c'])
  })

  it('根级 before：把 c 移到 a 之前', () => {
    const tree = [field('a'), field('b'), field('c')]
    const out = moveNodeRelative(tree, 'c', 'a', 'before')
    expect(out.map((n) => n.id)).toEqual(['c', 'a', 'b'])
  })

  it('源节点不存在 → 原样返回（不抛错、不破坏树）', () => {
    const tree = [field('a')]
    expect(moveNodeRelative(tree, 'nope', 'a', 'after')).toEqual(tree)
  })
})

describe('domain · moveNodeRelative：跨容器移动', () => {
  it('把根级字段移入容器末尾（inside）', () => {
    const tree = [card('c1', [field('f1')]), field('f2')]
    const out = moveNodeRelative(tree, 'f2', 'c1', 'inside')
    expect(ids(out), 'f2 应在 c1 内').toEqual(['c1', 'f1', 'f2'])
    expect(out.map((n) => n.id), '根级只剩 c1').toEqual(['c1'])
    expect(findNode(out, 'c1')!.children!.map((n) => n.id)).toEqual(['f1', 'f2'])
  })

  it('**把根级字段移到嵌套容器内某个字段之后，不得复制到其它容器**', () => {
    // 这是本轮读码发现的缺陷场景：target 在 c1 内，c2 与目标无关
    const tree = [card('c1', [field('f1')]), card('c2', [field('f2')]), field('f0')]
    const out = moveNodeRelative(tree, 'f0', 'f1', 'after')

    const all = ids(out)
    expect(all.filter((id) => id === 'f0'), `f0 出现了 ${all.filter((i) => i === 'f0').length} 次`).toHaveLength(1)
    expect(findNode(out, 'c1')!.children!.map((n) => n.id), 'f0 应进 c1').toEqual(['f1', 'f0'])
    expect(findNode(out, 'c2')!.children!.map((n) => n.id), 'c2 不该被污染').toEqual(['f2'])
  })
})

describe('domain · moveNodeInTree：同类缺陷必须同口径', () => {
  it('移到根级指定索引', () => {
    const tree = [field('a'), field('b'), field('c')]
    const out = moveNodeInTree(tree, 'c', null, 0)
    expect(out.map((n) => n.id)).toEqual(['c', 'a', 'b'])
  })

  it('移入容器指定索引', () => {
    const tree = [card('c1', [field('f1')]), field('f2')]
    const out = moveNodeInTree(tree, 'f2', 'c1', 0)
    expect(findNode(out, 'c1')!.children!.map((n) => n.id)).toEqual(['f2', 'f1'])
  })

  it('**容器移进自己的后代 → 整棵树原样不动**（否则子树全丢）', () => {
    // 关键：外层容器必须**不在根级** —— 否则"退回根级追加"恰好等价，
    // 去掉守卫也看不出差别（负向对照探 3 首轮就是这么漏的）
    const tree = [card('host', [card('outer', [card('inner', [field('deep')])])])]
    const snapshot = JSON.parse(JSON.stringify(tree))
    const out = moveNodeInTree(tree, 'outer', 'inner', 0)
    expect(out).toEqual(snapshot)
    expect(ids(out), 'host/outer/inner/deep 都必须在').toEqual(['host', 'outer', 'inner', 'deep'])
  })

  it('**目标容器不存在 → 退回根级追加，节点不丢**', () => {
    const tree = [card('c1', [field('f1')]), field('f2')]
    const out = moveNodeInTree(tree, 'f2', 'ghost', 0)
    expect(ids(out)).toContain('f2')
    expect(out.map((n) => n.id), 'f2 应回到根级').toEqual(['c1', 'f2'])
  })
})

describe('domain · moveNodeRelative：自环与非法目标', () => {
  it('**容器拖到自己的子节点之后：整棵树原样不动**（不消失、也不被挪到别处）', () => {
    const tree = [card('c1', [field('f1')]), field('x')]
    const snapshot = JSON.parse(JSON.stringify(tree))
    const out = moveNodeRelative(tree, 'c1', 'f1', 'after')
    // 注意：只断言"节点还在"太弱 —— 把容器挪到根级末尾也满足它。
    // 非法落点的正确语义是「什么都没发生」，所以必须深比较整棵树。
    expect(out).toEqual(snapshot)
  })

  it('**容器拖进自己的子容器：整棵树原样不动**（不得丢失整棵子树）', () => {
    const tree = [card('outer', [card('inner', [field('deep')])])]
    const snapshot = JSON.parse(JSON.stringify(tree))
    const out = moveNodeRelative(tree, 'outer', 'inner', 'inside')
    expect(out).toEqual(snapshot)
    expect(ids(out), 'outer/inner/deep 都必须在').toEqual(['outer', 'inner', 'deep'])
  })

  it('**拖到自己身上：整棵树原样不动**', () => {
    const tree = [field('a'), card('c1', [field('f1')])]
    const snapshot = JSON.parse(JSON.stringify(tree))
    expect(moveNodeRelative(tree, 'c1', 'c1', 'after')).toEqual(snapshot)
    expect(moveNodeRelative(tree, 'c1', 'c1', 'inside')).toEqual(snapshot)
  })

  it('目标不存在（before/after）→ 追加到根级末尾，节点不丢', () => {
    const tree = [field('a'), field('b')]
    const out = moveNodeRelative(tree, 'a', 'ghost', 'after')
    expect(ids(out).sort()).toEqual(['a', 'b'])
  })

  it('**inside 的目标容器不存在 → 退回根级，节点不丢**（不能静默消失）', () => {
    const tree = [card('c1', [field('f1')]), field('a')]
    const out = moveNodeRelative(tree, 'a', 'ghost', 'inside')
    expect(ids(out), 'a 必须还在树里').toContain('a')
    expect(out.map((n) => n.id), 'a 退回根级末尾').toEqual(['c1', 'a'])
  })
})
