// useNotify 行为锁定测试（Web Notification：权限状态判定/创建/点击行为/自动关闭/拒绝路径）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type MockN = {
  title: string
  body?: string
  onclick: (() => void) | null
  close: () => void
}

function makeNotification(status: 'granted' | 'denied' | 'prompt') {
  const instances: MockN[] = []
  const requestPermission = vi.fn(async () => (status === 'prompt' ? 'granted' : status))
  class MockNotification {
    title: string
    body?: string
    onclick: (() => void) | null = null
    close = vi.fn()
    constructor(title: string, opts?: { body?: string }) {
      this.title = title
      this.body = opts?.body
      instances.push(this as unknown as MockN)
    }
    static permission = status
    static requestPermission = requestPermission
  }
  return { MockNotification, instances, requestPermission }
}

beforeEach(() => {
  ;(window as unknown as { isSecureContext: boolean }).isSecureContext = true
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function freshNotify(status: 'granted' | 'denied' | 'prompt') {
  vi.resetModules()
  const { MockNotification, instances, requestPermission } = makeNotification(status)
  vi.stubGlobal('Notification', MockNotification)
  const mod = await import('@/components/feedback/composables/useNotify')
  return { mod, instances, requestPermission }
}

describe('getNotifyStatus 环境判定', () => {
  it('非安全上下文 → unsupported', async () => {
    ;(window as unknown as { isSecureContext: boolean }).isSecureContext = false
    const { mod } = await freshNotify('granted')
    expect(mod.getNotifyStatus()).toBe('unsupported')
  })

  it('Notification API 不存在 → unsupported', async () => {
    vi.resetModules()
    vi.stubGlobal('Notification', undefined)
    const mod = await import('@/components/feedback/composables/useNotify')
    expect(mod.getNotifyStatus()).toBe('unsupported')
  })

  it('三态透传 granted/denied/prompt', async () => {
    const { mod } = await freshNotify('granted')
    expect(mod.getNotifyStatus()).toBe('granted')
    const { mod: mod2 } = await freshNotify('denied')
    expect(mod2.getNotifyStatus()).toBe('denied')
    const { mod: mod3 } = await freshNotify('prompt')
    expect(mod3.getNotifyStatus()).toBe('prompt')
  })
})

describe('notify 创建与点击行为', () => {
  it('granted：创建通知并透传 body', async () => {
    const { mod, instances } = await freshNotify('granted')
    await mod.notify('标题A', '正文B')
    expect(instances).toHaveLength(1)
    expect(instances[0].title).toBe('标题A')
    expect(instances[0].body).toBe('正文B')
  })

  it('点击默认行为：聚焦窗口 + 关闭通知', async () => {
    const { mod, instances } = await freshNotify('granted')
    const focusSpy = vi.spyOn(window, 'focus').mockImplementation(() => {})
    await mod.notify('t')
    instances[0].onclick?.()
    expect(focusSpy).toHaveBeenCalledTimes(1)
    expect(instances[0].close).toHaveBeenCalledTimes(1)
  })

  it('onClick 优先于 url / 聚焦；url 次之', async () => {
    const { mod, instances } = await freshNotify('granted')
    const onClick = vi.fn()
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    await mod.notify('t', { body: 'b', onClick, url: 'https://example.com', autoClose: 0 })
    instances[0].onclick?.()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(openSpy).not.toHaveBeenCalled()
    expect(instances[0].close).toHaveBeenCalledTimes(1)

    const { instances: inst2 } = await freshNotify('granted')
    await mod.notify('t', { url: 'https://example.com/x' })
    inst2[0].onclick?.()
    expect(openSpy).toHaveBeenCalledWith('https://example.com/x', '_blank')
  })

  it('autoClose：到时自动关闭', async () => {
    vi.useFakeTimers()
    const { mod, instances } = await freshNotify('granted')
    await mod.notify('t', { autoClose: 5000 })
    expect(instances[0].close).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5000)
    expect(instances[0].close).toHaveBeenCalledTimes(1)
  })

  it('autoClose=0 不自动关闭', async () => {
    vi.useFakeTimers()
    const { mod, instances } = await freshNotify('granted')
    await mod.notify('t', { autoClose: 0 })
    vi.advanceTimersByTime(60000)
    expect(instances[0].close).not.toHaveBeenCalled()
  })
})

describe('notify 权限请求路径', () => {
  it('denied：不创建通知并 console.warn 提示开启权限', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { mod, instances } = await freshNotify('denied')
    await mod.notify('t')
    expect(instances).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('通知权限已被拒绝'))
  })

  it('prompt：同意才创建；请求被拒则静默放弃（不误报「已拒绝」warn）', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { mod, instances, requestPermission } = await freshNotify('prompt')
    await mod.notify('t')
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(instances).toHaveLength(1) // mock 请求结果为 granted

    // 第二个实例：请求权限返回 denied → 不创建；且静态 permission 仍是 'prompt'
    // → 不走「通知权限已被拒绝」的 warn 分支
    vi.resetModules()
    vi.unstubAllGlobals()
    const instances2: MockN[] = []
    class M2 {
      title = ''
      body?: string
      onclick: (() => void) | null = null
      close = vi.fn()
      constructor(t: string, o?: { body?: string }) {
        this.title = t
        this.body = o?.body
        instances2.push(this as unknown as MockN)
      }
      static permission = 'prompt'
      static requestPermission = vi.fn().mockResolvedValue('denied')
    }
    vi.stubGlobal('Notification', M2)
    const mod2 = await import('@/components/feedback/composables/useNotify')
    await mod2.notify('t')
    expect(instances2.length).toBe(0)
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
