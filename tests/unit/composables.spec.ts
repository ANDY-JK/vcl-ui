import { describe, it, expect, vi } from 'vitest'
import { useTreeFlatten } from '@/components/_internal/useTreeFlatten'
import { registerModal } from '@/components/_internal/useModalManager'
import { copyText } from '@/components/_internal/useCopy'

interface TreeNode {
  key: string
  label: string
  children?: TreeNode[]
}

const tree: TreeNode[] = [
  { key: 'a', label: '节点A', children: [{ key: 'a1', label: '节点A1' }] },
  { key: 'b', label: '节点B' },
]

describe('useTreeFlatten', () => {
  it('初始只展平根节点', () => {
    const { flatNodes } = useTreeFlatten<TreeNode>({ data: () => tree })
    expect(flatNodes.value).toHaveLength(2)
    expect(flatNodes.value.map(n => n.node.key)).toEqual(['a', 'b'])
    expect(flatNodes.value[0].isLeaf).toBe(false)
    expect(flatNodes.value[1].isLeaf).toBe(true)
  })

  it('展开后包含子节点', () => {
    const { flatNodes, toggleExpand, isExpanded } = useTreeFlatten<TreeNode>({ data: () => tree })
    toggleExpand('a')
    expect(isExpanded('a')).toBe(true)
    expect(flatNodes.value).toHaveLength(3)
    expect(flatNodes.value[1].node.key).toBe('a1')
    expect(flatNodes.value[1].depth).toBe(1)
  })

  it('expandAll / collapseAll', () => {
    const { flatNodes, expandAll, collapseAll } = useTreeFlatten<TreeNode>({ data: () => tree })
    expandAll()
    expect(flatNodes.value).toHaveLength(3)
    collapseAll()
    expect(flatNodes.value).toHaveLength(2)
  })

  it('filterByKeyword 匹配含祖先', () => {
    const { filterByKeyword } = useTreeFlatten<TreeNode>({ data: () => tree })
    const res = filterByKeyword('A1')
    expect(res.length).toBeGreaterThan(0)
    expect(res.some(n => n.node.key === 'a1')).toBe(true)
  })

  it('filterByKeyword 空关键词返回全部', () => {
    const { filterByKeyword } = useTreeFlatten<TreeNode>({ data: () => tree })
    expect(filterByKeyword('')).toHaveLength(2)
  })
})

describe('registerModal', () => {
  it('注册后注销', () => {
    const close = vi.fn()
    const unregister = registerModal(close)
    unregister()
    // 无异常即通过
    expect(true).toBe(true)
  })

  it('新弹窗注册会关闭上一个', () => {
    const close1 = vi.fn()
    const close2 = vi.fn()
    registerModal(close1)
    registerModal(close2)
    expect(close1).toHaveBeenCalledTimes(1)
  })
})

describe('copyText', () => {
  it('空文本返回 false', async () => {
    expect(await copyText('')).toBe(false)
  })

  it('Clipboard API 可用时返回 true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    expect(await copyText('hello')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })
})
