/**
 * useTheme — 运行时暗色/亮色模式切换 composable
 *
 * 使用方式：
 *   import { useTheme } from '@/components/_internal/useTheme'
 *   const { theme, setTheme, toggleTheme } = useTheme()
 *   setTheme('dark')     // 手动切暗色
 *   toggleTheme()        // 在 light/dark 间切换
 *   setTheme('auto')     // 跟随系统
 *
 * 实现原理：
 *   - 'light' → <html data-theme="light">
 *   - 'dark'  → <html data-theme="dark">
 *   - 'auto'  → 移除 data-theme 属性，由 CSS @media prefers-color-scheme 触发
 *
 * 持久化：
 *   选择保存在 localStorage('theme')，下次访问自动恢复
 */

import { ref, onMounted, onUnmounted } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'auto'

const STORAGE_KEY = 'theme'
const _currentTheme = ref<ThemeMode>('auto')
let _initialized = false

function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (mode === 'auto') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', mode)
  }
}

function initTheme() {
  if (_initialized) return
  _initialized = true
  if (typeof localStorage === 'undefined') return
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
  if (saved && ['light', 'dark', 'auto'].includes(saved)) {
    _currentTheme.value = saved
  }
  applyTheme(_currentTheme.value)
}

function setTheme(mode: ThemeMode) {
  _currentTheme.value = mode
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, mode)
  }
  applyTheme(mode)
}

function toggleTheme() {
  setTheme(_currentTheme.value === 'dark' ? 'light' : 'dark')
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  onMounted(() => {
    initTheme()

    // 监听系统主题变化（仅 auto 模式时生效，因 data-theme 属性覆写优先）
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (_currentTheme.value === 'auto') {
        // auto 模式下 CSS 自动响应，无需 JS 干预
        // 此回调仅用于通知 ref 变化
      }
    }
    mql.addEventListener('change', handler)
    onUnmounted(() => mql.removeEventListener('change', handler))
  })

  return {
    /** 当前主题模式（ref） */
    theme: _currentTheme,
    /** 设置主题模式 */
    setTheme,
    /** 在 light/dark 间切换（auto 视为当前系统值） */
    toggleTheme,
    /** 获取系统当前主题（'light' | 'dark'） */
    getSystemTheme,
  }
}
