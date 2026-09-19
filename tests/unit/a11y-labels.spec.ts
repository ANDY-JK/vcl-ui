// C12 护栏：
//   1. ToggleList 加载态文案走语言包（zh-CN / en-US 两侧都有词条），不再硬编码中文
//   2. AppLayout 纯图标按钮补 aria-label（含顶栏工具按钮的文档示例，避免教出只写 title 的不可访问写法）
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setLocale } from '@/components/_internal/i18n'
import ToggleList from '@/components/data/ToggleList.vue'

afterEach(() => setLocale('zh-CN'))

describe('ToggleList · 加载态文案 i18n', () => {
  it('中英双语均取语言包词条', () => {
    // 加载态已统一复用 feedback/Loading 组件（文案经 text prop 传入，仍走语言包）
    setLocale('en-US')
    const en = mount(ToggleList, { props: { items: [], isLoading: true } })
    expect(en.find('.spinner-text').text()).toBe('Loading...')

    setLocale('zh-CN')
    const zh = mount(ToggleList, { props: { items: [], isLoading: true } })
    expect(zh.find('.spinner-text').text()).toBe('加载中...')
  })
})

describe('AppLayout · 图标按钮可访问名称', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/components/layout/AppLayout.vue'), 'utf8')

  it('退出按钮同时提供 title 与 aria-label', () => {
    // 业务类名已加 vcl- 前缀防全局样式泄漏（topbar-tool-* 预设类保留原名）
    expect(src).toMatch(/class="vcl-logout-btn"[^>]*:aria-label="t\('common\.logout'\)"/)
  })

  it('顶栏工具按钮文档示例带 aria-label，不只靠 title', () => {
    expect(src).toMatch(/<button class="topbar-tool-btn"[^>]*aria-label="搜索"/)
  })
})
