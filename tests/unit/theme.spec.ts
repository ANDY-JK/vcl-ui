import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { useTheme } from '@/components/_internal/useTheme'
import { defineComponent } from 'vue'

// useTheme 内部用 onMounted/onUnmounted（监听系统主题），必须在组件上下文调用。
// 用 host 组件包裹 + expose 方法，避免组件外调用触发 Vue warn。
function mountTheme() {
  const host = defineComponent({
    setup() {
      return useTheme()
    },
    template: '<div />',
  })
  const wrapper = mount(host)
  // Vue 在 setup 返回 ref 时会自动解包：wrapper.vm.theme 是值（非 ref）
  const vm = wrapper.vm as unknown as {
    setTheme: (t: string) => void
    toggleTheme: () => void
    getSystemTheme: () => string
    theme: string
    isDark: boolean
  }
  return { wrapper, vm }
}

describe('useTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
  })

  it('setTheme 设置 data-theme', () => {
    const { vm } = mountTheme()
    vm.setTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    vm.setTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    vm.setTheme('auto')
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
  })

  it('toggleTheme 在 light/dark 间切换', () => {
    const { vm } = mountTheme()
    const before = vm.theme
    vm.toggleTheme()
    const after = vm.theme
    expect(after).not.toBe(before)
    expect(['light', 'dark']).toContain(after)
  })

  it('getSystemTheme 返回 light 或 dark', () => {
    const { vm } = mountTheme()
    expect(['light', 'dark']).toContain(vm.getSystemTheme())
  })
})
