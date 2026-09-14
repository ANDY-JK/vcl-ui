/**
 * 采集兜底引擎 —— 拍照 / 扫码 / 上传共用的一条「自动降级链」。
 *
 * 设计目标：懒人闭环。用户只触发一次，剩下的由链路自己下探，不需要在来源之间做选择：
 *
 *   inpage  页面内相机取流（不切后台、无刷新，体验最好）
 *   system  系统相机 / 相册（隐藏 file input；页面内取流不可用、被拒、被占用时自动接管）
 *   upload  选图识别 / 上传（相机整条不可用，或系统级被用户取消）
 *   manual  手工输入（扫码终点：码就在手边，打字最快）
 *
 * 每一级「不可用 / 失败 / 用户取消」都自动进入下一级；`manual` 为终点。
 * 本模块是纯逻辑 + 无框架 DOM（不依赖 Vue），供 CameraCapture / useBarcodeScanner /
 * CodeCapture / Upload 共用，避免各处重复实现「降级 + 临时 input」细节。
 */

/** 采集层级，从最省事到最兜底 */
export type CaptureLevel = 'inpage' | 'system' | 'upload' | 'manual'

/** 默认链路顺序 */
export const CAPTURE_CHAIN: readonly CaptureLevel[] = ['inpage', 'system', 'upload', 'manual']

export interface CaptureCapability {
  /** 安全上下文（HTTPS / localhost）：非安全上下文浏览器不提供摄像头 API */
  secure: boolean
  /** navigator.mediaDevices.getUserMedia 是否可用 */
  hasUserMedia: boolean
  /** 微信内置浏览器（含企业微信）：capture 属性行为不稳定，其文件选择器自带拍摄入口 */
  isWeChat: boolean
  /** 能否页面内取流 = 安全上下文 && 有 getUserMedia */
  canInpage: boolean
  /** 触屏设备（粗指针）：移动端优先弹自绘来源菜单而非直接开系统选择器 */
  isTouch: boolean
}

/** 探测当前环境能力（SSR / 测试环境安全回退，不抛错） */
export function detectCaptureCapability(): CaptureCapability {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  // isSecureContext 缺失（老内核）时不阻拦页面内取流
  const secure = typeof window === 'undefined' ? false : window.isSecureContext !== false
  const hasUserMedia = !!nav?.mediaDevices?.getUserMedia
  const isWeChat = !!nav && /MicroMessenger/i.test(nav.userAgent || '')
  const isTouch =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  return { secure, hasUserMedia, isWeChat, canInpage: secure && hasUserMedia, isTouch }
}

/** 失败归因：决定提示文案与是否值得在下探前重试 */
export type CaptureFailReason =
  'unsupported' | 'insecure' | 'permission' | 'notfound' | 'occupied' | 'decode' | 'unknown'

/** 浏览器摄像头错误 → 归因（与 CameraCapture / useBarcodeScanner 的文案映射同源） */
export function classifyCaptureError(err: unknown): CaptureFailReason {
  const raw = `${(err as { name?: string })?.name || ''} ${(err as { message?: string })?.message || ''}`
  if (/NotAllowedError|Permission ?denied|PermissionDenied/i.test(raw)) return 'permission'
  if (/NotFoundError|Requested device not found|DevicesNotFoundError/i.test(raw)) return 'notfound'
  if (/NotReadableError|AbortError|Could not start video source|Hardware error|TrackStartError/i.test(raw))
    return 'occupied'
  if (/OverconstrainedError/i.test(raw)) return 'unsupported'
  if (/NotSupportedError/i.test(raw)) return 'unsupported'
  if (/SecurityError/i.test(raw)) return 'insecure'
  return 'unknown'
}

export interface ChainOptions {
  /** 是否允许「上传」这一级（默认允许） */
  allowUpload?: boolean
  /** 是否允许「手工输入」这一级（默认允许） */
  allowManual?: boolean
}

/** 从某级起的可用子链（按 allow* 裁剪掉被禁用的级） */
export function captureChainFrom(level: CaptureLevel, opts: ChainOptions = {}): CaptureLevel[] {
  const { allowUpload = true, allowManual = true } = opts
  const i = CAPTURE_CHAIN.indexOf(level)
  return CAPTURE_CHAIN.slice(i < 0 ? 0 : i).filter((l) => {
    if (l === 'upload') return allowUpload
    if (l === 'manual') return allowManual
    return true
  })
}

/** 下一级；已是终点或存在被禁用的级时返回 null */
export function nextCaptureLevel(current: CaptureLevel, opts: ChainOptions = {}): CaptureLevel | null {
  const chain = captureChainFrom(current, opts)
  // chain[0] 未必 === current（current 可能本身被禁用），故取 current 之后的第一个
  const after = chain.filter((l) => CAPTURE_CHAIN.indexOf(l) > CAPTURE_CHAIN.indexOf(current))
  return after[0] ?? null
}

/**
 * 入口级：不满足页面内取流条件就直接从系统级起步。
 * 避免注定失败的 getUserMedia 尝试，也避免在没有摄像头/非 HTTPS 的机器上反复纠缠权限弹窗。
 */
export function resolveEntryLevel(cap: CaptureCapability = detectCaptureCapability()): CaptureLevel {
  return cap.canInpage ? 'inpage' : 'system'
}

export interface SystemCaptureOptions {
  /** input accept，缺省 image/* */
  accept?: string
  /** true 等价 'environment'（后置，拍照默认）；'user' 前置；false / 不传则不强制相机，弹系统选择器 */
  capture?: boolean | 'environment' | 'user'
  /** 多选（相册多张） */
  multiple?: boolean
  /** 微信内置浏览器判断覆盖（默认自动探测） */
  isWeChat?: boolean
}

/** 临时 input 标记：用于清理上一次残留（用户取消选择不触发 change，节点会留在文档里） */
const MARK = 'data-capture-fallback'
let captureSeq = 0
/** 上一次未结算的系统采集 resolve：旧内核无 cancel 事件时，用户取消 = Promise 永挂，靠它强制按「取消」结算 */
let pendingResolve: ((files: File[]) => void) | null = null

/**
 * 强制结算上一次未完成的系统采集（视作用户取消）并清理残留临时 input。
 * 旧内核（Chromium <113 / Safari <16 / 老 X5）对 file input 不触发 cancel 事件，
 * 用户取消后 Promise 永远挂着、节点永远残留 —— 再次调起 / 宿主关闭弹层 / 组件卸载前调用它，
 * 挂起的调用方会收到空数组并继续走兜底链。
 */
export function cancelPendingSystemCapture(): void {
  pendingResolve?.([])
  pendingResolve = null
  if (typeof document !== 'undefined') document.querySelectorAll(`input[${MARK}]`).forEach((el) => el.remove())
}

/**
 * 调起系统相机 / 相册（隐藏 file input），返回用户选中的文件。
 *
 * 关键点（与 CameraCapture / Upload 的历史实现对齐）：
 * - 微信内置浏览器（X5/XWeb）对 capture 支持不稳定 → 不带 capture，交给其自带「拍摄」入口；
 * - 用户取消 → resolve([])（现代内核支持 cancel 事件；旧内核由 cancelPendingSystemCapture 兜底），
 *   调用方据此继续下探，不会永久挂起；
 * - 调用前结算并清理上一次残留，避免文档里越堆越多、Promise 越挂越多。
 */
export function openSystemCapture(opts: SystemCaptureOptions = {}): Promise<File[]> {
  const { accept = 'image/*', capture = 'environment', multiple = false } = opts
  const isWeChat = opts.isWeChat ?? detectCaptureCapability().isWeChat
  if (typeof document === 'undefined') return Promise.resolve([])
  cancelPendingSystemCapture()
  return new Promise<File[]>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    if (multiple) input.multiple = true
    if (!isWeChat && capture) {
      input.setAttribute('capture', capture === true ? 'environment' : capture)
    }
    input.setAttribute(MARK, String(++captureSeq))
    input.style.display = 'none'
    pendingResolve = resolve
    let settled = false
    const done = (files: File[]) => {
      if (settled) return
      settled = true
      if (pendingResolve === resolve) pendingResolve = null
      input.remove()
      resolve(files)
    }
    input.addEventListener('change', () => done(Array.from(input.files || [])))
    // 取消：Chromium 113+ / Safari 16+ 支持 cancel 事件；旧内核由 cancelPendingSystemCapture 收尾
    input.addEventListener('cancel', () => done([]))
    document.body.appendChild(input)
    input.click()
  })
}
