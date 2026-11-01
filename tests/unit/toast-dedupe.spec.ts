/**
 * Toast 相同消息去重（#314）
 *
 * ## 缺陷
 *
 * `show()` 只做了队列上限（50 条），**没有去重**：连点保存 / 同一错误反复冒出来时，
 * 屏幕上会叠出 N 条一模一样的提示 —— 用户看到的是"刷屏"，还得一条条等它消失。
 *
 * ## 判据
 *
 * 同类型 + 同文案 + **无操作按钮** → 复用原那条并**重新计时**（延长停留）；
 * 带 actionText/undoText 的不合并（回调绑定的是某次具体操作，合并会丢回调）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Toast from '@/components/feedback/Toast.vue'

type ToastVm = {
  toasts: { id: number; type: string; message: string }[]
  show: (m: string, t?: string, d?: number, o?: Record<string, unknown>) => number
}

function mountToast() {
  const w = mount(Toast, { attachTo: document.body })
  return { w, vm: w.vm as unknown as ToastVm }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Toast · 相同消息去重', () => {
  it('**同类型同文案连发 5 次 → 只留 1 条**', async () => {
    const { w, vm } = mountToast()
    for (let i = 0; i < 5; i++) vm.show('保存失败', 'error', 3000)
    await nextTick()
    expect(vm.toasts.length, '连发 5 次不该叠 5 条').toBe(1)
    w.unmount()
  })

  it('**不同类型 / 不同文案不去重**（避免把不同问题吞掉）', async () => {
    const { w, vm } = mountToast()
    vm.show('保存失败', 'error', 3000)
    vm.show('保存失败', 'warning', 3000)
    vm.show('网络异常', 'error', 3000)
    await nextTick()
    expect(vm.toasts.length).toBe(3)
    w.unmount()
  })

  it('**去重会重新计时**（重复触发要延长停留，而不是提前消失）', async () => {
    const { w, vm } = mountToast()
    vm.show('同步中', 'info', 1000)
    await nextTick()
    vi.advanceTimersByTime(800)
    vm.show('同步中', 'info', 1000) // 重新计时
    await nextTick()
    vi.advanceTimersByTime(800)
    expect(vm.toasts.length, '重新计时后 800+800 还没到点，应仍在').toBe(1)
    vi.advanceTimersByTime(400)
    expect(vm.toasts.length, '累计超过 1000ms 后应消失').toBe(0)
    w.unmount()
  })

  it('**不把普通提示并进带操作的那条**（否则会延长一个已经过期的撤销）', async () => {
    const { w, vm } = mountToast()
    vm.show('已删除', 'info', 3000, { actionText: '撤销', onAction: vi.fn() })
    vm.show('已删除', 'info', 3000) // 后到的普通提示不该被并进上面那条
    await nextTick()
    expect(vm.toasts.length, '两条语义不同的提示不能合并').toBe(2)
    w.unmount()
  })

  it('**带操作按钮的不合并**（回调绑定具体操作，合并会丢）', async () => {
    const { w, vm } = mountToast()
    const onAction = vi.fn()
    vm.show('已删除', 'info', 3000, { actionText: '撤销', onAction })
    vm.show('已删除', 'info', 3000, { actionText: '撤销', onAction })
    await nextTick()
    expect(vm.toasts.length, '撤销类提示必须各留一条，否则撤销错记录').toBe(2)
    w.unmount()
  })
})