/**
 * useToastNotify — 组件内 Toast 通知（复用反馈域 Toast 组件）
 *
 * 收敛 DataTable / ImagePreview 等组件的重复实现（各自维护 toastRef + notify()）。
 * 用法：模板挂 `<Toast ref="toastRef" />`，script 调 notify(msg, type)。
 */
import { ref, type Ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'

/** Toast 组件 show 的 options（与 Toast.vue / toast-context.ts 的 ToastAPI 对齐） */
export interface ToastNotifyOptions {
  undoText?: string
  onUndo?: () => void
  actionText?: string
  onAction?: () => void
  closable?: boolean
}

/** Toast 组件暴露的 show 方法（与 Toast.vue 的 defineExpose 对齐） */
interface ToastInstance extends ComponentPublicInstance {
  show: (
    message: string,
    type?: 'info' | 'success' | 'warning' | 'error',
    duration?: number,
    options?: ToastNotifyOptions,
  ) => number
}

export function useToastNotify(): {
  toastRef: Ref<ToastInstance | undefined>
  notify: (
    msg: string,
    type?: 'info' | 'success' | 'warning' | 'error',
    duration?: number,
    options?: ToastNotifyOptions,
  ) => number | undefined
} {
  const toastRef = ref<ToastInstance>()

  function notify(
    msg: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info',
    duration?: number,
    options?: ToastNotifyOptions,
  ) {
    return toastRef.value?.show(msg, type, duration, options)
  }

  return { toastRef, notify }
}
