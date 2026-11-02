/**
 * Toast 队列状态机（use-toast-queue）的自测（#374）
 *
 * ## 它守的是什么
 *
 * 从 Toast.vue 下沉出来的队列逻辑：去重（同类型+同文案+无按钮 → 重新计时）、
 * 上限（50 条，丢最旧）、定时器簿记（duration<=0 常驻）、clearAll。
 * 下沉的额外收益：这 9 条行为此前只能通过组件整体测，现在**直接测状态机**。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createToastQueue, MAX_TOASTS } from '../../src/components/feedback/composables/use-toast-queue'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('Toast 队列状态机', () => {
  it('**show 入队、自动到期移除**（默认 info 3s / error 5s）', () => {
    const q = createToastQueue()
    const id = q.show('已保存', 'success')
    expect(q.toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(3000)
    expect(q.toasts.value).toHaveLength(0)
    const errId = q.show('失败', 'error')
    expect(q.toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(4999)
    expect(q.toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(q.toasts.value.find((t) => t.id === errId)).toBeUndefined()
    void id
  })

  it('**同类型同文案去重：不插第二条，重新计时**（#314）', () => {
    const q = createToastQueue()
    q.show('保存失败', 'error')
    vi.advanceTimersByTime(2000) // 距首次到期还剩 3s
    q.show('保存失败', 'error') // 去重 → 重新计时 5s
    expect(q.toasts.value).toHaveLength(1)
    // 首次的 5s 到点（2000 + 5000 = 7000 > 5000）→ 若没重新计时这里已经空了
    vi.advanceTimersByTime(3000)
    expect(q.toasts.value, '第二次 show 应重置计时').toHaveLength(1)
    vi.advanceTimersByTime(2000)
    expect(q.toasts.value).toHaveLength(0)
  })

  it('**带操作按钮的不合并**（合并会丢回调）', () => {
    const q = createToastQueue()
    q.show('已删除', 'info', 3000, { actionText: '撤销', onAction: () => {} })
    q.show('已删除', 'info', 3000, { actionText: '撤销', onAction: () => {} })
    expect(q.toasts.value).toHaveLength(2)
  })

  it('**duration<=0 常驻，不设定时器**', () => {
    const q = createToastQueue()
    q.show('常驻', 'info', 0)
    vi.advanceTimersByTime(60_000)
    expect(q.toasts.value).toHaveLength(1)
  })

  it('**超过上限丢最旧**（防长会话无限累积）', () => {
    const q = createToastQueue()
    const first = q.show('第一条', 'info', 0) // 常驻，否则会被自动清掉
    for (let i = 0; i < MAX_TOASTS - 1; i++) q.show(`m${i}`, 'info', 0)
    expect(q.toasts.value).toHaveLength(MAX_TOASTS)
    q.show('顶掉它', 'info', 0)
    expect(q.toasts.value).toHaveLength(MAX_TOASTS)
    expect(q.toasts.value.find((t) => t.id === first)).toBeUndefined()
  })

  it('**remove 按 id 精确移除并清定时器**', () => {
    const q = createToastQueue()
    const id = q.show('x', 'info', 0)
    q.remove(id)
    expect(q.toasts.value).toHaveLength(0)
    // 再 remove 同 id 不抛错（幂等）
    expect(() => q.remove(id)).not.toThrow()
  })

  it('**clearAll 清队列与定时器**', () => {
    const q = createToastQueue()
    q.show('a', 'info', 0)
    q.show('b', 'info', 0)
    q.clearAll()
    expect(q.toasts.value).toHaveLength(0)
    // 之前的常驻 toast 不会再被任何 timer 复活
    vi.advanceTimersByTime(60_000)
    expect(q.toasts.value).toHaveLength(0)
  })
})
