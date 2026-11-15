import { reportError, reportWarn } from '@/components/_internal/runtime-observer'
import { ref, isRef, onUnmounted, type Ref } from 'vue'
import {
  readBarcodes,
  prepareZXingModule,
  ZXING_WASM_SHA256,
  LINEAR_BARCODE_FORMATS,
  MATRIX_BARCODE_FORMATS,
  type ReadResult,
  type ReadInputBarcodeFormat,
} from 'zxing-wasm/reader'
import { useT } from '@/components/_internal/i18n'
import { errMessage } from '@/components/_internal/utils'
import { classifyCaptureError, type CaptureFailReason } from './capture-fallback'

/** 模块级 t：供各函数直接取当前语言文案 */
const t = useT()

/**
 * 静图识别的等待上限。来源＝上面那段分段实测：热路径 36ms、冷启动最坏 3.39s（4 并发），
 * 再给一个整机繁忙的量级取 20s——它比 e2e 的 45s 断言预算先结算，
 * 保证「识别中…」加全灰不会长期锁死界面，同时不会误伤本来能成功的慢机器。
 */
const PHOTO_DECODE_TIMEOUT_MS = 20_000

/** base64 → ArrayBuffer（zxing 的 `wasmBinary` 收 ArrayBuffer，见 @types/emscripten） */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

/**
 * 解码器启动：把随包的 wasm 二进制直接喂给 zxing，扫码零外发。
 *
 * 为什么必须自己带件（2026-09-28 e2e 分段实测，同页两次上传对比）：静图本身不值钱——
 * 取 Blob、解图、读像素合计 ≤13ms；热路径整次识别 24~36ms。差的全是**首次**
 * `readBarcodes` 触发的模块启动：空载 842ms、4 并发 3.39s，整机繁忙时实测能拖过
 * 45s 且不返回——期间界面停在「识别中…」且按钮全灰，用户只能关掉重来。
 * 那段时间花在向第三方 CDN 取 953,527 字节的 wasm（zxing 默认 `locateFile` 写死 jsdelivr，
 * 这也正是本包把那个 wasm 带上的原因。
 *
 * 兼容性闸门：比的是 zxing 自己导出的 `ZXING_WASM_SHA256`（它期望的字节）与随包件的 sha256，
 * 不等就说明宿主装的 zxing JS 与我们带的 wasm 不配套 —— 此时**不传** `wasmBinary`，
 * 退回 zxing 的默认取件方式，宁可联网也不要拿错 ABI 的二进制。
 * 启动失败不抛：真要用时仍会走原来的惰性路径。
 */
let decoderBoot: Promise<unknown> | null = null
let decoderReady = false

export function warmBarcodeDecoder(): Promise<unknown> {
  if (!decoderBoot) {
    const boot = (async () => {
      // 元数据（几百字节）与 base64 分两路取（#417）：先拿 sha256 判 ABI 配套，再按需取分片。
      // 两片各自成 chunk —— 单次 esbuild 输入超过 1MiB 会落临时文件再删不掉（TD-129）。
      const [meta, base64] = await Promise.all([
        import('@/components/_internal/zxing-wasm-data-meta'),
        import('@/components/_internal/zxing-wasm-data-load').then((m) => m.loadWasmBase64()),
      ])
      const inline = meta.ZXING_WASM_DATA_SHA256 === ZXING_WASM_SHA256
      return prepareZXingModule({
        fireImmediately: true,
        ...(inline ? { overrides: { wasmBinary: base64ToArrayBuffer(base64) } } : {}),
      })
    })().catch(() => null)
    // 启动也套同一个上限：不让「解码器没起来」把调用方挂死（2026-09-28 那次永久转圈就是这么来的）
    decoderBoot = withHardTimeout(boot, PHOTO_DECODE_TIMEOUT_MS, null).finally(() => {
      decoderReady = true
    })
  }
  return decoderBoot
}

/**
 * 给在途 Promise 套硬上限：到期不返回就用 fallback 结算，原 Promise 的失败语义不变
 * （照常 reject，调用方 catch 分支照旧），只是不再让调用方无限等。
 * 定时器必须在 finally 里清掉——连扫场景下每张图留一个悬挂 timer 会累积。
 */
export async function withHardTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([p, new Promise<T>((r) => (timer = setTimeout(() => r(fallback), ms)))])
  } finally {
    clearTimeout(timer)
  }
}

/** 截图区域（占画面比例，0-1） */
export interface CaptureRegion {
  left: number
  top: number
  width: number
  height: number
}

/** 默认识别框（画面中下部横条，占位比例 0-1，对准条码常见位置） */
export const DEFAULT_CAPTURE_REGION: CaptureRegion = {
  left: 0.175,
  top: 0.35,
  width: 0.65,
  height: 0.3,
}

/**
 * 识别格式分流：
 * - 'all'（默认）：二维码 + 条形码全部识别
 * - 'qr'：仅二维码家族（QRCode/DataMatrix/Aztec/PDF417/MaxiCode）
 * - 'barcode'：仅一维条码家族（EAN/UPC/Code128/Code39/ITF/DataBar 等）
 * 支持传 Ref 实时切换（下一帧生效），无需重启摄像头。
 */
export type BarcodeFormats = 'qr' | 'barcode' | 'all'

/**
 * 构造 zxing ReaderOptions。注意 formats 键只在有值时才存在：
 * zxing-wasm 对显式 formats: undefined 会内部崩溃（undefined.map），缺省键才正常。
 */
function buildReaderOptions(
  formats: BarcodeScannerOptions['formats'],
  maxNumberOfSymbols: number,
): Record<string, unknown> {
  const opts: Record<string, unknown> = { tryHarder: true, maxNumberOfSymbols }
  const fmts = resolveFormats(formats)
  if (fmts) opts.formats = fmts
  return opts
}

/** 映射到 zxing ReaderOptions.formats；all → undefined（不限制） */
function resolveFormats(formats: BarcodeScannerOptions['formats']): ReadInputBarcodeFormat[] | undefined {
  const v = isRef(formats) ? formats.value : formats
  if (v === 'qr') return [...MATRIX_BARCODE_FORMATS] as ReadInputBarcodeFormat[]
  if (v === 'barcode') return [...LINEAR_BARCODE_FORMATS] as ReadInputBarcodeFormat[]
  return undefined
}

export interface BarcodeScannerOptions {
  prefix?: string
  length?: number
  onScan?: (code: string) => void
  /** 截图区域，默认画面中间 65%×30% */
  captureRegion?: CaptureRegion
  /** 扫码间隔(ms)，默认 80。传 0 或不传则启用动态间隔 */
  scanInterval?: number
  /** 同一码需连续命中次数才触发，默认 2 */
  confirmCount?: number
  /** 同一码冷却时间(ms)，默认 3000。期间不会重复触发 */
  cooldownMs?: number
  /** 是否启用动态间隔（根据设备性能自适应），默认 true */
  adaptiveInterval?: boolean
  /**
   * 多码场景：检测到多个合法码时如何触发。
   * - 'center'（默认）：自动选最靠近截图区域中心的码触发（镜头对准哪个就录哪个）
   * - 'manual'：不自动触发，结果进 detections，由消费方展示候选列表/点击框让用户选择后调 triggerDetection
   */
  multiMode?: 'center' | 'manual'
  /**
   * 外部传入的 `<video>` 模板 ref（推荐用法）。
   *
   * 宿主在 `<script setup>` 里用**顶层** `const videoRef = ref<HTMLVideoElement | null>(null)`
   * 声明后传进来，模板 `<video ref="videoRef">` 才能被编译器静态识别；
   * 若让宿主从本 composable 解构 `videoRef` 再绑模板，Vue 3.5+ 会在生产构建里判为非 ref
   * 并告警 `Template ref "videoRef" used on a non-ref value`。
   */
  videoRef?: Ref<HTMLVideoElement | null>
  /**
   * 识别格式分流（默认 'all' 全识别）：'qr' 仅二维码家族、'barcode' 仅一维条码家族。
   * 支持 Ref 实时切换，下一帧生效。
   */
  formats?: BarcodeFormats | Ref<BarcodeFormats>
}

/** 单个码的实时检测信息（坐标系为 canvas 像素，消费方叠加渲染时按显示尺寸换算） */
export interface BarcodeDetection {
  text: string
  /** 四角坐标（canvas 像素坐标） */
  x: number
  y: number
  width: number
  height: number
  /** 是否为本帧被选中触发的码（center 模式下即离中心最近的） */
  primary: boolean
}

/** 将浏览器摄像头英文错误映射为用户可读中文（复用 form.cameraErr* 词条，与 CameraCapture 一致） */
function cameraErrorToChinese(err: unknown): string {
  const raw: string = errMessage(err)
  // 精确命中
  if (raw.includes('Requested device not found')) return t('form.cameraErrDeviceNotFound')
  if (raw.includes('Permission denied') || raw.includes('NotAllowedError')) return t('form.cameraErrNotAllowed')
  if (raw.includes('Could not start video source') || raw.includes('AbortError')) return t('form.cameraErrOccupied')
  if (raw.includes('NotReadableError') || raw.includes('Hardware error')) return t('form.cameraErrOccupied')
  if (raw.includes('OverconstrainedError')) return t('form.cameraErrResolution')
  if (raw.includes('NotFoundError')) return t('form.cameraErrNotFound')
  if (raw.includes('NotSupportedError')) return t('form.cameraErrNotSupported')
  if (raw.includes('SecurityError')) return t('form.cameraErrSecurity')
  return ''
}

/** 扫码 composable：相机取流 + 识别框区域抽帧（zxing-wasm 解码）+ 连扫确认/冷却，返回状态与起停控制 */
export function useBarcodeScanner(options: BarcodeScannerOptions = {}) {
  const {
    prefix,
    length,
    onScan,
    captureRegion: cr,
    scanInterval: rawInterval = 0,
    confirmCount = 2,
    cooldownMs = 3000,
    adaptiveInterval: useAdaptive = true,
    multiMode = 'center',
    /**
     * 外部传入的 `<video>` 模板 ref（2026-10-21 加）。
     *
     * **为什么必须能传**：Vue 3.5+ 的 `<script setup>` 编译器要求模板 ref 绑定的变量
     * 是**顶层 `ref()` 声明**，否则在生产构建里会被当成非 ref 而失效，并报
     * `Template ref "videoRef" used on a non-ref value. It will not work in the production build.`
     * —— 而本 composable 的 `videoRef` 若被宿主解构出来再绑到模板，就正好踩中这一点
     * （实测 `CodeCapture.vue` 每次 mount 都报，29 次/单测轮）。
     *
     * 所以宿主应当**自己**用顶层 `ref()` 声明再传进来；不传时仍用内部 ref（兼容旧用法）。
     */
    videoRef: externalVideoRef,
  } = options
  // 静态间隔下限 10ms；0 = 启用动态间隔
  const staticInterval = rawInterval > 0 ? Math.max(10, rawInterval) : 0
  const region = cr || DEFAULT_CAPTURE_REGION

  /** 设备性能评估：基于 CPU 核心数和内存推算基础扫码间隔 */
  function detectBaseInterval(): number {
    if (!useAdaptive && staticInterval > 0) return staticInterval
    // SSR/测试环境无 navigator：按中端设备默认值，避免 ReferenceError
    if (typeof navigator === 'undefined') return 120
    const cores = navigator.hardwareConcurrency || 4
    // deviceMemory 是实验性 API（Chrome only），TS 的 Navigator 类型没有它
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
    // 低端设备（≤4 核或 ≤4GB）→ 150ms；中端 → 100ms；高端（≥8 核且 ≥8GB）→ 60ms
    if (cores <= 2 || (memory != null && memory <= 2)) return 200
    if (cores <= 4 || (memory != null && memory <= 4)) return 120
    if (cores >= 8 && (memory == null || memory >= 8)) return 60
    return 80
  }

  // 动态间隔状态
  const _baseInterval = detectBaseInterval()
  let _currentInterval = _baseInterval
  let _consecutiveFails = 0 // 连续失败次数
  let _consecutiveSuccess = 0 // 连续成功次数
  const ADAPTIVE_MAX = 300 // 失败时间隔逐步增大，上限 300ms
  const ADAPTIVE_MIN = 40 // 成功时间隔逐步减小，下限 40ms

  const scanning = ref(false)
  const error = ref('')
  /** 失败归因（兜底链用）：unsupported/insecure/permission/notfound/occupied/unknown；成功时清空 */
  const failReason = ref<CaptureFailReason | ''>('')
  // 宿主传入优先（它能被 `<script setup>` 编译器静态识别为模板 ref），否则用内部 ref
  const videoRef = externalVideoRef ?? ref<HTMLVideoElement | null>(null)
  const canvasRef = ref<HTMLCanvasElement | null>(null)
  /** 当前帧检测到的所有合法码（含框位置）；单码时也填充，供消费方画指针/提示框 */
  const detections = ref<BarcodeDetection[]>([])
  /** 手电筒：仅当前轨道声明支持 torch 时可用（不支持则消费方隐藏入口，按了也不报错） */
  const torchOn = ref(false)
  const torchSupported = ref(false)

  let stream: MediaStream | null = null
  let active = false
  let _starting = false
  /** 启动代际：每次 start/stop 自增。getUserMedia/play 迟到返回的结果据此自判过期并释放流，
   *  防止「快速关-开」竞态下旧流覆盖新流变量导致摄像头泄漏（指示灯常亮到页面刷新） */
  let startGen = 0
  const confirmHits = new Map<string, number>()
  const acceptedAt = new Map<string, number>()
  let raf = 0
  let lastScan = 0
  let busy = false
  let ctx2d: CanvasRenderingContext2D | null = null

  /** 停止并释放当前摄像头流 */
  function stopTracks(): void {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      stream = null
    }
  }

  function ok(code: string): boolean {
    if (!code) return false
    if (prefix != null && prefix !== '' && !code.startsWith(prefix)) return false
    if (length != null && length > 0 && code.length !== length) return false
    return true
  }

  async function start(): Promise<void> {
    if (active || _starting) return
    const gen = ++startGen
    _starting = true
    error.value = ''
    failReason.value = ''
    confirmHits.clear()
    // 取景与解码互不依赖：取流期间就把解码器启动起来，首帧解码不用再等模块
    void warmBarcodeDecoder()
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      })
      // 迟到的流：等待期间发生过 stop()（或新一轮 start）—— 直接释放，绝不接管。
      // 否则会覆盖 stream 变量，让新流失去引用而泄漏（摄像头被占用到页面刷新）
      if (gen !== startGen) {
        s.getTracks().forEach((t) => t.stop())
        return
      }
      if (!videoRef.value) {
        error.value = t('form.videoNotMounted')
        _starting = false
        stopTracks()
        return
      }
      videoRef.value.srcObject = s
      stream = s
      await videoRef.value.play()
      if (gen !== startGen) return // play() 挂起期间被 stop()：流已由 stopTracks 释放，不再接管状态
      // 手电筒能力探测：个别内核 getCapabilities 缺失/无 torch 字段 → 按不支持处理。
      // 用 getTracks()[0]（video-only 流，与 stopTracks 同一取法）——部分内核/测试桩没有 getVideoTracks
      const track = s.getTracks()[0]
      const caps = track?.getCapabilities?.() as Record<string, unknown> | undefined
      torchSupported.value = !!caps && 'torch' in caps
      torchOn.value = false
      active = true
      scanning.value = true
      lastScan = 0
      busy = false
      scanLoop()
      _starting = false
    } catch (e: unknown) {
      _starting = false
      stopTracks() // play() 抛错等场景：释放已获取的摄像头流，避免持续占用
      error.value = cameraErrorToChinese(e) || t('form.cameraStartFailed')
      failReason.value = classifyCaptureError(e)
      scanning.value = false
    }
  }

  async function stop(): Promise<void> {
    startGen++ // 使迟到的 start 结果自判过期（释放其流而非接管）
    _starting = false
    active = false
    scanning.value = false
    paused.value = false
    torchOn.value = false
    torchSupported.value = false
    cancelAnimationFrame(raf)
    raf = 0
    stopTracks()
    // 清空连击/冷却/检测框状态：重启扫描不应残留上次会话的计数与旧框
    confirmHits.clear()
    acceptedAt.clear()
    detections.value = []
  }

  /**
   * 手电筒开关（live 态用）。applyConstraints 不支持 torch 的内核会 reject：
   * 静默降级为「不支持」，消费方据此隐藏入口，不弹错。
   */
  async function toggleTorch(): Promise<void> {
    const track = stream?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn.value
    try {
      // torch 不在 TS DOM 类型里（规范外扩展约束），断言经 unknown 中转
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints)
      torchOn.value = next
    } catch {
      torchSupported.value = false
      torchOn.value = false
    }
  }

  /**
   * 定格（多码选码用）：停掉解码循环 + 暂停视频播放 — 画面冻结在当前帧，
   * detections 保持不变供消费方画箭头/候选框；摄像头流仍占用，resume() 立即恢复。
   */
  const paused = ref(false)
  function pause(): void {
    if (!active || paused.value) return
    paused.value = true
    cancelAnimationFrame(raf)
    raf = 0
    videoRef.value?.pause()
  }

  /** 恢复实时扫描（配合 pause()） */
  function resume(): void {
    if (!active || !paused.value) return
    paused.value = false
    lastScan = 0
    busy = false
    videoRef.value?.play().catch(() => {})
    if (!raf) scanLoop()
  }

  // 组件卸载时自动清理
  onUnmounted(() => {
    active = false
    cancelAnimationFrame(raf)
    raf = 0
    stopTracks()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  // 页面切后台时 rAF 本身会停摆，但显式取消并重置节拍：
  // 回到前台后立即恢复扫描，且避免隐藏期间积压的 lastScan 时序错乱
  function onVisibilityChange(): void {
    if (!active) return
    if (document.hidden) {
      cancelAnimationFrame(raf)
      raf = 0
    } else {
      if (paused.value) return // 定格中不自动恢复解码
      lastScan = 0
      busy = false
      if (!raf) scanLoop()
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  function scanLoop(): void {
    if (!active) return
    raf = requestAnimationFrame(scanLoop)
    if (Date.now() - lastScan < _currentInterval) return
    lastScan = Date.now()
    tick()
  }

  /** 扫码结果自适应：成功则缩短间隔（更快响应），失败则增大间隔（省 CPU） */
  function onScanResult(success: boolean): void {
    if (!useAdaptive && staticInterval > 0) return // 静态模式不调整
    if (success) {
      _consecutiveSuccess++
      _consecutiveFails = 0
      if (_consecutiveSuccess >= 3 && _currentInterval > ADAPTIVE_MIN) {
        _currentInterval = Math.max(ADAPTIVE_MIN, _currentInterval - 10)
        _consecutiveSuccess = 0
      }
    } else {
      _consecutiveFails++
      _consecutiveSuccess = 0
      if (_consecutiveFails >= 5 && _currentInterval < ADAPTIVE_MAX) {
        _currentInterval = Math.min(ADAPTIVE_MAX, _currentInterval + 20)
        _consecutiveFails = 0
      }
    }
  }

  /** 码中心到截图区域中心的距离（越小越"被镜头对准"）；坐标相对截图区域局部系 */
  function distanceFromRegionCenter(r: ReadResult, sw: number, sh: number): number {
    const p = r.position
    if (!p) return Number.MAX_VALUE
    const cx = (p.topLeft.x + p.bottomRight.x) / 2
    const cy = (p.topLeft.y + p.bottomLeft.y) / 2
    const rcx = sw / 2
    const rcy = sh / 2
    return Math.hypot(cx - rcx, cy - rcy)
  }

  /** 四角坐标 → 包围矩形（position 缺失时返回零框：指针渲染失败不能拖死解码主流程） */
  function boundsOf(r: ReadResult): { x: number; y: number; width: number; height: number } {
    const p = r.position
    if (!p) return { x: 0, y: 0, width: 0, height: 0 }
    const xs = [p.topLeft.x, p.topRight.x, p.bottomLeft.x, p.bottomRight.x]
    const ys = [p.topLeft.y, p.topRight.y, p.bottomLeft.y, p.bottomRight.y]
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
  }

  async function tick(): Promise<void> {
    if (busy || !active) return
    const v = videoRef.value,
      c = canvasRef.value
    if (!v || !c || v.readyState < 2) return
    busy = true
    try {
      if (!ctx2d) ctx2d = c.getContext('2d', { willReadFrequently: true })!
      const vw = v.videoWidth,
        vh = v.videoHeight
      const s = vw > 960 * 1.1 ? 960 / vw : 1
      const dw = s < 1 ? Math.round(vw * s) : vw,
        dh = s < 1 ? Math.round(vh * s) : vh
      c.width = dw
      c.height = dh
      ctx2d.drawImage(v, 0, 0, dw, dh)
      const sx = Math.round(dw * region.left),
        sy = Math.round(dh * region.top)
      const sw = Math.round(dw * region.width),
        sh = Math.round(dh * region.height)
      // 解码器（含随包 wasm）没就位就跳过本帧：既不会让界面卡在 await 上，也不会让
      // readBarcodes 抢在预热之前用 zxing 的默认设置启动（那会白联网一次并多起一个实例）
      if (!decoderReady) {
        void warmBarcodeDecoder()
        return
      }
      const results: ReadResult[] = await readBarcodes(
        ctx2d.getImageData(sx, sy, sw, sh),
        buildReaderOptions(options.formats, 5) as Parameters<typeof readBarcodes>[1],
      )
      if (!active) return // stop() 已执行：放弃本次结果，不再触发 onScan

      // 合法码 → 检测框。readBarcodes 收到的是截图区域裁剪帧，position 为裁剪帧局部坐标 —
      // 必须加回 sx/sy 偏移才是整帧 canvas 像素系（此前漏加，框整体偏到画面左上）
      const valid = results.filter((r) => ok(r.text))
      detections.value = valid.map((r) => {
        const b = boundsOf(r)
        return { text: r.text, x: b.x + sx, y: b.y + sy, width: b.width, height: b.height, primary: false }
      })

      if (valid.length > 0) lastScan = Date.now()
      onScanResult(results.length > 0)

      if (valid.length === 0) return
      // 多码触发策略：center 模式只自动录入离区域中心最近的一个（其余留在检测框供选择/移动镜头）；
      // manual 模式全不自动触发；单码走正常确认流程
      const ordered =
        valid.length === 1
          ? valid
          : multiMode === 'manual'
            ? []
            : [...valid].sort((a, b) => distanceFromRegionCenter(a, sw, sh) - distanceFromRegionCenter(b, sw, sh))
      if (ordered.length > 0) detections.value[valid.indexOf(ordered[0])]!.primary = true
      // 只对「本帧选中的那一个」走确认流程（此前遍历全部 → 多码全部连发，center 形同虚设）
      const autoFire = ordered.length > 0 ? [ordered[0]!] : []
      for (const r of autoFire) {
        const code = r.text
        confirmHits.set(code, (confirmHits.get(code) || 0) + 1)
        if (confirmHits.get(code)! < confirmCount) continue
        confirmHits.delete(code)
        if (Date.now() - (acceptedAt.get(code) || 0) < cooldownMs) continue
        acceptedAt.set(code, Date.now())
        onScan?.(code)
      }
    } catch (e) {
      // ZXing 解码失败（模糊/无条码）属正常；WASM 级错误需记录
      if (e instanceof Error && e.message?.includes('WASM')) reportWarn('[Barcode] 扫描异常:', e.message)
      onScanResult(false)
    } finally {
      busy = false
    }
  }

  /**
   * 手动触发某个检测框（multiMode='manual' 时消费方在用户点击候选框/列表项后调用）。
   * 直接触发 onScan，绕过连击计数；仍受冷却约束（防连点重复提交）。
   */
  function triggerDetection(text: string): void {
    if (!ok(text)) return
    if (Date.now() - (acceptedAt.get(text) || 0) < cooldownMs) return
    acceptedAt.set(text, Date.now())
    confirmHits.delete(text)
    onScan?.(text)
  }

  async function scanPhoto(file: File): Promise<string[]> {
    const url = await new Promise<string>((r, j) => {
      const fr = new FileReader()
      fr.onload = () => r(fr.result as string)
      fr.onerror = j
      fr.readAsDataURL(file)
    })
    // url 为 data URL，无需（也无法）revokeObjectURL
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = async () => {
        try {
          const c = document.createElement('canvas')
          // 拍照用更高分辨率——单张不赶时间
          const TARGET = 1600
          const s = img.width > TARGET * 1.1 ? TARGET / img.width : 1
          c.width = s < 1 ? Math.round(img.width * s) : img.width
          c.height = s < 1 ? Math.round(img.height * s) : img.height
          const pctx = c.getContext('2d', { willReadFrequently: true })!
          pctx.drawImage(img, 0, 0, c.width, c.height)
          // 解码器先就位（内部已带 20s 上限，绝不会把这里挂死）：保证用的是随包 wasm 而不是抢跑默认启动
          await warmBarcodeDecoder()
          const results = await withHardTimeout(
            readBarcodes(
              pctx.getImageData(0, 0, c.width, c.height),
              buildReaderOptions(options.formats, 5) as Parameters<typeof readBarcodes>[1],
            ),
            PHOTO_DECODE_TIMEOUT_MS,
            [] as ReadResult[],
          )
          resolve(results.map((r) => r.text).filter(ok))
        } catch (e) {
          reportError('scanPhoto error:', e)
          reject(new Error(t('form.scanNotRecognized')))
        }
      }
      img.onerror = () => reject(new Error(t('form.imageLoadFailed')))
      img.src = url
    })
  }

  return {
    start,
    stop,
    scanPhoto,
    scanning,
    error,
    /** 失败归因（'' 表示无失败）；兜底链据它决定下探到系统相机还是直接兜底面板 */
    failReason,
    videoRef,
    canvasRef,
    detections,
    triggerDetection,
    /** 定格/恢复：多码选码流程用（pause 停解码并冻结画面，resume 恢复实时扫描） */
    paused,
    pause,
    resume,
    /** 手电筒（仅支持的设备可用；消费方按 torchSupported 决定是否展示入口） */
    torchOn,
    torchSupported,
    toggleTorch,
  }
}
