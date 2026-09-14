import { ref } from 'vue'
import { detectCaptureCapability, openSystemCapture } from './capture-fallback'

export interface CaptureFallbackOptions {
  /** 拿到照片（系统相机直出或兜底面板选图），交付由调用方决定 */
  onFile: (file: File) => void
  /** 系统相机取不到时是否弹兜底面板（默认弹） */
  allowSheet?: () => boolean
  /** 系统相机 accept，默认 image/* */
  accept?: string
  /** 相机朝向：默认后置；false 则弹系统选择器 */
  capture?: 'environment' | 'user' | false
}

/**
 * 「系统相机 → 上传兜底面板」编排（CameraCapture / CodeCapture 共用）。
 *
 * 只负责降级与文件收集，不碰业务：拿到照片就回调 onFile，拿不到（取消/不可用）
 * 就打开兜底面板，避免用户停在「按了没反应」的死角。
 */
export function useCaptureFallback(opts: CaptureFallbackOptions) {
  /** 兜底面板显隐 */
  const sheetVisible = ref(false)
  /** 能力探测一次即复用（微信 capture 行为 / 是否触屏） */
  const cap = detectCaptureCapability()
  const isWeChat = cap.isWeChat

  /**
   * 调起系统相机；取到文件即回调并返回 true，取不到则按需弹兜底面板并返回 false。
   * 桌面（精确指针）不自动弹系统选择器——「相机」意图弹文件框本身就很怪，
   * 且取消后还要再弹面板，等于让用户选两遍；直接出面板，点上传时才弹一次。
   */
  async function captureViaSystem(): Promise<boolean> {
    if (!cap.isTouch) {
      if (opts.allowSheet?.() !== false) sheetVisible.value = true
      return false
    }
    const files = await openSystemCapture({
      accept: opts.accept ?? 'image/*',
      capture: opts.capture ?? 'environment',
      isWeChat,
    })
    if (files.length) {
      files.forEach(opts.onFile)
      return true
    }
    if (opts.allowSheet?.() !== false) sheetVisible.value = true
    return false
  }

  /** 兜底面板选好图片：与系统相机同路径交付 */
  function onSheetFiles(files: File[]) {
    sheetVisible.value = false
    files.forEach(opts.onFile)
  }

  return { sheetVisible, captureViaSystem, onSheetFiles }
}
