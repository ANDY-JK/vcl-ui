/**
 * useEscClose · 组件卸载必须自动摘掉监听（#512）
 *
 * ## 缺陷
 *
 * `useEscClose` 的 docblock 写着"**调用方必须自己挂生命周期**"（看 `mount()`/`unmount()` 两个
 * 导出即知），它自己**不**注册任何卸载钩子。于是调用方只要在 `onMounted` 里 `mount()` 了、
 * 又忘了 `onUnmounted(unmount)`，那个 `window` keydown 监听就一直活着：
 *
 * - 组件销毁后按 Esc，回调照样执行 —— 若回调里 `emit('close')`，就是**对已销毁组件抛事件**；
 * - 模块级 `_stack` 里那条 entry 也永远不摘，`isTopVisible()` 会把一个死弹层当成"最上层可见"，
 *   于是**真弹层按 Esc 反而关不掉**（被死 entry 吞掉）。本文件里那条"组件外纯函数式使用"的
 *   用例修前就是**被上一个用例泄漏的死 entry 吞掉**才红的 —— 幽灵栈顶的实测证据。
 *
 * 同族的 `useFocusTrap` 就在最后一行做了兜底：`onBeforeUnmount(() => deactivate())`
 * （注释写着"组件卸载时兜底停用"）—— **同族里又少一格**。
 *
 * ## 修法
 *
 * 让 `useEscClose` 自己在组件作用域内注册兜底卸载。注意不能无条件注册：
 * `useEscClose` 也允许在**组件外**纯函数式使用（只取 `onKeydown` 自己挂监听，
 * `tests/unit/utils.spec.ts` 就是这么用的），此时 `onBeforeUnmount` 会警告
 * "no active component instance" —— 用 `getCurrentInstance()` 判一下。
 *
 * 挂两次是安全的：`unmount()` 内部 `_stack.indexOf(entry)` 找不到就不动 `_stack`，
 * `removeEventListener` 对未注册的处理器是 no-op。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, onMounted, ref } from 'vue'
import { useEscClose } from '@/components/_internal/useEscClose'

/**
 * 宿主：`mount()` 挂上监听，卸载行为由 `explicitUnmount` 决定。
 * 只定义一个内联组件（`vue/one-component-per-file` 要求），用例靠参数区分。
 */
function mountHost(onClose: () => void, explicitUnmount = false) {
  const unmountNow = ref<(() => void) | null>(null)
  const Host = defineComponent({
    name: 'EscHost',
    setup() {
      const esc = useEscClose(
        () => true,
        () => true,
        onClose,
      )
      onMounted(esc.mount)
      // explicitUnmount=false 时**故意**不写 onUnmounted：这正是"调用方忘了"的样子
      if (explicitUnmount) unmountNow.value = esc.unmount
      return () => h('div', { class: 'esc-host' })
    },
  })
  const w = mount(Host, { attachTo: document.body })
  return { w, unmountNow }
}

const pressEsc = () =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))

describe('useEscClose · 卸载兜底（#512）', () => {
  it('挂上后按 Esc 会触发（先证明监听真的挂上了）', () => {
    const onClose = vi.fn()
    const { w } = mountHost(onClose)
    pressEsc()
    expect(onClose).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('**组件卸载后按 Esc 不能再触发**（调用方忘了 unmount 也要摘掉）', () => {
    const onClose = vi.fn()
    const { w } = mountHost(onClose)
    pressEsc()
    expect(onClose).toHaveBeenCalledTimes(1)

    w.unmount()
    pressEsc()
    pressEsc()
    expect(onClose, '组件已销毁，回调不能再被全局 Esc 唤起').toHaveBeenCalledTimes(1)
  })

  it('显式 unmount 过的组件，卸载兜底跑第二遍也不出错（幂等）', () => {
    const onClose = vi.fn()
    const { w, unmountNow } = mountHost(onClose, true)
    pressEsc()
    expect(onClose).toHaveBeenCalledTimes(1)
    unmountNow.value?.() // 显式卸载
    w.unmount() // 再叠加兜底卸载
    pressEsc()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('**死 entry 不能吞掉后来弹层的 Esc**（幽灵栈顶）', () => {
    const first = vi.fn()
    const second = vi.fn()
    const a = mountHost(first)
    a.w.unmount() // 第一个组件已销毁；它的 entry 若不摘，就永远是"最上层可见"

    const b = mountHost(second)
    pressEsc()
    expect(second, '真弹层必须能收到 Esc').toHaveBeenCalledTimes(1)
    expect(first, '已销毁的那个不该再被唤起').not.toHaveBeenCalled()
    b.w.unmount()
  })

  it('组件外纯函数式使用不受影响（不注册卸载钩子、不报警告）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const onClose = vi.fn()
    const { onKeydown } = useEscClose(
      () => true,
      () => true,
      onClose,
    )
    onKeydown({ key: 'Escape' } as KeyboardEvent)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(warn, '组件外使用不该出现 onBeforeUnmount 的 no-instance 警告').not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
