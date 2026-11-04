/**
 * useImageExport — ImagePreview 的「导出为 PNG」管道（自 ImagePreview.vue 下沉，M3 持续拆分）
 *
 * 三件套：buildExportCanvas（跨域 fetch + 标注合成）→ toPngBlob → downloadImage / copyImage。
 * 依赖面：宿主注入 img 元素 ref、标注列表 ref、加载态 getter、标题 getter、i18n/notify 与
 * 下载/复制工具。合成图所需的 paintAnno/mapAnnoToImage 是 image-anno-paint 的纯函数，
 * 直接 import（不注入）——纯函数无循环依赖。
 */
import type { Ref } from 'vue'
import { downloadScreenshot, copyScreenshotToClipboard } from '@/components/_internal/useScreenshot'
import { paintAnno, mapAnnoToImage } from './image-anno-paint'
import type { Annotation } from './annotation-types'

export function useImageExport(o: {
  imgEl: Ref<HTMLImageElement | null>
  annoCanvas: Ref<HTMLCanvasElement | null>
  annotations: Ref<Annotation[]>
  isLoaded: () => boolean
  title: () => string
  t: (key: string) => string
  notify: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void
}) {
  /**
   * 把当前图片（按 natural 尺寸）+ 全部标注合成到一张 canvas。
   * 跨域图片直接 drawImage 会污染 canvas 导致 toBlob 失败，改用 CORS fetch 取图。
   */
  async function buildExportCanvas(): Promise<HTMLCanvasElement | null> {
    const img = o.imgEl.value
    const stage = o.annoCanvas.value?.parentElement
    if (!img || !stage || !img.naturalWidth || !img.naturalHeight) return null
    // 跨域图片直接 drawImage 会污染 canvas 导致 toBlob 失败，改用 CORS fetch 取图
    let source: CanvasImageSource = img
    try {
      const res = await fetch(img.src, { mode: 'cors', cache: 'force-cache' })
      if (res.ok) {
        const blob = await res.blob()
        try {
          source = await createImageBitmap(blob)
        } catch {
          // SVG 等 createImageBitmap 不支持的格式：blob URL + Image（同源绘制不污染）
          const url = URL.createObjectURL(blob)
          const bmpImg = new Image()
          await new Promise<void>((resolve, reject) => {
            bmpImg.onload = () => resolve()
            bmpImg.onerror = () => reject(new Error('blob decode fail'))
            bmpImg.src = url
          })
          URL.revokeObjectURL(url)
          source = bmpImg
        }
      }
    } catch {
      /* 服务端无 CORS 头时退回直接绘制，toBlob 阶段会失败并提示 */
    }
    const cvs = document.createElement('canvas')
    cvs.width = img.naturalWidth
    cvs.height = img.naturalHeight
    const ctx = cvs.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(source, 0, 0, cvs.width, cvs.height)
    // getBoundingClientRect 含 transform，映射跟随当前缩放平移
    const imgR = img.getBoundingClientRect()
    const stageR = stage.getBoundingClientRect()
    const offX = imgR.left - stageR.left
    const offY = imgR.top - stageR.top
    const sx = cvs.width / imgR.width
    const sy = cvs.height / imgR.height
    const sAvg = (sx + sy) / 2
    for (const a of o.annotations.value) {
      paintAnno(ctx, mapAnnoToImage(a, sx, sy, offX, offY), false, sAvg)
    }
    return cvs
  }

  /** canvas → PNG blob；跨域污染 canvas 时 toBlob 抛 SecurityError → 返回 null */
  async function toPngBlob(cvs: HTMLCanvasElement): Promise<Blob | null> {
    try {
      return await new Promise((r) => cvs.toBlob((b) => r(b), 'image/png'))
    } catch {
      return null
    }
  }

  /** 下载 PNG（文件名取当前标题，回退 image.png）。
   *  优先 blob + objectURL（2026-10-31）：原先用 toDataURL —— 一张 4000×3000 的
   *  手机照片 dataURL 是几十 MB 的字符串，同图 blob 通道内存占用减半且少一次 base64 编码。
   *  ① 画布被污染时 toPngBlob 返回 null → 与复制同口径提示跨域失败；
   *  ② 环境不支持 createObjectURL（旧 WebView/happy-dom 未桩）→ 回退 toDataURL，
   *     下载动作不能因为省内存的优化而整个失效。 */
  async function downloadImage(): Promise<void> {
    if (!o.isLoaded()) return
    const cvs = await buildExportCanvas()
    if (!cvs) {
      o.notify(o.t('imagePreview.exportFailNotLoaded'), 'error')
      return
    }
    const name = `${o.title() || 'image'}.png`
    if (typeof URL.createObjectURL === 'function') {
      const blob = await toPngBlob(cvs)
      if (!blob) {
        o.notify(o.t('imagePreview.exportFailCrossOrigin'), 'error')
        return
      }
      const url = URL.createObjectURL(blob)
      const ok = downloadScreenshot(url, name)
      // blob URL 的 revoke 必须让出**一轮宏任务**（#429）：
      // `downloadScreenshot` 只做 `<a download>` + `click()` 就返回，浏览器真正读取
      // blob URL 是**异步**的（下一轮任务里才开始拉数据）。同步 revoke 等于在读取前
      // 把 URL 抽走 —— Chrome/Safari 上表现为"点了下载、文件没下来或 0 字节"，
      // 而且不报错（`downloadScreenshot` 照样返回 true，通知还是成功）。
      // #253 把它从 dataURL 换成 blob 通道时只测了"revoke 被调用"，没测"什么时候撤"。
      // 用 setTimeout(…, 0) 让出一轮宏任务；URL 在页面卸载时由浏览器统一回收，
      // 这里不撤也不会泄漏。
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url)
        } catch {
          /* 环境不支持则忽略：撤不掉只影响内存回收时机，不影响已触发的下载 */
        }
      }, 0)
      o.notify(ok ? o.t('imagePreview.downloadOk') : o.t('imagePreview.downloadFail'), ok ? 'success' : 'error')
      return
    }
    try {
      const ok = downloadScreenshot(cvs.toDataURL('image/png'), name)
      o.notify(ok ? o.t('imagePreview.downloadOk') : o.t('imagePreview.downloadFail'), ok ? 'success' : 'error')
    } catch {
      o.notify(o.t('imagePreview.exportFailCrossOrigin'), 'error')
    }
  }

  /** 复制 PNG 到剪贴板。
   *  dataUrl 兜底（2026-10-31，#255）：Clipboard API 失败（HTTP 环境/部分 WebView）时
   *  富文本降级需要 dataUrl —— 此前只传 blob，降级通道永远拿不到图，HTTP 下复制必失败
   *  且只报 copyFail。blob 能产出说明画布未被污染，toDataURL 实际不会抛；仍 try 包住 ——
   *  失败只少一条降级通道，不阻断主通道。 */
  async function copyImage(): Promise<void> {
    if (!o.isLoaded()) return
    const cvs = await buildExportCanvas()
    if (!cvs) {
      o.notify(o.t('imagePreview.exportFailNotLoaded'), 'error')
      return
    }
    const blob = await toPngBlob(cvs)
    if (!blob) {
      o.notify(o.t('imagePreview.exportFailCrossOrigin'), 'error')
      return
    }
    let dataUrl: string | undefined
    try {
      dataUrl = cvs.toDataURL('image/png')
    } catch {
      /* 拿不到 dataUrl 就只走主通道 */
    }
    const ok = await copyScreenshotToClipboard(blob, dataUrl)
    o.notify(ok ? o.t('imagePreview.copyOk') : o.t('imagePreview.copyFail'), ok ? 'success' : 'error')
  }

  return { buildExportCanvas, toPngBlob, downloadImage, copyImage }
}
