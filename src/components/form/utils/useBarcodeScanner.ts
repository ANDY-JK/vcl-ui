import { ref, onUnmounted } from 'vue'
import { readBarcodes, type ReadResult } from 'zxing-wasm/reader'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：供各函数直接取当前语言文案 */
const t = useT()

/** 截图区域（占画面比例，0-1） */
export interface CaptureRegion {
  left: number
  top: number
  width: number
  height: number
}

export const DEFAULT_CAPTURE_REGION: CaptureRegion = {
  left: 0.175,
  top: 0.35,
  width: 0.65,
  height: 0.3,
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
}

/** 将浏览器摄像头英文错误映射为用户可读中文（复用 form.cameraErr* 词条，与 CameraCapture 一致） */
function cameraErrorToChinese(err: any): string {
  const raw: string = err?.message || err?.name || ''
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
    const memory = (navigator as any).deviceMemory as number | undefined
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
  const videoRef = ref<HTMLVideoElement | null>(null)
  const canvasRef = ref<HTMLCanvasElement | null>(null)

  let stream: MediaStream | null = null
  let active = false
  let _starting = false
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
    _starting = true
    error.value = ''
    confirmHits.clear()
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      })
      if (!videoRef.value) {
        error.value = t('form.videoNotMounted')
        _starting = false
        stopTracks()
        return
      }
      videoRef.value.srcObject = stream
      await videoRef.value.play()
      active = true
      scanning.value = true
      lastScan = 0
      busy = false
      scanLoop()
      _starting = false
    } catch (e: any) {
      _starting = false
      stopTracks() // play() 抛错等场景：释放已获取的摄像头流，避免持续占用
      error.value = cameraErrorToChinese(e) || t('form.cameraStartFailed')
      scanning.value = false
    }
  }

  async function stop(): Promise<void> {
    _starting = false
    active = false
    scanning.value = false
    cancelAnimationFrame(raf)
    raf = 0
    stopTracks()
    // 清空连击/冷却状态：重启扫描不应残留上次会话的计数
    confirmHits.clear()
    acceptedAt.clear()
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
      const results: ReadResult[] = await readBarcodes(ctx2d.getImageData(sx, sy, sw, sh), {
        tryHarder: true,
        maxNumberOfSymbols: 3,
      })
      if (!active) return // stop() 已执行：放弃本次结果，不再触发 onScan
      for (const r of results) {
        const code = r.text
        if (!ok(code)) continue
        confirmHits.set(code, (confirmHits.get(code) || 0) + 1)
        if (confirmHits.get(code)! < confirmCount) continue
        confirmHits.delete(code)
        if (Date.now() - (acceptedAt.get(code) || 0) < cooldownMs) continue
        acceptedAt.set(code, Date.now())
        onScan?.(code)
      }
      if (results.length > 0) lastScan = Date.now()
      onScanResult(results.length > 0)
    } catch (e) {
      // ZXing 解码失败（模糊/无条码）属正常；WASM 级错误需记录
      if (e instanceof Error && e.message?.includes('WASM')) console.warn('[Barcode] 扫描异常:', e.message)
      onScanResult(false)
    } finally {
      busy = false
    }
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
          const results = await readBarcodes(pctx.getImageData(0, 0, c.width, c.height), {
            tryHarder: true,
            maxNumberOfSymbols: 5,
          })
          resolve(results.map((r) => r.text).filter(ok))
        } catch (e) {
          console.error('scanPhoto error:', e)
          reject(new Error(t('form.scanNotRecognized')))
        }
      }
      img.onerror = () => reject(new Error(t('form.imageLoadFailed')))
      img.src = url
    })
  }

  return { start, stop, scanPhoto, scanning, error, videoRef, canvasRef }
}
