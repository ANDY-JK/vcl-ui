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
 *   import { i18n } from 'vcl-ui/i18n'
 *   app.use(i18n)
 *
 * 切换语言：
 *   import { setLocale } from 'vcl-ui/i18n'
 *   setLocale('en-US')
 *
 * 外部项目补充/覆盖文案（不污染组件库内置语言包）：
 *   import { registerMessages } from 'vcl-ui/i18n'
 *   registerMessages({
 *     'zh-CN': { common: { confirm: '项目自定义确认' } },  // 覆盖组件库同 key
 *     'fr-FR': { common: { confirm: 'Confirmer' } },       // 注册组件库没有的语言
 *   })
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

/**
 * 外部项目补充/覆盖文案。
 *
 * - messages 的 key 是语言代码（任意字符串，如 'zh-CN' / 'en-US' / 'fr-FR' / 'ja-JP'）。
 * - 已存在的语言（组件库内置或之前注册过）：深合并，同 key 以传入值为准（项目优先）。
 * - 未存在的语言：自动注册到 i18n（组件库组件缺文案时回退到 fallbackLocale = zh-CN）。
 * - 不改动组件库内置语言包源码（src/components/_internal/locales/ 保持原样）。
 *
 * 注意：需在 app.use(i18n) 之后、组件渲染前调用；组件库内部组件统一走同一个 i18n 实例，
 * 因此注册后立即生效，无需刷新。
 */
export function registerMessages(messages: Record<string, Record<string, unknown>>): void {
  for (const [locale, patch] of Object.entries(messages)) {
    if (!patch || typeof patch !== 'object') continue
    i18n.global.mergeLocaleMessage(locale, patch)
  }
}

/** 切换语言（可传任意已注册的语言代码） */
export function setLocale(locale: string) {
  // locale.value 类型被 createI18n 锁定为内置两个语言；registerMessages 已允许任意语言，
  // 赋值时放宽（运行时 locale 接受任意字符串）
  i18n.global.locale.value = locale as 'zh-CN' | 'en-US'
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', locale)
  }
}

/** 获取当前语言 */
export function getLocale(): string {
  return i18n.global.locale.value as string
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

/**
 * 安全的原始 message 获取函数 — 用于数组/对象类型的 message（如特性列表）
 * t() 会把数组插值成字符串，tm() 返回原始值。
 */
export function useTm() {
  return i18n.global.tm
}

/** 原始 useI18n — 供需要完整 i18n 上下文（如 scope、locale ref）的场景使用 */
export { useI18n } from 'vue-i18n'
