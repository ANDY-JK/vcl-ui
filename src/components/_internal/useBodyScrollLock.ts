/**
 * useBodyScrollLock — 弹层打开期间锁 body 滚动（引用计数）
 *
 * 为什么用计数而不是布尔：Drawer 内再开 ConfirmModal 时两层都加锁，
 * 任意一层先关都不能解锁，必须等最后一层关闭才恢复，否则背景提前可滚。
 * 恢复时写回打开前的内联值，不覆盖宿主自己设的 overflow。
 */
import { onUnmounted, watch } from 'vue'

let lockCount = 0
let savedOverflow = ''

/** 加锁；返回释放函数（重复调用只生效一次） */
export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined' || !document.body) return () => {}
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockCount += 1

  let released = false
  return () => {
    if (released) return
    released = true
    lockCount -= 1
    if (lockCount === 0) {
      document.body.style.overflow = savedOverflow
      savedOverflow = ''
    }
  }
}

/** 组件内使用：active 为真时加锁，转假或卸载时释放 */
export function useBodyScrollLock(active: () => boolean): void {
  let release: (() => void) | null = null

  watch(
    active,
    (v) => {
      if (v && !release) {
        release = lockBodyScroll()
      } else if (!v && release) {
        release()
        release = null
      }
    },
    { immediate: true },
  )

  onUnmounted(() => {
    if (release) {
      release()
      release = null
    }
  })
}
