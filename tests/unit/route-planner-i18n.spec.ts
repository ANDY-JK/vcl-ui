import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setLocale } from '@/components/_internal/i18n'
import StoreFormModal from '@/components/route-planner/StoreFormModal.vue'

describe('route-planner 国际化', () => {
  afterEach(() => setLocale('zh-CN'))

  it('中文默认：添加门店弹窗', () => {
    setLocale('zh-CN')
    const w = mount(StoreFormModal, {
      props: { visible: true, store: null },
      global: { stubs: { teleport: true } },
    })
    expect(w.text()).toContain('添加门店')
    expect(w.text()).toContain('门店名')
    expect(w.text()).toContain('详细地址')
    expect(w.text()).toContain('联系人')
  })

  it('英文：Add Store 弹窗', () => {
    setLocale('en-US')
    const w = mount(StoreFormModal, {
      props: { visible: true, store: null },
      global: { stubs: { teleport: true } },
    })
    expect(w.text()).toContain('Add Store')
    expect(w.text()).toContain('Store Name')
    expect(w.text()).toContain('Address')
    expect(w.text()).toContain('Contact')
  })
})
