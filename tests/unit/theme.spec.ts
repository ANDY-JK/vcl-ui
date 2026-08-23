import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { useTheme } from '@/components/_internal/useTheme'
import { defineComponent } from 'vue'

describe('useTheme', () => {
  it('setTheme 设置 data-theme', () => {
    const host = defineComponent({
      setup() {
        const { setTheme, theme } = useTheme()
        return { setTheme, theme }
      },
      template: '<div />',
    })
    mount(host)
    const { setTheme } = useTheme()
    setTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    setTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    setTheme('auto')
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
  })

  it('toggleTheme 在 light/dark 间切换', () => {
    const { toggleTheme } = useTheme()
    const before = document.documentElement.getAttribute('data-theme')
    toggleTheme()
    const after = document.documentElement.getAttribute('data-theme')
    expect(after).not.toBe(before)
  })

  it('getSystemTheme 返回 light 或 dark', () => {
    const { getSystemTheme } = useTheme()
    expect(['light', 'dark']).toContain(getSystemTheme())
  })
})
