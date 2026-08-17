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
