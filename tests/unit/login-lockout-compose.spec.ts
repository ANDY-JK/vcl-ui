/* useLoginLockout 编排层 · 失败计数与锁定倒计时（#459）
 *
 * 从 login.vue 下沉：localStorage 计数 → 达阈值锁定 → 秒级倒计时 → 到点自动解锁。
 * 安全边界：localStorage 属客户端辅助防护可被清除绕过，服务端锁定才是核心。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useLoginLockout } from '@/components/login/composables/useLoginLockout'
import { storageGet, storageDelete } from '@/components/storage'

function harness(maxAttempts = 3, lockMinutes = 5) {
  return useLoginLockout({
    t: (k, p) => (p ? `${k}:${JSON.stringify(p)}` : k),
    maxAttempts,
    lockMinutes,
    tickMs: 1000,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  storageDelete('_login_attempts');storageDelete('_login_lock_until')
})
afterEach(() => vi.useRealTimers())

describe('useLoginLockout · 计数', () => {
  it('未达阈值：报剩余次数错误（error 图标），不锁定', () => {
    const s = harness(3)
    s.recordFailedAttempt()
    expect(s.internalError.value).toContain('login.attemptsLeft')
    expect(s.errorType.value).toBe('error')
    expect(s.locked.value).toBe(false)
  })

  it('服务端消息优先于本地剩余次数文案', () => {
    const s = harness(3)
    s.recordFailedAttempt('账号或密码错误')
    expect(s.internalError.value).toBe('账号或密码错误')
  })

  it('maxAttempts<=0：不计数，只透传服务端消息', () => {
    const s = harness(0)
    s.recordFailedAttempt('bad')
    expect(s.internalError.value).toBe('bad')
    expect(storageGet<string>('_login_attempts')).toBe(null)
  })

  it('达到阈值：进入锁定 + 计数清零 + 锁时间落 localStorage', () => {
    const s = harness(3, 5)
    s.recordFailedAttempt()
    s.recordFailedAttempt()
    s.recordFailedAttempt()
    expect(s.locked.value).toBe(true)
    expect(storageGet<string>('_login_attempts')).toBe('0')
    expect(Number(storageGet<string>('_login_lock_until'))).toBeGreaterThan(Date.now())
    expect(s.errorType.value).toBe('warning')
  })
})

describe('useLoginLockout · 倒计时', () => {
  it('锁定中倒计时文案走 warning；到点自动解锁并清 localStorage', () => {
    const s = harness(1, 5)
    s.recordFailedAttempt()
    expect(s.internalError.value).toContain('login.lockedCountdown')
    vi.advanceTimersByTime(5 * 60 * 1000 + 1500)
    expect(s.locked.value).toBe(false)
    expect(s.internalError.value).toBe('')
    expect(storageGet<string>('_login_lock_until')).toBe(null)
  })

  it('restore：刷新后未过期的锁仍生效（不重置倒计时起点）', () => {
    const lockUntil = Date.now() + 60_000
    localStorage.setItem('saas__login_lock_until', JSON.stringify({ value: String(lockUntil), _exp: 0 }))
    const s = harness(3, 5)
    // restore 在 composable onMounted 里被 harness 外的组件生命周期触发；
    // 单测直接调（与组件挂载同语义）
    s.restore()
    expect(s.locked.value).toBe(true)
  })

  it('reset（登录成功）：清计数与锁、错误文案归零', () => {
    const s = harness(1, 5)
    s.recordFailedAttempt()
    expect(s.locked.value).toBe(true)
    s.reset()
    expect(s.locked.value).toBe(false)
    expect(s.internalError.value).toBe('')
    expect(storageGet<string>('_login_attempts')).toBe(null)
    expect(storageGet<string>('_login_lock_until')).toBe(null)
  })

  it('反向保护：锁定中 locked 与时间戳一致（供提交入口判断）', () => {
    const s = harness(1, 1)
    s.recordFailedAttempt()
    expect(s.locked.value).toBe(true)
    expect(s.lockUntil.value).toBeGreaterThan(Date.now())
  })
})
