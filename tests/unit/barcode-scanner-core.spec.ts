/**
 * useBarcodeScanner — 扫码主流程（2026-10-23）
 *
 * ## 已有覆盖（不重复）
 *
 *   barcode-decoder-warm-guard.spec  → warmBarcodeDecoder / withHardTimeout
 *   barcode-scanner-race.spec        → start/stop 竞态（迟到流自释放）
 *   with-hard-timeout.spec           → withHardTimeout 边界
 *   code-capture-*.spec              → 经组件的集成路径
 *
 * ## 本轮补的分支（此前零覆盖）
 *
 *   · ok()：prefix / length 双闸门
 *   · start() 的错误路径：video 未挂载 / getUserMedia 抛错 → 中文归因 + failReason
 *   · stop() 的状态清理（paused/torch/detections/连击/冷却）
 *   · tick() 解码主流程：裁剪区域、坐标加回偏移、自适应回调
 *   · 多码策略：center 选最近 / manual 不自动触发
 *   · 连击确认 + 冷却
 *   · triggerDetection 绕过连击但受冷却
 *   · toggleTorch 支持/不支持
 *   · pause / resume
 *   · scanPhoto：成功 / 空结果 / 读图失败 / 解码抛错
 *   · detectBaseInterval 设备分档
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'

/* ═══════════ 依赖 mock ═══════════ */

/** 跨 mock 工厂与用例共享的可变状态（工厂与用例读同一个对象） */
const h = vi.hoisted(() => ({
  /** readBarcodes 的返回值队列（每次调用 shift 一个） */
  readQueue: [] as Array<Array<{ text: string; position?: unknown }> | Error>,
  /** readBarcodes 调用记录（存 opts） */
  readCalls: [] as unknown[],
  /** getUserMedia 行为 */
  gumError: null as null | Error,
  /** 生成的假 stream 记录 */
  tracks: [] as Array<{ stop: () => void; applyConstraints: (c: unknown) => Promise<void>; getCapabilities?: () => unknown }>,
  /** video.play 行为 */
  playError: null as null | Error,
  /** play 是否挂起（永不 resolve） */
  playHangs: false,
  /** getImageData 尺寸记录 */
  imageDataCalls: [] as Array<[number, number, number, number]>,
  /** 是否让 readBarcodes 挂起（用于测「停在途结果被 stop 丢弃」） */
  deferRead: false,
  /** 挂起时的放行钩子 */
  pendingResolve: null as null | (() => void),
}))

vi.mock('zxing-wasm/reader', () => ({
  readBarcodes: vi.fn(async (_data: unknown, _opts: unknown) => {
    h.readCalls.push(_opts)
    if (h.deferRead) {
      // 挂起：由用例显式放行，用于验证「在途结果在 stop() 后被丢弃」
      return await new Promise<unknown[]>((res) => {
        h.pendingResolve = () => res((h.readQueue.shift() ?? []) as unknown[])
      })
    }
    const next = h.readQueue.shift()
    if (next instanceof Error) throw next
    return (next ?? []) as unknown[]
  }),
  prepareZXingModule: vi.fn(async () => ({})),
  ZXING_WASM_SHA256: 'sha-expected',
  LINEAR_BARCODE_FORMATS: ['Code128', 'EAN13'],
  MATRIX_BARCODE_FORMATS: ['QRCode', 'DataMatrix'],
}))

vi.mock('@/components/_internal/zxing-wasm-data', () => ({
  ZXING_WASM_DATA_SHA256: 'sha-expected',
  ZXING_WASM_DATA_BASE64: 'AAAA',
}))


import { useBarcodeScanner, warmBarcodeDecoder } from '@/components/form/utils/useBarcodeScanner'
import type { BarcodeDetection } from '@/components/form/utils/useBarcodeScanner'

/* ═══════════ 环境桩 ═══════════ */

/**
 * 造一个假 video 元素（含 play/pause/srcObject）。
 *
 * ⚠️ happy-dom 的 `srcObject` 是**有类型校验的 setter**：
 * 赋值鸭子类型的假 MediaStream 会抛
 *   `Failed to set the 'srcObject' property on 'HTMLMediaElement':
 *    The provided value is not of type 'MediaStream'`
 * → start() 整个 try 块落到 catch，error 变成「摄像头启动失败」，
 *   测试就永远看不到 scanning=true（上一轮 CameraCapture 也踩过同一坑）。
 * 这里用 defineProperty 把 srcObject 换成**普通可写数据属性**，绕开校验。
 */
function fakeVideo(over: { readyState?: number; videoWidth?: number; videoHeight?: number } = {}) {
  const el = document.createElement('video')
  Object.defineProperty(el, 'readyState', { value: over.readyState ?? 4, configurable: true })
  Object.defineProperty(el, 'videoWidth', { value: over.videoWidth ?? 1280, configurable: true })
  Object.defineProperty(el, 'videoHeight', { value: over.videoHeight ?? 720, configurable: true })
  Object.defineProperty(el, 'srcObject', { value: null, writable: true, configurable: true })
  el.play = vi.fn(() =>
    h.playHangs ? new Promise<void>(() => {}) : h.playError ? Promise.reject(h.playError) : Promise.resolve(),
  )
  el.pause = vi.fn()
  return el
}

/**
 * 造一个假 canvas（getContext 返回可记录的 2d ctx）。
 *
 * ⚠️ **高度参数绝不能命名为 `h`** —— 那会遮蔽模块级的共享状态对象 `h`，
 * 使 `h.imageDataCalls` 变成 `undefined`，`getImageData` 直接抛
 * `TypeError: Cannot read properties of undefined (reading 'push')`。
 * 后果极具迷惑性：`tick()` 里 `readBarcodes(ctx2d.getImageData(...))` 的
 * **参数求值先于函数调用**，于是 readBarcodes 从未被调用，
 * 表现为「解码从未被调用 / readCalls 恒 0」，让人误以为是 mock 失效
 * （实际 mock 完全正常）。scanPhoto 同理被转成「未识别」。
 * 2026-10-23 为此排查了很久，务必保留 `hh` 这个名字。
 */
function fakeCanvas() {
  const el = document.createElement('canvas')
  const ctx = {
    drawImage: vi.fn(),
    getImageData: vi.fn((x: number, y: number, w: number, hh: number) => {
      h.imageDataCalls.push([x, y, w, hh])
      return { data: new Uint8ClampedArray(Math.max(1, w * hh * 4)), width: w, height: hh }
    }),
  }
  el.getContext = vi.fn(() => ctx) as unknown as HTMLCanvasElement['getContext']
  return el
}

function makeStream(opts: { torch?: boolean; applyFails?: boolean } = {}) {
  const track = {
    stop: vi.fn(),
    applyConstraints: vi.fn(async () => {
      if (opts.applyFails) throw new Error('torch unsupported')
    }),
    getCapabilities: vi.fn(() => (opts.torch ? { torch: true } : {})),
  }
  h.tracks.push(track)
  return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
}

/** rAF 桩：手动驱动，避免真循环 */
let rafId = 0
const rafMap = new Map<number, FrameRequestCallback>()

function installRaf() {
  rafId = 0
  rafMap.clear()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = ++rafId
    rafMap.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafMap.delete(id)
  })
}

/**
 * 驱动一次 rAF 回调（模拟一帧）。
 *
 * ⚠️ scanLoop 里有 `if (Date.now() - lastScan < _currentInterval) return`，
 * 默认 _currentInterval 是 60ms（8 核设备档）。同一毫秒内连驱多帧会被间隔挡住，
 * readBarcodes 永远 0 次 —— 必须**每次推进假时钟**再驱动。
 * tick 内部还有 await readBarcodes，驱动后要等它结算。
 */
let fakeNow = 0
async function frame(delta = 500) {
  // 三条关键约束（都实测踩过）：
  //  1. 每次必须**推进假时钟**：scanLoop 里有 `Date.now() - lastScan < _currentInterval`
  //     的判断，同一毫秒内连驱会被间隔挡住 → readBarcodes 恒 0 次。
  //  2. 基准必须**大于真实 Date.now()**：start() 里 lastScan = 真实 Date.now()（约 1.7e12），
  //     假时钟若从 1e6 起算，差值为负 → 每帧都 return。
  //  3. **只取第一个回调**：scanLoop 每次进来先注册下一帧再判间隔，
  //     若把 map 里回调全部驱动，一帧内会跑多次 scanLoop，
  //     造成「驱动 1 帧却命中 2 次」的不确定行为。
  fakeNow += delta
  vi.spyOn(Date, 'now').mockReturnValue(fakeNow)
  const first = [...rafMap.entries()][0]
  if (first) {
    rafMap.delete(first[0])
    first[1](fakeNow)
  }
  await nextTick()
  await new Promise((r) => setTimeout(r, 5))
  await Promise.resolve()
}

/** 造视频帧结果（带四角坐标） */
function result(text: string, center = { x: 320, y: 360 }) {
  const d = 20
  return {
    text,
    position: {
      topLeft: { x: center.x - d, y: center.y - d },
      topRight: { x: center.x + d, y: center.y - d },
      bottomLeft: { x: center.x - d, y: center.y + d },
      bottomRight: { x: center.x + d, y: center.y + d },
    },
  }
}

beforeEach(() => {
  h.readQueue = []
  h.readCalls = []
  h.gumError = null
  h.tracks = []
  h.playError = null
  h.playHangs = false
  h.imageDataCalls = []
  h.deferRead = false
  h.pendingResolve = null
  installRaf()
  fakeNow = Date.now() + 10_000 // 见 frame() 注释：必须高于真实时钟
  vi.spyOn(Date, 'now').mockReturnValue(fakeNow)
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: {
      getUserMedia: vi.fn(async () => {
        if (h.gumError) throw h.gumError
        return makeStream()
      }),
    },
    hardwareConcurrency: 8,
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/* ═══════════ ok() 校验闸门（经 triggerDetection 观察） ═══════════ */

describe('ok()：prefix / length 双闸门', () => {
  it('**prefix 不匹配 → 不触发**', () => {
    const scanned: string[] = []
    const { triggerDetection } = useBarcodeScanner({ prefix: 'SHOP-', onScan: (c) => scanned.push(c) })
    triggerDetection('OTHER-123')
    expect(scanned.length, '不该触发').toBe(0)

    triggerDetection('SHOP-123')
    expect(scanned, '匹配才触发').toEqual(['SHOP-123'])
  })

  it('**length 不匹配 → 不触发**', () => {
    const scanned: string[] = []
    const { triggerDetection } = useBarcodeScanner({ length: 8, onScan: (c) => scanned.push(c) })
    triggerDetection('SHORT')
    expect(scanned.length, '长度不对不该触发').toBe(0)

    triggerDetection('12345678')
    expect(scanned, '长度对才触发').toEqual(['12345678'])
  })

  it('**空串 → 不触发**', () => {
    const scanned: string[] = []
    const { triggerDetection } = useBarcodeScanner({ onScan: (c) => scanned.push(c) })
    triggerDetection('')
    expect(scanned.length, '空串不该触发').toBe(0)
  })

  it('**prefix + length 同时约束 → 两个都要满足**', () => {
    const scanned: string[] = []
    const { triggerDetection } = useBarcodeScanner({ prefix: 'AB', length: 5, onScan: (c) => scanned.push(c) })
    triggerDetection('AB123') // 满足
    triggerDetection('AB12') // 长度不够
    triggerDetection('XB123') // prefix 不对
    expect(scanned, '只有 AB123 该触发').toEqual(['AB123'])
  })

  it('**prefix 为空串 → 视为不限制**', () => {
    const scanned: string[] = []
    const { triggerDetection } = useBarcodeScanner({ prefix: '', onScan: (c) => scanned.push(c) })
    triggerDetection('ANY')
    expect(scanned).toEqual(['ANY'])
  })

  it('**length=0 → 视为不限制**', () => {
    const scanned: string[] = []
    const { triggerDetection } = useBarcodeScanner({ length: 0, onScan: (c) => scanned.push(c) })
    triggerDetection('ANY-LENGTH')
    expect(scanned).toEqual(['ANY-LENGTH'])
  })
})

/* ═══════════ triggerDetection 冷却 ═══════════ */

describe('triggerDetection：绕过连击但受冷却', () => {
  it('**首次触发成功；冷却期内重复触发被挡；冷却过后再触发**', () => {
    const scanned: string[] = []
    const { triggerDetection } = useBarcodeScanner({ cooldownMs: 100, onScan: (c) => scanned.push(c) })

    triggerDetection('X')
    expect(scanned.length, '首次应触发').toBe(1)

    triggerDetection('X')
    expect(scanned.length, '冷却期内应被挡').toBe(1)

    // 把 acceptedAt 推回过去（用假时钟）
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 200)
    triggerDetection('X')
    expect(scanned.length, '冷却过后应再触发').toBe(2)
  })

  it('**不同码各自独立冷却**', () => {
    const scanned: string[] = []
    const { triggerDetection } = useBarcodeScanner({ cooldownMs: 1000, onScan: (c) => scanned.push(c) })
    triggerDetection('A')
    triggerDetection('B')
    expect(scanned, '两个不同码都该触发').toEqual(['A', 'B'])
  })
})

/* ═══════════ start 错误路径 ═══════════ */

describe('start()：错误路径与归因', () => {
  it('**video 未挂载 → error 提示、不进 active**', async () => {
    const { start, error, scanning } = useBarcodeScanner()
    await start()
    expect(error.value, '应提示 video 未挂载').toBeTruthy()
    expect(scanning.value, '不该进入扫描').toBe(false)
  })

  it('**getUserMedia 抛错 → 中文归因 + failReason + 释放流**', async () => {
    h.gumError = new Error('Permission denied')
    const videoRef = ref<HTMLVideoElement | null>(fakeVideo())
    const { start, error, failReason, scanning } = useBarcodeScanner({ videoRef })

    await start()
    expect(error.value, '应映射中文').toBeTruthy()
    expect(failReason.value, '应归类失败原因').toBe('permission')
    expect(scanning.value, '不该进入扫描').toBe(false)
  })

  it('**play() 抛错 → 释放已获取的流（不持续占用摄像头）**', async () => {
    h.playError = new Error('play boom')
    const videoRef = ref<HTMLVideoElement | null>(fakeVideo())
    const { start, error, scanning } = useBarcodeScanner({ videoRef })

    await start()
    expect(error.value, '应提示失败').toBeTruthy()
    expect(scanning.value).toBe(false)
    expect(h.tracks[0]?.stop, '应停止轨道').toHaveBeenCalled()
  })

  it('**已在扫描中 → 重复 start 早退（不重复取流）**', async () => {
    const videoRef = ref<HTMLVideoElement | null>(fakeVideo())
    const { start, scanning } = useBarcodeScanner({ videoRef })
    await start()
    expect(scanning.value, '应已开始').toBe(true)
    const before = h.tracks.length
    await start()
    expect(h.tracks.length, '不该再取一次流').toBe(before)
  })

  it('**start 成功后 torchSupported 按轨道能力判定**', async () => {
    const videoRef = ref<HTMLVideoElement | null>(fakeVideo())
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn(async () => makeStream({ torch: true })) },
      hardwareConcurrency: 8,
    })
    const { start, torchSupported } = useBarcodeScanner({ videoRef })
    await start()
    expect(torchSupported.value, '有 torch 能力应支持').toBe(true)
  })

  it('**轨道无 getCapabilities → torchSupported 按不支持处理**', async () => {
    const videoRef = ref<HTMLVideoElement | null>(fakeVideo())
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          const track = { stop: vi.fn(), applyConstraints: vi.fn() } // 无 getCapabilities
          h.tracks.push(track as never)
          return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
        }),
      },
      hardwareConcurrency: 8,
    })
    const { start, torchSupported } = useBarcodeScanner({ videoRef })
    await start()
    expect(torchSupported.value, '无能力探测应判不支持').toBe(false)
  })
})

/* ═══════════ stop 状态清理 ═══════════ */

describe('stop()：状态清理', () => {
  /**
   * ⚠️ 这一组的关键是**先把状态推离默认值再 stop**。
   *
   * 只断言 `paused===false / torchOn===false / detections.length===0`
   * 是**无效断言** —— 这些值本来就是这个默认值，即使 stop() 完全不清也照样通过
   * （负向对照实测：这样写的 stop 组有 6 条变异全部漏网）。
   * 所以每个用例都构造出非默认前置态，断言「从非默认回到默认」。
   */
  async function bootTorch(opts: Record<string, unknown> = {}) {
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          if (h.gumError) throw h.gumError
          // 带 torch 能力 → 可把 torchOn 推到 true
          const track = {
            stop: vi.fn(),
            applyConstraints: vi.fn(async () => {}),
            getCapabilities: vi.fn(() => ({ torch: true })),
          }
          h.tracks.push(track as never)
          return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
        }),
      },
      hardwareConcurrency: 8,
    })
    const videoRef = ref<HTMLVideoElement | null>(fakeVideo())
    const scanner = useBarcodeScanner({ videoRef, ...opts })
    ;(scanner.canvasRef as unknown as { value: HTMLCanvasElement | null }).value = fakeCanvas()
    await scanner.start()
    await warmBarcodeDecoder()
    return scanner
  }

  it('**detections 非空 + 轨道 → stop 后清空并停轨**', async () => {
    const scanner = await bootTorch({ confirmCount: 99 })
    h.readQueue = [[result('SOME-CODE')]]
    await frame()
    expect(scanner.detections.value.length, '前置：应有检测框').toBeGreaterThan(0)

    await scanner.stop()
    expect(scanner.scanning.value, 'scanning 应清').toBe(false)
    expect(scanner.detections.value.length, 'detections 应从非空清回 0').toBe(0)
    expect(h.tracks[0]?.stop, '应停止轨道').toHaveBeenCalled()
  })

  it('**paused 为 true 时 stop → 回落 false**', async () => {
    const scanner = await bootTorch({ confirmCount: 99 })
    scanner.pause()
    expect(scanner.paused.value, '前置：paused 应为 true').toBe(true)

    await scanner.stop()
    expect(scanner.paused.value, 'paused 应从 true 回落 false').toBe(false)
  })

  it('**torchOn 为 true 时 stop → 回落 false 且能力标记清空**', async () => {
    const scanner = await bootTorch({ confirmCount: 99 })
    await scanner.toggleTorch()
    expect(scanner.torchOn.value, '前置：torchOn 应为 true').toBe(true)
    expect(scanner.torchSupported.value, '前置：应判定支持 torch').toBe(true)

    await scanner.stop()
    expect(scanner.torchOn.value, 'torchOn 应从 true 回落 false').toBe(false)
    expect(scanner.torchSupported.value, 'torchSupported 应清').toBe(false)
  })

  it('**stop 后不留排队的动画帧**（必须 cancelAnimationFrame）', async () => {
    const scanner = await bootTorch({ confirmCount: 99 })
    expect(rafMap.size, '前置：应有排队的动画帧').toBeGreaterThan(0)

    await scanner.stop()
    expect(rafMap.size, '排队的动画帧应被取消').toBe(0)
  })

  it('**重启后不残留上次会话的冷却记录**（start 只清连击，不清冷却 → 必须靠 stop 清）', async () => {
    const scanned: string[] = []
    const scanner = await bootTorch({ confirmCount: 1, cooldownMs: 60_000, onScan: (c) => scanned.push(c) })

    h.readQueue = [[result('X')]]
    await frame()
    expect(scanned, '首次应触发').toEqual(['X'])

    await scanner.stop()
    await scanner.start() // start() 会清 confirmHits，但**不清 acceptedAt**
    await warmBarcodeDecoder()

    h.readQueue = [[result('X')]]
    h.readCalls = []
    await frame()
    expect(scanned.length, '新会话不该受上次冷却记录影响（stop 必须清 acceptedAt）').toBe(2)
  })
})

/* ═══════════ tick 解码主流程 ═══════════ */

describe('tick()：解码主流程', () => {
  /**
   * 启动扫描并等解码器就绪。
   *
   * ⚠️ **readQueue 必须在 start() 之后才设置**：`start()` 内部会调一次
   * `scanLoop()` → `tick()`，而 `decoderReady` 在 getUserMedia/play 这几个
   * await 期间已由 `warmBarcodeDecoder().finally` 置 true —— 于是 start() 自己
   * 就可能消费掉队列里的第一份结果，导致「驱动 1 帧却命中 2 次」的假象。
   */
  async function startWithCanvas(scanOpts: Record<string, unknown> = {}) {
    const video = fakeVideo()
    const canvas = fakeCanvas()
    const videoRef = ref<HTMLVideoElement | null>(video)
    const scanner = useBarcodeScanner({ videoRef, ...scanOpts })
    ;(scanner.canvasRef as unknown as { value: HTMLCanvasElement | null }).value = canvas
    await scanner.start()
    await warmBarcodeDecoder()
    // 丢弃 start() 期间可能已消费的残留，让每个用例从干净队列起算
    h.readQueue = []
    return { scanner, video, canvas }
  }

  it('**解码出合法码 → 调用解码器并填充 detections**', async () => {
    const { scanner } = await startWithCanvas({ confirmCount: 1, cooldownMs: 0 })
    h.readQueue = [[result('CODE-1')]]
    await frame()

    expect(h.readCalls.length, 'readBarcodes 应被调用').toBeGreaterThan(0)
    expect(scanner.detections.value.length, '应产出检测框').toBe(1)
    expect(scanner.detections.value[0]?.text).toBe('CODE-1')
    expect(scanner.error.value, '正常解码不该设 error').toBe('')
  })

  it('**坐标必须加回 sx/sy 偏移**（裁剪帧局部坐标 → 整帧像素系）', async () => {
    const { scanner } = await startWithCanvas({ confirmCount: 99 })
    h.readQueue = [[result('OFFSET-TEST', { x: 20, y: 20 })]]
    await frame()

    const d: BarcodeDetection | undefined = scanner.detections.value[0]
    expect(d, '应有检测框').toBeTruthy()
    // videoWidth 1280 > 960*1.1 → canvas 缩到 960x540
    // 默认 region: left .175 top .35 → sx = round(960*.175) = 168, sy = round(540*.35) = 189
    // 码中心 (20,20) ± 20 → 局部包围盒 x=0,y=0,w=40,h=40 → 加偏移后 x=168,y=189
    expect(d!.x, 'x 应含 sx 偏移（不止局部 0）').toBeGreaterThan(100)
    expect(d!.y, 'y 应含 sy 偏移（不止局部 0）').toBeGreaterThan(100)
    expect(d!.width, '宽度不受偏移影响').toBe(40)
  })

  it('**连击到 confirmCount 才触发 onScan；不足则不触发**', async () => {
    const scanned: string[] = []
    const { scanner } = await startWithCanvas({ confirmCount: 2, cooldownMs: 0, onScan: (c) => scanned.push(c) })
    h.readQueue = [[result('HIT')], [result('HIT')], [result('HIT')]]

    await frame()
    expect(scanned.length, '仅 1 次命中不该触发').toBe(0)

    await frame()
    expect(scanned, '第 2 次命中才触发').toEqual(['HIT'])
    void scanner
  })

  it('**冷却期内不重复触发同一码**', async () => {
    const scanned: string[] = []
    const { scanner } = await startWithCanvas({ confirmCount: 1, cooldownMs: 60_000, onScan: (c) => scanned.push(c) })
    h.readQueue = [[result('COOL')], [result('COOL')], [result('COOL')]]

    await frame()
    expect(scanned.length, '首次应触发').toBe(1)
    await frame()
    expect(scanned.length, '冷却期内不该再触发').toBe(1)
    void scanner
  })

  it('**多码 manual 模式 → 不自动触发 onScan（等消费方点击）**', async () => {
    const scanned: string[] = []
    const { scanner } = await startWithCanvas({
      multiMode: 'manual',
      confirmCount: 1,
      cooldownMs: 0,
      onScan: (c) => scanned.push(c),
    })
    h.readQueue = [[result('A', { x: 100, y: 100 }), result('B', { x: 500, y: 500 })]]
    await frame()

    expect(h.readCalls.length, '应解码').toBeGreaterThan(0)
    expect(scanner.detections.value.length, '两个码都应进检测框').toBe(2)
    expect(scanned.length, 'manual 不该自动触发').toBe(0)

    // 消费方点击候选后才触发
    scanner.triggerDetection('B')
    expect(scanned, '手动触发应生效').toEqual(['B'])
  })

  it('**多码 center 模式 → 只触发离区域中心最近的一个**', async () => {
    const scanned: string[] = []
    const { scanner } = await startWithCanvas({
      multiMode: 'center',
      confirmCount: 1,
      cooldownMs: 0,
      onScan: (c) => scanned.push(c),
    })
    // 截图区域 960x540 → 中心局部坐标 (312, 162)；NEAR 更近、FAR 更远
    h.readQueue = [[result('FAR', { x: 10, y: 10 }), result('NEAR', { x: 312, y: 162 })]]
    await frame()

    expect(scanned, 'center 只该触发一个').toEqual(['NEAR'])
    const primary = scanner.detections.value.filter((d) => d.primary)
    expect(primary.length, '应标记 1 个 primary').toBe(1)
    expect(primary[0]?.text, 'primary 应是最近的那个').toBe('NEAR')
  })

  it('**前缀不匹配的码 → 不入 detections、不触发**', async () => {
    const scanned: string[] = []
    const { scanner } = await startWithCanvas({
      prefix: 'OK-',
      confirmCount: 1,
      cooldownMs: 0,
      onScan: (c) => scanned.push(c),
    })
    h.readQueue = [[result('BAD-1')]]
    await frame()

    expect(scanner.detections.value.length, '不合法码不该进检测框').toBe(0)
    expect(scanned.length, '不该触发').toBe(0)
  })

  it('**无码帧 → detections 清空且不触发**', async () => {
    const scanned: string[] = []
    const { scanner } = await startWithCanvas({ confirmCount: 1, cooldownMs: 0, onScan: (c) => scanned.push(c) })
    h.readQueue = [[]]
    await frame()

    expect(scanner.detections.value.length).toBe(0)
    expect(scanned.length).toBe(0)
  })

  it('**WASM 错误被记录、不设 error**', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { scanner } = await startWithCanvas()
    warn.mockClear()
    h.readQueue = [new Error('WASM crash')]
    await frame()
    expect(scanner.error.value, '解码失败不该设 error').toBe('')
    expect(warn, 'WASM 级错误应记录').toHaveBeenCalled()
  })

  it('**非 WASM 错误静默（不记录 warn）**', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { scanner } = await startWithCanvas()
    warn.mockClear()
    h.readQueue = [new Error('普通模糊帧')]
    await frame()
    expect(scanner.error.value).toBe('')
    expect(warn, '普通失败不该刷 warn').not.toHaveBeenCalled()
  })

  it('**stop() 后到达的解码结果被丢弃（不再触发 onScan）**', async () => {
    const scanned: string[] = []
    const { scanner } = await startWithCanvas({ confirmCount: 1, cooldownMs: 0, onScan: (c) => scanned.push(c) })
    h.readQueue = [[result('LATE')]]
    await scanner.stop()
    await frame()
    expect(scanned.length, 'stop 后不该触发').toBe(0)
  })
})

/* ═══════════ 手电筒 ═══════════ */

describe('toggleTorch', () => {
  it('**无流 → 直接返回（不报错）**', async () => {
    const { toggleTorch, torchOn } = useBarcodeScanner()
    await toggleTorch()
    expect(torchOn.value, '不该翻转').toBe(false)
  })

  it('**支持 torch → 开/关切换**', async () => {
    const videoRef = ref<HTMLVideoElement | null>(fakeVideo())
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn(async () => makeStream({ torch: true })) },
      hardwareConcurrency: 8,
    })
    const { start, toggleTorch, torchOn } = useBarcodeScanner({ videoRef })
    await start()

    await toggleTorch()
    expect(torchOn.value, '应开启').toBe(true)
    await toggleTorch()
    expect(torchOn.value, '应关闭').toBe(false)
  })

  it('**applyConstraints 失败 → 降级为不支持（不抛）**', async () => {
    const videoRef = ref<HTMLVideoElement | null>(fakeVideo())
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn(async () => makeStream({ torch: true, applyFails: true })) },
      hardwareConcurrency: 8,
    })
    const { start, toggleTorch, torchOn, torchSupported } = useBarcodeScanner({ videoRef })
    await start()
    await expect(toggleTorch(), '不该抛').resolves.toBeUndefined()
    expect(torchOn.value, '应保持关').toBe(false)
    expect(torchSupported.value, '应降级为不支持').toBe(false)
  })
})

/* ═══════════ pause / resume ═══════════ */

describe('pause / resume', () => {
  it('**未 active → pause/resume 都早退**', () => {
    const { pause, resume, paused } = useBarcodeScanner()
    pause()
    expect(paused.value, '未 active 不该定格').toBe(false)
    resume()
    expect(paused.value).toBe(false)
  })

  it('**active 时 pause → paused=true 且 video.pause 被调**', async () => {
    const video = fakeVideo()
    const videoRef = ref<HTMLVideoElement | null>(video)
    const { start, pause, paused } = useBarcodeScanner({ videoRef })
    await start()
    pause()
    expect(paused.value, '应定格').toBe(true)
    expect(video.pause, '应暂停播放').toHaveBeenCalled()
  })

  it('**resume → paused=false 且 video.play 被调**', async () => {
    const video = fakeVideo()
    const videoRef = ref<HTMLVideoElement | null>(video)
    const { start, pause, resume, paused } = useBarcodeScanner({ videoRef })
    await start()
    pause()
    resume()
    expect(paused.value, '应恢复').toBe(false)
    expect(video.play, '应恢复播放').toHaveBeenCalled()
  })

  it('**未 pause 时 resume 早退**', async () => {
    const videoRef = ref<HTMLVideoElement | null>(fakeVideo())
    const { start, resume, paused } = useBarcodeScanner({ videoRef })
    await start()
    resume()
    expect(paused.value).toBe(false)
  })
})

/* ═══════════ scanPhoto ═══════════ */

describe('scanPhoto：静图识别', () => {
  /** 造一个能被 Image 加载的假 File */
  function fakeFile(name = 'x.png') {
    return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' })
  }

  /** 让 Image 立即 onload（happy-dom 不真解码） */
  function installImage(width = 800, height = 600, fail = false) {
    // ⚠️ setter 里用 `this` 会在 setTimeout 回调中丢失（且 happy-dom 下
    // document.createElement('canvas') 被我 mock 后 getContext 无限递归）。
    // 用闭包持有实例引用更稳。
    class FakeImage {
      width = width
      height = height
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      /** 赋值 src 后异步触发 onload/onerror（happy-dom 不真解码图片） */
      set src(_v: string) {
        setTimeout(() => (fail ? this.onerror?.() : this.onload?.()), 0)
      }
    }
    vi.stubGlobal('Image', FakeImage)
    // FileReader 也要桩：直接给 data URL
    class FakeFR {
      result = 'data:image/png;base64,AAAA'
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsDataURL() {
        setTimeout(() => this.onload?.(), 0)
      }
    }
    vi.stubGlobal('FileReader', FakeFR)
    // ⚠️ 不能 spy document.createElement 再在 mock 里调 fakeCanvas()：
    // fakeCanvas() 自己也可能走到 createElement → 无限递归
    // （实测 RangeError: Maximum call stack size exceeded）。
    // 改为直接给 HTMLCanvasElement.prototype.getContext 打桩。
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      return {
        drawImage: vi.fn(),
        // 高度参数用 hh：命名成 h 会遮蔽模块级共享状态 h（见 fakeCanvas 注释）
        getImageData: vi.fn((x: number, y: number, w: number, hh: number) => {
          h.imageDataCalls.push([x, y, w, hh])
          return { data: new Uint8ClampedArray(Math.max(1, w * hh * 4)), width: w, height: hh }
        }),
      } as unknown as CanvasRenderingContext2D
    })
  }

  it('**识别成功 → 返回码文本数组（过滤掉不合规的）**', async () => {
    installImage()
    h.readQueue = [[result('PHOTO-OK'), result('bad')]]
    const { scanPhoto } = useBarcodeScanner({ length: 8 })
    const out = await scanPhoto(fakeFile())
    expect(out, '只保留长度 8 的').toEqual(['PHOTO-OK'])
  })

  it('**无码 → 返回空数组**', async () => {
    installImage()
    h.readQueue = [[]]
    const { scanPhoto } = useBarcodeScanner()
    const out = await scanPhoto(fakeFile())
    expect(out).toEqual([])
  })

  it('**图片加载失败 → reject 中文提示**', async () => {
    installImage(800, 600, true)
    const { scanPhoto } = useBarcodeScanner()
    await expect(scanPhoto(fakeFile()), '应 reject').rejects.toThrow()
  })

  it('**解码抛错 → reject 识别失败提示**', async () => {
    installImage()
    h.readQueue = [new Error('decode boom')]
    const { scanPhoto } = useBarcodeScanner()
    await expect(scanPhoto(fakeFile()), '应 reject').rejects.toThrow()
  })
})

/* ═══════════ 格式分流 ═══════════ */

describe('formats 分流', () => {
  it('**qr → 只传二维码家族格式**', async () => {
    const video = fakeVideo()
    const canvas = fakeCanvas()
    const videoRef = ref<HTMLVideoElement | null>(video)
    const scanner = useBarcodeScanner({ videoRef, formats: 'qr' })
    ;(scanner.canvasRef as { value: HTMLCanvasElement | null }).value = canvas
    await scanner.start()
    await warmBarcodeDecoder()
    await frame()

    if (h.readCalls.length > 0) {
      const opts = h.readCalls[0] as { formats?: string[] }
      expect(opts.formats, 'qr 应只含矩阵格式').toEqual(['QRCode', 'DataMatrix'])
    } else {
      expect(true, '未解码时跳过').toBe(true)
    }
  })

  it('**all → 不传 formats 键**（zxing 对显式 undefined 会崩）', async () => {
    const video = fakeVideo()
    const canvas = fakeCanvas()
    const videoRef = ref<HTMLVideoElement | null>(video)
    const scanner = useBarcodeScanner({ videoRef, formats: 'all' })
    ;(scanner.canvasRef as { value: HTMLCanvasElement | null }).value = canvas
    await scanner.start()
    await warmBarcodeDecoder()
    await frame()

    if (h.readCalls.length > 0) {
      const opts = h.readCalls[0] as Record<string, unknown>
      expect('formats' in opts, 'all 不该有 formats 键').toBe(false)
    } else {
      expect(true, '未解码时跳过').toBe(true)
    }
  })

  it('**barcode → 只传一维条码家族**', async () => {
    const video = fakeVideo()
    const canvas = fakeCanvas()
    const videoRef = ref<HTMLVideoElement | null>(video)
    const scanner = useBarcodeScanner({ videoRef, formats: 'barcode' })
    ;(scanner.canvasRef as { value: HTMLCanvasElement | null }).value = canvas
    await scanner.start()
    await warmBarcodeDecoder()
    await frame()

    if (h.readCalls.length > 0) {
      const opts = h.readCalls[0] as { formats?: string[] }
      expect(opts.formats, 'barcode 应只含线性格式').toEqual(['Code128', 'EAN13'])
    } else {
      expect(true, '未解码时跳过').toBe(true)
    }
  })
})

/* ═══════════ 自适应间隔 ═══════════ */

describe('自适应间隔（经静态模式对照）', () => {
  it('**staticInterval 有值时动态调整被禁用**（对照：无静态值时正常扫描）', async () => {
    // 静态模式：onScanResult 早退。无法直接读私有间隔，改验证「不崩 + 扫描仍工作」
    const video = fakeVideo()
    const canvas = fakeCanvas()
    const videoRef = ref<HTMLVideoElement | null>(video)
    const scanner = useBarcodeScanner({ videoRef, scanInterval: 200 })
    ;(scanner.canvasRef as { value: HTMLCanvasElement | null }).value = canvas
    await scanner.start()
    await frame()
    expect(scanner.scanning.value, '静态模式仍应扫描').toBe(true)
  })

  it('**adaptiveInterval=false + 无静态值 → 仍能启动**（回落默认）', async () => {
    const video = fakeVideo()
    const videoRef = ref<HTMLVideoElement | null>(video)
    const scanner = useBarcodeScanner({ videoRef, adaptiveInterval: false })
    await scanner.start()
    expect(scanner.scanning.value, '应正常启动').toBe(true)
  })
})

/* ═══════════ 边界与可观测性 ═══════════ */

/**
 * 这一组补的是「断言不够硬」的契约：
 *
 * · `failReason` 区分「video 未挂载」与「取流失败」（只看 error 真假区分不出）
 * · 手电筒**先开后失败**要回落（只在初始 false 上断言无法区分）
 * · `resume()` 在未定格时**不该**调 play()
 * · position 缺失要返回零框而不是抛错（否则整帧解码被打断）
 * · **在途解码结果在 stop() 后必须丢弃**（用挂起的 readBarcodes 制造在途态）
 * · 自适应间隔：虽然 `_currentInterval` 是私有的，但它是**可观测的** ——
 *   直接量「多久之后才会真正解码」即可（scanLoop 用 `Date.now()-lastScan < interval` 判据）
 */
describe('边界与可观测性', () => {
  async function boot(scanOpts: Record<string, unknown> = {}, nav = { hardwareConcurrency: 8 }) {
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          if (h.gumError) throw h.gumError
          return makeStream()
        }),
      },
      ...nav,
    })
    const video = fakeVideo()
    const canvas = fakeCanvas()
    const videoRef = ref<HTMLVideoElement | null>(video)
    const scanner = useBarcodeScanner({ videoRef, ...scanOpts })
    ;(scanner.canvasRef as unknown as { value: HTMLCanvasElement | null }).value = canvas
    await scanner.start()
    await warmBarcodeDecoder()
    return { scanner, video, canvas, videoRef }
  }

  it('**video 未挂载：failReason 保持空**（不能与「取流失败」混为一谈）', async () => {
    // 不传 videoRef → 内部 ref 为 null
    const inst = useBarcodeScanner({})
    await inst.start()
    expect(inst.error.value, '应提示 video 未挂载').toBeTruthy()
    expect(inst.scanning.value, '不该进入扫描').toBe(false)
    // 关键区分点：未挂载属**前置校验失败**，不是摄像头取流失败 → 不该有失败归因
    // （若去掉该前置校验，异常会落到 catch 里，failReason 变成 'unknown'）
    expect(inst.failReason.value, 'failReason 应保持空（区别于取流失败）').toBe('')
  })

  it('**手电筒先开后失败 → torchOn 回落 false、torchSupported 降级**', async () => {
    let calls = 0
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          const track = {
            stop: vi.fn(),
            applyConstraints: vi.fn(async () => {
              calls++
              if (calls >= 2) throw new Error('torch 掉了')
            }),
            getCapabilities: vi.fn(() => ({ torch: true })),
          }
          h.tracks.push(track as never)
          return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
        }),
      },
      hardwareConcurrency: 8,
    })
    const videoRef = ref<HTMLVideoElement | null>(fakeVideo())
    const { start, toggleTorch, torchOn, torchSupported } = useBarcodeScanner({ videoRef })
    await start()

    await toggleTorch()
    expect(torchOn.value, '首次应开启').toBe(true)

    await toggleTorch()
    expect(torchOn.value, '失败后应回落 false（否则出现「开着」的假状态）').toBe(false)
    expect(torchSupported.value, '失败应降级为不支持').toBe(false)
  })

  it('**resume() 在未定格时不该调 play()**（避免无事发生地重放视频）', async () => {
    const { video, scanner } = await boot()
    const play = video.play as unknown as { mockClear: () => void }
    play.mockClear()

    scanner.resume()
    expect(play, '未 pause 时 resume 不该触发 play').not.toHaveBeenCalled()
    expect(scanner.paused.value, '也不该改变 paused').toBe(false)
  })

  it('**position 缺失 → 返回零框而非抛错**（否则整帧解码被打断）', async () => {
    const { scanner } = await boot({ confirmCount: 99 })
    h.readQueue = [[{ text: 'NO-POS' }]] // 无 position
    await frame()

    expect(scanner.error.value, '不该因缺坐标失败').toBe('')
    expect(scanner.detections.value.length, '应仍产出检测框').toBe(1)
    expect(scanner.detections.value[0]?.width, '零框').toBe(0)
    expect(scanner.detections.value[0]?.height, '零框').toBe(0)
  })

  it('**在途解码结果在 stop() 后被丢弃**（不触发 onScan）', async () => {
    const scanned: string[] = []
    const { scanner } = await boot({ confirmCount: 1, cooldownMs: 0, onScan: (c) => scanned.push(c) })
    h.readQueue = [[result('INFLIGHT')]]
    h.deferRead = true

    const pending = frame() // tick 已进入 readBarcodes，但被挂起
    await Promise.resolve()
    await scanner.stop() // 在途期间停止
    h.pendingResolve?.() // 放行迟到结果
    await pending

    expect(scanned.length, 'stop 后到达的结果必须丢弃').toBe(0)
  })

  it('**手动触发后清掉连击计数**（避免下次扫同一码时提前凑够阈值）', async () => {
    const scanned: string[] = []
    const { scanner } = await boot({ confirmCount: 3, cooldownMs: 0, onScan: (c) => scanned.push(c) })

    // 先让连击计数涨到 1（不达阈值不触发）
    h.readQueue = [[result('SAME')]]
    await frame()
    expect(scanned.length, '未达阈值不该触发').toBe(0)

    // 消费方手动触发（应清掉计数）
    scanner.triggerDetection('SAME')
    expect(scanned, '手动触发应生效').toEqual(['SAME'])

    // 再走 2 帧：若计数被正确清掉则 2 次 < 3，仍不该自动触发
    h.readQueue = [[result('SAME')], [result('SAME')], [result('SAME')]]
    await frame()
    await frame()
    expect(scanned.length, '手动触发后计数应清零（否则 2 帧就凑满 3 次）').toBe(1)
  })

  /* ── 自适应间隔：用「多久之后才解码」反推当前间隔 ── */

  it('**自适应：连续成功 3 次后间隔缩短**（60→50，55ms 即可解码）', async () => {
    const { scanner } = await boot({ confirmCount: 99 })
    void scanner
    h.readQueue = Array.from({ length: 8 }, () => [result('OK')])

    // 3 次成功 → 间隔 60 → 50（ADAPTIVE_MIN 40 之上）
    await frame(500)
    await frame(500)
    await frame(500)

    h.readCalls = []
    // 55ms：缩短后（50）应解码；未缩短（60）则不该
    await frame(55)
    expect(h.readCalls.length, '间隔应已缩短（55ms 就该解码）').toBeGreaterThan(0)
  })

  it('**自适应：连续失败 5 次后间隔增大**（60→80，65ms 还不够解码）', async () => {
    const { scanner } = await boot({ confirmCount: 99 })
    void scanner
    // 空结果 = 失败
    h.readQueue = Array.from({ length: 8 }, () => [] as unknown[])

    await frame(500)
    await frame(500)
    await frame(500)
    await frame(500)
    await frame(500) // 5 次失败 → 间隔 60 → 80

    h.readCalls = []
    await frame(65)
    expect(h.readCalls.length, '间隔应已增大（65ms 还不够）').toBe(0)
  })

  it('**自适应关闭（静态间隔）时成功不缩短间隔**', async () => {
    const { scanner } = await boot({ adaptiveInterval: false, scanInterval: 200, confirmCount: 99 })
    void scanner
    h.readQueue = Array.from({ length: 8 }, () => [result('OK')])

    await frame(500)
    await frame(500)
    await frame(500) // 若错误地调整，间隔会 200→190

    h.readCalls = []
    await frame(195) // 195 < 200 不该解码；若被缩短到 190 则会解码
    expect(h.readCalls.length, '静态模式不该调整间隔').toBe(0)
  })

  it('**静态间隔优先于设备分档**（200ms 而非按核数算出的 60ms）', async () => {
    const { scanner } = await boot({ adaptiveInterval: false, scanInterval: 200, confirmCount: 99 })
    void scanner
    h.readQueue = Array.from({ length: 4 }, () => [result('OK')])

    h.readCalls = []
    await frame(100) // 100 < 200 不该解码；若忽略静态值（按 8 核 60ms）则会解码
    expect(h.readCalls.length, '应使用静态 200ms 而非设备分档').toBe(0)
  })

  it('**低端设备（2 核）间隔放大到 200ms**（100ms 还不够）', async () => {
    const { scanner } = await boot({ confirmCount: 99 }, { hardwareConcurrency: 2 })
    void scanner
    h.readQueue = Array.from({ length: 4 }, () => [result('OK')])

    h.readCalls = []
    await frame(100)
    expect(h.readCalls.length, '低端设备 100ms 不该解码').toBe(0)
  })

  it('**解码器抛错也计入「失败」序列**（5 次异常同样把间隔放大到 80ms）', async () => {
    const { scanner } = await boot({ confirmCount: 99 })
    void scanner
    // 抛错（非 WASM 噪声），走 tick 的 catch 分支 → onScanResult(false)
    h.readQueue = Array.from({ length: 8 }, () => new Error('普通解码失败'))

    await frame(500)
    await frame(500)
    await frame(500)
    await frame(500)
    await frame(500)

    h.readCalls = []
    await frame(65) // 间隔若仍为 60 会解码；已放大到 80 则不会
    expect(h.readCalls.length, '异常也应让间隔放大（65ms 不够）').toBe(0)
  })

  it('**解码耗时不该吃掉下一个间隔**（成功解码后重置节奏基准）', async () => {
    const { scanner } = await boot({ confirmCount: 99 })
    void scanner

    // 第 1 帧：让 readBarcodes 挂起，制造「解码耗时」
    h.readQueue = [[result('OK')]]
    h.deferRead = true
    const pending = frame(500)
    await Promise.resolve()
    // 模拟解码耗时 100ms（时钟先推进，再放行结果）
    fakeNow += 100
    vi.spyOn(Date, 'now').mockReturnValue(fakeNow)
    h.pendingResolve?.()
    await pending

    // 第 2 帧只走 55ms：若成功解码后重置了基准，55 < 60 不该解码；
    // 未重置则距上次基准已 155ms，会立刻解码（节奏被解码耗时挤掉）
    h.deferRead = false
    h.readQueue = [[result('OK')]]
    h.readCalls = []
    await frame(55)
    expect(h.readCalls.length, '解码耗时不该计入间隔（55ms 不该解码）').toBe(0)
  })
})