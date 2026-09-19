import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setLocale } from '@/components/_internal/i18n'
import Input from '@/components/form/Input.vue'

describe('form 国际化', () => {
  afterEach(() => setLocale('zh-CN'))

  it('Input 密码显隐状态文案切换', () => {
    setLocale('en-US')
    const w = mount(Input, { props: { modelValue: '123456', label: '密码', type: 'password' } })
    expect(w.find('.sr-only').text()).toBe('Password hidden')

    setLocale('zh-CN')
    const w2 = mount(Input, { props: { modelValue: '123456', label: '密码', type: 'password' } })
    expect(w2.find('.sr-only').text()).toBe('密码已隐藏')
  })
})
