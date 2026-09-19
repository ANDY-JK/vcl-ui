// 修复锁定 #23：ConfirmModal 的 title/confirmText/cancelText 默认值此前是 prop 工厂，
// 实例创建时求值一次 —— 常驻弹窗中途切语言后仍是旧语言。改为 computed 回退到 t()。
import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ConfirmModal from '@/components/feedback/ConfirmModal.vue'
import { setLocale } from '@/components/_internal/i18n'

const mounted: VueWrapper[] = []
function mountConfirm(props: Record<string, unknown>): VueWrapper {
  const w = mount(ConfirmModal, {
    props: { visible: true, message: '删除该条记录？', ...props },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
  mounted.push(w)
  return w
}

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  setLocale('zh-CN')
})

describe('ConfirmModal · 默认文案跟随语言切换', () => {
  it('未传 title/按钮文案：切到英文后渲染英文', async () => {
    setLocale('zh-CN')
    const w = mountConfirm({})
    expect(w.find('.modal-title').text()).toBe('确认操作')
    expect(w.find('.confirm-btn.cancel').text()).toBe('取消')
    expect(w.find('.confirm-btn.btn-danger').text()).toContain('确定')

    setLocale('en-US')
    await nextTick()
    expect(w.find('.modal-title').text()).toBe('Confirm action')
    expect(w.find('.confirm-btn.cancel').text()).toBe('Cancel')
    expect(w.find('.confirm-btn.btn-danger').text()).toContain('Confirm')
  })

  it('显式传入的文案不被语言切换覆盖', async () => {
    setLocale('zh-CN')
    const w = mountConfirm({ title: '自定义标题', confirmText: '继续', cancelText: '算了' })
    setLocale('en-US')
    await nextTick()

    expect(w.find('.modal-title').text()).toBe('自定义标题')
    expect(w.find('.confirm-btn.cancel').text()).toBe('算了')
    expect(w.find('.confirm-btn.btn-danger').text()).toContain('继续')
  })
})
