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
import { getCurrentInstance, onBeforeUnmount } from 'vue'

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
    // 已被**内层**消费的 Esc 不再往上关（2026-11-01 #280）。
    //
    // 场景：弹窗里放一个 Select / 表格单元格编辑 / 右键菜单，用户按 Esc 想收起那一层。
    // 内层组件在自己的 keydown 里处理了 Esc，但事件继续冒泡到 window —— 本函数也响应，
    // 于是「收起下拉」和「关闭弹窗」同时发生：用户丢失整屏已填内容。
    // 契约：**谁真正消费了 Esc，谁调 `preventDefault()`**；这里据 `defaultPrevented` 让行。
    if (e.defaultPrevented) return
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

  /**
   * 组件卸载时兜底摘掉监听（#512）。
   *
   * 以前这里**不**兜底，docblock 写的是"调用方必须自己挂生命周期"—— 于是调用方只要
   * `onMounted(mount)` 之后忘了 `onUnmounted(unmount)`，监听就一直活着，且模块级 `_stack`
   * 里那条 entry 永不摘除：
   *   · 组件销毁后按 Esc，回调照样执行（回调里常是 `emit('close')` —— 对已销毁组件抛事件）；
   *   · 更要命的是 `isTopVisible()` 会把这个**死弹层**当成"最上层可见"，
   *     于是**真弹层按 Esc 反而关不掉**（被死 entry 吞掉）。这个"幽灵栈顶"效应已由
   *     `esc-close-unmount.spec.ts` 的交叉污染用例实测到。
   * 同族的 `useFocusTrap` 末行就做了兜底（`onBeforeUnmount(() => deactivate())`）。
   *
   * 用 `getCurrentInstance()` 判一下：本 composable 也允许在**组件外**纯函数式使用
   * （只取 `onKeydown` 自己挂监听，`tests/unit/utils.spec.ts` 即如此），
   * 那种场景调 `onBeforeUnmount` 会警告 "no active component instance"。
   * 重复卸载是安全的：`_stack.indexOf` 找不到就不动栈，`removeEventListener` 是 no-op。
   */
  if (getCurrentInstance()) onBeforeUnmount(unmount)

  return { onKeydown, mount, unmount }
}
