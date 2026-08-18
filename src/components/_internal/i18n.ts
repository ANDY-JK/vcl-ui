/**
 * i18n 配置 — vue-i18n 实例创建 + composable 导出
 *
 * 使用方式（组件库内部）：
 *   import { useT } from '@/components/_internal/i18n'
 *   const t = useT()
 *   t('common.confirm')  // → '确认'
 *
 * 使用方式（消费方应用）：
 *   // main.ts
 *   import { i18n } from 'vue-component-lib/i18n'
 *   app.use(i18n)
 *
 * 切换语言：
 *   import { setLocale } from 'vue-component-lib/i18n'
 *   setLocale('en-US')
 */

import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'

export type Locale = 'zh-CN' | 'en-US'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})

/** 切换语言 */
export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', locale)
  }
}

/** 获取当前语言 */
export function getLocale(): Locale {
  return i18n.global.locale.value as Locale
}

/** i18n 实例 — 供消费方 app.use(i18n) */
export { i18n }

/**
 * 安全的翻译函数 — 直接使用 i18n.global.t，无需 app.use(i18n)
 * 组件库内部使用此函数，避免 useI18n() 需要 app.use 的限制
 * 在测试环境中也能正常工作
 */
export function useT() {
  return i18n.global.t
}

/** 原始 useI18n — 供需要完整 i18n 上下文（如 scope、locale ref）的场景使用 */
export { useI18n } from 'vue-i18n'
