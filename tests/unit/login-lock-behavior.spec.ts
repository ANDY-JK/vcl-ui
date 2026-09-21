// login 页行为锁定（Q4 后半·login 域）——失败计数、锁定倒计时、记住我、重复提交防护。
// 这些逻辑此前只被 login-i18n.spec.ts 的文案冒烟覆盖，锁定计数/倒计时/存储恢复零测试，
// 是 login 域覆盖率 35% 洼地的主要缺口。改锁定语义/存储键/提交防护时必须过本组。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import Login from '@/components/login/login.vue'
import { storageGet, storageSet, storageHas } from '@/components/storage'

const ATTEMPT_KEY = '_login_attempts'
const LOCK_KEY = '_login_lock_until'
const REMEMBER_KEY = 'remembered_username'

const mountLogin = (props = {}) =>
  mount(Login, {
    props: { hideBrand: true, showSocialLogin: false, showRegister: false, showForgotPassword: false, ...props },
  })

describe('login · 表单校验与提交', () => {
  beforeEach(() => localStorage.clear())

  it('用户名短于 3 位：警告文案，不 emit submit', async () => {
    const w = mountLogin()
    await w.find('input[type="text"]').setValue('ab')
    await w.find('input[type="password"]').setValue('secret123')
    const btn = w.findAll('button').find((b) => b.text().includes('登'))!
    await btn.trigger('click')
    expect(w.text()).toContain('请输入正确的用户名和密码')
    expect(w.emitted('submit')).toBeUndefined()
  })

  it('密码短于 6 位同样不放行', async () => {
    const w = mountLogin()
    await w.find('input[type="text"]').setValue('alice')
    await w.find('input[type="password"]').setValue('123')
    const btn = w.findAll('button').find((b) => b.text().includes('登'))!
    await btn.trigger('click')
    expect(w.emitted('submit')).toBeUndefined()
  })

  it('合法提交：emit 出 username/password/rememberMe 三件', async () => {
    const w = mountLogin()
    await w.find('input[type="text"]').setValue('alice')
    await w.find('input[type="password"]').setValue('secret123')
    const btn = w.findAll('button').find((b) => b.text().includes('登'))!
    await btn.trigger('click')
    const submit = w.emitted('submit')
    expect(submit).toHaveLength(1)
    expect(submit![0]).toEqual([{ username: 'alice', password: 'secret123', rememberMe: false }])
  })

  it('加载中重复点击被忽略（提交防护）', async () => {
    vi.useFakeTimers()
    try {
      const w = mountLogin()
      await w.find('input[type="text"]').setValue('alice')
      await w.find('input[type="password"]').setValue('secret123')
      const btn = w.findAll('button').find((b) => b.text().includes('登'))!
      await btn.trigger('click')
      await btn.trigger('click')
      await btn.trigger('click')
      expect(w.emitted('submit')).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('login · 记住用户名', () => {
  beforeEach(() => localStorage.clear())

  it('勾选记住我：提交即写 remembered_username', async () => {
    const w = mountLogin()
    await w.find('input[type="text"]').setValue('alice')
    await w.find('input[type="password"]').setValue('secret123')
    await w.find('input.remember-checkbox').setChecked(true)
    const btn = w.findAll('button').find((b) => b.text().includes('登'))!
    await btn.trigger('click')
    expect(storageGet(REMEMBER_KEY)).toBe('alice')
  })

  it('自动勾选后手动取消再提交：remembered_username 被清掉（防串账号）', async () => {
    // 注意真实行为：挂载读到 remembered_username 会连 rememberMe 一起自动勾上
    // （onMounted 的恢复先落地），删除路径 = 用户手动取消勾选后再提交
    storageSet(REMEMBER_KEY, 'old-user')
    const w = mountLogin()
    await w.vm.$nextTick() // 等 onMounted 的自动勾选落地
    expect((w.find('input.remember-checkbox').element as HTMLInputElement).checked).toBe(true)
    await w.find('input.remember-checkbox').setChecked(false)
    await w.find('input[type="text"]').setValue('alice')
    await w.find('input[type="password"]').setValue('secret123')
    const btn = w.findAll('button').find((b) => b.text().includes('登'))!
    await btn.trigger('click')
    expect(storageHas(REMEMBER_KEY)).toBe(false)
  })

  it('挂载时恢复记住的用户名并自动勾选', async () => {
    storageSet(REMEMBER_KEY, 'remembered-bob')
    const w = mountLogin()
    await w.vm.$nextTick()
    expect((w.find('input[type="text"]').element as HTMLInputElement).value).toBe('remembered-bob')
    expect((w.find('input.remember-checkbox').element as HTMLInputElement).checked).toBe(true)
  })
})

describe('login · 失败计数与锁定', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  /** v2（Q18）：宿主回写走 authResult prop（watch 驱动），取代 notifyFailed() 暴露方法 */
  const failOnce = (w: VueWrapper) => w.setProps({ authResult: { ok: false } })

  it('authResult {ok:false} 按次数累加并警告剩余次数', async () => {
    const w = mountLogin({ maxAttempts: 3 })
    await failOnce(w)
    expect(storageGet(ATTEMPT_KEY)).toBe('1')
    expect(w.text()).toContain('用户名或密码错误 (1/3)')
    await failOnce(w)
    expect(storageGet(ATTEMPT_KEY)).toBe('2')
    expect(w.text()).toContain('用户名或密码错误 (2/3)')
  })

  it('达到 maxAttempts：写入锁定时间戳并进入倒计时文案', async () => {
    const w = mountLogin({ maxAttempts: 2, lockMinutes: 15 })
    await failOnce(w)
    await failOnce(w)
    const until = Number(storageGet(LOCK_KEY))
    expect(until).toBeGreaterThan(Date.now())
    expect(storageGet(ATTEMPT_KEY)).toBe('0') // 计数复位
    await w.vm.$nextTick() // 回写的 errorType 写入需 flush
    vi.advanceTimersByTime(1000) // 倒计时节拍
    await w.vm.$nextTick()
    expect(w.text()).toMatch(/账户已锁定，请 \d+:\d{2} 后重试/)
  })

  it('锁定期间提交被拒绝（不 emit）', async () => {
    const w = mountLogin({ maxAttempts: 1, lockMinutes: 15 })
    await failOnce(w) // 一次即锁
    await w.find('input[type="text"]').setValue('alice')
    await w.find('input[type="password"]').setValue('secret123')
    const btn = w.findAll('button').find((b) => b.text().includes('登'))!
    await btn.trigger('click')
    expect(w.emitted('submit')).toBeUndefined()
  })

  it('maxAttempts<=0：不计数不锁定（宿主自行管控）', async () => {
    const w = mountLogin({ maxAttempts: 0 })
    await failOnce(w)
    expect(storageHas(ATTEMPT_KEY)).toBe(false)
    expect(storageHas(LOCK_KEY)).toBe(false)
  })

  it('authResult {ok:true}：清错误、清计数与锁定', async () => {
    const w = mountLogin({ maxAttempts: 2 })
    await failOnce(w)
    await failOnce(w)
    await w.setProps({ authResult: { ok: true } })
    expect(storageHas(ATTEMPT_KEY)).toBe(false)
    expect(storageHas(LOCK_KEY)).toBe(false)
    expect(w.text()).not.toContain('账户已锁定')
  })

  it('挂载时检测到未过期锁定：直接恢复倒计时', async () => {
    storageSet(LOCK_KEY, Date.now() + 10 * 60 * 1000)
    const w = mountLogin()
    vi.advanceTimersByTime(1000)
    await w.vm.$nextTick()
    expect(w.text()).toMatch(/账户已锁定，请 \d+:\d{2} 后重试/)
  })

  it('倒计时走完：错误自动清除、锁定键删除', async () => {
    const w = mountLogin({ maxAttempts: 1, lockMinutes: 15 })
    await failOnce(w)
    vi.advanceTimersByTime(15 * 60 * 1000 + 2000)
    await w.vm.$nextTick()
    expect(storageHas(LOCK_KEY)).toBe(false)
    expect(w.text()).not.toContain('账户已锁定')
  })

  it('服务端错误文案经 message 透传（等同原 notifyFailed(serverMsg)）', async () => {
    const w = mountLogin({ maxAttempts: 3 })
    await w.setProps({ authResult: { ok: false, message: '账号已在别处登录' } })
    expect(w.text()).toContain('账号已在别处登录')
  })
})
