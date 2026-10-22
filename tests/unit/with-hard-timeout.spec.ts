/**
 * useBarcodeScanner 的纯函数部分（2026-10-22）
 *
 * ## 为什么先测 withHardTimeout
 *
 * `src/components/form/utils/useBarcodeScanner.ts` 626 行，未覆盖 178 条语句（45.6%），
 * 是 `form` 域第三大洼地。整文件依赖摄像头 / zxing wasm / DOM，很难在 happy-dom 里跑。
 *
 * 但它的 `withHardTimeout` 是**独立纯函数**，且承载着一段真实的故障史：
 * 2026-09-28 那次「首次扫码永久转圈」就是解码器启动没上限导致的
 * （注释原文：整机繁忙时实测能拖过 45s 且不返回，界面停在「识别中…」按钮全灰）。
 *
 * 所以这个函数的三条契约必须锁死：
 *
 *   ① 正常返回 → 拿到原值，**不是 fallback**
 *   ② 超时 → 拿到 fallback（**不挂死调用方**）
 *   ③ **原 Promise 的 reject 语义不变** —— 超时兜底不能把真实错误吞成 fallback
 *   ④ **定时器必须被清掉** —— 注释明说：连扫场景下每张图留一个悬挂 timer 会累积
 *
 * 第 ③ 条最容易写错：如果实现成 `Promise.race([p.catch(()=>fallback), timeout])`
 * 就会把真实失败伪装成超时，调用方永远看不到错误原因。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withHardTimeout } from '@/components/form/utils/useBarcodeScanner'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('withHardTimeout', () => {
  it('正常返回 → 拿到原值，不是 fallback', async () => {
    const result = await withHardTimeout(Promise.resolve('real-value'), 1000, 'fallback')
    expect(result, '不该返回 fallback').toBe('real-value')
  })

  it('超时 → 拿到 fallback（**不挂死调用方**）', async () => {
    vi.useFakeTimers()
    // 一个永不 resolve 的 Promise
    const never = new Promise<string>(() => {})
    const p = withHardTimeout(never, 500, 'TIMEOUT')
    await vi.advanceTimersByTimeAsync(600)
    await expect(p).resolves.toBe('TIMEOUT')
  })

  it('超时前完成 → 用真实值，fallback 不生效', async () => {
    vi.useFakeTimers()
    let resolveIt: (v: string) => void = () => {}
    const slow = new Promise<string>((r) => {
      resolveIt = r
    })
    const p = withHardTimeout(slow, 500, 'TIMEOUT')
    // 在超时前 resolve
    await vi.advanceTimersByTimeAsync(100)
    resolveIt('in-time')
    await expect(p).resolves.toBe('in-time')
  })

  it('**原 Promise reject → 照常 reject**（超时兜底不能吞掉真实错误）', async () => {
    // ⚠️ 这是最关键的一条：如果实现把 reject 也映射成 fallback，
    // 调用方就永远看不到真实失败原因（"解码器 ABI 不匹配"会被伪装成"超时"）
    const failing = Promise.reject(new Error('real failure'))
    await expect(withHardTimeout(failing, 1000, 'fallback')).rejects.toThrow('real failure')
  })

  it('reject 与超时竞争 → reject 先到就报错', async () => {
    vi.useFakeTimers()
    let rejectIt: (e: Error) => void = () => {}
    const p = new Promise<string>((_, rj) => {
      rejectIt = rj
    })
    const wrapped = withHardTimeout(p, 500, 'TIMEOUT')
    await vi.advanceTimersByTimeAsync(50)
    rejectIt(new Error('early fail'))
    await expect(wrapped).rejects.toThrow('early fail')
  })

  it('**定时器被清掉**（连扫场景不能累积悬挂 timer）', async () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    await withHardTimeout(Promise.resolve('ok'), 5000, 'fb')
    expect(clearSpy, '正常完成也必须 clearTimeout（finally 里清）').toHaveBeenCalled()
  })

  it('reject 时定时器也被清掉', async () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    await withHardTimeout(Promise.reject(new Error('x')), 5000, 'fb').catch(() => {})
    expect(clearSpy, 'reject 路径也要清 timer').toHaveBeenCalled()
  })

  it('ms 为 0 时立即 fallback', async () => {
    vi.useFakeTimers()
    const never = new Promise<string>(() => {})
    const p = withHardTimeout(never, 0, 'IMMEDIATE')
    await vi.advanceTimersByTimeAsync(1)
    await expect(p).resolves.toBe('IMMEDIATE')
  })

  it('fallback 可以是 null / undefined（warmBarcodeDecoder 就用 null）', async () => {
    vi.useFakeTimers()
    const never = new Promise<null>(() => {})
    const p = withHardTimeout(never, 100, null)
    await vi.advanceTimersByTimeAsync(200)
    await expect(p).resolves.toBeNull()
  })
})
