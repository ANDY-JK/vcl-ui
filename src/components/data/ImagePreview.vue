<script setup lang="ts">
import { ref, watch, computed, nextTick, onMounted, onUnmounted } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import Toast from '@/components/feedback/Toast.vue'
import { downloadScreenshot, copyScreenshotToClipboard } from '@/components/_internal/useScreenshot'
import { boostZTop } from '@/components/_internal/z-top'
import { useToastNotify } from '@/components/_internal/useToastNotify'
import { useT } from '@/components/_internal/i18n'

const t = useT()
// 模板 v-for 循环变量曾遮蔽 t()，i18n 函数用 $t 别名并收窄返回 string（ComposerTranslation 不能作索引类型）
const $t = t as (key: string, params?: Record<string, unknown>) => string

// ---- 图片项 ----
export interface ImageItem {
  url: string
  label?: string
}

/** src 接受：字符串 / 对象 / 数组（任意组合），自动归一化 */
export type ImageSrc = string | ImageItem | (string | ImageItem)[]

const props = withDefaults(
  defineProps<{
    /** 图片源：字符串/对象 = 单图，数组 = 多图 */
    src?: ImageSrc
    initialIndex?: number
    title?: string
  }>(),
  { initialIndex: 0 },
)

const emit = defineEmits<{
  close: []
  change: [index: number]
}>()

// ---- 归一化：统一为 ImageItem[] ----
function toItem(raw: string | ImageItem): ImageItem {
  return typeof raw === 'string' ? { url: raw } : raw
}
const items = computed<ImageItem[]>(() => {
  if (props.src == null || props.src === '') return []
  if (Array.isArray(props.src)) return props.src.map(toItem)
  // 单个字符串或单个 ImageItem 对象
  return [toItem(props.src as string | ImageItem)]
})
const isMulti = computed(() => items.value.length > 1)
const total = computed(() => items.value.length)

const currentIndex = ref(Math.max(0, Math.min(props.initialIndex, total.value - 1)))
const currentUrl = computed(() => items.value[currentIndex.value]?.url || '')
const currentLabel = computed(() => items.value[currentIndex.value]?.label || '')
watch(
  () => props.initialIndex,
  (v) => {
    currentIndex.value = Math.max(0, Math.min(v ?? 0, total.value - 1))
  },
)

// ---- 缩略图面板 ----
const showThumbs = ref(isMulti.value)
watch(isMulti, (v) => {
  showThumbs.value = v
})
function toggleThumbs() {
  showThumbs.value = !showThumbs.value
}

// ---- 标注工具切换/取消（统一入口） ----
// 再次点击已激活的工具 = 取消；切换工具互斥。取消/切换时必须清理全部绘制状态
// （_annoDrawing/_annoCurrent/_annoDrag 等），否则 touchcancel 等中断残留会让
// 「取消后再次触摸仍画出幽灵标注」——取消失效的根因。
function setAnnoTool(t: AnnoType | null) {
  annoTool.value = annoTool.value === t ? null : t
  annoSelected.value = null
  _annoCurrent = null
  _annoDrawing.value = false
  _annoDrag = false
  _annoDragOrig = null
  unbindAnnoWindow()
  renderAnnos()
}

// ---- 标注系统（仅保留矩形 / 圆形 / 画笔） ----
type AnnoType = 'rect' | 'circle' | 'pen'
interface AnnoBase {
  type: AnnoType
  id: string
  color: string
  lw: number
}
interface RectAnno extends AnnoBase {
  type: 'rect'
  x: number
  y: number
  w: number
  h: number
}
interface CircleAnno extends AnnoBase {
  type: 'circle'
  x: number
  y: number
  w: number
  h: number
}
interface PenAnno extends AnnoBase {
  type: 'pen'
  points: { x: number; y: number }[]
}
type Annotation = RectAnno | CircleAnno | PenAnno

const annotations = ref<Annotation[]>([])
const annoTool = ref<AnnoType | null>(null)
const annoColor = ref('#f43f5e')
const annoWidth = ref(2)
const annoSelected = ref<string | null>(null)
const annoColors = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ffffff']
const annoWidths = [2, 4, 6]
const annoCanvas = ref<HTMLCanvasElement | null>(null)
let _annoId = 0
const _annoDrawing = ref(false)
let _annoDrag = false
let _annoStart = { x: 0, y: 0 }
let _annoCurrent: Annotation | null = null
let _annoDragOrig: { x: number; y: number } | null = null
function uid() {
  return 'a' + ++_annoId
}
watch(currentIndex, () => {
  annotations.value = []
  annoTool.value = null
  annoSelected.value = null
  _annoCurrent = null
  _annoDrawing.value = false
  _annoDrag = false
  unbindAnnoWindow()
})

// Canvas 自适应：stage 尺寸变化时重新渲染标注
let _ro: ResizeObserver | null = null
// 预览弹层（--z-lightbox 10000）高于全局 Toast（--z-top 9999）：挂载期间临时提升 --z-top 至 10001，让内嵌 Toast 显示在弹层之上
// boostZTop 模块级引用计数（_internal/z-top.ts），多组件/多实例共享
let _releaseZTop: (() => void) | null = null
const overlayRef = ref<HTMLElement | null>(null)

// ---- 顶栏标注工具行：色点按可用空间逐步裁减 ----
// 单行布局下，窄屏空间不足时从最后一个色点往前逐个隐藏，保证所有控件一行放下（不换行/不横滚）。
// 选中色始终保留可见（用户当前在用的颜色不因裁减而丢失）。桌面端宽屏空间充足，全部显示。
const annoToolsRef = ref<HTMLElement | null>(null)
let _annoToolsRo: ResizeObserver | null = null
function fitAnnoColors() {
  const tools = annoToolsRef.value
  if (!tools) return
  const dots = [...tools.querySelectorAll<HTMLElement>('.ip-color-dot')]
  if (!dots.length) return
  const activeIdx = annoColors.findIndex((c) => c === annoColor.value)
  // 先全量显示（选中色恒显示），再按空间从后往前逐个隐藏。
  // 判据用 scrollWidth：色点有 min-width 下限、按钮不压缩，内容放不下时 scrollWidth 真实溢出
  dots.forEach((d) => {
    d.style.display = ''
  })
  let guard = 0
  while (tools.scrollWidth > tools.clientWidth + 1 && guard++ < dots.length) {
    let hide = -1
    for (let i = dots.length - 1; i >= 0; i--) {
      if (i !== activeIdx && dots[i].style.display !== 'none') {
        hide = i
        break
      }
    }
    if (hide < 0) break
    dots[hide].style.display = 'none'
  }
}
// 换色后重算：新选中色若是被裁减隐藏的色点，需要显示出来（当前使用中的颜色不能丢失）
watch(annoColor, () => fitAnnoColors())

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') _ro = new ResizeObserver(() => renderAnnos())
  if (typeof ResizeObserver !== 'undefined' && annoToolsRef.value) {
    _annoToolsRo = new ResizeObserver(() => fitAnnoColors())
    _annoToolsRo.observe(annoToolsRef.value)
  }
  _releaseZTop = boostZTop()
  // 挂载即聚焦弹层，保证 Esc 立即可用（此前焦点在触发按钮，键盘关闭失效）
  nextTick(() => overlayRef.value?.focus())
})
onUnmounted(() => {
  if (_renderRAF != null) {
    cancelAnimationFrame(_renderRAF)
    _renderRAF = null
  }
  _ro?.disconnect()
  _annoToolsRo?.disconnect()
  unbindAnnoWindow()
  _releaseZTop?.()
})
watch(annoCanvas, (cvs) => {
  _ro?.disconnect()
  if (cvs?.parentElement) _ro?.observe(cvs.parentElement)
})

// 屏幕坐标 → stage 坐标（像素）
function stagePoint(x: number, y: number) {
  const stage = annoCanvas.value?.parentElement
  if (!stage) return { x: 0, y: 0 }
  const r = stage.getBoundingClientRect()
  return { x: x - r.left, y: y - r.top }
}
function stageCoords(e: MouseEvent) {
  return stagePoint(e.clientX, e.clientY)
}

// ---- Canvas 渲染 ----
// 绘制单条标注；s 为缩放因子（导出合成图时按图片像素重绘），sel 为选中高亮
function paintAnno(ctx: CanvasRenderingContext2D, a: Annotation, sel: boolean, s = 1) {
  // 导出时线宽保底 2px：过细描边（如 1.5px）抗锯齿后几乎不可见
  const lw = Math.max(2, a.lw * s)
  ctx.strokeStyle = a.color
  ctx.fillStyle = a.color
  ctx.lineWidth = lw

  if (a.type === 'rect') {
    const [rx, ry, rw, rh] = a.w >= 0 ? [a.x, a.y, a.w, a.h] : [a.x + a.w, a.y + a.h, -a.w, -a.h]
    if (sel) ctx.setLineDash([5, 3])
    else ctx.setLineDash([])
    ctx.strokeRect(rx, ry, rw, rh)
    if (sel) {
      const corners = [
        { x: rx, y: ry },
        { x: rx + rw, y: ry },
        { x: rx, y: ry + rh },
        { x: rx + rw, y: ry + rh },
      ]
      ctx.setLineDash([])
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1
      for (const c of corners) {
        ctx.fillRect(c.x - 4, c.y - 4, 8, 8)
        ctx.strokeRect(c.x - 4, c.y - 4, 8, 8)
      }
    }
  } else if (a.type === 'circle') {
    const cx = a.x + a.w / 2
    const cy = a.y + a.h / 2
    const rx = Math.abs(a.w) / 2
    const ry = Math.abs(a.h) / 2
    if (sel) ctx.setLineDash([5, 3])
    else ctx.setLineDash([])
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
    if (sel) {
      ctx.setLineDash([])
      const corners = [
        { x: a.x, y: a.y },
        { x: a.x + a.w, y: a.y },
        { x: a.x, y: a.y + a.h },
        { x: a.x + a.w, y: a.y + a.h },
      ]
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1
      for (const c of corners) {
        ctx.fillRect(c.x - 4, c.y - 4, 8, 8)
        ctx.strokeRect(c.x - 4, c.y - 4, 8, 8)
      }
    }
  } else if (a.type === 'pen') {
    ctx.lineCap = 'round'
    ctx.setLineDash([])
    ctx.beginPath()
    if (sel) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = lw + 2 * s
    }
    for (let i = 0; i < a.points.length; i++) {
      const p = a.points[i]
      if (i === 0) {
        ctx.moveTo(p.x, p.y)
      } else {
        ctx.lineTo(p.x, p.y)
      }
    }
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.globalAlpha = 1
}

// renderAnnos rAF 节流：避免 mousemove 高频调用导致全量重绘卡顿
let _renderRAF: number | null = null
function renderAnnos() {
  if (_renderRAF != null) return // 已排队，跳过
  _renderRAF = requestAnimationFrame(() => {
    _renderRAF = null
    _renderAnnosNow()
  })
}
function _renderAnnosNow() {
  const cvs = annoCanvas.value
  if (!cvs) return
  const stage = cvs.parentElement
  if (!stage) return
  cvs.width = stage.clientWidth
  cvs.height = stage.clientHeight
  const ctx = cvs.getContext('2d')!
  ctx.clearRect(0, 0, cvs.width, cvs.height)

  const all = _annoCurrent ? [...annotations.value, _annoCurrent] : annotations.value
  for (const a of all) {
    paintAnno(ctx, a, annoSelected.value === a.id, 1)
  }
}

// ---- 命中检测 ----
function hitTest(p: { x: number; y: number }): Annotation | null {
  const pad = 6
  for (let i = annotations.value.length - 1; i >= 0; i--) {
    const a = annotations.value[i]
    if (a.type === 'rect') {
      const [rx, ry, rw, rh] = a.w >= 0 ? [a.x, a.y, a.w, a.h] : [a.x + a.w, a.y + a.h, -a.w, -a.h]
      if (p.x >= rx - pad && p.x <= rx + rw + pad && p.y >= ry - pad && p.y <= ry + rh + pad) return a
    } else if (a.type === 'circle') {
      const cx = a.x + a.w / 2
      const cy = a.y + a.h / 2
      const rx = Math.abs(a.w) / 2 + pad
      const ry = Math.abs(a.h) / 2 + pad
      const dx = (p.x - cx) / rx
      const dy = (p.y - cy) / ry
      if (dx * dx + dy * dy <= 1) return a
    } else if (a.type === 'pen') {
      for (const pt of a.points) {
        if (Math.abs(p.x - pt.x) <= pad + a.lw && Math.abs(p.y - pt.y) <= pad + a.lw) return a
      }
    }
  }
  return null
}

// ---- 标注删除 ----
function deleteAnno(id: string) {
  annotations.value = annotations.value.filter((a) => a.id !== id)
  if (annoSelected.value === id) annoSelected.value = null
  renderAnnos()
}

// ---- 鼠标交互 ----
// 绘制/拖动标注期间挂 window mouseup，防止鼠标移出 stage 释放导致状态卡死
function bindAnnoWindow() {
  window.addEventListener('mouseup', onAnnoMouseUp)
}
function unbindAnnoWindow() {
  window.removeEventListener('mouseup', onAnnoMouseUp)
}
// 标注开始（stage 坐标）：工具激活 → 开始绘制；否则命中检测 → 选中/拖动
function annoStartAt(p: { x: number; y: number }) {
  // 标注工具激活 → 开始绘制
  if (annoTool.value) {
    _annoDrawing.value = true
    _annoStart = p
    const c = annoColor.value
    const lw = annoWidth.value
    const id = uid()
    if (annoTool.value === 'rect') {
      _annoCurrent = { type: 'rect', id, x: p.x, y: p.y, w: 0, h: 0, color: c, lw }
    } else if (annoTool.value === 'circle') {
      _annoCurrent = { type: 'circle', id, x: p.x, y: p.y, w: 0, h: 0, color: c, lw }
    } else if (annoTool.value === 'pen') {
      _annoCurrent = { type: 'pen', id, points: [p], color: c, lw }
    }
    bindAnnoWindow()
    return
  }
  // 无工具 → 检测选中
  const hit = hitTest(p)
  if (hit) {
    annoSelected.value = hit.id
    _annoDrag = true
    _annoDragOrig =
      hit.type === 'rect' ? { x: hit.x, y: hit.y } : hit.type === 'circle' ? { x: hit.x, y: hit.y } : { x: 0, y: 0 }
    _annoStart = p
    bindAnnoWindow()
    renderAnnos()
    return
  }
  annoSelected.value = null
  renderAnnos()
}

// 标注移动（stage 坐标）：拖动已有标注 / 更新绘制
function annoMoveAt(p: { x: number; y: number }) {
  // 移动已有标注
  if (_annoDrag && annoSelected.value && _annoDragOrig) {
    const dx = p.x - _annoStart.x
    const dy = p.y - _annoStart.y
    const a = annotations.value.find((x) => x.id === annoSelected.value)
    if (!a) return
    if (a.type === 'rect') {
      a.x = _annoDragOrig.x + dx
      a.y = _annoDragOrig.y + dy
    } else if (a.type === 'circle') {
      a.x = _annoDragOrig.x + dx
      a.y = _annoDragOrig.y + dy
    }
    annotations.value = [...annotations.value]
    renderAnnos()
    return
  }
  // 绘制中
  if (!_annoDrawing.value || !_annoCurrent) return
  if (_annoCurrent.type === 'rect') {
    _annoCurrent.w = p.x - _annoStart.x
    _annoCurrent.h = p.y - _annoStart.y
  } else if (_annoCurrent.type === 'circle') {
    _annoCurrent.w = p.x - _annoStart.x
    _annoCurrent.h = p.y - _annoStart.y
  } else if (_annoCurrent.type === 'pen') {
    _annoCurrent.points.push(p)
  }
  renderAnnos()
}

function onAnnoMouseDown(e: MouseEvent) {
  annoStartAt(stageCoords(e))
}
function onAnnoMouseMove(e: MouseEvent) {
  annoMoveAt(stageCoords(e))
}

function onAnnoMouseUp() {
  if (_annoDrag) {
    _annoDrag = false
    _annoDragOrig = null
    unbindAnnoWindow()
    _renderAnnosNow()
    return
  }
  if (!_annoDrawing.value) {
    unbindAnnoWindow()
    return
  }
  _annoDrawing.value = false
  unbindAnnoWindow()
  if (_annoCurrent) {
    // 防止添加零尺寸标注
    const skip =
      (_annoCurrent.type === 'rect' && (_annoCurrent.w === 0 || _annoCurrent.h === 0)) ||
      (_annoCurrent.type === 'circle' && (_annoCurrent.w === 0 || _annoCurrent.h === 0)) ||
      (_annoCurrent.type === 'pen' && _annoCurrent.points.length < 2)
    if (!skip) {
      annotations.value = [...annotations.value, _annoCurrent]
    }
  }
  _annoCurrent = null
  renderAnnos()
}

// ---- 导航 ----
function goTo(idx: number) {
  if (idx < 0 || idx >= total.value || idx === currentIndex.value) return
  currentIndex.value = idx
  emit('change', idx)
  resetTransform()
  _loadState.value = 'loading'
}
function goPrev() {
  goTo(currentIndex.value - 1)
}
function goNext() {
  goTo(currentIndex.value + 1)
}

// ---- 键盘 ----
function onKeydown(e: KeyboardEvent) {
  // 标注键盘操作优先
  if (annoTool.value || annoSelected.value) {
    if (e.key === 'Escape') {
      if (_annoDrawing.value) {
        _annoDrawing.value = false
        _annoCurrent = null
        renderAnnos()
        return
      }
      if (annoSelected.value) {
        annoSelected.value = null
        renderAnnos()
        return
      }
      setAnnoTool(null)
      return // 取消工具并清理绘制残留
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && annoSelected.value) {
      deleteAnno(annoSelected.value)
      return
    }
  }
  // 工具快捷键：再按同一工具键 = 取消（与点击按钮同语义）
  const k = e.key.toLowerCase()
  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    const map: Record<string, AnnoType> = { r: 'rect', p: 'pen', c: 'circle' }
    if (k in map) {
      setAnnoTool(map[k])
      return
    }
  }
  if (e.key === 'Escape') {
    // 取消当前标注工具并清理绘制残留（与点击按钮取消一致）
    if (annoTool.value) {
      setAnnoTool(null)
      return
    }
    emit('close')
    return
  }
  if (isMulti.value && !annoTool.value) {
    if (e.key === 'ArrowLeft') {
      goPrev()
      return
    }
    if (e.key === 'ArrowRight') {
      goNext()
      return
    }
  }
}

// ---- 触摸手势：双指缩放 / 放大后单指平移 / 双击缩放 / 多图轻扫切图 ----
let _touchStartX = 0
let _touchStartY = 0
let _touchDragging = false
let _pinchDist = 0
let _pinchStartScale = 1
let _pinchStartPos = { x: 0, y: 0 }
let _pinchCenter = { x: 0, y: 0 }
let _pinchStageCenter = { x: 0, y: 0 }
let _lastTapAt = 0

function onTouchStart(e: TouchEvent) {
  // 双指：进入 pinch 缩放
  if (e.touches.length >= 2) {
    const [a, b] = [e.touches[0], e.touches[1]]
    _pinchDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    _pinchStartScale = scale.value
    _pinchStartPos = { ...pos.value }
    const stage = annoCanvas.value?.parentElement
    const r = stage?.getBoundingClientRect()
    _pinchCenter = r
      ? {
          x: (a.clientX + b.clientX) / 2 - r.left,
          y: (a.clientY + b.clientY) / 2 - r.top,
        }
      : { x: 0, y: 0 }
    _pinchStageCenter = r ? { x: r.width / 2, y: r.height / 2 } : { x: 0, y: 0 }
    _touchStartX = 0
    _touchStartY = 0
    _touchDragging = false
    return
  }
  const t = e.touches[0]
  const p = stagePoint(t.clientX, t.clientY)
  // 标注工具激活 → 开始绘制
  if (annoTool.value) {
    annoStartAt(p)
    return
  }
  // 无工具：命中已有标注则选中拖动（图片手势让位）
  annoStartAt(p)
  if (_annoDrag) return
  _touchStartX = t.clientX
  _touchStartY = t.clientY
  // 已放大 / 已旋转时，单指即可拖动平移
  if (scale.value > 1 || rotation.value !== 0) {
    _touchDragging = true
    dragStart = { x: t.clientX - pos.value.x, y: t.clientY - pos.value.y }
  }
}

function onTouchMove(e: TouchEvent) {
  // 双指 pinch：以双指中心为锚点缩放，中心对应的图片像素保持不动
  if (e.touches.length >= 2 && _pinchDist > 0) {
    const [a, b] = [e.touches[0], e.touches[1]]
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    if (d === 0) return
    const ns = Math.max(0.25, Math.min(5, _pinchStartScale * (d / _pinchDist)))
    if (ns === scale.value) return
    const ratio = ns / _pinchStartScale
    pos.value = {
      x: _pinchStartPos.x * ratio + (_pinchCenter.x - _pinchStageCenter.x) * (1 - ratio),
      y: _pinchStartPos.y * ratio + (_pinchCenter.y - _pinchStageCenter.y) * (1 - ratio),
    }
    if (ns <= 1) pos.value = { x: 0, y: 0 }
    scale.value = ns
    return
  }
  // 标注绘制 / 拖动中
  if (_annoDrawing.value || _annoDrag) {
    annoMoveAt(stagePoint(e.touches[0].clientX, e.touches[0].clientY))
    return
  }
  if (_touchDragging && e.touches.length === 1) {
    const t = e.touches[0]
    pos.value = { x: t.clientX - dragStart.x, y: t.clientY - dragStart.y }
  }
}

function onTouchEnd(e: TouchEvent) {
  // pinch 结束：抬起一指后若仍有一指，转为拖动平移
  if (_pinchDist > 0) {
    _pinchDist = 0
    if (e.touches.length === 1) {
      _touchDragging = true
      const t = e.touches[0]
      dragStart = { x: t.clientX - pos.value.x, y: t.clientY - pos.value.y }
    } else {
      _touchDragging = false
    }
    return
  }
  // 标注绘制 / 拖动结束
  if (_annoDrawing.value || _annoDrag) {
    onAnnoMouseUp()
    return
  }
  const t = e.changedTouches[0]
  const dx = t.clientX - _touchStartX
  const dy = t.clientY - _touchStartY
  // 轻点（位移小）：双击切换 1x / 2x 缩放；放大状态下优先于拖拽结束判定
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
    _touchDragging = false
    const now = Date.now()
    if (now - _lastTapAt < 300) {
      setScale(scale.value > 1 ? 1 : 2)
      _lastTapAt = 0
    } else {
      _lastTapAt = now
    }
    return
  }
  if (_touchDragging) {
    _touchDragging = false
    return
  }
  // 多图且未放大：水平轻扫切图（位移需超过阈值且水平主导）
  if (isMulti.value && scale.value <= 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0) {
      goPrev()
    } else {
      goNext()
    }
  }
}

// 触摸被系统中断（来电/手势识别抢走触摸等）：丢弃当前半成品绘制，清理绘制状态
// ——否则 _annoDrawing/_annoCurrent 残留，取消工具后再次触摸仍会画出幽灵标注
function onTouchCancel() {
  _annoCurrent = null
  _annoDrawing.value = false
  _annoDrag = false
  _annoDragOrig = null
  _pinchDist = 0
  _touchDragging = false
  unbindAnnoWindow()
  renderAnnos()
}

// ---- 变换：缩放 + 拖拽 + 旋转 + 翻转 ----
const scale = ref(1)
const pos = ref({ x: 0, y: 0 })
const dragging = ref(false)
const rotation = ref(0) // 0 | 90 | 180 | 270
const flipH = ref(false)
let dragStart = { x: 0, y: 0 }

function resetTransform() {
  scale.value = 1
  pos.value = { x: 0, y: 0 }
  rotation.value = 0
  flipH.value = false
}
function setScale(s: number) {
  scale.value = Math.max(0.25, Math.min(5, s))
  if (scale.value <= 1) pos.value = { x: 0, y: 0 }
}
function rotateCW() {
  rotation.value = ((rotation.value + 90) % 360) as 0 | 90 | 180 | 270
}
function rotateCCW() {
  rotation.value = ((rotation.value - 90 + 360) % 360) as 0 | 90 | 180 | 270
}
function toggleFlip() {
  flipH.value = !flipH.value
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  setScale(scale.value + (e.deltaY > 0 ? -0.15 : 0.15))
}
function onMouseDown(e: MouseEvent) {
  if (annoTool.value) return
  // 命中已有标注时不启动图片拖拽（拖动标注只移动标注，避免图片同时平移）
  if (hitTest(stageCoords(e))) return
  if (scale.value <= 1 && rotation.value === 0) return
  dragging.value = true
  dragStart = { x: e.clientX - pos.value.x, y: e.clientY - pos.value.y }
}
function onMouseMove(e: MouseEvent) {
  if (annoTool.value) return
  if (!dragging.value) return
  pos.value = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }
}
function onMouseUp() {
  if (annoTool.value) return
  dragging.value = false
}
function onDblClick() {
  setScale(scale.value > 1 ? 1 : 2)
}

const imgTransform = computed(() => {
  const parts: string[] = []
  parts.push(`translate(${pos.value.x}px, ${pos.value.y}px)`)
  parts.push(`scale(${scale.value})`)
  if (rotation.value !== 0) parts.push(`rotate(${rotation.value}deg)`)
  if (flipH.value) parts.push('scaleX(-1)')
  return parts.join(' ')
})

// ---- 加载状态 ----
type LoadState = 'loading' | 'loaded' | 'error'
const _loadState = ref<LoadState>('loading')
watch(currentUrl, () => {
  _loadState.value = 'loading'
})
function onImgLoad() {
  _loadState.value = 'loaded'
  nextTick(renderAnnos)
}
function onImgError() {
  _loadState.value = 'error'
}

// ---- 导出：合成（原图 + 标注）→ 下载 / 复制 ----
const imgEl = ref<HTMLImageElement | null>(null)
// 操作反馈走 Toast 通知（右下角弹窗），不用工具栏小字（复用共享 notify）
const { toastRef, notify } = useToastNotify()

// 标注坐标从 stage 像素换算为图片像素（基于当前显示比例；旋转/翻转时标注不联动，与画布行为一致）
// offX/offY = 图片显示区域左/上边缘相对 stage 的偏移（getBoundingClientRect 含 transform，映射跟随缩放平移）
function mapAnnoToImage(a: Annotation, sx: number, sy: number, offX: number, offY: number): Annotation {
  if (a.type === 'pen') return { ...a, points: a.points.map((p) => ({ x: (p.x - offX) * sx, y: (p.y - offY) * sy })) }
  return { ...a, x: (a.x - offX) * sx, y: (a.y - offY) * sy, w: a.w * sx, h: a.h * sy }
}

async function buildExportCanvas(): Promise<HTMLCanvasElement | null> {
  const img = imgEl.value
  const stage = annoCanvas.value?.parentElement
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
  for (const a of annotations.value) {
    paintAnno(ctx, mapAnnoToImage(a, sx, sy, offX, offY), false, sAvg)
  }
  return cvs
}

async function toPngBlob(cvs: HTMLCanvasElement): Promise<Blob | null> {
  try {
    return await new Promise((r) => cvs.toBlob((b) => r(b), 'image/png'))
  } catch {
    return null // 跨域图片污染 canvas 时抛 SecurityError
  }
}

async function downloadImage() {
  if (_loadState.value !== 'loaded') return
  const cvs = await buildExportCanvas()
  if (!cvs) {
    notify($t('imagePreview.exportFailNotLoaded'), 'error')
    return
  }
  try {
    const ok = downloadScreenshot(cvs.toDataURL('image/png'), `${displayTitle.value || 'image'}.png`)
    notify(ok ? $t('imagePreview.downloadOk') : $t('imagePreview.downloadFail'), ok ? 'success' : 'error')
  } catch {
    notify($t('imagePreview.exportFailCrossOrigin'), 'error')
  }
}

async function copyImage() {
  if (_loadState.value !== 'loaded') return
  const cvs = await buildExportCanvas()
  if (!cvs) {
    notify($t('imagePreview.exportFailNotLoaded'), 'error')
    return
  }
  const blob = await toPngBlob(cvs)
  if (!blob) {
    notify($t('imagePreview.exportFailCrossOrigin'), 'error')
    return
  }
  const ok = await copyScreenshotToClipboard(blob)
  notify(ok ? $t('imagePreview.copyOk') : $t('imagePreview.copyFail'), ok ? 'success' : 'error')
}

// ---- 标题 ----
const displayTitle = computed(() => {
  if (props.title) return props.title
  if (isMulti.value) return currentLabel.value || $t('imagePreview.imageLabel', { n: currentIndex.value + 1 })
  return currentLabel.value || ''
})
</script>

<template>
  <div v-if="currentUrl" class="ip-backdrop" @click.self="emit('close')">
    <Toast ref="toastRef" variant="toast" position="bottom-right" />
    <div
      ref="overlayRef"
      class="ip-overlay"
      role="dialog"
      aria-modal="true"
      tabindex="0"
      @keydown="onKeydown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
    >
      <!-- 顶部栏 -->
      <div class="ip-header">
        <span class="ip-title">{{ displayTitle }}</span>
        <!-- 标注工具：矩形 / 圆形 / 画笔 / 颜色 / 粗细（单行；颜色数量按可用空间逐步裁减，窄屏先隐藏后面的色点） -->
        <div ref="annoToolsRef" class="ip-anno-tools">
          <button
            v-for="tool in ['rect', 'circle', 'pen'] as AnnoType[]"
            :key="tool"
            class="ip-hdr-btn"
            :class="{ active: annoTool === tool }"
            :title="
              {
                rect: $t('imagePreview.annoRect'),
                pen: $t('imagePreview.annoPen'),
                circle: $t('imagePreview.annoCircle'),
              }[tool]
            "
            @click="setAnnoTool(tool)"
          >
            <IconSvg :type="{ rect: 'square', pen: 'pen-tool', circle: 'circle' }[tool]" size="sm" />
          </button>
          <span class="ip-toolbar-sep" />
          <button
            v-for="c in annoColors"
            :key="c"
            class="ip-color-dot"
            :class="{ active: annoColor === c }"
            :style="{ background: c }"
            :title="c"
            @click="annoColor = c"
          />
          <span class="ip-toolbar-sep" />
          <button
            v-for="w in annoWidths"
            :key="w"
            class="ip-hdr-btn ip-w-btn"
            :class="{ active: annoWidth === w }"
            :title="$t('imagePreview.lineWidth', { w })"
            @click="annoWidth = w"
          >
            <span :style="{ width: w * 2 + 'px', height: w * 2 + 'px', borderRadius: '50%', background: annoColor }" />
          </button>
        </div>
        <div class="ip-header-right">
          <span v-if="isMulti" class="ip-counter-header">{{ currentIndex + 1 }} / {{ total }}</span>
          <button
            v-if="isMulti"
            class="ip-hdr-btn"
            :class="{ active: showThumbs }"
            :title="$t('imagePreview.thumbs')"
            @click="toggleThumbs"
          >
            <IconSvg type="panel-right" size="sm" />
          </button>
          <button class="ip-close" :title="$t('imagePreview.close')" @click="emit('close')">
            <IconSvg type="x" size="sm" />
          </button>
        </div>
      </div>

      <!-- 主体：主视图 + 缩略图 -->
      <div class="ip-body">
        <!-- 主视图 -->
        <div class="ip-main">
          <div
            class="ip-stage"
            :style="{ cursor: annoTool ? 'crosshair' : undefined }"
            @wheel="onWheel"
            @mousedown="onAnnoMouseDown"
            @mousemove="onAnnoMouseMove"
            @mouseup="onAnnoMouseUp"
            @touchstart.passive="onTouchStart"
            @touchmove.prevent="onTouchMove"
            @touchend.passive="onTouchEnd"
            @touchcancel.passive="onTouchCancel"
          >
            <!-- 加载态 -->
            <div v-if="_loadState === 'loading'" class="ip-spinner" />
            <div v-else-if="_loadState === 'error'" class="ip-error">⚠ {{ $t('imagePreview.loadFailed') }}</div>

            <!-- 图片 -->
            <img
              ref="imgEl"
              :src="currentUrl"
              class="ip-img"
              :class="{ invisible: _loadState !== 'loaded' }"
              :style="{
                transform: imgTransform,
                cursor: scale > 1 || rotation !== 0 ? (dragging ? 'grabbing' : 'grab') : 'default',
              }"
              draggable="false"
              @load="onImgLoad"
              @error="onImgError"
              @mousedown.prevent="onMouseDown"
              @dblclick.prevent="onDblClick"
              @dragstart.prevent
            />

            <!-- 标注画布 -->
            <canvas ref="annoCanvas" class="ip-anno-canvas" />
            <template v-if="isMulti">
              <button
                class="ip-arrow ip-arrow-left"
                :disabled="currentIndex <= 0"
                :title="$t('imagePreview.prev')"
                @click.stop="goPrev"
              >
                <IconSvg type="chevron-left" size="md" />
              </button>
              <button
                class="ip-arrow ip-arrow-right"
                :disabled="currentIndex >= total - 1"
                :title="$t('imagePreview.next')"
                @click.stop="goNext"
              >
                <IconSvg type="chevron-right" size="md" />
              </button>
            </template>
          </div>

          <!-- 底部工具栏 -->
          <div class="ip-toolbar">
            <!-- 旋转 + 翻转 -->
            <button :title="$t('imagePreview.rotateCCW')" @click.stop="rotateCCW">
              <IconSvg type="rotate-ccw" size="sm" />
            </button>
            <button :title="$t('imagePreview.rotateCW')" @click.stop="rotateCW">
              <IconSvg type="rotate-cw" size="sm" />
            </button>
            <button :class="{ active: flipH }" :title="$t('imagePreview.flipH')" @click.stop="toggleFlip">
              <IconSvg type="arrow-left-right" size="sm" />
            </button>
            <span class="ip-toolbar-sep" />
            <!-- 缩放 -->
            <button :title="$t('imagePreview.zoomIn')" @click.stop="setScale(scale + 0.25)">
              <IconSvg type="zoom-in" size="sm" />
            </button>
            <button :title="$t('imagePreview.zoomOut')" @click.stop="setScale(scale - 0.25)">
              <IconSvg type="zoom-out" size="sm" />
            </button>
            <button :title="$t('imagePreview.zoomActual')" @click.stop="setScale(1)">
              <IconSvg type="maximize" size="sm" />
            </button>
            <span class="ip-toolbar-sep" />
            <!-- 导出：下载 / 复制（合成图包含标注） -->
            <button :title="$t('imagePreview.download')" @click.stop="downloadImage">
              <IconSvg type="download" size="sm" />
            </button>
            <button :title="$t('imagePreview.copy')" @click.stop="copyImage">
              <IconSvg type="copy" size="sm" />
            </button>
            <span v-if="isMulti" class="ip-counter">{{ currentIndex + 1 }} / {{ total }}</span>
            <slot name="actions" />
          </div>
        </div>

        <!-- 缩略图面板 -->
        <div v-if="isMulti && showThumbs" class="ip-thumbs">
          <div
            v-for="(item, i) in items"
            :key="i"
            class="ip-thumb"
            :class="{ active: i === currentIndex }"
            @click="goTo(i)"
          >
            <img :src="item.url" :alt="item.label || $t('imagePreview.imageLabel', { n: i + 1 })" />
            <span class="ip-thumb-label">{{ item.label || $t('imagePreview.imageLabel', { n: i + 1 }) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== 遮罩层（全屏半透明，点击关闭） ===== */
.ip-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-lightbox, 10000);
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(var(--space-1));
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ===== 浮动面板（按视口比例居中） ===== */
.ip-overlay {
  width: clamp(360px, 92vw, 1400px);
  height: clamp(280px, 90vh, 95vh);
  display: flex;
  flex-direction: column;
  background: rgba(20, 20, 22, 0.96);
  border-radius: clamp(var(--radius-md), 1.2vw, 14px);
  overflow: hidden;
  box-shadow:
    0 var(--space-2) clamp(28px, 5vw, 40px) rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.08);
  outline: none;
}

/* ===== 顶部栏 ===== */
.ip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--ctrl-height);
  padding: 0 var(--space-3) 0 var(--space-4);
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.ip-title {
  font-size: var(--ctrl-font-size);
  color: rgba(255, 255, 255, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.ip-header-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}
.ip-counter-header {
  font-size: var(--ctrl-font-size);
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
}
.ip-hdr-btn {
  width: clamp(28px, 4vw, 36px);
  height: var(--ctrl-height);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: clamp(16px, 2vw, 22px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}
.ip-hdr-btn:hover,
.ip-hdr-btn.active {
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
}
.ip-close {
  width: clamp(28px, 4vw, 36px);
  height: var(--ctrl-height);
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: clamp(16px, 2vw, 22px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition-fast);
}
.ip-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* ===== 主体 ===== */
.ip-body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.ip-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* ===== 图片限定区域 ===== */
.ip-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  /* 手势交由组件处理：阻止浏览器原生滚动/双指缩放 */
  touch-action: none;
}
.ip-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
}
.ip-img.invisible {
  opacity: 0;
  position: absolute;
  pointer-events: none;
}
/* 标注画布（覆盖在图片上方，透明背景） */
.ip-anno-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}
.ip-w-btn {
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 标注工具栏 */
.ip-anno-tools {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.ip-color-dot {
  width: clamp(14px, 2vw, 18px);
  height: clamp(14px, 2vw, 18px);
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition:
    transform var(--transition-fast),
    border-color var(--transition-fast);
  flex-shrink: 0;
}
.ip-color-dot:hover {
  transform: scale(1.2);
}
.ip-color-dot.active {
  border-color: #fff;
  transform: scale(1.15);
}
.ip-spinner {
  width: clamp(32px, 5vw, 40px);
  height: clamp(32px, 5vw, 40px);
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: #fff;
  border-radius: 50%;
  animation: ip-spin 0.8s linear infinite;
}
@keyframes ip-spin {
  to {
    transform: rotate(360deg);
  }
}
.ip-error {
  color: rgba(255, 255, 255, 0.5);
  font-size: var(--ctrl-font-size);
}

/* 左右箭头 */
.ip-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: clamp(32px, 5vw, 44px);
  height: clamp(32px, 5vw, 44px);
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: clamp(18px, 3vw, 26px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background var(--transition-normal),
    opacity var(--transition-normal);
  opacity: 0;
  z-index: 1;
}
.ip-stage:hover .ip-arrow {
  opacity: 1;
}
.ip-arrow:hover {
  background: rgba(255, 255, 255, 0.25);
}
.ip-arrow:disabled {
  opacity: 0.15;
  cursor: default;
}
.ip-arrow-left {
  left: var(--space-3);
}
.ip-arrow-right {
  right: var(--space-3);
}

/* ===== 缩略图面板 ===== */
.ip-thumbs {
  width: clamp(80px, 10vw, 110px);
  flex-shrink: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--space-2) var(--space-1);
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
}
.ip-thumbs::-webkit-scrollbar {
  width: var(--space-1);
}
.ip-thumbs::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-sm);
}
.ip-thumb {
  width: clamp(72px, 8vw, 98px);
  flex-shrink: 0;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    opacity var(--transition-fast);
  opacity: 0.55;
  display: flex;
  flex-direction: column;
}
.ip-thumb:hover {
  opacity: 0.85;
  border-color: rgba(255, 255, 255, 0.3);
}
.ip-thumb.active {
  opacity: 1;
  border-color: #fff;
}
.ip-thumb img {
  width: 100%;
  height: clamp(48px, 6vw, 62px);
  object-fit: cover;
  display: block;
  flex-shrink: 0;
}
.ip-thumb-label {
  font-size: clamp(10px, 1.4vw, 13px);
  color: rgba(255, 255, 255, 0.55);
  padding: var(--space-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  line-height: 1.3;
}
.ip-thumb.active .ip-thumb-label {
  color: rgba(255, 255, 255, 0.85);
}

/* ===== 底部工具栏 ===== */
.ip-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: clamp(44px, 7vw, 56px);
  padding: 0 var(--space-4);
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.04);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.ip-toolbar > button {
  width: clamp(28px, 4vw, 36px);
  height: var(--ctrl-height);
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: clamp(13px, 2vw, 15px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition-fast);
}
.ip-toolbar > button:hover {
  background: rgba(255, 255, 255, 0.25);
}
.ip-toolbar > button.active {
  background: rgba(255, 255, 255, 0.3);
}
.ip-toolbar-sep {
  width: 1px;
  height: clamp(16px, 3vw, 20px);
  background: rgba(255, 255, 255, 0.15);
  margin: 0 var(--space-1);
}
.ip-counter {
  color: rgba(255, 255, 255, 0.45);
  font-size: var(--ctrl-font-size);
  margin: 0 var(--space-2);
}

/* ===== 移动端适配（窄视口） ===== */
@media (max-width: 640px) {
  /* 弹层收窄、降低高度，避免顶天立地 */
  .ip-overlay {
    width: calc(100vw - var(--space-4));
    height: 80vh;
    border-radius: var(--radius-lg);
  }
  /* 顶栏单行：标题（封顶，让位给工具行）+ 工具（flex:1 拿剩余空间，色点按空间自适应裁减）+ 缩略图/关闭 */
  .ip-header {
    height: clamp(38px, 6vw, 44px);
    padding: 0 var(--space-2) 0 var(--space-3);
  }
  .ip-title {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 15vw;
  }
  .ip-header-right {
    flex-shrink: 1;
    min-width: 0;
  }
  /* 顶栏计数与底部工具栏重复，移动端隐藏省空间 */
  .ip-counter-header {
    display: none;
  }
  /* 工具行不换行不横滚：拿到剩余宽度，空间不足时由 fitAnnoColors 逐步裁减色点数量 */
  .ip-anno-tools {
    flex: 1 1 auto;
    min-width: 0;
    gap: var(--space-1);
    overflow: visible;
    justify-content: center;
  }
  .ip-anno-tools .ip-toolbar-sep {
    margin: 0 var(--space-1);
    flex-shrink: 0;
  }
  /* 工具/线宽按钮固定不压缩（保证可点尺寸）；色点可压缩但最小 14px，压缩到底仍放不下才由 fitAnnoColors 裁减 */
  .ip-anno-tools .ip-hdr-btn {
    width: clamp(24px, 4vw, 26px);
    height: clamp(24px, 4vw, 26px);
    flex-shrink: 0;
  }
  .ip-header-right .ip-hdr-btn {
    width: clamp(28px, 5vw, 30px);
    height: clamp(28px, 5vw, 30px);
    flex-shrink: 0;
  }
  .ip-close {
    width: clamp(32px, 5vw, 40px);
    height: clamp(32px, 5vw, 40px);
    flex-shrink: 0;
  }
  .ip-color-dot {
    width: clamp(14px, 2.5vw, 16px);
    height: clamp(14px, 2.5vw, 16px);
    min-width: clamp(12px, 2vw, 14px);
    flex-shrink: 1;
  }
  .ip-toolbar {
    height: var(--ctrl-height);
    padding: 0 var(--space-2);
  }
  .ip-toolbar > button {
    width: clamp(32px, 5vw, 40px);
    height: clamp(32px, 5vw, 40px);
  }
  /* 左右箭头移动端无 hover，改为常显 */
  .ip-arrow {
    opacity: 0.8;
    width: clamp(32px, 5vw, 40px);
    height: clamp(32px, 5vw, 40px);
  }
  /* 缩略图面板改为底部横排（文档流内），不挤占主图宽度也不遮挡主图 */
  .ip-body {
    flex-direction: column;
  }
  .ip-main {
    min-height: 0;
  }
  .ip-thumbs {
    position: static;
    width: auto;
    height: clamp(64px, 12vw, 86px);
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    background: rgba(0, 0, 0, 0.55);
    padding: var(--space-2);
    gap: var(--space-2);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .ip-thumb {
    width: clamp(64px, 8vw, 84px);
  }
  .ip-thumb img {
    height: clamp(44px, 6vw, 56px);
  }
  .ip-thumb-label {
    padding: var(--space-1);
  }
}
</style>
