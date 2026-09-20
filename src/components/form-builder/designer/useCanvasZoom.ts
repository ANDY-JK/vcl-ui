/**
 * useCanvasZoom — 设计器画布缩放（拆分自 DesignerCanvas.vue，超 800 行整改）
 *
 * 职责：缩放倍率钳制 / 档位步进 / localStorage 持久化（含 SSR 安全与配额失败降级）。
 * 写在设计变量 --ldc-zoom 上供 CSS transform 消费，不直接操作 DOM 样式。
 */
import { ref, computed } from 'vue'

const ZOOM_STORE_KEY = 'vcl-designer-zoom'
const ZOOM_MIN = 0.5
const ZOOM_MAX = 1.5
const ZOOM_STEP = 0.1

export function useCanvasZoom() {
  function clampZoom(v: number): number {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v * 100) / 100))
  }

  function readStoredZoom(): number {
    // SSR 安全：无 window 环境下 localStorage 是未定义标识符，裸访问 ReferenceError
    if (typeof localStorage === 'undefined') return 1
    try {
      return clampZoom(Number(localStorage.getItem(ZOOM_STORE_KEY)) || 1)
    } catch {
      return 1
    }
  }

  const zoom = ref(readStoredZoom())
  const zoomPercent = computed(() => Math.round(zoom.value * 100))
  const zoomStyle = computed(() => ({ '--ldc-zoom': String(zoom.value) }))

  function setZoom(v: number): void {
    zoom.value = clampZoom(v)
    try {
      localStorage.setItem(ZOOM_STORE_KEY, String(zoom.value))
    } catch {
      /* 隐私模式 / 存储不可用时忽略 */
    }
  }
  function zoomIn(): void {
    setZoom(zoom.value + ZOOM_STEP)
  }
  function zoomOut(): void {
    setZoom(zoom.value - ZOOM_STEP)
  }
  function resetZoom(): void {
    setZoom(1)
  }

  /** Ctrl/⌘ + 滚轮缩放；普通滚轮保持页面滚动 */
  function onCanvasWheel(e: WheelEvent): void {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    setZoom(zoom.value + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))
  }

  return { ZOOM_MIN, ZOOM_MAX, zoom, zoomPercent, zoomStyle, setZoom, zoomIn, zoomOut, resetZoom, onCanvasWheel }
}
