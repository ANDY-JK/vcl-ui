// 设计令牌必须先于本域组件样式（Q3 域级 CSS 自包含；与主入口 index.ts 同口径）
import '../tokens.css'
/** 反馈组件按需导入入口 */
export { default as Toast } from './Toast.vue'
export { default as Loading } from './Loading.vue'
export { default as Popover } from './Popover.vue'
export { default as Result } from './Result.vue'
export { default as Drawer } from './Drawer.vue'
export { default as OfflineIndicator } from './OfflineIndicator.vue'
export { default as ReadOnlyOverlay } from './ReadOnlyOverlay.vue'
export { default as ErrorBoundary } from './ErrorBoundary.vue'
export { default as ConfirmModal } from './ConfirmModal.vue'
export { beepSuccess, beepError, beepNotify, beepWarning, unlockAudio } from './composables/useBeep'
export { speak, stopSpeak, unlockVoice } from './composables/useVoice'
export type { VoiceLang } from './composables/useVoice'
export { notify, getNotifyStatus } from './composables/useNotify'
export type { NotifyOptions } from './composables/useNotify'
// Toast provide/inject API（消费方注入 Toast 实例后经 useToast() 编程调用）
export { useToast, TOAST_KEY } from './composables/toast-context'
export type { ToastItem, ToastAPI } from './composables/toast-context'
// 全局错误兜底：接管 app.config.errorHandler + 浏览器级错误事件 + 懒加载 chunk 失效自愈
export { installErrorGuard, uninstallErrorGuard } from './composables/useErrorGuard'
export type { ErrorGuardOptions, ErrorGuardPayload, ErrorGuardSource } from './composables/useErrorGuard'
