// #24(b) 环境不支持 Notification 时不得触碰裸 Notification 引用：
//         此前 ensure() 过了 'Notification' in window 后直接读 Notification.permission，
//         在不支持的环境抛 TypeError 被外层 catch 吞成误导性的「通知发送失败」告警
import { describe, it, expect, afterEach, vi } from 'vitest'
import { notify, getNotifyStatus } from '@/components/feedback/composables/useNotify'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useNotify · 不支持环境', () => {
  it('Notification 缺失时静默返回：不抛错、不误报“发送失败”', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('Notification', undefined)

    await expect(notify('标题', '正文')).resolves.toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
  })

  it('getNotifyStatus 在 Notification 缺失时返回 unsupported', () => {
    // 隔离 isSecureContext：否则 happy-dom 的 http 环境会先命中 'unsupported'，测试因错误原因通过
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('Notification', undefined)
    expect(getNotifyStatus()).toBe('unsupported')
  })
})
