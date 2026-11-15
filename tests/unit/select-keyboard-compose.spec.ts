/* useSelectKeyboard 编排层 · 键位与游标（#454）
 *
 * 从 Select.vue 下沉的两套 keydown 处理器 + 高亮游标。
 * 本 spec 在最小 harness 上钉住：游标边界、Escape 收口、Home/End、树型 Enter 走节点点击。
 */
import { describe, it, expect } from 'vitest'
import { ref, computed } from 'vue'
import { useSelectKeyboard } from '@/components/form/composables/useSelectKeyboard'
import type { Option } from '@/components/shared/types'

function opt(value: string, disabled = false): Option {
  return { value, label: value, disabled } as unknown as Option
}

function harness() {
  const items = [opt('a'), opt('b'), opt('c')]
  const calls: string[] = []
  const comboText = ref('')
  const open = ref(false)
  const highlight = ref(-1)
  const emitted: (string | number | boolean)[][] = []
  const d = useSelectKeyboard({
    navItems: computed(() => items),
    navCount: computed(() => items.length),
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
    findExact: (t) => items.find((i) => i.value === t),
    commitComboValue: () => calls.push('commit'),
    toggleOpen: () => {
      open.value = true
      calls.push('toggleOpen')
    },
    closePanel: () => {
      open.value = false
      calls.push('close')
    },
    selectOption: () => calls.push('selectOption'),
    onMenuClick: () => calls.push('menuClick'),
    onTreeNodeClick: () => calls.push('treeClick'),
    focusComboInput: () => calls.push('focus'),
    emitValue: (v) => {
      emitted.push(v)
      calls.push('emitValue')
    },
    externalHighlight: highlight,
  })
  return { ...d, calls, emitted, items, highlight, comboText, open }
}

/**
 * 可配 `multiple` / `allowCreate` 的 harness（#499 补的组合框提交分支）。
 * `findExact` / `matchOptions` 直接给，避免依赖真实选项列表的防抖更新。
 */
function comboHarness(cfg: {
  multiple?: boolean
  allowCreate?: boolean
  modelValue?: (string | number | boolean)[]
  exact?: Option
  fresh?: Option[]
}) {
  const items = [opt('a'), opt('b'), opt('c')]
  const calls: string[] = []
  const emitted: (string | number | boolean)[][] = []
  const comboText = ref('')
  const open = ref(true)
  const highlight = ref(-1)
  const d = useSelectKeyboard({
    navItems: computed(() => items),
    navCount: computed(() => items.length),
    visibleTreeNodes: computed(() => []),
    isMenu: computed(() => false),
    isTreeSelect: computed(() => false),
    open,
    comboText,
    modelValue: computed(() => cfg.modelValue),
    multiple: cfg.multiple ?? false,
    allowCreate: cfg.allowCreate ?? false,
    isImeComposing: () => false,
    matchOptions: () => cfg.fresh ?? [],
    findExact: () => cfg.exact,
    commitComboValue: (t) => calls.push(`commit:${t}`),
    toggleOpen: () => calls.push('toggleOpen'),
    closePanel: () => calls.push('close'),
    selectOption: () => calls.push('selectOption'),
    onMenuClick: () => calls.push('menuClick'),
    onTreeNodeClick: () => calls.push('treeClick'),
    focusComboInput: () => calls.push('focus'),
    emitValue: (v) => {
      emitted.push(v)
      calls.push(`emit:${v.join('|')}`)
    },
    externalHighlight: highlight,
  })
  return { ...d, calls, emitted, items, comboText, open, highlight }
}

const key = (k: string, extra: Record<string, unknown> = {}) =>
  ({ key: k, preventDefault: () => {}, ...extra } as unknown as KeyboardEvent)

describe('useSelectKeyboard · 游标与收口', () => {
  it('ArrowDown：未开面板先开；已开则游标下移（带边界）', () => {
    const h = harness()
    h.onComboKeydown(key('ArrowDown'))
    expect(h.open.value).toBe(true)
    expect(h.highlight.value).toBe(-1) // 打开分支不动游标
    h.onComboKeydown(key('ArrowDown'))
    expect(h.highlight.value).toBe(0)
    h.onComboKeydown(key('ArrowDown'))
    h.onComboKeydown(key('ArrowDown'))
    expect(h.highlight.value).toBe(2) // 触底不再加
    h.onComboKeydown(key('ArrowUp'))
    expect(h.highlight.value).toBe(1)
  })

  it('Escape：清空输入 + 关面板（消费事件）', () => {
    const h = harness()
    h.open.value = true
    h.comboText.value = 'ab'
    h.onComboKeydown(key('Escape'))
    expect(h.comboText.value).toBe('')
    expect(h.open.value).toBe(false)
    expect(h.calls).toEqual(['close'])
  })

  it('Home/End：未打开不拦截；打开后跳首/尾', () => {
    const h = harness()
    let prevented = 0
    h.onComboKeydown(key('End', { preventDefault: () => prevented++ }))
    expect(prevented).toBe(0) // 未打开 → 留给页面滚动
    h.open.value = true
    h.onComboKeydown(key('End', { preventDefault: () => prevented++ }))
    expect(prevented).toBe(1)
    expect(h.highlight.value).toBe(2)
    h.onComboKeydown(key('Home', { preventDefault: () => prevented++ }))
    expect(h.highlight.value).toBe(0)
  })

  it('**ArrowUp 未打开时不动游标**（#499：与 ArrowDown / Home / End 同口径）', () => {
    const h = harness()
    let prevented = 0
    h.onComboKeydown(key('ArrowUp', { preventDefault: () => prevented++ }))
    expect(h.highlight.value, '面板关着时按 ↑ 只是"没反应"').toBe(-1)
    expect(prevented, '没打开就不该拦默认行为').toBe(0)
    // 后果：↑ 之后按 ↓ 打开面板，游标仍是 -1，第一次 ↓ 落在第 0 条而不是第 1 条
    h.onComboKeydown(key('ArrowDown'))
    expect(h.open.value).toBe(true)
    expect(h.highlight.value).toBe(-1)
    h.onComboKeydown(key('ArrowDown'))
    expect(h.highlight.value).toBe(0)
  })

  it('Enter + 游标命中 → 走 selectOption（单选/非菜单）', () => {
    const h = harness()
    h.open.value = true
    h.highlight.value = 1
    h.onComboKeydown(key('Enter'))
    expect(h.calls).toEqual(['selectOption'])
  })

  it('反向保护：空输入 + 无游标 → 不派发任何事件', () => {
    const h = harness()
    h.open.value = true
    h.onComboKeydown(key('Enter'))
    expect(h.calls).toEqual([])
  })
})

describe('onComboKeydown · 组合框提交分支（#499）', () => {
  it('多选 + 精确命中 → 追加值并清空输入、聚焦回输入框', () => {
    const h = comboHarness({ multiple: true, modelValue: ['x'], exact: opt('b'), fresh: [] })
    h.comboText.value = 'b'
    h.onComboKeydown(key('Enter'))
    expect(h.emitted).toEqual([['x', 'b']])
    expect(h.comboText.value).toBe('')
    expect(h.calls).toContain('focus')
  })

  it('多选 + 精确命中但**已在选中里** → 不重复追加（幂等）', () => {
    const h = comboHarness({ multiple: true, modelValue: ['b'], exact: opt('b'), fresh: [] })
    h.comboText.value = 'b'
    h.onComboKeydown(key('Enter'))
    expect(h.emitted, '同一个值不能进两次').toEqual([])
    expect(h.comboText.value, '仍然清空输入并聚焦').toBe('')
  })

  it('多选 + 精确命中但选项禁用 → 不选中（与鼠标点击同口径）', () => {
    const h = comboHarness({ multiple: true, modelValue: [], exact: opt('b', true), fresh: [] })
    h.comboText.value = 'b'
    h.onComboKeydown(key('Enter'))
    expect(h.emitted).toEqual([])
  })

  it('多选 + 无精确命中 + allowCreate → 用**即时匹配**的首项而不是 stale 列表', () => {
    const h = comboHarness({ multiple: true, allowCreate: true, modelValue: [], exact: undefined, fresh: [opt('fresh-1'), opt('fresh-2')] })
    h.comboText.value = 'fres'
    h.onComboKeydown(key('Enter'))
    expect(h.emitted, '应按即时匹配结果建值').toEqual([['fresh-1']])
  })

  it('多选 + 无精确命中 + allowCreate 且即时匹配为空 → 用输入文本建值', () => {
    const h = comboHarness({ multiple: true, allowCreate: true, modelValue: [], exact: undefined, fresh: [] })
    h.comboText.value = '新值'
    h.onComboKeydown(key('Enter'))
    expect(h.emitted).toEqual([['新值']])
  })

  it('多选 + 无精确命中 + **不允许创建** → 什么都不做（不清输入、不 emit）', () => {
    const h = comboHarness({ multiple: true, allowCreate: false, modelValue: [], exact: undefined, fresh: [opt('b')] })
    h.comboText.value = 'zzz'
    h.onComboKeydown(key('Enter'))
    expect(h.emitted).toEqual([])
    expect(h.comboText.value, '没结果就别偷偷清输入').toBe('zzz')
  })

  it('单选 + 允许创建 → 提交文本并关面板', () => {
    const h = comboHarness({ multiple: false, allowCreate: true, exact: undefined })
    h.comboText.value = '自定义'
    h.onComboKeydown(key('Enter'))
    expect(h.calls).toEqual(['commit:自定义', 'close'])
  })

  it('单选 + 无精确命中且不允许创建 → 不提交（避免把随便打的字当值）', () => {
    const h = comboHarness({ multiple: false, allowCreate: false, exact: undefined })
    h.comboText.value = 'zzz'
    h.onComboKeydown(key('Enter'))
    expect(h.calls).toEqual([])
  })
})