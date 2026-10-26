/**
 * 设计器画布快捷键（第 120 轮）。此前覆盖率：语句 31.6% / 分支 20.8%。
 *
 * 为什么值得单独一套：这是**"用户正在输入时也会触发"**的一类代码 —— 没有恰当的守卫，
 * 用户在一个输入框/富文本里按 Delete，删掉的是**画布上选中的那个节点**；
 * 而快捷键失效（比如重做）用户只会觉得"这软件不好用"，不会来报 bug。
 * 本文件因此把两类都钉住：**该触发的必须触发**、**不该触发的绝不动手**。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useDesignerShortcuts, type DesignerShortcutsHost } from '@/components/form-builder/designer/useDesignerShortcuts'

type Host = {
  [K in keyof DesignerShortcutsHost]: DesignerShortcutsHost[K] extends (...a: never[]) => unknown
    ? ReturnType<typeof vi.fn>
    : DesignerShortcutsHost[K]
}

/** 造一个"全记录"的宿主：每个动作都是 spy，选中的状态用真实 ref（宿主就是这样传的） */
function makeHost(selectedId: string | null = 'n1', selectedIds: string[] = []) {
  const host = {
    undo: vi.fn(),
    redo: vi.fn(),
    removeNode: vi.fn(),
    duplicateNode: vi.fn(),
    copyNode: vi.fn(),
    pasteNode: vi.fn(),
    moveNode: vi.fn(),
    showShortcuts: ref(false),
    selectedId: ref<string | null>(selectedId),
    selectedIds: ref<Set<string>>(new Set(selectedIds)),
  }
  const { onCanvasKeydown } = useDesignerShortcuts(host)
  return { host: host as unknown as Host & typeof host, onCanvasKeydown }
}

/** 派发一个可以 preventDefault 的 keydown（happy-dom 里 KeyboardEvent 可 cancel） */
function press(onCanvasKeydown: (e: KeyboardEvent) => void, init: KeyboardEventInit & { tag?: string; editable?: boolean }) {
  const { tag, editable, ...eventInit } = init
  const target = document.createElement(tag ?? 'DIV')
  if (editable) target.setAttribute('contenteditable', 'true')
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...eventInit })
  target.dispatchEvent(e)
  // 组件是挂在容器上监听、事件冒泡到它；这里直接以目标身份调用，等价且更可控
  Object.defineProperty(e, 'target', { value: target, configurable: true })
  onCanvasKeydown(e)
  return e
}

let h: ReturnType<typeof makeHost>
beforeEach(() => {
  h = makeHost()
})

// ════════════════════════════════════════════════════════════════════
// 守卫：用户在输入时，快捷键必须全部让路
// ════════════════════════════════════════════════════════════════════
describe('守卫：焦点在输入类元素里时，一个动作都不该发生', () => {
  it.each([
    ['INPUT', { key: 'Delete' }],
    ['TEXTAREA', { key: 'Backspace' }],
    ['SELECT', { key: 'Delete' }],
    ['INPUT', { key: 'z', ctrlKey: true }],
    ['INPUT', { key: 'd', ctrlKey: true }],
    ['INPUT', { key: '?' }],
  ])('%s 里按 %o → 全部动作静默（否则删掉的是画布上的节点）', (tag, init) => {
    const e = press(h.onCanvasKeydown, { tag, ...init })
    expect(h.host.removeNode).not.toHaveBeenCalled()
    expect(h.host.undo).not.toHaveBeenCalled()
    expect(h.host.redo).not.toHaveBeenCalled()
    expect(h.host.duplicateNode).not.toHaveBeenCalled()
    expect(h.host.showShortcuts.value).toBe(false)
    expect(e.defaultPrevented, '让路时也不该 preventDefault（输入要正常发生）').toBe(false)
  })

  it('**contenteditable 元素里同样必须让路**（富文本标签/可编辑文案，按 Delete 不该删节点）', () => {
    const e = press(h.onCanvasKeydown, { tag: 'DIV', editable: true, key: 'Delete' })
    expect(h.host.removeNode, '正在编辑文字时删掉整个节点 = 用户最不可预期的行为').not.toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(false)
  })

  it('contenteditable 里 Ctrl+Z 也必须让路（要撤销的是他的输入，不是画布撤销）', () => {
    press(h.onCanvasKeydown, { tag: 'DIV', editable: true, key: 'z', ctrlKey: true })
    expect(h.host.undo).not.toHaveBeenCalled()
  })
})

// ════════════════════════════════════════════════════════════════════
// 撤销 / 重做
// ════════════════════════════════════════════════════════════════════
describe('撤销 / 重做（不依赖选中节点）', () => {
  it('Ctrl+Z / Cmd+Z → undo，且 preventDefault（别让浏览器也撤一次）', () => {
    expect(press(h.onCanvasKeydown, { key: 'z', ctrlKey: true }).defaultPrevented).toBe(true)
    expect(h.host.undo).toHaveBeenCalledTimes(1)

    press(h.onCanvasKeydown, { key: 'z', metaKey: true })
    expect(h.host.undo, 'macOS 上是 Cmd').toHaveBeenCalledTimes(2)
  })

  it('Ctrl+Y → redo', () => {
    expect(press(h.onCanvasKeydown, { key: 'y', ctrlKey: true }).defaultPrevented).toBe(true)
    expect(h.host.redo).toHaveBeenCalledTimes(1)
  })

  it('**Ctrl+Shift+Z → redo**（真实浏览器里带 Shift 的 key 是**大写** Z）', () => {
    const e = press(h.onCanvasKeydown, { key: 'Z', ctrlKey: true, shiftKey: true })
    expect(h.host.redo, 'Windows/Linux 的标准"重做"就是 Ctrl+Shift+Z').toHaveBeenCalledTimes(1)
    expect(h.host.undo, '不能退化成撤销').not.toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(true)
  })

  it('**Cmd+Shift+Z → redo**（macOS 的标准"重做"）', () => {
    press(h.onCanvasKeydown, { key: 'Z', metaKey: true, shiftKey: true })
    expect(h.host.redo).toHaveBeenCalledTimes(1)
    expect(h.host.undo).not.toHaveBeenCalled()
  })

  it('无选中节点时撤销/重做照样生效（它们与选中无关）', () => {
    const bare = makeHost(null)
    press(bare.onCanvasKeydown, { key: 'z', ctrlKey: true })
    expect(bare.host.undo).toHaveBeenCalledTimes(1)
    press(bare.onCanvasKeydown, { key: 'y', ctrlKey: true })
    expect(bare.host.redo).toHaveBeenCalledTimes(1)
  })

  it('没有修饰键的 z/y 不触发（普通输入不能被吃掉）', () => {
    press(h.onCanvasKeydown, { key: 'z' })
    press(h.onCanvasKeydown, { key: 'y' })
    expect(h.host.undo).not.toHaveBeenCalled()
    expect(h.host.redo).not.toHaveBeenCalled()
  })
})

// ════════════════════════════════════════════════════════════════════
// 快捷键帮助弹层
// ════════════════════════════════════════════════════════════════════
describe('? 呼出快捷键帮助', () => {
  it('按 ? 开、再按关（切换），并 preventDefault', () => {
    expect(press(h.onCanvasKeydown, { key: '?' }).defaultPrevented).toBe(true)
    expect(h.host.showShortcuts.value).toBe(true)
    press(h.onCanvasKeydown, { key: '?' })
    expect(h.host.showShortcuts.value).toBe(false)
  })

  it('没有选中节点时也能用（帮助不该要求先选东西）', () => {
    const bare = makeHost(null)
    press(bare.onCanvasKeydown, { key: '?' })
    expect(bare.host.showShortcuts.value).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════════
// 结构操作（依赖选中）
// ════════════════════════════════════════════════════════════════════
describe('结构操作：删除 / 复制 / 粘贴 / 移动', () => {
  it('Delete 与 Backspace 都删选中项（两者都是用户预期），并 preventDefault', () => {
    expect(press(h.onCanvasKeydown, { key: 'Delete' }).defaultPrevented).toBe(true)
    expect(h.host.removeNode).toHaveBeenLastCalledWith('n1')
    expect(press(h.onCanvasKeydown, { key: 'Backspace' }).defaultPrevented).toBe(true)
    expect(h.host.removeNode).toHaveBeenCalledTimes(2)
  })

  it('Ctrl+D 复制、Ctrl+C 拷贝、Ctrl+V 粘贴（macOS 用 Cmd 同理）', () => {
    expect(press(h.onCanvasKeydown, { key: 'd', ctrlKey: true }).defaultPrevented).toBe(true)
    expect(h.host.duplicateNode).toHaveBeenLastCalledWith(['n1'])
    press(h.onCanvasKeydown, { key: 'c', metaKey: true })
    expect(h.host.copyNode).toHaveBeenLastCalledWith(['n1'])
    press(h.onCanvasKeydown, { key: 'v', ctrlKey: true })
    expect(h.host.pasteNode).toHaveBeenLastCalledWith('n1')
  })

  it('**带 Shift 的大写字母也归一到同一动作**（归一化后行为可预测，不因大小写分裂）', () => {
    press(h.onCanvasKeydown, { key: 'D', ctrlKey: true, shiftKey: true })
    expect(h.host.duplicateNode).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+↑/↓ 上移/下移；无修饰的方向键不动（方向键要留给焦点移动）', () => {
    press(h.onCanvasKeydown, { key: 'ArrowUp', ctrlKey: true })
    expect(h.host.moveNode).toHaveBeenLastCalledWith(['n1'], -1)
    press(h.onCanvasKeydown, { key: 'ArrowDown', ctrlKey: true })
    expect(h.host.moveNode).toHaveBeenLastCalledWith(['n1'], 1)
    press(h.onCanvasKeydown, { key: 'ArrowUp' })
    press(h.onCanvasKeydown, { key: 'ArrowDown' })
    expect(h.host.moveNode, '无修饰的方向键不该移动节点').toHaveBeenCalledTimes(2)
  })

  it('多选集合非空 → 结构操作作用于**整个集合**；删除仍只报主 id（上游处理集合）', () => {
    const multi = makeHost('n1', ['n1', 'n2', 'n3'])
    press(multi.onCanvasKeydown, { key: 'd', ctrlKey: true })
    expect(multi.host.duplicateNode).toHaveBeenLastCalledWith(['n1', 'n2', 'n3'])
    press(multi.onCanvasKeydown, { key: 'c', ctrlKey: true })
    expect(multi.host.copyNode).toHaveBeenLastCalledWith(['n1', 'n2', 'n3'])
    press(multi.onCanvasKeydown, { key: 'ArrowDown', ctrlKey: true })
    expect(multi.host.moveNode).toHaveBeenLastCalledWith(['n1', 'n2', 'n3'], 1)
    press(multi.onCanvasKeydown, { key: 'Delete' })
    expect(multi.host.removeNode, '删除只报主 id（多选/容器确认流在上游）').toHaveBeenLastCalledWith('n1')
  })

  it('没有选中节点 → 结构类按键什么都不做，也**不** preventDefault', () => {
    const bare = makeHost(null)
    for (const init of [
      { key: 'Delete' },
      { key: 'Backspace' },
      { key: 'd', ctrlKey: true },
      { key: 'c', ctrlKey: true },
      { key: 'v', ctrlKey: true },
      { key: 'ArrowUp', ctrlKey: true },
      { key: 'ArrowDown', ctrlKey: true },
    ]) {
      const e = press(bare.onCanvasKeydown, init)
      expect(e.defaultPrevented, `${JSON.stringify(init)} 无选中时不该被吃掉`).toBe(false)
    }
    expect(bare.host.removeNode).not.toHaveBeenCalled()
    expect(bare.host.duplicateNode).not.toHaveBeenCalled()
    expect(bare.host.moveNode).not.toHaveBeenCalled()
  })

  it('无修饰的 d/c/v 与普通字母不触发（避免"打字打到一半复制了节点"）', () => {
    for (const key of ['d', 'c', 'v', 'a', 'Enter']) {
      press(h.onCanvasKeydown, { key })
    }
    expect(h.host.duplicateNode).not.toHaveBeenCalled()
    expect(h.host.copyNode).not.toHaveBeenCalled()
    expect(h.host.pasteNode).not.toHaveBeenCalled()
  })

  it('事件没有 target 也不崩（宿主把监听挂在容器上时 target 可能是 null）', () => {
    const e = new KeyboardEvent('keydown', { key: 'Delete', cancelable: true })
    Object.defineProperty(e, 'target', { value: null, configurable: true })
    expect(() => h.onCanvasKeydown(e)).not.toThrow()
  })
})