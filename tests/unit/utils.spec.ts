import { describe, it, expect, vi } from 'vitest'
import { formatSize } from '@/components/_internal/utils'
import { calcTotalPages } from '@/components/nav/utils/pagination-utils'
import { warnOnce } from '@/components/_internal/warnOnce'
import { safeRun, safeDocument } from '@/components/_internal/ssr-guard'
import { useEscClose } from '@/components/_internal/useEscClose'
import { useDebounceFn } from '@/components/_internal/useDebounce'
import { formatDateZh, formatDateTimeZh } from '@/components/form/utils/date-utils'

describe('formatSize', () => {
  it('B / KB / MB / GB 分级', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(1024)).toBe('1.0 KB')
    expect(formatSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatSize(1024 * 1024 * 1024)).toBe('1.00 GB')
  })

  it('**脏输入 → 空串，不产出 "NaN GB" / "null B"**（第 187 轮）', () => {
    // 模块头部承诺「所有函数带容错/降级：接受 unknown 输入」，
    // 但 formatSize 完全没守卫：NaN / undefined / 'abc' 一路比较全为 false，
    // 落到 GB 分支拼出 "NaN GB"；null 走 B 分支拼出 "null B"。
    // 上传组件（Upload.vue:464）直接把它渲染在文件条目上。
    const dirty: unknown[] = [NaN, Infinity, -Infinity, undefined, null, '', 'abc', {}, []]
    for (const v of dirty) {
      expect(formatSize(v as never), `输入 ${String(v)}`).toBe('')
    }
    // 负大小无意义，同样按非法处理
    expect(formatSize(-1)).toBe('')
  })
})

describe('calcTotalPages', () => {
  it('正常分页', () => {
    expect(calcTotalPages(100, 10)).toBe(10)
    expect(calcTotalPages(101, 10)).toBe(11)
  })

  it('pageSize<=0 兜底为 1', () => {
    expect(calcTotalPages(100, 0)).toBe(100)
    expect(calcTotalPages(100, -5)).toBe(100)
  })

  it('total=0 兜底 1 页', () => {
    expect(calcTotalPages(0, 10)).toBe(1)
  })
})

describe('warnOnce', () => {
  it('同一消息只警告一次', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warnOnce('test', 'msg')
    warnOnce('test', 'msg')
    warnOnce('test', 'msg')
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('不同模块/消息各自警告', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warnOnce('a', 'x')
    warnOnce('b', 'x')
    warnOnce('a', 'y')
    expect(spy).toHaveBeenCalledTimes(3)
    spy.mockRestore()
  })
})

describe('ssr-guard', () => {
  it('safeRun 执行并返回', () => {
    expect(safeRun(() => 42)).toBe(42)
  })

  it('safeRun 异常时返回 fallback', () => {
    expect(
      safeRun(() => {
        throw new Error('x')
      }, 'fallback'),
    ).toBe('fallback')
  })

  it('safeDocument 返回 document（happy-dom）', () => {
    expect(safeDocument()).toBe(document)
  })
})

describe('useEscClose', () => {
  it('ESC 键触发关闭（可见且可关闭）', () => {
    const onClose = vi.fn()
    const { onKeydown } = useEscClose(
      () => true,
      () => true,
      onClose,
    )
    onKeydown({ key: 'Escape' } as KeyboardEvent)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('非 ESC 键不触发', () => {
    const onClose = vi.fn()
    const { onKeydown } = useEscClose(
      () => true,
      () => true,
      onClose,
    )
    onKeydown({ key: 'Enter' } as KeyboardEvent)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('不可关闭时不触发', () => {
    const onClose = vi.fn()
    const { onKeydown } = useEscClose(
      () => true,
      () => false,
      onClose,
    )
    onKeydown({ key: 'Escape' } as KeyboardEvent)
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('formatDateZh / formatDateTimeZh', () => {
  it('中文日期/时间格式化不抛异常，返回非空', () => {
    const d = new Date(2026, 7, 23, 14, 30, 5)
    expect(formatDateZh(d)).toBeTruthy()
    expect(formatDateTimeZh(d)).toBeTruthy()
  })

  it('默认取当前时间', () => {
    expect(formatDateZh()).toBeTruthy()
    expect(formatDateTimeZh()).toBeTruthy()
  })
})

describe('useDebounceFn', () => {
  it('防抖后执行最后一次', async () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const { run } = useDebounceFn(fn, 100)
    run(1)
    run(2)
    run(3)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(3)
    vi.useRealTimers()
  })

  it('cancel 取消待执行', async () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const { run, cancel } = useDebounceFn(fn, 100)
    run(1)
    cancel()
    vi.advanceTimersByTime(100)
    expect(fn).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
