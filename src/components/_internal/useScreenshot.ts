// 截图工具 — 基于 html2canvas，适应 HTTP/HTTPS/跨域图片等环境

export interface ScreenshotOptions {
  /** 输出缩放比例，默认 2（Retina 高清） */
  scale?: number
  /** 背景色，默认 null（透明，由 CSS 提供） */
  backgroundColor?: string | null
}

export interface ScreenshotResult {
  /** PNG data URL */
  dataUrl: string
  /** Canvas 元素，可用于进一步处理 */
  canvas: HTMLCanvasElement
  /** PNG Blob，用于复制到剪贴板 */
  blob: Blob
}

/**
 * 对指定 DOM 元素截图，返回 dataUrl + canvas + blob
 * - 首次调用时动态加载 html2canvas
 * - useCORS 优先 true，失败自动降级
 * - 自动捕获完整滚动内容（非仅可见视口）
 */
export async function captureElement(
  element: HTMLElement,
  options: ScreenshotOptions = {},
): Promise<ScreenshotResult | null> {
  const { backgroundColor = '#ffffff' } = options
  const safeScale = Math.max(0.1, options.scale ?? 2)

  // 读取完整内容尺寸（含溢出/滚动部分）
  const fullWidth = element.scrollWidth
  const fullHeight = element.scrollHeight

  // onclone：复制 CSS 变量 + 移除裁剪约束，确保完整内容正确渲染
  const onclone = (_clonedDoc: Document, clonedElement: HTMLElement) => {
    // 1. 复制 CSS 自定义属性（修复斑马行等 var(--xxx) 丢失问题）
    const origRoot = document.documentElement
    const clonedRoot = _clonedDoc.documentElement
    const origStyle = getComputedStyle(origRoot)
    for (let i = 0; i < origStyle.length; i++) {
      const prop = origStyle[i]
      if (prop.startsWith('--')) {
        clonedRoot.style.setProperty(prop, origStyle.getPropertyValue(prop))
      }
    }

    // 2. 移除克隆元素上的裁剪约束，展开完整内容
    const s = clonedElement.style
    s.overflow = 'visible'
    s.overflowX = 'visible'
    s.overflowY = 'visible'
    s.maxHeight = 'none'
    s.maxWidth = 'none'
    s.height = 'auto'
    s.width = 'auto'
    s.contain = 'none'
    s.flex = 'none'
    // 递归清理所有子元素的裁剪约束
    clonedElement.querySelectorAll('*').forEach(el => {
      if (el instanceof HTMLElement) {
        const cs = el.style
        cs.overflow = 'visible'
        cs.maxHeight = 'none'
        cs.maxWidth = 'none'
      }
    })
  }

  try {
    const html2canvas = (await import('html2canvas')).default

    const baseOptions = {
      scale: safeScale,
      backgroundColor,
      logging: false,
      width: fullWidth,
      height: fullHeight,
      windowWidth: fullWidth,
      windowHeight: fullHeight,
      onclone,
    }

    let canvas: HTMLCanvasElement | null = null

    try {
      canvas = await html2canvas(element, {
        ...baseOptions,
        useCORS: true,
        allowTaint: false,
      })
    } catch {
      canvas = await html2canvas(element, {
        ...baseOptions,
        useCORS: false,
      })
    }

    if (!canvas) return null

    const dataUrl = canvas.toDataURL('image/png')
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas!.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png'),
    )

    return { dataUrl, canvas, blob }
  } catch (e) {
    console.warn('[useScreenshot] 截图失败:', e)
    return null
  }
}

/** 下载 data URL 为 PNG 文件，返回是否成功触发下载 */
export function downloadScreenshot(dataUrl: string, filename?: string): boolean {
  try {
    const a = document.createElement('a')
    a.download = filename || `screenshot_${Date.now()}.png`
    a.href = dataUrl
    a.click()
    return true
  } catch (e) {
    console.warn('[useScreenshot] 下载截图失败:', e)
    return false
  }
}

/**
 * 复制 PNG 到剪贴板：
 * 1. Clipboard API（HTTPS/localhost，原图 PNG）
 * 2. 富文本 <img> execCommand 降级（HTTP/IP 访问、WebView 可用，粘贴为图片）
 */
export async function copyScreenshotToClipboard(blob: Blob, dataUrl?: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ])
      return true
    }
  } catch {
    // Clipboard API 失败（权限/非安全上下文）→ 走富文本降级
  }
  return dataUrl ? copyImageViaExecCommand(dataUrl) : false
}

/** 富文本 <img> 复制降级：HTTP 环境、部分 WebView 下 execCommand 可用 */
function copyImageViaExecCommand(dataUrl: string): boolean {
  try {
    const holder = document.createElement('div')
    holder.contentEditable = 'true'
    holder.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none'
    const img = document.createElement('img')
    img.src = dataUrl
    img.style.cssText = 'width:1px;height:1px;display:block'
    holder.appendChild(img)
    document.body.appendChild(holder)
    const range = document.createRange()
    range.selectNodeContents(holder)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    sel?.removeAllRanges()
    document.body.removeChild(holder)
    return ok
  } catch {
    return false
  }
}
