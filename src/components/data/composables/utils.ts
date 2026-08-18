// 单例 canvas 复用，避免每次测量创建新元素
let _measureCanvas: HTMLCanvasElement | null = null
function _getMeasureCtx(): CanvasRenderingContext2D | null {
  if (!_measureCanvas) _measureCanvas = document.createElement('canvas')
  return _measureCanvas.getContext('2d')
}

// 单例 DOM 测量元素，与 .th-title 样式对齐，用于表头最小宽度精确测量
let _measureSpan: HTMLSpanElement | null = null
function _getMeasureSpan(): HTMLSpanElement {
  if (!_measureSpan) {
    _measureSpan = document.createElement('span')
    _measureSpan.style.cssText =
      'position:fixed;top:0;left:0;visibility:hidden;white-space:nowrap;font-family:SimSun,"宋体",serif;pointer-events:none'
    document.body.appendChild(_measureSpan)
  }
  return _measureSpan
}
/** 清理测量元素（SPA 路由切换时可调用，非必须） */
export function cleanupMeasureElements() {
  if (_measureSpan) {
    _measureSpan.remove()
    _measureSpan = null
  }
  if (_measureCanvas) {
    _measureCanvas = null
  }
}

/** canvas 测量文本宽度（用于列宽/下拉宽度计算） */
export function measureTextWidth(text: string, fontSize: number = 14, fontWeight: number = 400): number {
  if (!text) return 0
  const ctx = _getMeasureCtx()
  if (!ctx) return text.length * fontSize * 0.6
  ctx.font = `${fontWeight} ${fontSize}px SimSun, "宋体", serif`
  return ctx.measureText(text).width
}

/** DOM 实测文本宽度（与 .th-title 完全一致的渲染，用于表头最小宽度） */
export function measureDomTextWidth(text: string, fontSize: number = 14, fontWeight: number = 600): number {
  if (!text) return 0
  const span = _getMeasureSpan()
  span.style.fontSize = `${fontSize}px`
  span.style.fontWeight = String(fontWeight)
  span.textContent = text
  return span.getBoundingClientRect().width
}

// ==================== 纯工具函数（从 useTableCore 迁出） ====================

import type { Column } from './types'

/** 单元格文本提取（纯函数，多处复用） */
export function getCellText(value: any, col: Column, row: Record<string, any>, idx: number): string {
  if (col.render) {
    // 防御：render 声明返回 string，但实际可能返回 VNode/数字等任意类型
    const rendered = col.render(value, row, idx)
    return typeof rendered === 'string' ? rendered : String(rendered ?? '-')
  }
  if (value === null || value === undefined) return '-'
  return String(value)
}

/** 拼音匹配 — 委托给共享 usePinyinSearch 模块 */
export { matchPinyin } from '@/components/_internal/usePinyinSearch'

/** 菜单/浮层视口边界收敛：修正 left/top，确保不超出表格容器与视口（右键菜单共用） */
export function clampFloatingPosition(
  clientX: number,
  clientY: number,
  menuW: number,
  menuH: number,
  tableWrap: HTMLElement | null,
): { left: number; top: number } {
  const tableRect = tableWrap?.getBoundingClientRect()
  const tableRight = tableRect?.right ?? window.innerWidth
  const tableLeft = tableRect?.left ?? 0
  let left = clientX
  let top = clientY
  if (left + menuW > tableRight) left = tableRight - menuW
  if (left < tableLeft) left = tableLeft
  if (left + menuW > window.innerWidth) left = window.innerWidth - menuW - 10
  if (top + menuH > window.innerHeight) top = window.innerHeight - menuH - 10
  return { left, top }
}

// 轻量浮层（筛选/右键菜单/列设置/选项面板）滚动关闭冷却：
// 打开瞬间的布局滚动不应误关，200ms 后滚动才生效
let _lastLayerOpenAt = 0
export function markLayerOpen(): void {
  _lastLayerOpenAt = Date.now()
}
export function isLayerFresh(ms = 200): boolean {
  return Date.now() - _lastLayerOpenAt < ms
}

// ==================== 列宽测量 ====================

/** 采样测量某列的内容宽度（多行取最宽行），返回最大宽和平均宽 */
export function measureColumnWidth(col: Column, sample: Record<string, any>[]): { maxW: number } {
  let maxW = 0
  for (const row of sample) {
    const raw = getCellText(row[col.key], col, row, 0)
    const lineW = Math.max(...raw.split('\n').map((l) => measureTextWidth(l, 14)), 0)
    if (lineW > maxW) maxW = lineW
  }
  return { maxW }
}

// ==================== 文件/DOM 工具 ====================

/** 读取剪贴板中的图片文件，转为 dataURL */
export function readClipboardImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** 从 DropEvent / PasteEvent 中提取图片文件 */
export function extractImageFile(e: DragEvent | ClipboardEvent): File | null {
  const files = 'dataTransfer' in e ? e.dataTransfer?.files : (e as ClipboardEvent).clipboardData?.files
  if (!files || files.length === 0) return null
  const f = files[0]
  return f.type.startsWith('image/') ? f : null
}
