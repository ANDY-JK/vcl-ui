// 修复锁定：多层弹层叠加时，Escape 只关最上层可见且可关闭的那一个
// 背景：每个弹层各自往 window 挂 keydown，叠加时一次 Esc 把所有可见弹层全关掉
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref, onMounted, onUnmounted, nextTick } from 'vue'
import type { Ref } from 'vue'
import { useEscClose } from '@/components/_internal/useEscClose'
import ConfirmModal from '@/components/feedback/ConfirmModal.vue'
import ModalShell from '@/components/_internal/ModalShell.vue'

const mounted: Array<{ unmount: () => void }> = []

/** 造一个只用来挂 useEscClose 的最小弹层宿主 */
function overlay(visible: Ref<boolean>, closable: Ref<boolean>, onClose: () => void) {
  return defineComponent({
    name: 'EscOverlay',
    setup() {
      const { mount: m, unmount: u } = useEscClose(
        () => visible.value,
        () => closable.value,
        onClose,
      )
      onMounted(m)
      onUnmounted(u)
      return () => h('div')
    },
  })
}

function mountOverlay(visible: Ref<boolean>, closable: Ref<boolean>, onClose: () => void) {
  const w = mount(overlay(visible, closable, onClose), { attachTo: document.body })
  mounted.push(w)
  return w
}

function esc() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
})

describe('useEscClose · 弹层栈', () => {
  it('两层都可见：Escape 只关最上层，不关下层', () => {
    const closeA = vi.fn()
    const closeB = vi.fn()
    mountOverlay(ref(true), ref(true), closeA)
    mountOverlay(ref(true), ref(true), closeB)

    esc()

    expect(closeB).toHaveBeenCalledTimes(1)
    expect(closeA).not.toHaveBeenCalled()
  })

  it('最上层不可关闭：Escape 被它吞掉，不穿透到下层', () => {
    const closeA = vi.fn()
    const closeB = vi.fn()
    mountOverlay(ref(true), ref(true), closeA)
    mountOverlay(ref(true), ref(false), closeB)

    esc()

    expect(closeB).not.toHaveBeenCalled()
    expect(closeA).not.toHaveBeenCalled()
  })

  it('最上层隐藏：Escape 落到下面可见的那层', () => {
    const closeA = vi.fn()
    const closeB = vi.fn()
    mountOverlay(ref(true), ref(true), closeA)
    mountOverlay(ref(false), ref(true), closeB)

    esc()

    expect(closeA).toHaveBeenCalledTimes(1)
    expect(closeB).not.toHaveBeenCalled()
  })

  it('上层卸载后 Escape 回到下层', async () => {
    const closeA = vi.fn()
    const closeB = vi.fn()
    mountOverlay(ref(true), ref(true), closeA)
    const b = mountOverlay(ref(true), ref(true), closeB)

    b.unmount()
    await nextTick()
    esc()

    expect(closeA).toHaveBeenCalledTimes(1)
    expect(closeB).not.toHaveBeenCalled()
  })
})

describe('ConfirmModal · 行为开关透传（走 Vue attrs 落到唯一根组件）', () => {
  // ConfirmModal 未声明这三个 prop，靠单根组件 attrs fallthrough 自动落到根组件；
  // 本用例锁定该链路，防止将来加多根节点或 inheritAttrs:false 时静默失效。
  //
  // 2026-09-11 更新：根组件由 layout/ModalBox 换成 _internal/ModalShell
  // （为消除 ModalBox ↔ ConfirmModal 的双向依赖）。透传链路本身没有变，
  // 只是落点跟着换 —— 断言目标同步改为 ModalShell，并补一条功能性断言。
  it('maskClosable / mutexScope / internal 透传给根组件 ModalShell', () => {
    const w = mount(ConfirmModal, {
      props: {
        visible: true,
        message: '确定？',
        maskClosable: false,
        mutexScope: 'confirm-x',
        internal: true,
      },
      attachTo: document.body,
    })
    mounted.push(w)

    const shell = w.findComponent(ModalShell)
    expect(shell.exists()).toBe(true)
    expect(shell.props('maskClosable')).toBe(false)
    expect(shell.props('mutexScope')).toBe('confirm-x')
    expect(shell.props('internal')).toBe(true)
  })

  // 上面那条只证明「props 收到了」，万一 ModalShell 之后不再使用它们仍会通过。
  // 这里直接验行为：maskClosable=false 时点遮罩不应该关闭。
  it('maskClosable=false 真的不响应遮罩点击（功能性验证，非仅 prop 透传）', async () => {
    const w = mount(ConfirmModal, {
      props: { visible: true, message: '确定？', maskClosable: false },
      attachTo: document.body,
    })
    mounted.push(w)

    const overlay = document.querySelector('.modal-overlay') as HTMLElement
    expect(overlay).toBeTruthy()
    overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    overlay.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    await nextTick()

    expect(w.emitted('update:visible')).toBeUndefined()
  })
})
