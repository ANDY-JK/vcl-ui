/**
 * login 域共享原语 —— 4 个登录页面共用的跨域组件/工具统一出口
 *
 * ⛔ 本文件是 login 域对其它域的唯一横向依赖点：新增跨域依赖先加这里，
 * 页面禁止直接 import 其他域内部路径。依赖变更只需改这一处。
 */
// 通用 UI 原语（4 页共用）
export { default as Input } from '@/components/form/Input.vue'
export { default as Button } from '@/components/basic/Button.vue'
export { default as IconSvg } from '@/components/basic/IconSvg.vue'
export { default as Toast } from '@/components/feedback/Toast.vue'
// login 页专用
export { default as Divider } from '@/components/data/Divider.vue'
export { useT, useTm } from '@/components/_internal/i18n'
// 表单校验（register 页专用）
export { isValidPhone, isValidEmail } from '@/components/_internal/utils'
// 存储（走 storage 公共出口，非 indexedDB 内部路径）
export { storageGet, storageSet, storageDelete } from '@/components/storage'

/**
 * 提交后自动解锁的兜底时长 —— 登录/注册/改密三页是同一件事，抄三遍就会各改各的。
 * 提交动作交给宿主（emit 后由父组件收尾），这里只保证宿主没回音时按钮最迟这么久恢复可点。
 */
export const SUBMIT_UNLOCK_FALLBACK_MS = 15000
