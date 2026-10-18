// runtime-observer 的结构化事件出口（H.1 第 6 项）
//
// 为什么在 warn/error 之外还要 event：部署后用户说「提交没成功」，而自由文本日志里
// 有几百条 warn，无法回答「哪个表单、失败几次、什么时候开始的」。
// event 带**稳定事件码**与结构化上下文，宿主才能建告警与聚合。
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  setRuntimeObserver,
  reportEvent,
  reportWarn,
  type RuntimeEvent,
} from '@/components/_internal/runtime-observer'

afterEach(() => {
  setRuntimeObserver(null)
  vi.restoreAllMocks()
})

describe('reportEvent · 路由与形状', () => {
  it('宿主实现了 event → 只投 event，且字段完整', () => {
    const events: RuntimeEvent[] = []
    const warn = vi.fn()
    setRuntimeObserver({ event: (e) => events.push(e), warn })

    reportEvent('form-builder/submit-failed', '提交失败', { formTitle: 'A' }, 'error')

    expect(events).toHaveLength(1)
    expect(events[0].code).toBe('form-builder/submit-failed')
    expect(events[0].message).toBe('提交失败')
    expect(events[0].level).toBe('error')
    expect(events[0].context).toEqual({ formTitle: 'A' })
    expect(new Date(events[0].at).toString(), 'at 应是合法时间').not.toBe('Invalid Date')
    // 关键：**不重复上报**——宿主接了结构化管道，就不该再吃一条文本
    expect(warn, 'event 与 warn 不应同时投递').not.toHaveBeenCalled()
  })

  it('level 默认 warn', () => {
    const events: RuntimeEvent[] = []
    setRuntimeObserver({ event: (e) => events.push(e) })
    reportEvent('x/y', 'm')
    expect(events[0].level).toBe('warn')
  })

  it('宿主只接了 warn/error（老宿主）→ 退化投递，信息不丢', () => {
    const warn = vi.fn()
    const error = vi.fn()
    setRuntimeObserver({ warn, error })

    reportEvent('a/b', '警告类', undefined, 'warn')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('a/b')

    reportEvent('a/c', '错误类', { k: 1 }, 'error')
    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0][0])).toContain('a/c')
  })

  it('未注入 observer → 回落 console（行为与既有一致）', () => {
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const e = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportEvent('p/q', '没人接')
    expect(w).toHaveBeenCalled()
    reportEvent('p/r', '没人接', undefined, 'error')
    expect(e).toHaveBeenCalled()
  })

  it('宿主管道抛异常 → 不打断数据流，降级 console 并报一次故障', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setRuntimeObserver({
      event: () => {
        throw new Error('宿主埋点炸了')
      },
    })
    // 不应抛出
    expect(() => reportEvent('boom/x', '消息')).not.toThrow()
    // 宿主管道故障要可见
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('event 管道抛异常'))).toBe(true)
    // 且事件本身仍以 console 形式落地（不静默吞）
    expect(w).toHaveBeenCalled()
  })

  it('既有 reportWarn 行为不受影响（回归）', () => {
    const warn = vi.fn()
    setRuntimeObserver({ warn })
    reportWarn('老调用')
    expect(warn).toHaveBeenCalledWith('老调用')
  })
})

describe('真实点位确实会发事件', () => {
  it('草稿保存失败 → form-designer/draft-save-failed（带 storage 与节点数）', async () => {
    const events: RuntimeEvent[] = []
    setRuntimeObserver({ event: (e) => events.push(e) })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { setActiveDraftStorage } = await import('@/components/form-builder/designer/draft-storage')
    const { useDesignerDraft } = await import('@/components/form-builder/designer/useDesignerDraft')
    setActiveDraftStorage({
      name: 'always-fails',
      load: async () => null,
      save: async () => {
        throw new Error('配额满了')
      },
      clear: async () => {},
    })

    await useDesignerDraft().saveDraft([{ id: 'n1', type: 'text', label: 'x', key: 'k1' }] as never, {} as never)

    const ev = events.find((e) => e.code === 'form-designer/draft-save-failed')
    expect(ev, '草稿保存失败必须发结构化事件').toBeTruthy()
    expect(ev!.level).toBe('error')
    expect(ev!.context?.storage).toBe('always-fails')
    expect(ev!.context?.nodeCount).toBe(1)
    expect(String(ev!.context?.reason)).toContain('配额满了')

    setActiveDraftStorage(null)
  })
})
