import { describe, it, expect, vi } from 'vitest'
import { useTreeFlatten } from '@/components/_internal/useTreeFlatten'
import { registerModal } from '@/components/_internal/useModalManager'
import { copyText } from '@/components/_internal/useCopy'
import { blankPlaceholder, getCellText } from '@/components/data/composables/utils'
import type { Column } from '@/components/data/composables/types'

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

// 空白占位取原值语义（与小程序库 6.14.57 对齐）：getCellText 只供数据通道，不得注入占位符
describe('getCellText — 保持原值，不注入占位符', () => {
  const col: Column = { key: 'v', title: 'V' }

  it('null/undefined → 空串（不再返回硬编码 -）', () => {
    expect(getCellText(null, col, {}, 0)).toBe('')
    expect(getCellText(undefined, col, {}, 0)).toBe('')
  })

  it('0/false 等合法值原样返回', () => {
    expect(getCellText(0, col, {}, 0)).toBe('0')
    expect(getCellText(false, col, {}, 0)).toBe('false')
  })

  it('render 返回 null/undefined 时也返回空串（导出不被 - 污染）', () => {
    const renderCol: Column = { key: 'v', title: 'V', render: () => null as unknown as string }
    expect(getCellText('x', renderCol, {}, 0)).toBe('')
  })
})

describe('blankPlaceholder（空白占位：展示层 - 替代）', () => {
  it('null/undefined → 默认 -', () => {
    expect(blankPlaceholder(null)).toBe('-')
    expect(blankPlaceholder(undefined)).toBe('-')
  })

  it('空串与纯空白串 → -', () => {
    expect(blankPlaceholder('')).toBe('-')
    expect(blankPlaceholder('   ')).toBe('-')
    expect(blankPlaceholder('\t\n')).toBe('-')
  })

  it('0/false/字符串 0 是合法数据，不占位', () => {
    expect(blankPlaceholder(0)).toBe('0')
    expect(blankPlaceholder(false)).toBe('false')
    expect(blankPlaceholder('0')).toBe('0')
  })

  it('有值原样返回，首尾空白不裁剪', () => {
    expect(blankPlaceholder('北京')).toBe('北京')
    expect(blankPlaceholder('  中 间  ')).toBe('  中 间  ')
  })

  it('支持自定义占位符', () => {
    expect(blankPlaceholder(null, '—')).toBe('—')
    expect(blankPlaceholder('', '暂无')).toBe('暂无')
  })

  it("blankText 传空串 → 关闭占位（空值回落空串）", () => {
    expect(blankPlaceholder(null, '')).toBe('')
    expect(blankPlaceholder(undefined, '')).toBe('')
    expect(blankPlaceholder('  ', '')).toBe('  ')
    expect(blankPlaceholder(0, '')).toBe('0')
  })
})
