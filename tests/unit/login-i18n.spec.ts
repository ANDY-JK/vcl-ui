import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Login from '@/components/login/login.vue'
import { setLocale } from '@/components/_internal/i18n'

describe('login 国际化', () => {
  afterEach(() => setLocale('zh-CN'))

  it('中文默认：用户名/密码/登录按钮', () => {
    setLocale('zh-CN')
    const w = mount(Login, { props: { hideBrand: true, showSocialLogin: false, showRegister: false, showForgotPassword: false } })
    expect(w.text()).toContain('用户名')
    expect(w.text()).toContain('密码')
    expect(w.text()).toContain('登 录')
    expect(w.text()).toContain('记住用户名')
  })

  it('英文：Username/Password/Sign In', () => {
    setLocale('en-US')
    const w = mount(Login, { props: { hideBrand: true, showSocialLogin: false, showRegister: false, showForgotPassword: false } })
    expect(w.text()).toContain('Username')
    expect(w.text()).toContain('Password')
    expect(w.text()).toContain('Sign In')
    expect(w.text()).toContain('Remember username')
  })

  it('品牌标题跟随语言（未传 brandTitle）', () => {
    setLocale('en-US')
    const w = mount(Login, { props: { showSocialLogin: false } })
    expect(w.text()).toContain('SaaS Management System')
    setLocale('zh-CN')
    const w2 = mount(Login, { props: { showSocialLogin: false } })
    expect(w2.text()).toContain('SaaS 管理系统')
  })
})
