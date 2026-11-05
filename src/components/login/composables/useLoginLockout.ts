/**
 * useLoginLockout — 登录失败计数与锁定倒计时（#459 从 login.vue 下沉）
 *
 * 状态机：失败计数（localStorage）→ 达阈值进入锁定（lockUntil 存 localStorage）→
 * 秒级倒计时（internalError 文案 + warning 图标）→ 到点自动解锁清态。
 * 成功登录时调用 reset() 清计数与锁。
 *
 * 安全边界（保留原注释语义）：localStorage 属客户端辅助防护，可被清除绕过；
 * 服务端锁定才是核心 —— 本状态机只优化体验与防误触。
 */
import { ref, computed, onUnmounted, onMounted, type ComputedRef } from 'vue'
import { storageGet, storageSet, storageDelete } from '../_shared'

export interface LoginLockoutDeps {
  t: (key: string, params?: Record<string, unknown>) => string
  /** 最大失败次数（<=0 = 不启用本地计数） */
  maxAttempts: number
  /** 锁定分钟数 */
  lockMinutes: number
  /** 倒计时心跳间隔 */
  tickMs: number
}

export function useLoginLockout(d: LoginLockoutDeps) {
  const lockUntil = ref(0)
  const internalError = ref('')
  const errorType = ref<'circle-alert' | 'success' | 'warning' | 'error'>('error')
  let lockTimer: ReturnType<typeof setInterval> | null = null

  // 锁定状态存 localStorage，属客户端辅助防护可被清除绕过，服务端锁定才是核心
  const ATTEMPT_KEY = '_login_attempts'
  const LOCK_KEY = '_login_lock_until'

  /** 是否处于锁定中（供提交入口判断） */
  const locked = computed(() => lockUntil.value > Date.now())

  function startLockCountdown(): void {
    if (lockTimer) clearInterval(lockTimer)
    const render = () => {
      const remaining = Math.max(0, lockUntil.value - Date.now())
      const min = Math.floor(remaining / 60000)
      const sec = Math.floor((remaining % 60000) / 1000)
      internalError.value = d.t('login.lockedCountdown', {
        time: `${min}:${String(sec).padStart(2, '0')}`,
      })
      errorType.value = 'warning'
    }
    render()
    lockTimer = setInterval(() => {
      const remaining = Math.max(0, lockUntil.value - Date.now())
      if (remaining <= 0) {
        lockUntil.value = 0
        storageDelete(LOCK_KEY)
        internalError.value = ''
        if (lockTimer) {
          clearInterval(lockTimer)
          lockTimer = null
        }
      } else {
        render()
      }
    }, d.tickMs)
  }

  /** 登录失败回写：计数 +1；达阈值进入锁定 */
  function recordFailedAttempt(serverMsg?: string): void {
    if (d.maxAttempts <= 0) {
      internalError.value = serverMsg ?? ''
      if (serverMsg) errorType.value = 'error'
      return
    }
    const attempts = (Number(storageGet<string>(ATTEMPT_KEY)) || 0) + 1
    storageSet(ATTEMPT_KEY, String(attempts))

    if (attempts >= d.maxAttempts) {
      const until = Date.now() + d.lockMinutes * 60 * 1000
      storageSet(LOCK_KEY, String(until))
      storageSet(ATTEMPT_KEY, '0')
      lockUntil.value = until
      errorType.value = 'warning'
      startLockCountdown()
    } else {
      internalError.value = serverMsg || d.t('login.attemptsLeft', { attempts, max: d.maxAttempts })
      errorType.value = 'error'
    }
  }

  /** 宿主本地校验失败：直接呈现 warning 文案（不计数、不锁定） */
  function setValidationError(msg: string): void {
    internalError.value = msg
    errorType.value = 'warning'
  }

  /** 清当前错误文案（提交入口复位） */
  function clearError(): void {
    internalError.value = ''
  }

  /** 登录成功：清计数与锁 */
  function reset(): void {
    storageDelete(ATTEMPT_KEY)
    storageDelete(LOCK_KEY)
    lockUntil.value = 0
    internalError.value = ''
  }

  /** 挂载时恢复持久化的锁（刷新页面后锁定仍然生效） */
  function restore(): void {
    const lkUntil = Number(storageGet<string>(LOCK_KEY)) || 0
    if (lkUntil > Date.now()) {
      lockUntil.value = lkUntil
      startLockCountdown()
    }
  }

  onMounted(restore)
  onUnmounted(() => {
    if (lockTimer) clearInterval(lockTimer)
  })

  return {
    setValidationError,
    clearError,
    lockUntil,
    locked,
    internalError,
    errorType,
    startLockCountdown,
    recordFailedAttempt,
    reset,
    restore,
  }
}

/** 供类型引用（宿主 displayError 计算属性用） */
export type LoginLockoutState = ComputedRef<string>
