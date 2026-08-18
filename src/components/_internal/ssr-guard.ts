/**
 * SSR 环境检测工具 — 统一浏览器 API 守卫
 *
 * 使用方式：
 *   import { isBrowser, safeWindow, safeDocument } from '@/components/_internal/ssr-guard'
 *
 *   if (isBrowser) { window.addEventListener(...) }
 *   const w = safeWindow()  // 返回 window | undefined
 *   const d = safeDocument() // 返回 document | undefined
 */

/** 是否在浏览器环境（非 SSR） */
export const isBrowser: boolean =
  typeof window !== 'undefined' && typeof document !== 'undefined' && typeof window.document !== 'undefined'

/** 安全获取 window 对象，SSR 环境返回 undefined */
export function safeWindow(): Window | undefined {
  return isBrowser ? window : undefined
}

/** 安全获取 document 对象，SSR 环境返回 undefined */
export function safeDocument(): Document | undefined {
  return isBrowser ? document : undefined
}

/** 安全获取 localStorage，SSR 或不支持时返回 undefined */
export function safeLocalStorage(): Storage | undefined {
  try {
    if (isBrowser && window.localStorage) return window.localStorage
  } catch {
    // 某些环境（隐私模式）访问 localStorage 会抛异常
  }
  return undefined
}

/** 安全获取 navigator，SSR 环境返回 undefined */
export function safeNavigator(): Navigator | undefined {
  return isBrowser ? navigator : undefined
}

/**
 * 安全执行浏览器操作 — SSR 环境下静默跳过
 * @param fn 需要在浏览器中执行的操作
 * @param fallback SSR 时的回退返回值
 */
export function safeRun<T>(fn: () => T, fallback?: T): T | undefined {
  if (!isBrowser) return fallback
  try {
    return fn()
  } catch {
    return fallback
  }
}
