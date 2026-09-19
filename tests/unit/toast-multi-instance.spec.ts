// 修复锁定：多实例 Toast 的 window.__toast 全局入口不悬空 + 实例队列仍按实例隔离
// 背景：__toast 被后挂载实例覆盖，先卸载的入口实例卸载后 __toast 仍指向已卸载实例
//       → 通知落入已卸载队列，静默丢失；同时队列不能改成全局共享，否则同页两实例重复渲染
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Toast from '@/components/feedback/Toast.vue'

const mounted: Array<{ unmount: () => void }> = []

function items() {
  return document.querySelectorAll('.toast-item').length
}

function globalToast() {
  return (window as unknown as { __toast?: { show: (m: string, t?: string) => number } }).__toast
}

function mountToast() {
  const w = mount(Toast, { attachTo: document.body })
  mounted.push(w)
  return w
}

beforeEach(() => {
  document.body.innerHTML = ''
  delete (window as unknown as { __toast?: unknown }).__toast
})

afterEach(() => {
  // 用例中途断言失败也要把实例卸干净，避免模块级引用计数被污染到后续用例
  mounted.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
  delete (window as unknown as { __toast?: unknown }).__toast
})

describe('Toast · 多实例全局入口', () => {
  it('入口实例卸载后 window.__toast 回退到仍存活实例，不悬空', async () => {
    mountToast()
    const b = mountToast()
    await nextTick()

    // 最后挂载的 b 是当前入口
    globalToast().show('来自全局', 'info')
    await nextTick()
    expect(items()).toBe(1)

    b.unmount()
    await nextTick()
    // b 的容器已移除，它那条通知随之消失
    expect(items()).toBe(0)

    // 入口必须回退到仍存活的实例；否则通知落进 b 的死队列，DOM 里一条都没有
    expect(typeof globalToast()?.show).toBe('function')
    globalToast().show('回退后', 'success')
    await nextTick()
    expect(items()).toBe(1)
  })

  it('卸载非入口实例不影响当前入口', async () => {
    const a = mountToast()
    mountToast()
    await nextTick()

    a.unmount() // a 不是当前入口，摘除它不该动到 b
    await nextTick()

    globalToast().show('b 仍在', 'info')
    await nextTick()
    expect(items()).toBe(1)
  })

  it('最后一个实例卸载后 window.__toast 被摘除（不留死引用）', async () => {
    const a = mountToast()
    await nextTick()
    expect(typeof globalToast()?.show).toBe('function')

    a.unmount()
    expect(globalToast()).toBeUndefined()
  })

  it('两实例队列各自独立：一个实例 show 只渲染一次（防止改成全局共享队列导致重复）', async () => {
    const a = mountToast()
    mountToast()
    await nextTick()

    ;(a.vm as unknown as { show: (m: string, t?: string) => number }).show('A 的通知', 'info')
    await nextTick()
    // 共享同一队列的话 a/b 两个容器会各渲染一条 → 2
    expect(items()).toBe(1)
  })
})
