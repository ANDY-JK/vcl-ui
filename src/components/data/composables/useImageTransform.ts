/**
 * useImageTransform — ImagePreview 变换 + 触摸手势子系统（自主文件下沉，M3 持续拆分）
 *
 * 承接两块强耦合逻辑：
 *   1. 变换状态机：scale/pos/rotation/flipH + 鼠标拖拽（放大/旋转后）+ 滚轮缩放 + 双击切换
 *   2. 触摸手势：双指 pinch（以双指中心为锚点）/ 放大后单指平移 / 双击 1x↔2x / 多图水平轻扫切图
 *
 * 与标注子系统的边界（刻意留在宿主）：
 *   - 手势让位判定：annoActive（工具激活）/ isAnnoDragging / endAnnoDraw（onTouchEnd 收尾）/
 *     cancelAnnoGestures（onTouchCancel 的标注侧清理）由宿主注入——标注绘制是独立子系统
 *   - 坐标换算 stagePoint、命中检测 hitTest 是标注子系统的纯函数，经注入复用
 * 多图轻扫切图通过 onSwipe 注入（宿主 goTo 前需先 resetTransform，宿主自己保证顺序）。
 */
import { ref, computed } from 'vue'
import type { Ref } from 'vue'

export function useImageTransform(
  annoCanvas: Ref<HTMLCanvasElement | null>,
  o: {
    isMulti: () => boolean
    /** 标注工具是否激活（图片手势整体让位） */
    annoActive: () => boolean
    /** 标注绘制中（移动事件移交标注） */
    isAnnoDrawing: () => boolean
    /** 标注拖动中（触摸侧） */
    isAnnoDragging: () => boolean
    /** 触摸开始：工具激活绘制 / 无工具命中拖动（宿主 annoStartAt） */
    startAnnoAt: (p: { x: number; y: number }) => void
    /** 触摸移动：标注绘制/拖动跟手（宿主 annoMoveAt） */
    moveAnnoAt: (p: { x: number; y: number }) => void
    /** 触摸轻扫收尾的标注完成（宿主 onAnnoMouseUp） */
    endAnnoDraw: () => void
    /** 触摸被系统中断：标注侧清理（宿主：清 _annoCurrent/_annoDrawing 等 + renderAnnos） */
    cancelAnnoGestures: () => void
    /** 多点取 stage 坐标（宿主 stagePoint） */
    stagePoint: (x: number, y: number) => { x: number; y: number }
    /** 鼠标事件取 stage 坐标（宿主 stageCoords） */
    stageCoords: (e: MouseEvent) => { x: number; y: number }
    /** 命中已有标注（命中时图片拖拽让位；宿主 hitTest） */
    hitTest: (p: { x: number; y: number }) => unknown
    /** 多图轻扫切图（宿主：goPrev/goNext，已含 resetTransform） */
    onSwipe: (direction: 'next' | 'prev') => void
  },
) {
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
    const p = o.stagePoint(t.clientX, t.clientY)
    // 标注工具激活 → 开始绘制
    if (o.annoActive()) {
      o.startAnnoAt(p)
      return
    }
    // 无工具：命中已有标注则选中拖动（图片手势让位）
    o.startAnnoAt(p)
    if (o.isAnnoDragging()) return
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
    if (o.isAnnoDrawing() || o.isAnnoDragging()) {
      o.moveAnnoAt(o.stagePoint(e.touches[0].clientX, e.touches[0].clientY))
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
    if (o.isAnnoDrawing() || o.isAnnoDragging()) {
      o.endAnnoDraw()
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
    if (o.isMulti() && scale.value <= 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      o.onSwipe(dx > 0 ? 'prev' : 'next')
    }
  }

  // 触摸被系统中断（来电/手势识别抢走触摸等）：丢弃当前半成品绘制，清理绘制状态
  // ——否则标注侧残留状态，取消工具后再次触摸仍会画出幽灵标注
  function onTouchCancel() {
    _pinchDist = 0
    _touchDragging = false
    o.cancelAnnoGestures()
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
    if (o.annoActive()) return
    // 命中已有标注时不启动图片拖拽（拖动标注只移动标注，避免图片同时平移）
    if (o.hitTest(o.stageCoords(e))) return
    if (scale.value <= 1 && rotation.value === 0) return
    dragging.value = true
    dragStart = { x: e.clientX - pos.value.x, y: e.clientY - pos.value.y }
  }
  function onMouseMove(e: MouseEvent) {
    if (o.annoActive()) return
    if (!dragging.value) return
    pos.value = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }
  }
  function onMouseUp() {
    if (o.annoActive()) return
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

  return {
    scale,
    pos,
    dragging,
    rotation,
    flipH,
    imgTransform,
    resetTransform,
    setScale,
    rotateCW,
    rotateCCW,
    toggleFlip,
    onWheel,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onDblClick,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  }
}
