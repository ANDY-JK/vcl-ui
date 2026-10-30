import { describe, it, expect, vi } from 'vitest'
import { useTreeFlatten } from '@/components/_internal/useTreeFlatten'
import { registerModal } from '@/components/_internal/useModalManager'
import { copyText } from '@/components/_internal/useCopy'
import { blankPlaceholder, getCellText, optColor } from '@/components/data/composables/utils'
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
    expect(flatNodes.value.map((n) => n.node.key)).toEqual(['a', 'b'])
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
    expect(res.some((n) => n.node.key === 'a1')).toBe(true)
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

describe('blankPlaceholder（空白占位：展示层 - 替代）', () => {  it('null/undefined → 默认 -', () => {
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

  it('blankText 传空串 → 关闭占位（空值回落空串）', () => {
    expect(blankPlaceholder(null, '')).toBe('')
    expect(blankPlaceholder(undefined, '')).toBe('')
    expect(blankPlaceholder('  ', '')).toBe('  ')
    expect(blankPlaceholder(0, '')).toBe('0')
  })
})

/* ═══════════ optColor：选项列着色（第 189 轮） ═══════════
 *
 * DataTable 的调用是 `optColor(col, cellVal(...))`，而 cellVal 返回的是
 * `getCellValue(...)` —— **字符串**。旧实现用严格相等 `o.value === val`，
 * 于是数字型选项（状态码 1/2/3、优先级 1/2/3 这类最常见写法）永远匹配不上，
 * 颜色静默失效（用户看到的是"配了颜色但不生效"）。
 */
describe('optColor（选项列取值颜色）', () => {
  const colOf = (options: unknown): Column => ({ key: 's', title: '状态', options }) as Column

  it('字符串选项值命中 → 返回其 color', () => {
    expect(optColor(colOf(['待办', { value: 'doing', label: '进行中', color: '#f59e0b' }]), 'doing')).toBe('#f59e0b')
  })

  it('**数字选项值也要命中**（单元格值是字符串，`1 === "1"` 会漏）', () => {
    const col = colOf([
      { value: 1, label: '待办', color: '#ef4444' },
      { value: 2, label: '已完成', color: '#10b981' },
    ])
    expect(optColor(col, '1'), '状态码 1 应着红色').toBe('#ef4444')
    expect(optColor(col, '2')).toBe('#10b981')
    // 防御：下游直接传原始值（数字）也要命中 —— 两侧都 String 化才稳
    expect(optColor(col, 1 as never), 'val 为数字时同样命中').toBe('#ef4444')
    // 布尔型选项值同理
    const boolCol = colOf([{ value: true, label: '是', color: '#0ea5e9' }])
    expect(optColor(boolCol, 'true')).toBe('#0ea5e9')
  })

  it('未命中 / 选项无 color → inherit', () => {
    const col = colOf([{ value: 'a', label: 'A' }])
    expect(optColor(col, 'a')).toBe('inherit')
    expect(optColor(col, 'nope')).toBe('inherit')
    expect(optColor(colOf(undefined), 'x')).toBe('inherit')
  })

  it('**col 为 undefined 时不抛错**（表格列定义异步到达时可达）', () => {
    expect(() => optColor(undefined as never, 'x')).not.toThrow()
    expect(optColor(undefined as never, 'x')).toBe('inherit')
  })
})
