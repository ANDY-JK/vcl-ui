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
    emitValue: () => calls.push('emitValue'),
    externalHighlight: highlight,
  })
  return { ...d, calls, items, highlight, comboText, open }
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
