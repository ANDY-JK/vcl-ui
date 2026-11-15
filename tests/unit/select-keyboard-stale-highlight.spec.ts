/**
 * useSelectKeyboard · 高亮游标与"选项列表变短"的错位（#493）
 *
 * ## 缺陷路径（真实可达）
 *
 * 1. 打开面板 → `highlightIdx = -1`；连按 ArrowDown 把它推到 2；
 * 2. 在 combobox 里**输入筛选词** → `navItems`（`filteredOptions`）从 3 条缩到 1 条，
 *    但 `highlightIdx` 没有任何 watcher 重置（`Select.vue` 只在 `openPanel` 里置 -1）；
 * 3. 按 Enter → `onComboKeydown` 里
 *    `const item = navItems.value[highlightIdx.value]; if (!d.isMenu.value) d.selectOption(item)`
 *    —— **`item` 是 `undefined`，而 `selectOption` 第一行就 `if (opt.disabled)`**：
 *    `TypeError: Cannot read properties of undefined (reading 'disabled')`，面板直接白掉。
 *
 * 菜单分支（`onMenuClick`）有 `if (item)` 守卫，普通选项分支没有 —— 同一个函数里
 * 两条路径的健壮性不一致，这本身就是要查的信号。
 *
 * ## 第二条：游标上界的口径不一致
 * `onComboKeydown` 的 ArrowDown 用 `navItems.value.length - 1` 当上界，
 * `onTriggerKeydown` 用 `navCount.value - 1`。树型选择里 `navCount` 是可见树节点数、
 * `navItems` 是 filteredOptions —— 两者可以不同。游标必须钳到**当前列表**的真实长度。
 */
import { describe, it, expect } from 'vitest'
import { computed, ref } from 'vue'
import { useSelectKeyboard } from '@/components/form/composables/useSelectKeyboard'
import type { Option } from '@/components/shared/types'

function opt(value: string, disabled = false): Option {
  return { value, label: value, disabled } as unknown as Option
}

function harness(initial: Option[] = [opt('a'), opt('b'), opt('c')]) {
  const items = ref<Option[]>(initial)
  const calls: string[] = []
  const comboText = ref('')
  const open = ref(false)
  const highlight = ref(-1)
  const navCount = ref(initial.length)
  const d = useSelectKeyboard({
    navItems: computed(() => items.value),
    navCount: computed(() => navCount.value),
    visibleTreeNodes: computed(() => []),
    isMenu: computed(() => false),
    isTreeSelect: computed(() => false),
    open,
    comboText,
    modelValue: computed(() => undefined),
    multiple: false,
    allowCreate: false,
    isImeComposing: () => false,
    matchOptions: () => [],
    findExact: (t) => initial.find((i) => i.value === t),
    commitComboValue: () => calls.push('commit'),
    toggleOpen: () => {
      open.value = true
      calls.push('toggleOpen')
    },
    closePanel: () => {
      open.value = false
      calls.push('close')
    },
    selectOption: (item) => calls.push(`select:${(item as Option | undefined)?.value ?? 'undefined'}`),
    onMenuClick: () => calls.push('menuClick'),
    onTreeNodeClick: () => calls.push('treeClick'),
    focusComboInput: () => calls.push('focus'),
    emitValue: () => calls.push('emitValue'),
    externalHighlight: highlight,
  })
  return { ...d, calls, items, navCount, highlight, comboText, open }
}

const key = (k: string, extra: Record<string, unknown> = {}) =>
  ({ key: k, preventDefault: () => {}, ...extra } as unknown as KeyboardEvent)

/** 模拟"真宿主"的 selectOption 第一行访问（这里用来说明为什么 undefined 会崩） */
describe('useSelectKeyboard · 列表缩短后的陈旧游标（#493）', () => {
  it('**筛选到 1 条后按 Enter：不能把 undefined 交给 selectOption**', () => {
    const h = harness()
    h.open.value = true
    h.onComboKeydown(key('ArrowDown'))
    h.onComboKeydown(key('ArrowDown'))
    h.onComboKeydown(key('ArrowDown'))
    expect(h.highlight.value).toBe(2)

    // 输入筛选词 → 列表变短，但游标没重置
    h.comboText.value = 'a'
    h.items.value = [opt('a')]
    h.navCount.value = 1

    // 真宿主的 selectOption 第一行是 `if (opt.disabled)`，
    // 把 undefined 交过去就是 TypeError —— 这里用 harness 记录"交了什么"来钉住
    h.onComboKeydown(key('Enter'))
    expect(h.calls).not.toContain('select:undefined')
  })

  it('陈旧游标 + Enter：修好后走精确匹配（comboText 命中保留项）', () => {
    const h = harness()
    h.open.value = true
    h.onComboKeydown(key('ArrowDown'))
    h.onComboKeydown(key('ArrowDown'))
    expect(h.highlight.value).toBe(1)
    h.comboText.value = 'a'
    h.items.value = [opt('a')]
    h.navCount.value = 1
    h.onComboKeydown(key('Enter'))
    expect(h.calls, '不该选中越界项').not.toContain('select:undefined')
  })

  it('游标永远不超过当前列表长度（ArrowDown 用 navItems.length 而非 navCount）', () => {
    const h = harness()
    h.open.value = true
    // navCount 故意比 navItems 大（树型/异步加载时的形态）
    h.navCount.value = 10
    for (let i = 0; i < 12; i++) h.onComboKeydown(key('ArrowDown'))
    expect(h.highlight.value, '应钳到列表最后一项，而不是跟着 navCount 跑到 9').toBe(2)
  })

  it('列表清空后 Enter 不抛，也不 select', () => {
    const h = harness()
    h.open.value = true
    h.onComboKeydown(key('ArrowDown'))
    h.highlight.value = 2
    h.items.value = []
    h.navCount.value = 0
    h.comboText.value = 'zzz'
    expect(() => h.onComboKeydown(key('Enter'))).not.toThrow()
    expect(h.calls.filter((c) => c.startsWith('select:'))).toEqual([])
  })

  it('陈旧游标 + 无精确匹配 + 不允许创建 → 什么都不做（不是崩、也不是乱提交）', () => {
    const h = harness()
    h.open.value = true
    h.highlight.value = 2
    h.items.value = [opt('a')]
    h.navCount.value = 1
    h.comboText.value = 'zzz'
    expect(() => h.onComboKeydown(key('Enter'))).not.toThrow()
    expect(h.calls).toEqual([])
  })

  it('陈旧游标会把 highlightIdx 归位（避免 aria-activedescendant 指向不存在的项）', () => {
    const h = harness()
    h.open.value = true
    h.highlight.value = 2
    h.items.value = [opt('a')]
    h.navCount.value = 1
    h.comboText.value = 'zzz'
    h.onComboKeydown(key('Enter'))
    expect(h.highlight.value).toBe(-1)
  })

  it('列表正常时 Enter 仍选中高亮项（回归护栏）', () => {
    const h = harness()
    h.open.value = true
    h.onComboKeydown(key('ArrowDown'))
    h.onComboKeydown(key('ArrowDown'))
    h.onComboKeydown(key('Enter'))
    expect(h.calls).toContain('select:b')
  })

  it('onTriggerKeydown 同样不能选中越界项', () => {
    const h = harness()
    h.open.value = true
    h.highlight.value = 8
    h.items.value = [opt('a')]
    h.navCount.value = 1
    expect(() => h.onTriggerKeydown(key('Enter'))).not.toThrow()
    expect(h.calls).not.toContain('select:undefined')
  })
})
