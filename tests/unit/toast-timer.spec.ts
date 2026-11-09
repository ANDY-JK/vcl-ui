// 修复锁定：Toast 自动关闭定时器在组件卸载时统一清理
// 背景：show() 的 setTimeout 未跟踪，组件卸载后 timer 仍会回调 removeToast 操作已卸载组件状态
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Toast from '@/components/feedback/Toast.vue'
import type { ToastAPI } from '@/components/feedback/composables/toast-context'

function items() {
  return document.querySelectorAll('.toast-item').length
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('Toast · 自动关闭定时器', () => {
  it('卸载后定时器不再触发 removeToast（不操作已卸载状态）', async () => {
    vi.useFakeTimers()
    const w = mount(Toast, { attachTo: document.body })
    const vm = w.vm as ToastAPI

    vm.show('消息', 'info', 3000)
    await nextTick()
    // 卸载前未到 3000ms：toast 还在（Teleport 到 body）
    expect(items()).toBe(1)

    w.unmount()
    // 卸载后推进 5s：timer 已被清理，不再向 document 追加/操作（无异常即通过）
    vi.advanceTimersByTime(5000)
    expect(items()).toBe(0)
  })

  it('remove 手动关闭时同步清理对应定时器', async () => {
    vi.useFakeTimers()
    const w = mount(Toast, { attachTo: document.body })
    const vm = w.vm as ToastAPI

    const id = vm.show('消息', 'info', 3000)
    await nextTick()
    expect(items()).toBe(1)

    vm.remove(id)
    await nextTick()
    expect(items()).toBe(0)

    // 推进远超 duration：被 remove 的 toast 定时器已清理，不再有二次操作
    vi.advanceTimersByTime(10000)
    expect(items()).toBe(0)
  })

  it('clearAll 清理全部 toast 与定时器', async () => {
    vi.useFakeTimers()
    const w = mount(Toast, { attachTo: document.body })
    const vm = w.vm as ToastAPI

    vm.show('a', 'info', 1000)
    vm.show('b', 'info', 2000)
    await nextTick()
    expect(items()).toBe(2)

    vm.clearAll()
    await nextTick()
    expect(items()).toBe(0)
    vi.advanceTimersByTime(5000)
    expect(items()).toBe(0)
  })
})
