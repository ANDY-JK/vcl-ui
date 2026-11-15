/**
 * slot-utils · 容器槽位的本地交互状态（#490）
 *
 * 这些是**画布本地 UI 状态**（激活 tab / 折叠展开 / 当前步骤），不写回 schema、不进撤销栈。
 * 之前只在 `designer-canvas-dnd.spec.ts` 里被间接碰到几条，本文件把它们逐条钉住。
 *
 * 三个可疑点（先写用例钉实际行为，再决定改不改）：
 *
 *  ① `activeStepIndex` 读回 `containerConfig.activeStep` 时**没有钳制**，而 `setActiveStep`
 *    写的时候钳了。配置里存了越界值（比如从别的工具导入的 schema 写了 activeStep: 99，
 *    或步骤被删了但 activeStep 没同步）→ 返回越界下标 →
 *    `activeSlotOf` 把它当**槽位号**返回，拖入的字段落到一个不存在的槽位里。
 *
 *  ② `activeTabName` 读回 `containerConfig.activeTab` 时有校验（`tabs.some(t => t.name === saved)`），
 *    越界/失效值会退到第一个 —— 这一条是对的，本文件把它钉住当回归护栏。
 *
 *  ③ collapse 的展开状态与"最后交互项"是**两个独立 ref**（`localCollapseOpen` 按
 *    `${node.id}:${index}` 记，`localActiveCollapse` 按 `node.id` 记）。折叠项被删掉一个后，
 *    展开状态还留在旧索引上 → 展开/收起错位。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  activeSlotOf,
  activeStepIndex,
  activeTabIndex,
  activeTabName,
  childrenInSlot,
  collapseActiveIndex,
  collapseSlots,
  isCollapseOpen,
  setActiveStep,
  setActiveTab,
  stepSlots,
  tabSlots,
  toggleCollapse,
  localActiveCollapse,
  localActiveStep,
  localActiveTab,
  localCollapseOpen,
} from '@/components/form-builder/designer/slot-utils'
import type { DesignerNode } from '@/components/form-builder/designer/types'

function node(patch: Partial<DesignerNode> = {}): DesignerNode {
  return {
    id: 'n1',
    type: 'steps',
    label: '容器',
    isContainer: true,
    children: [],
    ...patch,
  } as DesignerNode
}

/** 清掉模块级本地状态（这些 ref 是模块级的，跨用例会串） */
beforeEach(() => {
  localActiveTab.value = {}
  localCollapseOpen.value = {}
  localActiveCollapse.value = {}
  localActiveStep.value = {}
})

describe('slot-utils · 槽位列表回退', () => {
  it('未配置 tabs → 用容器 label 兜底出一个 tab', () => {
    const n = node({ type: 'tabs', label: '信息分页' })
    expect(tabSlots(n)).toHaveLength(1)
    expect(tabSlots(n)[0].label).toBe('信息分页')
  })

  it('配置了 tabs → 原样返回', () => {
    const n = node({
      type: 'tabs',
      containerConfig: { tabs: [{ label: '甲', name: 'a' }, { label: '乙', name: 'b' }] },
    })
    expect(tabSlots(n).map((t) => t.name)).toEqual(['a', 'b'])
  })

  it('collapse / steps 未配置时也各有兜底', () => {
    expect(collapseSlots(node({ type: 'collapse', label: '更多' }))).toHaveLength(1)
    expect(stepSlots(node({ type: 'steps', label: '审批' }))).toHaveLength(1)
  })

  it('**连容器 label 都没有 → 兜底走 i18n（不能是空标题）**', () => {
    const bare = node({ type: 'tabs', label: '' })
    expect(tabSlots(bare)[0].label).not.toBe('')
    expect(tabSlots(bare)[0].name).toBe('tab1')
    expect(collapseSlots(node({ type: 'collapse', label: '' }))[0].title).not.toBe('')
    expect(stepSlots(node({ type: 'steps', label: '' }))[0].title).not.toBe('')
  })

  it('childrenInSlot：按 containerSlot 归属，缺省算 0 号槽', () => {
    const n = node({
      children: [
        { id: 'a', type: 'text', label: 'A', containerSlot: 0 },
        { id: 'b', type: 'text', label: 'B', containerSlot: 1 },
        { id: 'c', type: 'text', label: 'C' },
      ] as DesignerNode[],
    })
    expect(childrenInSlot(n, 0).map((c) => c.id)).toEqual(['a', 'c'])
    expect(childrenInSlot(n, 1).map((c) => c.id)).toEqual(['b'])
  })

  it('childrenInSlot：容器没有 children → 空数组（不是 undefined）', () => {
    expect(childrenInSlot(node({ children: undefined }), 0)).toEqual([])
  })
})

describe('slot-utils · tabs 激活态（#490）', () => {
  const tabsNode = node({
    type: 'tabs',
    containerConfig: { tabs: [{ label: '甲', name: 'a' }, { label: '乙', name: 'b' }] },
  })

  it('没有本地状态 → 用 containerConfig.activeTab', () => {
    const n = node({ ...tabsNode, containerConfig: { ...tabsNode.containerConfig, activeTab: 'b' } })
    expect(activeTabName(n)).toBe('b')
    expect(activeTabIndex(n)).toBe(1)
  })

  it('**containerConfig.activeTab 指向不存在的 tab → 退到第一个（回归护栏）**', () => {
    const n = node({ ...tabsNode, containerConfig: { ...tabsNode.containerConfig, activeTab: 'nope' } })
    expect(activeTabName(n)).toBe('a')
    expect(activeTabIndex(n)).toBe(0)
  })

  it('本地状态优先于配置（用户点过就以用户为准）', () => {
    const n = node({ ...tabsNode, containerConfig: { ...tabsNode.containerConfig, activeTab: 'a' } })
    setActiveTab(n, 'b')
    expect(activeTabName(n)).toBe('b')
    expect(activeTabIndex(n)).toBe(1)
  })

  it('本地状态 + 配置都指向同一个 tab → 仍返回它（不是空串）', () => {
    const n = node({ ...tabsNode, containerConfig: { ...tabsNode.containerConfig, activeTab: 'b' } })
    setActiveTab(n, 'b')
    expect(activeTabName(n)).toBe('b')
  })

  it('本地状态指向已被删掉的 tab → 退到配置/第一个，不返回空', () => {
    const n = node({ ...tabsNode, containerConfig: { ...tabsNode.containerConfig, activeTab: 'a' } })
    setActiveTab(n, 'gone')
    expect(activeTabName(n)).toBe('a')
  })

  it('配置里没有 activeTab → 第一个 tab', () => {
    expect(activeTabName(node({ type: 'tabs', containerConfig: { tabs: [{ label: '甲', name: 'a' }] } }))).toBe('a')
  })

  it('**配置里 tabs 是空数组 → 走兜底槽位（不是空数组 → 页面空白）**', () => {
    const n = node({ type: 'tabs', containerConfig: { tabs: [] } })
    expect(tabSlots(n)).toHaveLength(1)
    expect(activeTabName(n)).toBe('tab1')
    expect(activeTabIndex(n)).toBe(0)
  })
})

describe('slot-utils · steps 当前步骤的越界（#490）', () => {
  const stepsNode = node({
    type: 'steps',
    containerConfig: { steps: [{ title: '一' }, { title: '二' }] },
  })

  it('未设置 → 0', () => {
    expect(activeStepIndex(stepsNode)).toBe(0)
  })

  it('配置里存了合法值 → 用它', () => {
    const n = node({ ...stepsNode, containerConfig: { ...stepsNode.containerConfig, activeStep: 1 } })
    expect(activeStepIndex(n)).toBe(1)
  })

  it('**配置里存了越界值 → 必须钳到有效范围（旧实现直接返回越界下标）**', () => {
    const n = node({ ...stepsNode, containerConfig: { ...stepsNode.containerConfig, activeStep: 99 } })
    expect(activeStepIndex(n), '越界下标会让 activeSlotOf 返回一个不存在的槽位').toBeLessThan(
      stepSlots(n).length,
    )
  })

  it('配置里存了负值 → 钳到 0', () => {
    const n = node({ ...stepsNode, containerConfig: { ...stepsNode.containerConfig, activeStep: -3 } })
    expect(activeStepIndex(n)).toBe(0)
  })

  it('setActiveStep 越界 → 写进去的是钳制后的值', () => {
    const n = node(stepsNode)
    setActiveStep(n, 99)
    expect(localActiveStep.value[n.id]).toBe(1)
    setActiveStep(n, -5)
    expect(localActiveStep.value[n.id]).toBe(0)
  })

  it('本地状态里的步骤下标 → 优先于配置', () => {
    const n = node({ ...stepsNode, containerConfig: { ...stepsNode.containerConfig, activeStep: 0 } })
    setActiveStep(n, 1)
    expect(activeStepIndex(n)).toBe(1)
  })

  it('activeSlotOf 对 steps 返回有效槽位号', () => {
    const n = node({ ...stepsNode, containerConfig: { ...stepsNode.containerConfig, activeStep: 99 } })
    const slot = activeSlotOf(n)
    expect(slot).toBeGreaterThanOrEqual(0)
    expect(slot!).toBeLessThan(stepSlots(n).length)
  })
})

describe('slot-utils · collapse 展开态与激活项', () => {
  const colNode = node({
    type: 'collapse',
    containerConfig: {
      collapseItems: [
        { title: '一', expanded: true },
        { title: '二', expanded: false },
      ],
    },
  })

  it('没有本地状态 → 用配置的 expanded', () => {
    expect(isCollapseOpen(colNode, 0)).toBe(true)
    expect(isCollapseOpen(colNode, 1)).toBe(false)
  })

  it('下标越界 → 默认展开（不是 undefined）', () => {
    expect(isCollapseOpen(colNode, 9)).toBe(true)
  })

  it('toggleCollapse 翻转展开态，并记下最后交互项', () => {
    toggleCollapse(colNode, 1)
    expect(isCollapseOpen(colNode, 1)).toBe(true)
    expect(collapseActiveIndex(colNode)).toBe(1)
  })

  it('collapseActiveIndex：最后交互项 → 首个展开项 → 0', () => {
    const noExpanded = node({
      type: 'collapse',
      containerConfig: { collapseItems: [{ title: '一', expanded: false }, { title: '二', expanded: false }] },
    })
    expect(collapseActiveIndex(noExpanded)).toBe(0)
    const firstOpen = node({
      type: 'collapse',
      containerConfig: { collapseItems: [{ title: '一', expanded: false }, { title: '二', expanded: true }] },
    })
    expect(collapseActiveIndex(firstOpen)).toBe(1)
  })

  it('activeSlotOf 对 collapse 返回有效槽位号', () => {
    const slot = activeSlotOf(colNode)
    expect(slot).toBeGreaterThanOrEqual(0)
    expect(slot!).toBeLessThan(collapseSlots(colNode).length)
  })

  it('activeSlotOf 对 card/grid → undefined（没有槽位概念）', () => {
    expect(activeSlotOf(node({ type: 'card' }))).toBeUndefined()
    expect(activeSlotOf(node({ type: 'grid' }))).toBeUndefined()
  })

  it('activeSlotOf 对 tabs → 激活 tab 的下标', () => {
    const n = node({
      type: 'tabs',
      containerConfig: { tabs: [{ label: '甲', name: 'a' }, { label: '乙', name: 'b' }], activeTab: 'b' },
    })
    expect(activeSlotOf(n)).toBe(1)
  })
})
