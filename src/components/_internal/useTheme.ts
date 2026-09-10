/**
 * useTheme — 运行时暗色/亮色模式切换 composable
 *
 * 使用方式：
 *   import { useTheme } from '@/components/_internal/useTheme'
 *   const { theme, effectiveTheme, setTheme, toggleTheme } = useTheme()
 *   setTheme('dark')     // 手动切暗色
 *   toggleTheme()        // 在 light/dark 间切换（auto 视为当前系统值）
 *   setTheme('auto')     // 跟随系统
 *
 * 实现原理：
 *   - 'light' → <html data-theme="light">
 *   - 'dark'  → <html data-theme="dark">
 *   - 'auto'  → 移除 data-theme 属性，由 CSS @media prefers-color-scheme 触发；
 *               effectiveTheme 同步跟踪系统值供 JS 消费方读取
 *
 * 持久化：
 *   选择保存在 localStorage('theme')，下次访问自动恢复
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { safeLocalStorage } from './ssr-guard'

export type ThemeMode = 'light' | 'dark' | 'auto'

const STORAGE_KEY = 'theme'
const _currentTheme = ref<ThemeMode>('auto')
/** 系统当前是否暗色（auto 模式下 effectiveTheme 的依据；mql 不存在的环境恒 false） */
const _systemDark = ref(false)
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
  // safeLocalStorage：Safari 隐私模式/禁存储下裸访问会抛 SecurityError，中断组件挂载
  const storage = safeLocalStorage()
  const saved = storage?.getItem(STORAGE_KEY) as ThemeMode | null
  if (saved && ['light', 'dark', 'auto'].includes(saved)) {
    _currentTheme.value = saved
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    _systemDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  applyTheme(_currentTheme.value)
}

function setTheme(mode: ThemeMode) {
  _currentTheme.value = mode
  try {
    safeLocalStorage()?.setItem(STORAGE_KEY, mode)
  } catch {
    /* 隐私模式：主题不落盘，仅本次会话生效 */
  }
  applyTheme(mode)
}

function toggleTheme() {
  // auto 视为当前系统值再翻转（此前 auto 一律切到 dark，与注释语义不符）
  const base = _currentTheme.value === 'auto' ? (_systemDark.value ? 'dark' : 'light') : _currentTheme.value
  setTheme(base === 'dark' ? 'light' : 'dark')
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  onMounted(() => {
    initTheme()

    // 系统主题变化时同步 _systemDark（auto 模式的渲染由 CSS 响应，这里保证 JS 侧
    // effectiveTheme 与 toggleTheme 语义正确；此前 handler 是空壳死代码）
    if (typeof window.matchMedia === 'function') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => {
        _systemDark.value = mql.matches
      }
      mql.addEventListener('change', handler)
      onUnmounted(() => mql.removeEventListener('change', handler))
    }
  })

  return {
    /** 当前主题模式（ref，用户选择值） */
    theme: _currentTheme,
    /** 实际生效主题：auto 时跟随系统（供 JS 消费方读取） */
    effectiveTheme: computed(() =>
      _currentTheme.value === 'auto' ? (_systemDark.value ? 'dark' : 'light') : _currentTheme.value,
    ),
    /** 设置主题模式 */
    setTheme,
    /** 在 light/dark 间切换（auto 视为当前系统值） */
    toggleTheme,
    /** 获取系统当前主题（'light' | 'dark'） */
    getSystemTheme,
  }
}
