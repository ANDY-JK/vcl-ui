/**
 * useEscClose — ESC 键关闭弹窗 composable
 *
 * 从 Drawer.vue 和 ModalBox.vue 中抽离的重复 ESC keydown 逻辑。
 * 统一管理 keydown 监听器的注册和清理，避免每个弹窗组件各写一份。
 *
 * 叠放语义：多个弹层同时打开时，只有「栈中最上层且可见」的那一个响应 ESC；
 * 上层不可关闭时 ESC 被它吞掉，不穿透到下层（避免一次 ESC 连关多层）。
 *
 * @param isVisible  返回当前可见状态的函数
 * @param isClosable 返回是否可关闭的函数
 * @param onClose    关闭回调
 *
 * 用法：
 * ```ts
 * const { onKeydown, mount, unmount } = useEscClose(() => props.visible, () => props.closable, close)
 * onMounted(mount)
 * onUnmounted(unmount)
 * ```
 */
interface EscEntry {
  isVisible: () => boolean
  isClosable: () => boolean
  onClose: () => void
}

/** 弹层栈：mount 顺序即叠放顺序（后挂载者在上） */
const _stack: EscEntry[] = []

/**
 * 本 entry 是否是当前最上层的可见弹层。
 * 栈中没有可见弹层时放行 —— 兼容不注册、直接调用 onKeydown 的用法。
 */
function isTopVisible(entry: EscEntry): boolean {
  for (let i = _stack.length - 1; i >= 0; i--) {
    if (_stack[i].isVisible()) return _stack[i] === entry
  }
  return true
}

export function useEscClose(isVisible: () => boolean, isClosable: () => boolean, onClose: () => void) {
  const entry: EscEntry = { isVisible, isClosable, onClose }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    if (!isVisible()) return
    if (!isTopVisible(entry)) return
    if (!isClosable()) return
    onClose()
  }

  function mount() {
    if (_stack.indexOf(entry) < 0) _stack.push(entry)
    window.addEventListener('keydown', onKeydown)
  }

  function unmount() {
    const i = _stack.indexOf(entry)
    if (i >= 0) _stack.splice(i, 1)
    window.removeEventListener('keydown', onKeydown)
  }

  return { onKeydown, mount, unmount }
}
