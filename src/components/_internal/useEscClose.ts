/**
 * useEscClose — ESC 键关闭弹窗 composable
 *
 * 从 Drawer.vue 和 ModalBox.vue 中抽离的重复 ESC keydown 逻辑。
 * 统一管理 keydown 监听器的注册和清理，避免每个弹窗组件各写一份。
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
export function useEscClose(isVisible: () => boolean, isClosable: () => boolean, onClose: () => void) {
  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    if (!isVisible()) return
    if (!isClosable()) return
    onClose()
  }

  function mount() {
    window.addEventListener('keydown', onKeydown)
  }

  function unmount() {
    window.removeEventListener('keydown', onKeydown)
  }

  return { onKeydown, mount, unmount }
}
