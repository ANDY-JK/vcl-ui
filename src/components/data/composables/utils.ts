// 单例 canvas 复用，避免每次测量创建新元素
import { fileToBase64 } from '@/components/_internal/utils'

let _measureCanvas: HTMLCanvasElement | null = null
function _getMeasureCtx(): CanvasRenderingContext2D | null {
  // SSR/无 DOM 环境：无 canvas 可用，measureTextWidth 走字数估算降级
  if (typeof document === 'undefined') return null
  if (!_measureCanvas) _measureCanvas = document.createElement('canvas')
  return _measureCanvas.getContext('2d')
}

// 单例 DOM 测量元素，与 .th-title 样式对齐，用于表头最小宽度精确测量
let _measureSpan: HTMLSpanElement | null = null
function _getMeasureSpan(): HTMLSpanElement | null {
  // SSR/无 DOM 环境：返回 null，measureDomTextWidth 走估算降级
  if (typeof document === 'undefined' || typeof document.body === 'undefined') return null
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
  // 无 DOM 降级：按 canvas 估算或字数 × 0.6 系数
  if (!span) return measureTextWidth(text, fontSize, fontWeight)
  span.style.fontSize = `${fontSize}px`
  span.style.fontWeight = String(fontWeight)
  span.textContent = text
  return span.getBoundingClientRect().width
}

// ==================== 纯工具函数（从 useTableCore 迁出） ====================

import type { Column } from './types'
import { computePointerPosition } from '@/components/_internal/useFloating'

/** 单元格文本提取（纯函数，多处复用）
 *  ⚠️ 保持「原值」语义：空白一律返回空串，绝不注入占位符。
 *  展示层占位请用 blankPlaceholder —— 本函数同时喂导出/筛选/测宽，
 *  注入占位符会污染导出的 CSV/Excel 数据。 */
export function getCellText(value: any, col: Column, row: Record<string, any>, idx: number): string {
  if (col.render) {
    // 防御：render 声明返回 string，但实际可能返回 VNode/数字等任意类型
    const rendered = col.render(value, row, idx)
    return typeof rendered === 'string' ? rendered : String(rendered ?? '')
  }
  return value == null ? '' : String(value)
}

/** 单元格空白占位（展示层专用）：null/undefined/空串/纯空白 → placeholder。
 *  placeholder 传空串即关闭。0/false 等合法值不占位（trim 判空，非 falsy）。
 *  ⚠️ 只在渲染层调用：getCellText 保持原值，导出/筛选/测宽口径不受影响。 */
export function blankPlaceholder(text: unknown, placeholder = '-'): string {
  if (!placeholder) return text == null ? '' : String(text)
  if (text == null) return placeholder
  const s = String(text)
  return s.trim() === '' ? placeholder : s
}

/** 拼音匹配 — 委托给共享 usePinyinSearch 模块 */
export { matchPinyin } from '@/components/_internal/usePinyinSearch'

/** Column 标题：title 优先，label 别名兜底，key 最终兜底（主文件与区块子组件共用） */
export function colTitle(col?: Column): string {
  return col?.title || col?.label || col?.key || ''
}

/** 选项列取值颜色：匹配 options 内对象项的 color，未命中回退 inherit */
export function optColor(col: Column, val: string): string {
  if (!col.options) return 'inherit'
  const opt = col.options.find((o) => (typeof o === 'string' ? o : o.value) === val)
  return opt && typeof opt === 'object' && opt.color ? opt.color : 'inherit'
}

/** 默认图片域名白名单（调用方未传 imageDomains 时使用） */
const _defaultImageDomains = [
  'pravatar.cc',
  'placeholder.com',
  'picsum.photos',
  'unsplash.com',
  'via.placeholder',
  'dummyimage.com',
]

/** 判断值是否为图片（dataURL 或以常见图片扩展名结尾，或来自知名图片 CDN）
 *  imageDomains：外部传入的白名单（DataTable props.imageDomains），空则用默认清单 */
export function isImageUrl(val: unknown, imageDomains?: string[]): boolean {
  if (!val) return false
  if (typeof val !== 'string') return false
  if (val.startsWith('data:image/')) return true
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?|#|$)/i.test(val)) return true
  const domains = imageDomains?.length ? imageDomains : _defaultImageDomains
  const pattern = new RegExp(domains.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')
  if (pattern.test(val)) return true
  // 启发式 URL 路径匹配 — 可能误判，优先依赖域名白名单 + 扩展名
  if (new RegExp('^https?://.+[/=](img|image|photo|avatar|pic|thumb)', 'i').test(val)) return true
  return false
}

/** 菜单/浮层视口边界收敛：修正 left/top，确保不超出表格容器与视口（右键菜单共用）
 *  返回 above 标记：true 表示下方空间不足，调用方应改用 bottom 定位（向上弹出）
 *  委托给通用 computePointerPosition，保持 API 兼容 */
export function clampFloatingPosition(
  clientX: number,
  clientY: number,
  menuW: number,
  menuH: number,
  tableWrap: HTMLElement | null,
): { left: number; top: number; above: boolean } {
  return computePointerPosition(clientX, clientY, menuW, menuH, tableWrap)
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

/** 读取剪贴板中的图片文件，转为 dataURL（复用统一 fileToBase64） */
export function readClipboardImage(file: File): Promise<string> {
  return fileToBase64(file)
}

/** 从 DropEvent / PasteEvent 中提取图片文件 */
export function extractImageFile(e: DragEvent | ClipboardEvent): File | null {
  const files = 'dataTransfer' in e ? e.dataTransfer?.files : (e as ClipboardEvent).clipboardData?.files
  if (!files || files.length === 0) return null
  const f = files[0]
  return f.type.startsWith('image/') ? f : null
}
