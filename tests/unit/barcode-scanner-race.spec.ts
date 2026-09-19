// useBarcodeScanner 启动代际护栏
// 背景：start() 在 await getUserMedia 期间若发生 stop()，守卫（_starting/active）被复位，
// 再次 start 会形成两个在途流 —— 旧流迟到返回会覆盖 stream 变量，新流失去引用而泄漏
// （摄像头指示灯常亮到页面刷新）。代际令牌让迟到结果自判过期并释放。
// rAF 用手动帧泵模拟：happy-dom 的 requestAnimationFrame 不会自动触发回调；
// 「按 id 取消」的语义与浏览器一致（stop 只能取消最后排入的那条链）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useBarcodeScanner } from '@/components/form/utils/useBarcodeScanner'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

function fakeStream() {
  const track = { stop: vi.fn() }
  return Object.assign({ getTracks: () => [track] }, { __track: track }) as unknown as MediaStream
}

function trackOf(s: MediaStream) {
  return (s as unknown as { __track: { stop: ReturnType<typeof vi.fn> } }).__track
}

describe('useBarcodeScanner 启动竞态（代际令牌）', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stop 后二次 start：迟到的旧流自释放；仅新 start 一条解码链；最终 stop 全部收尾', async () => {
    const g1 = deferred<MediaStream>()
    const g2 = deferred<MediaStream>()
    let call = 0
    const gmock = vi.fn(() => (call++ === 0 ? g1.promise : g2.promise))
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: gmock } })

    let rafQueue: FrameRequestCallback[] = []
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb)
      return rafQueue.length as unknown as number
    })
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
      rafQueue.splice(Number(id) - 1, 1)
    })
    const pump = (frames: number) => {
      for (let i = 0; i < frames; i++) {
        const q = rafQueue
        rafQueue = []
        q.forEach((cb) => cb(Date.now()))
      }
    }

    const scanner = useBarcodeScanner({ formats: 'qr' })
    scanner.videoRef.value = { srcObject: null, play: () => Promise.resolve() } as unknown as HTMLVideoElement

    const p1 = scanner.start() // start#1：gen1，挂起在 getUserMedia
    await scanner.stop() // 关闭：gen2，_starting/active 复位
    const p2 = scanner.start() // 重开：gen3，第二次进入
    expect(p2).not.toBe(p1) // 二次 start 确实重新发起了 getUserMedia

    const s1 = fakeStream()
    g1.resolve(s1) // 旧流迟到：必须自释放，不得接管
    await p1
    expect(trackOf(s1).stop).toHaveBeenCalledTimes(1)

    const s2 = fakeStream()
    g2.resolve(s2) // 新流：正常接管
    await p2
    expect(trackOf(s2).stop).not.toHaveBeenCalled()

    // 仅 start#2 一条解码链：初始 1 个 rAF，跑一帧只再排 1 个（修复前双链并存会排 2 个）
    pump(1)
    expect(rafSpy.mock.calls.length).toBe(2)

    await scanner.stop()
    const atStop = rafSpy.mock.calls.length
    pump(5)
    expect(rafSpy.mock.calls.length).toBe(atStop) // stop 后链终止
    expect(trackOf(s2).stop).toHaveBeenCalledTimes(1)
  })

  it('play() 挂起期间被 stop：接管前让位，流已由 stop 释放，不进入 active', async () => {
    let playResolve!: () => void
    const playGate = new Promise<void>((r) => (playResolve = r))
    const g = deferred<MediaStream>()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(() => g.promise) },
    })

    const scanner = useBarcodeScanner({ formats: 'qr' })
    scanner.videoRef.value = { srcObject: null, play: () => playGate } as unknown as HTMLVideoElement

    const p = scanner.start()
    const s = fakeStream()
    g.resolve(s)
    await Promise.resolve()
    await scanner.stop() // play() 仍挂起时关闭
    playResolve()
    await p

    expect(trackOf(s).stop).toHaveBeenCalledTimes(1) // stopTracks 已释放
    expect(scanner.scanning.value).toBe(false) // 未接管为 active 态
  })
})
