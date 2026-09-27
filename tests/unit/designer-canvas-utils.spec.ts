// canvas-utils 纯函数单测 — 设计器画布的拖拽落点/选中判定/预览假数据（自述"可按域单测独立覆盖"的兑现）
import { describe, it, expect } from 'vitest'
import {
  isSelected,
  showIndicator,
  childDropPos,
  gridColSpan,
  findContainerOfChildren,
  resolveDropPos,
  previewFakeData,
} from '@/components/form-builder/designer/canvas-utils'
import type { DesignerNode } from '@/components/form-builder/designer/types'

const field = (over: Partial<DesignerNode> = {}): DesignerNode =>
  ({ id: 'f1', type: 'text', label: '字段', key: 'f1', ...over }) as DesignerNode
const container = (over: Partial<DesignerNode> = {}): DesignerNode =>
  ({ id: 'c1', type: 'grid', label: '容器', isContainer: true, children: [], ...over }) as DesignerNode

/** 构造伪 DragEvent：currentTarget 的 rect 高度 + clientY 决定落点分区 */
const dragEvent = (height: number, offsetY: number): DragEvent =>
  ({
    clientY: offsetY,
    currentTarget: { getBoundingClientRect: () => ({ top: 0, height, bottom: height }) },
  }) as unknown as DragEvent

describe('选中与落点指示判定', () => {
  it('isSelected：单选命中 / 多选集合命中 / 双双不中', () => {
    expect(isSelected('a', 'a', [])).toBe(true)
    expect(isSelected('a', null, ['x', 'a'])).toBe(true)
    expect(isSelected('a', 'b', ['x'])).toBe(false)
  })

  it('showIndicator：仅当节点是 dropTarget 且位置一致时显示', () => {
    expect(showIndicator('a', 'before', 'a', 'before')).toBe(true)
    expect(showIndicator('a', 'before', 'a', 'after')).toBe(false)
    expect(showIndicator('a', 'before', 'b', 'before')).toBe(false)
    expect(showIndicator('a', 'before', null, null)).toBe(false)
  })

  it('childDropPos：命中返回位置，未命中恒 null（含 inside）', () => {
    expect(childDropPos('a', 'a', 'inside')).toBe('inside')
    expect(childDropPos('a', 'b', 'before')).toBe(null)
  })
})

describe('gridColSpan：24 栏制按容器列数折算', () => {
  const parent = (columns?: number) => container({ containerConfig: { columns } as never })

  it('两列容器：span 24 → 2 列满、span 12 → 1 列、span 6 → 1 列（向上取整不丢）', () => {
    expect(gridColSpan(parent(2), field({ span: 24 }))).toBe(2)
    expect(gridColSpan(parent(2), field({ span: 12 }))).toBe(1)
    expect(gridColSpan(parent(2), field({ span: 6 }))).toBe(1)
  })

  it('三列容器：span 16 → 2 列（8/24*3=2）', () => {
    expect(gridColSpan(parent(3), field({ span: 16 }))).toBe(2)
  })

  it('边界钳制：columns 缺省按 2、span 缺失按 24、columns 最小 1、span 最小 1', () => {
    expect(gridColSpan(container(), field({ span: 24 }))).toBe(2)
    expect(gridColSpan(parent(2), field())).toBe(2)
    expect(gridColSpan(parent(0), field({ span: 24 }))).toBe(1)
    expect(gridColSpan(parent(2), field({ span: 0 }))).toBe(1)
  })
})

describe('findContainerOfChildren：按 children 数组引用定位容器', () => {
  it('顶层命中 / 嵌套深度优先先命中浅层 / 引用不同不命中', () => {
    const childList: DesignerNode[] = [field()]
    const top = container({ children: childList })
    expect(findContainerOfChildren([top], childList)).toBe(top)

    const deep = container({ id: 'c2', children: childList })
    const root = container({ children: [top] })
    // 列表顺序 [deep, root]：deep 自身 children 即目标，先于 root 的嵌套命中
    expect(findContainerOfChildren([deep, root], childList)).toBe(deep)
    // 列表顺序 [root, deep]：root 的嵌套里 top.children===目标，深度优先命中 top
    expect(findContainerOfChildren([root, deep], childList)).toBe(top)

    const other: DesignerNode[] = [field({ id: 'f2' })]
    expect(findContainerOfChildren([top], other)).toBe(null)
  })
})

describe('resolveDropPos：容器 25/50/25 三区、字段 50/50 两区', () => {
  it('面板拖入容器：一律 inside（不区分前后）', () => {
    expect(resolveDropPos(dragEvent(100, 5), container(), false)).toBe('inside')
    expect(resolveDropPos(dragEvent(100, 95), container(), false)).toBe('inside')
  })

  it('排序拖拽容器：<25% before、>75% after、中段 inside', () => {
    expect(resolveDropPos(dragEvent(100, 10), container(), true)).toBe('before')
    expect(resolveDropPos(dragEvent(100, 90), container(), true)).toBe('after')
    expect(resolveDropPos(dragEvent(100, 50), container(), true)).toBe('inside')
  })

  it('字段节点：上半 before、下半 after', () => {
    expect(resolveDropPos(dragEvent(100, 30), field(), true)).toBe('before')
    expect(resolveDropPos(dragEvent(100, 70), field(), true)).toBe('after')
    expect(resolveDropPos(dragEvent(100, 30), field(), false)).toBe('before')
  })

  it('rect 高度 0（隐藏节点）不除零：ratio=0 → before', () => {
    expect(resolveDropPos(dragEvent(0, 0), field(), true)).toBe('before')
  })
})

describe('previewFakeData：按字段类型生成预览初始值（与 FormRenderer 默认值口径一致）', () => {
  it('基础类型：text 取 placeholder、number/slider 取 min、select/cascader/date 为 null', () => {
    const data = previewFakeData([
      field({ id: 'a', key: 'a', type: 'text', placeholder: '请输入' }),
      field({ id: 'b', key: 'b', type: 'textarea' }),
      field({ id: 'c', key: 'c', type: 'number', min: 5 }),
      field({ id: 'd', key: 'd', type: 'slider' }),
      field({ id: 'e', key: 'e', type: 'select' }),
      field({ id: 'g', key: 'g', type: 'date' }),
    ])
    expect(data).toEqual({ a: '请输入', b: '', c: 5, d: 0, e: null, g: null })
  })

  it('选项类：radio 取首项、checkbox 多选项取 [首项] 单选项取 []、switch false、rate 取满值一半向上', () => {
    const opts = ['甲', '乙']
    const data = previewFakeData([
      field({ id: 'r', key: 'r', type: 'radio', options: opts }),
      field({ id: 'cb', key: 'cb', type: 'checkbox', options: opts }),
      field({ id: 'cb1', key: 'cb1', type: 'checkbox', options: ['唯一'] }),
      field({ id: 's', key: 's', type: 'switch' }),
      field({ id: 'rt', key: 'rt', type: 'rate', rateMax: 5 }),
      field({ id: 'rt10', key: 'rt10', type: 'rate', rateMax: 10 }),
    ])
    expect(data).toEqual({ r: '甲', cb: ['甲'], cb1: [], s: false, rt: 3, rt10: 5 })
  })

  it('v3 高级字段与 upload：数组/空串/null 归位', () => {
    const data = previewFakeData([
      field({ id: 'u', key: 'u', type: 'upload' }),
      field({ id: 'sf', key: 'sf', type: 'subform' }),
      field({ id: 'rt', key: 'rt', type: 'richtext' }),
      field({ id: 'sig', key: 'sig', type: 'signature' }),
      field({ id: 'mx', key: 'mx', type: 'matrix' }),
      field({ id: 'sr', key: 'sr', type: 'serial' }),
      field({ id: 'unk', key: 'unk', type: '未知类型' as never }),
    ])
    expect(data).toEqual({ u: [], sf: [], rt: '', sig: '', mx: {}, sr: null, unk: null })
  })

  it('容器节点不产值但递归子字段；无 key 时回退 id', () => {
    const data = previewFakeData([
      container({ children: [field({ id: 'inner', key: 'inner', type: 'switch' })] }),
      { id: 'noid', type: 'switch', label: '无key字段' } as DesignerNode,
    ])
    expect(data).toEqual({ inner: false, noid: false })
  })
})
