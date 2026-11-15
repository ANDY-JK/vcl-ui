/**
 * useSelectKeyboard · **触发器型** keydown（onTriggerKeydown，含菜单 / 树 / 普通三套）
 *
 * 此前只有 `select-keyboard-compose.spec.ts` 覆盖 `onComboKeydown`，`onTriggerKeydown`
 * **一条都没有** —— 100+ 行键位分支全靠 e2e 间接兜。本文件逐条钉住：
 * 菜单（Arrow 开面板 / Home End / Enter 点选项 / Space 开面板）、树（Enter 点节点）、
 * 普通（Arrow 开面板 / ArrowUp / Home End / Enter 选中），以及两个真缺陷：
 *
 *   ① **面板关着时按 ArrowUp 会偷偷移动游标**（#499）：ArrowDown 在关着时是
 *      `toggleOpen()` 然后 return，`Home/End` 在关着时直接 return，
 *      只有 ArrowUp 不看 `open` —— 于是"先按 ↑ 再按 ↓"会把第一条跳过。
 *
 *   ② 普通分支里 `if (d.isMenu.value) d.onMenuClick(...)` 是**死代码**：
 *      函数开头 `if (d.isMenu.value) { … return }` 已经把所有菜单路径挡掉了，
 *      走到这里时 `isMenu` 必然为 false。
 */
import { describe, it, expect, vi } from 'vitest'
import { computed, ref } from 'vue'
import { useSelectKeyboard } from '@/components/form/composables/useSelectKeyboard'
import type { Option } from '@/components/shared/types'

function opt(value: string, disabled = false): Option {
  return { value, label: value, disabled } as unknown as Option
}

interface Cfg {
  isMenu?: boolean
  isTreeSelect?: boolean
  open?: boolean
  items?: Option[]
  treeNodes?: unknown[]
  navCount?: number
}

function harness(cfg: Cfg = {}) {
  const calls: string[] = []
  const items = ref<Option[]>(cfg.items ?? [opt('a'), opt('b'), opt('c')])
  const treeNodes = ref<unknown[]>(cfg.treeNodes ?? [])
  const open = ref(cfg.open ?? false)
  const comboText = ref('')
  const highlight = ref(-1)
  const isMenu = ref(cfg.isMenu ?? false)
  const isTreeSelect = ref(cfg.isTreeSelect ?? false)

  const d = useSelectKeyboard({
    navItems: computed(() => items.value),
    navCount: computed(() => cfg.navCount ?? items.value.length),
    visibleTreeNodes: computed(() => treeNodes.value),
    isMenu: computed(() => isMenu.value),
    isTreeSelect: computed(() => isTreeSelect.value),
    open,
    comboText,
    modelValue: computed(() => undefined),
    multiple: false,
    allowCreate: false,
    isImeComposing: () => false,
    matchOptions: () => [],
    findExact: () => undefined,
    commitComboValue: () => calls.push('commit'),
    toggleOpen: () => {
      open.value = !open.value
      calls.push('toggleOpen')
    },
    closePanel: () => {
      open.value = false
      calls.push('close')
    },
    selectOption: (o) => calls.push(`select:${o?.value ?? 'undefined'}`),
    onMenuClick: (m) => calls.push(`menu:${(m as unknown as Option)?.value ?? 'undefined'}`),
    onTreeNodeClick: () => calls.push('treeClick'),
    focusComboInput: () => calls.push('focus'),
    emitValue: () => calls.push('emitValue'),
    externalHighlight: highlight,
  })
  return { ...d, calls, items, treeNodes, open, highlight, isMenu, isTreeSelect, comboText }
}

const key = (k: string) => ({ key: k, preventDefault: vi.fn() }) as unknown as KeyboardEvent

describe('onTriggerKeydown · 通用收口', () => {
  it('Escape → 关面板，不碰游标', () => {
    const h = harness({ open: true })
    h.highlight.value = 2
    h.onTriggerKeydown(key('Escape'))
    expect(h.open.value).toBe(false)
    expect(h.highlight.value).toBe(2)
    expect(h.calls).toEqual(['close'])
  })

  it('Tab → 关面板（不 preventDefault：让焦点正常离开）', () => {
    const h = harness({ open: true })
    const e = key('Tab')
    h.onTriggerKeydown(e)
    expect(h.open.value).toBe(false)
    expect(e.preventDefault, 'Tab 不能拦').not.toHaveBeenCalled()
    expect(h.calls).toEqual(['close'])
  })
})

describe('onTriggerKeydown · 菜单型', () => {
  it('面板关着 → ArrowDown / ArrowUp 都先开面板，不动游标', () => {
    const h = harness({ isMenu: true })
    h.onTriggerKeydown(key('ArrowDown'))
    expect(h.open.value).toBe(true)
    expect(h.highlight.value).toBe(-1)
    h.open.value = false
    h.onTriggerKeydown(key('ArrowUp'))
    expect(h.open.value).toBe(true)
    expect(h.highlight.value).toBe(-1)
    expect(h.calls).toEqual(['toggleOpen', 'toggleOpen'])
  })

  it('面板打开 → ArrowDown / ArrowUp 移动游标并夹在两端', () => {
    const h = harness({ isMenu: true, open: true })
    h.onTriggerKeydown(key('ArrowDown'))
    expect(h.highlight.value).toBe(0)
    h.onTriggerKeydown(key('ArrowDown'))
    h.onTriggerKeydown(key('ArrowDown'))
    expect(h.highlight.value, '触底不再加').toBe(2)
    h.onTriggerKeydown(key('ArrowUp'))
    expect(h.highlight.value).toBe(1)
    h.highlight.value = 0
    h.onTriggerKeydown(key('ArrowUp'))
    expect(h.highlight.value, '触顶不再减').toBe(0)
  })

  it('菜单项为空时 ArrowDown 把游标夹成 -1（不能跑到 0）', () => {
    const h = harness({ isMenu: true, open: true, items: [], navCount: 0 })
    h.onTriggerKeydown(key('ArrowDown'))
    expect(h.highlight.value).toBe(-1)
  })

  it('Home / End：关着不动（留给页面滚动）；打开后跳首尾', () => {
    const h = harness({ isMenu: true })
    const homeClosed = key('Home')
    h.onTriggerKeydown(homeClosed)
    expect(h.highlight.value).toBe(-1)
    expect(homeClosed.preventDefault, '关着时别拦 Home').not.toHaveBeenCalled()

    h.open.value = true
    h.onTriggerKeydown(key('End'))
    expect(h.highlight.value).toBe(2)
    h.onTriggerKeydown(key('Home'))
    expect(h.highlight.value).toBe(0)
  })

  it('Enter（打开且有游标）→ 点该菜单项', () => {
    const h = harness({ isMenu: true, open: true })
    h.highlight.value = 1
    h.onTriggerKeydown(key('Enter'))
    expect(h.calls).toEqual(['menu:b'])
  })

  it('Enter（打开但游标越界 / 无游标）→ 什么都不点', () => {
    const h = harness({ isMenu: true, open: true })
    h.highlight.value = -1
    h.onTriggerKeydown(key('Enter'))
    h.highlight.value = 9
    h.onTriggerKeydown(key('Enter'))
    expect(h.calls).toEqual([])
  })

  it('Enter / Space（关着）→ 开面板（键盘可发现性）', () => {
    const h = harness({ isMenu: true })
    h.onTriggerKeydown(key('Enter'))
    expect(h.open.value).toBe(true)
    h.open.value = false
    h.onTriggerKeydown(key(' '))
    expect(h.open.value).toBe(true)
    expect(h.calls.filter((c) => c === 'toggleOpen')).toHaveLength(2)
  })
})

describe('onTriggerKeydown · 普通型（非菜单）', () => {
  it('关着 → ArrowDown / Enter 都先开面板，不动游标', () => {
    const h = harness()
    h.onTriggerKeydown(key('ArrowDown'))
    expect(h.open.value).toBe(true)
    expect(h.highlight.value).toBe(-1)
    h.open.value = false
    h.onTriggerKeydown(key('Enter'))
    expect(h.open.value).toBe(true)
    expect(h.highlight.value).toBe(-1)
  })

  it('打开 → ArrowDown 移动游标', () => {
    const h = harness({ open: true })
    h.onTriggerKeydown(key('ArrowDown'))
    expect(h.highlight.value).toBe(0)
    h.onTriggerKeydown(key('ArrowDown'))
    expect(h.highlight.value).toBe(1)
  })

  it('打开 + Enter + 有游标 → selectOption 选中该项', () => {
    const h = harness({ open: true })
    h.highlight.value = 2
    h.onTriggerKeydown(key('Enter'))
    expect(h.calls).toEqual(['select:c'])
  })

  it('打开 + Enter + 游标越界 → 不把 undefined 交给宿主，游标归位', () => {
    const h = harness({ open: true })
    h.highlight.value = 9
    h.onTriggerKeydown(key('Enter'))
    expect(h.calls).toEqual([])
    expect(h.highlight.value).toBe(-1)
  })

  it('**面板关着按 ArrowUp 不该移动游标**（#499）', () => {
    const h = harness()
    h.onTriggerKeydown(key('ArrowUp'))
    expect(h.highlight.value, '关着时按 ↑ 只是"没反应"，不能把游标挪到 0').toBe(-1)
    expect(h.open.value, '↑ 不负责开面板（与既有行为一致）').toBe(false)

    // 关键后果：先按 ↑ 再按 ↓ 开面板，第一条不能被跳过
    h.onTriggerKeydown(key('ArrowDown'))
    expect(h.open.value).toBe(true)
    expect(h.highlight.value).toBe(-1)
    h.onTriggerKeydown(key('ArrowDown'))
    expect(h.highlight.value, '打开后第一次 ↓ 应落在第 0 条').toBe(0)
  })

  it('打开后 ArrowUp 触顶不减、Home/End 跳首尾', () => {
    const h = harness({ open: true })
    h.highlight.value = 0
    h.onTriggerKeydown(key('ArrowUp'))
    expect(h.highlight.value).toBe(0)
    h.onTriggerKeydown(key('End'))
    expect(h.highlight.value).toBe(2)
    h.onTriggerKeydown(key('Home'))
    expect(h.highlight.value).toBe(0)
  })

  it('Home / End 关着不动（留给页面滚动）', () => {
    const h = harness()
    const e = key('End')
    h.onTriggerKeydown(e)
    expect(h.highlight.value).toBe(-1)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })
})

describe('onTriggerKeydown · 树型', () => {
  it('打开 + Enter + 有游标 → 点可见树节点（不走 selectOption）', () => {
    const node = { key: 'n1', label: '节点1' }
    const h = harness({ isTreeSelect: true, open: true, treeNodes: [node], items: [] })
    h.highlight.value = 0
    h.onTriggerKeydown(key('Enter'))
    expect(h.calls).toEqual(['treeClick'])
  })

  it('打开 + Enter + 树节点缺失 → 不抛、不派发', () => {
    const h = harness({ isTreeSelect: true, open: true, treeNodes: [], items: [] })
    h.highlight.value = 0
    expect(() => h.onTriggerKeydown(key('Enter'))).not.toThrow()
    expect(h.calls).toEqual([])
  })
})
