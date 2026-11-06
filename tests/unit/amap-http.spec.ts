/* amapHttp · fetch 超时与一次退避重试（#462）
 *
 * 从 amap-service.ts 拆出的 HTTP 底座：超时必须真的 abort，重试必须只重试一次。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchOnce, safeFetch, RETRY_BACKOFF_MS } from '@/components/amap/amap-http'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('fetchOnce', () => {
  it('超时后 abort（不悬挂），并把 abort 错误抛给调用方', async () => {
    let aborted = false
    vi.stubGlobal('fetch', (_u: string, init?: RequestInit) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true
      })
      return new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new Error('aborted')))
      })
    })
    const p = fetchOnce('https://x', 1000)
    const asserted = expect(p).rejects.toThrow('aborted')
    vi.advanceTimersByTime(1000)
    await asserted
    expect(aborted).toBe(true)
  })

  it('正常返回时清理定时器（不留下未触发的 abort）', async () => {
    const resp = { ok: true } as Response
    vi.stubGlobal('fetch', () => Promise.resolve(resp))
    await expect(fetchOnce('https://x', 5000)).resolves.toBe(resp)
    // 定时器应已清除：推进时间不会再触发任何 abort（fetch 已 resolve，不会报错）
    vi.advanceTimersByTime(10000)
  })
})

describe('safeFetch', () => {
  it('首次失败 → 退避后重试一次成功', async () => {
    let calls = 0
    const resp = { ok: true } as Response
    vi.stubGlobal('fetch', () => {
      calls++
      return calls === 1 ? Promise.reject(new Error('boom')) : Promise.resolve(resp)
    })
    const p = safeFetch('https://x')
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS + 1)
    await expect(p).resolves.toBe(resp)
    expect(calls).toBe(2) // 只重试一次
  })

  it('反向保护：连续失败时不再重试第二次（calls 恰好 2）', async () => {
    let calls = 0
    vi.stubGlobal('fetch', () => {
      calls++
      return Promise.reject(new Error('boom'))
    })
    const p = safeFetch('https://x')
    const asserted = expect(p).rejects.toThrow('boom')
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS + 1)
    await asserted
    expect(calls).toBe(2)
  })
})
