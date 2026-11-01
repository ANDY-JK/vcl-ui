/**
 * 提示的可访问性播报（#315）
 *
 * ## 缺陷
 *
 * 弹幕模式（`variant="toast"`）的每条消息有 `role="alert|status"`，
 * 但**内联模式**（`variant="inline"`，用来替代 Alert 显示"表单保存失败"这类关键信息）
 * **一个 aria 属性都没有** —— 屏幕阅读器用户完全感知不到。
 *
 * ## 判据
 *
 * error 用 `role="alert"` + `aria-live="assertive"`（打断式，与弹幕一致），
 * 其余用 `role="status"` + `aria-live="polite"`。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Toast from '@/components/feedback/Toast.vue'

function mountInline(type: string) {
  return mount(Toast, {
    props: { variant: 'inline', type, message: '保存失败，请重试', showIcon: false } as never,
  })
}

describe('Toast · 内联模式可被读屏播报', () => {
  it('**error 用 alert + assertive**', () => {
    const w = mountInline('error')
    const el = w.find('.toast-inline')
    expect(el.attributes('role'), '错误提示必须打断式播报').toBe('alert')
    expect(el.attributes('aria-live')).toBe('assertive')
    w.unmount()
  })

  it.each(['success', 'warning', 'info'])('**%s 用 status + polite**', (type) => {
    const w = mountInline(type)
    const el = w.find('.toast-inline')
    expect(el.attributes('role')).toBe('status')
    expect(el.attributes('aria-live')).toBe('polite')
    w.unmount()
  })

  it('弹幕模式的每条也必须有 role（口径一致，防回退）', async () => {
    const w = mount(Toast, { props: { variant: 'toast' } as never, attachTo: document.body })
    const vm = w.vm as unknown as { show: (m: string, t?: string) => number }
    vm.show('出错了', 'error')
    await w.vm.$nextTick()
    // 弹幕模式 Teleport 到 body，wrapper 里查不到
    const item = document.body.querySelector('.toast-item')
    expect(item, '弹幕应渲染到 body').toBeTruthy()
    expect(item!.getAttribute('role')).toBe('alert')
    w.unmount()
  })
})
