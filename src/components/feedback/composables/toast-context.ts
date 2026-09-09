/**
 * Toast 共享上下文 — 从 Toast.vue 抽出的 provide/inject 层
 *
 * Toast.vue 的 <script setup> 不能包含 ES module exports，
 * 故将 TOAST_KEY / ToastItem / ToastAPI / useToast 拆到此文件。
 */
import { inject, type InjectionKey, type Ref } from 'vue'

/** Toast 项接口 */
export interface ToastItem {
  id: number
  type: 'info' | 'success' | 'warning' | 'error'
  message: string
  duration?: number
  closable?: boolean
  /** @deprecated 用 actionText 代替 */
  undoText?: string
  /** @deprecated 用 onAction 代替 */
  onUndo?: () => void
  /** action 按钮文本（如「撤销」「查看」「跳转」） */
  actionText?: string
  /** action 按钮回调 */
  onAction?: () => void
}

/** Toast API 接口 */
export interface ToastAPI {
  toasts: Ref<ToastItem[]>
  show: (
    message: string,
    type?: 'info' | 'success' | 'warning' | 'error',
    duration?: number,
    options?: {
      undoText?: string
      onUndo?: () => void
      actionText?: string
      onAction?: () => void
      closable?: boolean
    },
  ) => number
  remove: (id: number) => void
  clearAll: () => void
}

/** provide/inject key */
export const TOAST_KEY: InjectionKey<ToastAPI> = Symbol('toast-state')

/**
 * 存活实例 API 栈 — window.__toast 全局入口的单一事实源。
 *
 * 各实例队列必须保持独立（DataTable / ImagePreview 等各自挂 <Toast> 靠 ref 通知自己那一份），
 * 所以全局入口不做队列共享，只做「指向最后一个仍存活的实例」：栈顶卸载时回退到上一个存活实例，
 * 避免旧实现里后装实例覆盖 getter、先卸载者卸载后 __toast 悬空指向死队列导致通知静默丢失。
 */
const _liveApis: ToastAPI[] = []

function syncGlobalToast(): void {
  if (typeof window === 'undefined') return
  const top = _liveApis[_liveApis.length - 1]
  if (!top) {
    try {
      delete (window as unknown as { __toast?: unknown }).__toast
    } catch {
      // 某些环境 window.__toast 不可配置，忽略
    }
    return
  }
  Object.defineProperty(window, '__toast', { get: () => top, configurable: true })
}

/** 注册一个存活实例为全局入口候选（后注册者优先） */
export function registerGlobalToast(api: ToastAPI): void {
  _liveApis.push(api)
  syncGlobalToast()
}

/** 按身份摘除实例：无论它是不是栈顶都要从栈里移除，再把入口重新指向当前栈顶 */
export function unregisterGlobalToast(api: ToastAPI): void {
  const i = _liveApis.indexOf(api)
  if (i >= 0) _liveApis.splice(i, 1)
  syncGlobalToast()
}

/**
 * inject 辅助函数 — 在子组件 setup() 中调用获取 Toast API
 *
 * 用法：
 * ```ts
 * const toast = useToast()
 * toast?.show('保存成功', 'success')
 * ```
 */
export function useToast(): ToastAPI | null {
  return inject(TOAST_KEY, null)
}
