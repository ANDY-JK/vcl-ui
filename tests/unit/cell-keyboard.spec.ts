// useCellKeyboard 行为锁定测试（全局 keydown 总控：多实例守卫/浮层放行/编辑态 Ctrl+Z 续撤/导航/快捷键）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useCellKeyboard } from '@/components/data/composables/cell-keyboard'
import { isActiveInstance } from '@/components/data/composables/cell-active'
import type { CellKeyboardDeps } from '@/components/data/composables/cell-keyboard'

vi.mock('@/components/data/composables/cell-active', () => ({ isActiveInstance: vi.fn() }))

function makeDeps(overrides: Partial<CellKeyboardDeps> = {}) {
  const spies = {
    navAnchor: vi.fn().mockReturnValue(true),
    extendSelection: vi.fn(),
    moveToEdge: vi.fn(),
    moveSelection: vi.fn(),
    enterEditFromSelection: vi.fn(),
    canUndo: vi.fn().mockReturnValue(true),
    canRedo: vi.fn().mockReturnValue(true),
    undo: vi.fn(),
    redo: vi.fn(),
    cancelEdit: vi.fn(),
    copySelectedCell: vi.fn(async () => {}),
    copyRangeSelection: vi.fn(async () => {}),
    clearSelection: vi.fn(),
    pasteText: vi.fn(),
    pasteToSelection: vi.fn(),
  }
  const editingCell = ref<null | { rowKey: string; colKey: string; value: string }>(null)
  const editValue = ref('')
  const select = {
    ...spies,
    rangeSel: ref(null),
    selectedCell: ref(null),
    multiSelection: ref(new Set<string>()),
    selectedColKey: ref(''),
    displayRows: ref([] as string[]),
    displayCols: ref([] as string[]),
  } as CellKeyboardDeps['select']
  const write = {
    canUndo: spies.canUndo,
    canRedo: spies.canRedo,
    undo: spies.undo,
    redo: spies.redo,
    applyChange: vi.fn(),
    applyChanges: vi.fn(),
  } as CellKeyboardDeps['write']
  const clipboard = {
    copySelectedCell: spies.copySelectedCell,
    copyRangeSelection: spies.copyRangeSelection,
    clearSelection: spies.clearSelection,
    pasteText: spies.pasteText,
    pasteToSelection: spies.pasteToSelection,
    clipboard: ref(''),
  } as CellKeyboardDeps['clipboard']
  const edit = {
    editingCell,
    editValue,
    cancelEdit: spies.cancelEdit,
  } as CellKeyboardDeps['edit']
  const deps = {
    props: { editable: true, keyboardNav: true },
    editKey: {},
    select,
    write,
    clipboard,
    edit,
    ...overrides,
  }
  const api = useCellKeyboard(deps)
  return { api, spies, select, write, clipboard, edit, editingCell, editValue, deps }
}

function key(over: Record<string, unknown> = {}, target: HTMLElement | null = null): KeyboardEvent {
  const t = target ?? document.createElement('div')
  const e = {
    key: 'a',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target: t,
    preventDefault: vi.fn(),
    ...over,
  } as unknown as KeyboardEvent
  return e
}

/** happy-dom 的 navigator.clipboard 是 getter-only，用 defineProperty 覆盖；
 *  并兜底到 globalThis（vitest happy-dom 下模块里裸引用 navigator 可能解析到全局对象） */
const fakeReadText = vi.fn().mockResolvedValue('')
function stubNavigatorClipboard() {
  for (const obj of [navigator as unknown as Record<string, unknown>, globalThis as Record<string, unknown>]) {
    try {
      Object.defineProperty(obj, 'clipboard', {
        value: { readText: fakeReadText },
        configurable: true,
        writable: true,
      })
    } catch {
      /* 该对象上不可配则跳过，另一个兜底 */
    }
  }
}

beforeEach(() => {
  vi.mocked(isActiveInstance).mockReturnValue(true)
  vi.spyOn(window, 'getSelection').mockReturnValue(null as never)
  fakeReadText.mockClear().mockResolvedValue('')
  stubNavigatorClipboard()
})

describe('实例/浮层/输入框守卫', () => {
  it('defaultPrevented（别的实例已处理）→ 直接跳过', () => {
    const { api, spies } = makeDeps()
    api.onCellKeydown(key({ key: 'ArrowDown', defaultPrevented: true }))
    expect(spies.moveSelection).not.toHaveBeenCalled()
  })

  it('非活动实例 → 跳过全部处理', () => {
    vi.mocked(isActiveInstance).mockReturnValue(false)
    const { api, spies } = makeDeps()
    api.onCellKeydown(key({ key: 'ArrowDown' }))
    expect(spies.moveSelection).not.toHaveBeenCalled()
    expect(spies.undo).not.toHaveBeenCalled()
  })

  it('浮层（右键菜单/选项面板/筛选/列设置）内的键盘事件放行给浮层', () => {
    const { api, spies } = makeDeps()
    const menu = document.createElement('div')
    vi.spyOn(menu, 'closest').mockReturnValue(document.createElement('div') as never)
    api.onCellKeydown(key({ key: 'Enter' }, menu))
    expect(spies.enterEditFromSelection).not.toHaveBeenCalled()
  })

  it('普通表单输入框内的按键交还原生光标（不劫持方向键）', () => {
    const { api, spies } = makeDeps()
    const input = document.createElement('input')
    const t = document.createElement('div')
    vi.spyOn(t, 'closest').mockReturnValue(input as never) // 命中 input 守卫
    api.onCellKeydown(key({ key: 'ArrowDown' }, t))
    expect(spies.moveSelection).not.toHaveBeenCalled()
  })

  it('编辑态中（未命中 Ctrl+Z 特殊分支）普通按键不导航', () => {
    const { api, spies, editingCell, editValue } = makeDeps()
    editingCell.value = { rowKey: 'r1', colKey: 'c1', value: '旧' }
    editValue.value = '新输入' // dirty → 不拦 Ctrl+Z，但普通按键仍被 editingCell 守卫拦
    api.onCellKeydown(key({ key: 'ArrowDown' }))
    expect(spies.moveSelection).not.toHaveBeenCalled()
  })
})

describe('编辑态未改动的 Ctrl+Z/Y：撤销上一步表格操作', () => {
  it('Ctrl+Z：cancelEdit + undo（可撤销且可编辑时 preventDefault）', () => {
    const { api, spies, editingCell, editValue } = makeDeps()
    editingCell.value = { rowKey: 'r1', colKey: 'c1', value: 'x' }
    editValue.value = 'x' // 未改动
    const e = key({ key: 'z', ctrlKey: true })
    api.onCellKeydown(e)
    expect(spies.cancelEdit).toHaveBeenCalledTimes(1)
    expect(spies.undo).toHaveBeenCalledTimes(1)
    expect(spies.redo).not.toHaveBeenCalled()
    expect(e.preventDefault).toHaveBeenCalled()
  })

  it('Ctrl+Shift+Z 走 redo 分支（需 canRedo）', () => {
    const { api, spies, editingCell, editValue } = makeDeps()
    editingCell.value = { rowKey: 'r1', colKey: 'c1', value: 'x' }
    editValue.value = 'x'
    api.onCellKeydown(key({ key: 'z', ctrlKey: true, shiftKey: true }))
    expect(spies.redo).toHaveBeenCalledTimes(1)
    expect(spies.undo).not.toHaveBeenCalled()
  })

  it('dirty 输入框（editValue ≠ cell.value）→ 不拦截，交给浏览器原生撤销', () => {
    const { api, spies, editingCell, editValue } = makeDeps()
    editingCell.value = { rowKey: 'r1', colKey: 'c1', value: 'x' }
    editValue.value = 'y'
    const e = key({ key: 'z', ctrlKey: true })
    api.onCellKeydown(e)
    expect(spies.cancelEdit).not.toHaveBeenCalled()
    expect(spies.undo).not.toHaveBeenCalled()
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('不可编辑时编辑态快捷键不生效（canDo 门）', () => {
    const { api, spies, editingCell, editValue, deps } = makeDeps()
    ;(deps.props as { editable: boolean }).editable = false
    editingCell.value = { rowKey: 'r1', colKey: 'c1', value: 'x' }
    editValue.value = 'x'
    api.onCellKeydown(key({ key: 'z', ctrlKey: true }))
    expect(spies.undo).not.toHaveBeenCalled()
  })
})

describe('键盘导航（keyboardNav）', () => {
  it('方向键 → moveSelection（无 navAnchor 时跳过）', () => {
    const { api, spies } = makeDeps()
    api.onCellKeydown(key({ key: 'ArrowDown' }))
    expect(spies.moveSelection).toHaveBeenCalledTimes(1)
    vi.mocked(spies.navAnchor).mockReturnValue(false)
    api.onCellKeydown(key({ key: 'ArrowDown' }))
    expect(spies.moveSelection).toHaveBeenCalledTimes(1)
  })

  it('Shift+方向键 → extendSelection 扩展选区', () => {
    const { api, spies } = makeDeps()
    api.onCellKeydown(key({ key: 'ArrowRight', shiftKey: true }))
    expect(spies.extendSelection).toHaveBeenCalledTimes(1)
    expect(spies.moveSelection).not.toHaveBeenCalled()
  })

  it('Ctrl+Home/End → moveToEdge', () => {
    const { api, spies } = makeDeps()
    api.onCellKeydown(key({ key: 'Home', ctrlKey: true }))
    expect(spies.moveToEdge).toHaveBeenCalledTimes(1)
  })

  it('Enter / F2 → enterEditFromSelection', () => {
    const { api, spies } = makeDeps()
    api.onCellKeydown(key({ key: 'Enter' }))
    api.onCellKeydown(key({ key: 'F2' }))
    expect(spies.enterEditFromSelection).toHaveBeenCalledTimes(2)
  })

  it('Delete/Backspace → clipboard.clearSelection', () => {
    const { api, spies } = makeDeps()
    api.onCellKeydown(key({ key: 'Delete' }))
    api.onCellKeydown(key({ key: 'Backspace' }))
    expect(spies.clearSelection).toHaveBeenCalledTimes(2)
  })

  it('keyboardNav=false：导航键全禁，但 Ctrl+Z/Y 撤销重做仍生效（Excel 语义独立）', () => {
    const { api, spies, deps } = makeDeps()
    ;(deps.props as { keyboardNav: boolean }).keyboardNav = false
    api.onCellKeydown(key({ key: 'ArrowDown' }))
    expect(spies.moveSelection).not.toHaveBeenCalled()
    api.onCellKeydown(key({ key: 'z', ctrlKey: true }))
    expect(spies.undo).toHaveBeenCalledTimes(1)
  })
})

describe('全局 Ctrl+C / Ctrl+V / Ctrl+Z / Ctrl+Y', () => {
  it('Ctrl+C：有划词文本选择 → 放行浏览器原生复制', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => '选中的文本' } as never)
    const { api, spies, select } = makeDeps()
    select.selectedCell.value = { rowKey: 'r1', colKey: 'c1' }
    const e = key({ key: 'c', ctrlKey: true })
    api.onCellKeydown(e)
    expect(spies.copySelectedCell).not.toHaveBeenCalled()
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('Ctrl+C：单选格 → copySelectedCell；矩形 → copyRangeSelection；整列 → 清内部剪贴板', async () => {
    const { api, spies, select, clipboard } = makeDeps()
    select.selectedCell.value = { rowKey: 'r1', colKey: 'c1' }
    await api.onCellKeydown(key({ key: 'c', ctrlKey: true }))
    expect(spies.copySelectedCell).toHaveBeenCalledTimes(1)

    select.selectedCell.value = null
    select.rangeSel.value = { rows: ['r1'], cols: ['c1'] } as never
    await api.onCellKeydown(key({ key: 'c', ctrlKey: true }))
    expect(spies.copyRangeSelection).toHaveBeenCalledTimes(1)

    select.rangeSel.value = null
    select.selectedColKey.value = 'c1'
    clipboard.clipboard.value = '旧内容'
    await api.onCellKeydown(key({ key: 'c', ctrlKey: true }))
    expect(clipboard.clipboard.value).toBe('')
  })

  it('Ctrl+V：系统剪贴板优先，空则回退内部剪贴板；读取失败也安全回退', async () => {
    const { api, spies, select, clipboard } = makeDeps()
    select.selectedCell.value = { rowKey: 'r1', colKey: 'c1' }

    fakeReadText.mockResolvedValue('外部\tTSV')
    await api.onCellKeydown(key({ key: 'v', ctrlKey: true }))
    expect(spies.pasteText).toHaveBeenCalledWith('外部\tTSV')
    expect(spies.pasteToSelection).not.toHaveBeenCalled()

    clipboard.clipboard.value = '内部'
    fakeReadText.mockResolvedValue('')
    await api.onCellKeydown(key({ key: 'v', ctrlKey: true }))
    expect(spies.pasteToSelection).toHaveBeenCalledTimes(1)

    fakeReadText.mockRejectedValue(new Error('denied'))
    await api.onCellKeydown(key({ key: 'v', ctrlKey: true }))
    expect(spies.pasteToSelection).toHaveBeenCalledTimes(2)
  })

  it('Ctrl+Z 不可编辑 → 不 preventDefault 不 undo；可编辑时 Ctrl+Z undo / Ctrl+Y redo', () => {
    const { api, spies, deps, select } = makeDeps()
    ;(deps.props as { editable: boolean }).editable = false
    const e1 = key({ key: 'z', ctrlKey: true })
    api.onCellKeydown(e1)
    expect(spies.undo).not.toHaveBeenCalled()
    expect(e1.preventDefault).not.toHaveBeenCalled()

    ;(deps.props as { editable: boolean }).editable = true
    select.selectedCell.value = { rowKey: 'r1', colKey: 'c1' }
    const e2 = key({ key: 'z', ctrlKey: true })
    api.onCellKeydown(e2)
    expect(spies.undo).toHaveBeenCalledTimes(1)
    expect(e2.preventDefault).toHaveBeenCalled()

    const e3 = key({ key: 'y', ctrlKey: true })
    api.onCellKeydown(e3)
    expect(spies.redo).toHaveBeenCalledTimes(1)
    expect(e3.preventDefault).toHaveBeenCalled()
  })
})
