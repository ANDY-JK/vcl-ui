/**
 * Toast 队列状态机（#374，从 Toast.vue 下沉）
 *
 * ## 为什么下沉
 *
 * Toast.vue 只剩 **3 行余量**（287/290），任何改动都会被行数闸口拦下。
 * `show/remove/clearAll` 这段队列逻辑（去重、上限、定时器簿记）是**纯状态机**——
 * 只依赖传入的 `toasts` 数组，不碰 DOM / provide / 全局注册，是最安全的一刀。
 *
 * ## 判据集中在单一的 `dedup` 判断（#314/#313 的延续）
 *
 * 同类型 + 同文案 + 无操作按钮 → 重新计时（延长停留）而不是再插一条；
 * 带 `actionText/undoText` 的不合并（合并会丢回调）。
 * 下沉后这个判据第一次有了**独立的单测入口**（此前 9 条行为混在组件测试里）。
 *
 * ## 定时器簿记
 *
 * `_closeTimers`（id → timer）跟队列一起搬进来：卸载清理仍由组件在 `onUnmounted`
 * 调 `clearAll()`，语义不变。
 */
import { ref, type Ref } from 'vue'
import type { ToastItem } from './toast-context'

/** 未显式传 duration 时的默认停留：报错要给人读完并处理的时间，其余类型读完即走 */
export const _DEFAULT_ERROR_DURATION_MS = 5000
export const _DEFAULT_DURATION_MS = 3000
/** 队列上限：常驻 toast 被调用方遗漏 remove 时防止长会话无限累积（丢弃最旧的一条） */
export const MAX_TOASTS = 50

export interface ToastQueue {
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

let nextId = 0

export function createToastQueue(): ToastQueue {
  const toasts = ref<ToastItem[]>([])
  const _closeTimers = new Map<number, ReturnType<typeof setTimeout>>()

  function removeToast(id: number) {
    const idx = toasts.value.findIndex((t) => t.id === id)
    if (idx >= 0) toasts.value.splice(idx, 1)
    const timer = _closeTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      _closeTimers.delete(id)
    }
  }

  function show(
    message: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info',
    duration?: number,
    options?: {
      undoText?: string
      onUndo?: () => void
      actionText?: string
      onAction?: () => void
      closable?: boolean
    },
  ) {
    const id = nextId++
    const dur = duration ?? (type === 'error' ? _DEFAULT_ERROR_DURATION_MS : _DEFAULT_DURATION_MS)
    const toast: ToastItem = {
      id,
      type,
      message,
      duration: dur,
      closable: options?.closable ?? true,
      // 向后兼容 undoText/onUndo
      undoText: options?.undoText,
      onUndo: options?.onUndo,
      // 新 action 接口（优先级高于 undo）
      actionText: options?.actionText ?? options?.undoText,
      onAction: options?.onAction ?? options?.onUndo,
    }
    // 相同消息去重（#314）：同类型 + 同文案 + 无操作按钮 → 重新计时，不重复插。
    // 带 actionText/undoText 的不合并：那类提示绑定的是某次具体操作，合并会丢回调。
    // 判断收敛到**一处**（单一判据）：两层独立守卫时，任一层被改坏另一层仍能挡住，
    // 单点变异测不出来（#313 的教训）。
    const dup =
      options?.actionText || options?.undoText
        ? undefined
        : toasts.value.find((t) => t.type === type && t.message === message && !t.actionText)
    if (dup) {
      const old = _closeTimers.get(dup.id)
      if (old) clearTimeout(old)
      if (dur > 0) {
        _closeTimers.set(
          dup.id,
          setTimeout(() => removeToast(dup.id), dur),
        )
      }
      return dup.id
    }
    toasts.value.unshift(toast)
    if (toasts.value.length > MAX_TOASTS) {
      const oldest = toasts.value.pop()!
      const t = _closeTimers.get(oldest.id)
      if (t) {
        clearTimeout(t)
        _closeTimers.delete(oldest.id)
      }
    }

    if (dur > 0) {
      const timer = setTimeout(() => removeToast(id), dur)
      _closeTimers.set(id, timer)
    }
    return id
  }

  function clearAll() {
    toasts.value.splice(0)
    _closeTimers.forEach((t) => clearTimeout(t))
    _closeTimers.clear()
  }

  return { toasts, show, remove: removeToast, clearAll }
}
