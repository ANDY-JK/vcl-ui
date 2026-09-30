// 运行时可观测性注入口（F10）——
// 默认 console 透传（既有 spy 行为不变）、宿主管道接管、null 复位、管道抛异常降级不炸组件。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { setRuntimeObserver, reportWarn, reportError } from '@/components/_internal/runtime-observer'

afterEach(() => {
  setRuntimeObserver(null)
  vi.restoreAllMocks()
})

describe('runtime-observer（F10）', () => {
  it('未注入时透传 console（参数逐字一致，既有行为零差异）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportWarn('[组件库][Select] a', 1)
    reportError('[Button] 异常:', new Error('x'))
    expect(warn).toHaveBeenCalledWith('[组件库][Select] a', 1)
    expect(error).toHaveBeenCalledWith('[Button] 异常:', expect.any(Error))
  })

  it('注入后 warn/error 改投宿主管道，console 不再收到', () => {
    const host = { warn: vi.fn(), error: vi.fn() }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    setRuntimeObserver(host)
    reportWarn('w')
    reportError('e')
    expect(host.warn).toHaveBeenCalledWith('w')
    expect(host.error).toHaveBeenCalledWith('e')
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('只注入 error 时 warn 仍走 console（两口独立）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setRuntimeObserver({ error: vi.fn() })
    reportWarn('w')
    expect(warn).toHaveBeenCalledWith('w')
  })

  it('传 null 复位默认 console', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setRuntimeObserver({ warn: vi.fn() })
    setRuntimeObserver(null)
    reportWarn('w')
    expect(warn).toHaveBeenCalledWith('w')
  })

  it('宿主管道抛异常：向 console.error 报告后降级 console 输出，不炸组件', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setRuntimeObserver({ warn: () => { throw new Error('host pipeline bug') } })
    expect(() => reportWarn('w')).not.toThrow()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('warn 管道抛异常'), expect.any(Error))
    expect(warn).toHaveBeenCalledWith('w')
  })
})
