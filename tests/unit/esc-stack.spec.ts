// 修复锁定：多层弹层叠加时，Escape 只关最上层可见且可关闭的那一个
// 背景：每个弹层各自往 window 挂 keydown，叠加时一次 Esc 把所有可见弹层全关掉
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref, onMounted, onUnmounted, nextTick } from 'vue'
import type { Ref } from 'vue'
import { useEscClose } from '@/components/_internal/useEscClose'
import ConfirmModal from '@/components/feedback/ConfirmModal.vue'
import ModalBox from '@/components/layout/ModalBox.vue'

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

describe('ConfirmModal · ModalBox 行为开关透传（走 Vue attrs 落到唯一根组件）', () => {
  // ConfirmModal 未声明这三个 prop，靠单根组件 attrs fallthrough 自动落到 ModalBox；
  // 本用例锁定该链路，防止将来加多根节点或 inheritAttrs:false 时静默失效
  it('maskClosable / mutexScope / internal 透传给内部 ModalBox', () => {
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

    const box = w.findComponent(ModalBox)
    expect(box.props('maskClosable')).toBe(false)
    expect(box.props('mutexScope')).toBe('confirm-x')
    expect(box.props('internal')).toBe(true)
  })
})
