// 解码器预热与静图识别硬上限（2026-09-28 挂起缺陷的回归防线）
//
// 缺陷形态（e2e 现场取证）：整机繁忙时兜底页上传识别会**一直停在「识别中…」且按钮全灰**，
// 45s 断言预算耗尽仍未出结果；分段实测显示图片本身不值钱（取 Blob/解图/读像素 ≤13ms），
// 热路径整次识别 24~36ms，全部耗时来自首次 readBarcodes 触发的 wasm 模块启动
// （空载 842ms / 4 并发 3.39s，繁忙时不返回）。
// 两道处置：① 界面一打开就预热模块（warmBarcodeDecoder），② 静图解码套 20s 硬上限
// （withHardTimeout），到期按「这一次没结果」结算，界面回到可操作态。
//
// 本文件只锁这两个接缝的契约：预热只启一次、失败不外抛；硬上限三种结局
// （按时返回 / 原值透传 / 原失败语义保留）且不留悬挂定时器。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const state = vi.hoisted(() => ({
  calls: 0,
  // 每次 prepareZXingModule 走哪个假实现；照真上游的失败形态给（返回 Promise / 直接拒）
  behavior: null as null | (() => Promise<unknown>),
}))

vi.mock('zxing-wasm/reader', async (importOriginal) => {
  const actual = await (importOriginal() as Promise<Record<string, unknown>>)
  return {
    ...actual,
    prepareZXingModule: vi.fn(() => {
      state.calls++
      return (state.behavior ?? (() => Promise.resolve({})))()
    }),
  }
})

const { withHardTimeout } = await import('@/components/form/utils/useBarcodeScanner')

// warmBarcodeDecoder 的 promise 是**模块级单例**（这正是它的作用：全页只启一次 wasm），
// 所以每条用例都要先 resetModules 拿到一份新的模块实例，否则读到的是上一条留下的缓存。
async function freshApi() {
  vi.resetModules()
  return import('@/components/form/utils/useBarcodeScanner')
}

describe('warmBarcodeDecoder 解码器预热', () => {
  beforeEach(() => {
    state.calls = 0
    state.behavior = null
  })

  it('上游启动失败时吞掉并返回已结算的 promise（预热失败不能把采集界面带崩）', async () => {
    const { warmBarcodeDecoder } = await freshApi()
    state.behavior = () => Promise.reject(new Error('wasm fetch failed'))
    await expect(warmBarcodeDecoder()).resolves.toBeNull()
    expect(state.calls).toBe(1)
    // 第二次复用同一条已失败的 promise：不在这里重试加载（真要解码时仍走惰性路径）
    await expect(warmBarcodeDecoder()).resolves.toBeNull()
    expect(state.calls).toBe(1)
  })

  it('连调两次只启动一次模块（开合弹层不该反复重载 wasm）', async () => {
    const { warmBarcodeDecoder } = await freshApi()
    await warmBarcodeDecoder()
    await warmBarcodeDecoder()
    expect(state.calls).toBe(1)
  })
})

describe('withHardTimeout 硬上限', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('在途 promise 永不返回 → 到期按 fallback 结算，且定时器已清干净', async () => {
    const hanging = new Promise<string[]>(() => {})
    const wrapped = withHardTimeout(hanging, 1_000, [] as string[])
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(wrapped).resolves.toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('正常返回时不等上限，原样透传结果', async () => {
    const fast = Promise.resolve(['UPLOAD-888'])
    await expect(withHardTimeout(fast, 1_000, [] as string[])).resolves.toEqual(['UPLOAD-888'])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('原 promise 失败保持失败语义（调用方的 catch 分支照旧），定时器同样清掉', async () => {
    const bad = Promise.reject(new Error('图片解码失败'))
    await expect(withHardTimeout(bad, 1_000, [] as string[])).rejects.toThrow('图片解码失败')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('未到期不误结算（给 20s 上限时 19.9s 仍在等，别把慢机器误判成没结果）', async () => {
    let done = false
    const slow = new Promise<string[]>((r) => setTimeout(() => r(['LATE-1']), 19_900))
    const wrapped = withHardTimeout(slow, 20_000, [] as string[]).then((v) => {
      done = true
      return v
    })
    await vi.advanceTimersByTimeAsync(19_800)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    await expect(wrapped).resolves.toEqual(['LATE-1'])
  })
})
