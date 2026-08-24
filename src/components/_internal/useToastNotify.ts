/**
 * useToastNotify — 组件内 Toast 通知（复用反馈域 Toast 组件）
 *
 * 收敛 DataTable / ImagePreview 等组件的重复实现（各自维护 toastRef + notify()）。
 * 用法：模板挂 `<Toast ref="toastRef" />`，script 调 notify(msg, type)。
 */
import { ref, type Ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'

/** Toast 组件暴露的 show 方法（与 Toast.vue 的 defineExpose 对齐） */
interface ToastInstance extends ComponentPublicInstance {
  show: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
}

export function useToastNotify(): {
  toastRef: Ref<ToastInstance | undefined>
  notify: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
} {
  const toastRef = ref<ToastInstance>()

  function notify(msg: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    toastRef.value?.show(msg, type)
  }

  return { toastRef, notify }
}
