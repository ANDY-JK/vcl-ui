/**
 * useImageAnnotation — ImagePreview 标注绘制引擎（自 ImagePreview.vue 下沉，M3 持续拆分）
 *
 * 承接标注子系统全部状态与逻辑：
 *   - 状态：annotations / annoTool / annoColor / annoWidth / annoSelected
 *   - 绘制：annoStartAt（工具激活绘制 / 无工具命中选中拖动）/ annoMoveAt / onAnnoMouse*
 *   - 渲染：renderAnnos（rAF 节流）/ _renderAnnosNow / paintAnno 调用（image-anno-paint）
 *   - 生命周期：切图（watch currentIndex）清空标注、ResizeObserver 跟 stage 尺寸重渲
 *   - 工具切换/取消：setAnnoTool（互斥 + 清全部绘制残留，防幽灵标注）
 *   - 键盘：onKeydown（标注优先：Escape 分三级取消、Delete/Backspace 删选中、
 *     R/P/C 工具快捷键，无标注态时回落给宿主：关弹层/切图/关全屏等）
 *
 * 刻意留在宿主：色点自适应裁减 fitAnnoColors（顶栏 UI 布局知识，依赖 .ip-color-dot
 * 与 annoToolsRef）；画布导出（useImageExport）；变换/手势（useImageTransform）。
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { Annotation, AnnoType } from './annotation-types'
import { paintAnno } from './image-anno-paint'

export function useImageAnnotation(
  annoCanvas: Ref<HTMLCanvasElement | null>,
  o: {
    /** 当前图索引（切图时清空标注；宿主 currentIndex） */
    currentIndex: Ref<number>
    /** 无标注态时的键盘回落（宿主：Escape 关弹层 / ←→ 切图等） */
    onKeydownFallback: (e: KeyboardEvent) => void
  },
) {
  // ---- 标注系统（仅保留矩形 / 圆形 / 画笔） ----
  const annotations = ref<Annotation[]>([])
  const annoTool = ref<AnnoType | null>(null)
  const annoColor = ref('#f43f5e')
  const annoWidth = ref(2)
  const annoSelected = ref<string | null>(null)
  const annoColors = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ffffff']
  const annoWidths = [2, 4, 6]
  let _annoId = 0
  const _annoDrawing = ref(false)
  let _annoDrag = false
  let _annoStart = { x: 0, y: 0 }
  let _annoCurrent: Annotation | null = null
  let _annoDragOrig: { x: number; y: number } | null = null
  function uid() {
    return 'a' + ++_annoId
  }

  // ---- 工具切换/取消（统一入口）----
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

  // 切图：标注绑定在单张图上，换图全部清空并复位工具
  watch(o.currentIndex, () => {
    annotations.value = []
    annoTool.value = null
    annoSelected.value = null
    _annoCurrent = null
    _annoDrawing.value = false
    _annoDrag = false
    unbindAnnoWindow()
  })

  // ---- Canvas 渲染 ----
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

  // Canvas 自适应：stage 尺寸变化时重新渲染标注
  let _ro: ResizeObserver | null = null
  watch(annoCanvas, (cvs) => {
    _ro?.disconnect()
    if (cvs?.parentElement) _ro?.observe(cvs.parentElement)
  })

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

  // 标注删除
  function deleteAnno(id: string) {
    annotations.value = annotations.value.filter((a) => a.id !== id)
    if (annoSelected.value === id) annoSelected.value = null
    renderAnnos()
  }

  // ---- 触摸中断时的标注侧清理（宿主经注入调用，见 o.cancelAnnoGestures）----
  // 绘制/拖动标注期间挂 window mouseup，防止鼠标移出 stage 释放导致状态卡死
  function bindAnnoWindow() {
    window.addEventListener('mouseup', onAnnoMouseUp)
  }
  function unbindAnnoWindow() {
    window.removeEventListener('mouseup', onAnnoMouseUp)
  }

  // ---- 标注绘制/拖动（stage 坐标） ----
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

  // 屏幕坐标 → stage 坐标（像素）：取画布所在 .ip-stage 的 getBoundingClientRect 偏移
  function stagePoint(x: number, y: number) {
    const stage = annoCanvas.value?.parentElement
    if (!stage) return { x: 0, y: 0 }
    const r = stage.getBoundingClientRect()
    return { x: x - r.left, y: y - r.top }
  }
  function stageCoords(e: MouseEvent) {
    return stagePoint(e.clientX, e.clientY)
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

  // 触摸被系统中断（来电/手势识别抢走触摸等）时宿主（useImageTransform.onTouchCancel）调用的
  // 标注侧清理：丢弃当前半成品绘制并复位全部绘制状态——否则 _annoDrawing/_annoCurrent 残留，
  // 取消工具后再次触摸仍会画出幽灵标注
  function resetAnnoGestures() {
    _annoCurrent = null
    _annoDrawing.value = false
    _annoDrag = false
    _annoDragOrig = null
    unbindAnnoWindow()
    renderAnnos()
  }

  // ---- 键盘（标注操作优先；无标注态回落宿主）----
  function onKeydown(e: KeyboardEvent) {
    // 标注键盘操作优先
    if (annoTool.value || annoSelected.value) {
      if (e.key === 'Escape') {
        // 关闭标注即消费 Esc，避免连外层弹窗一起关（#280）
        e.preventDefault?.()
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
    o.onKeydownFallback(e)
  }

  // 绘制/拖动状态只读视图（useImageTransform 的触摸手势让位判定经此注入）
  function isAnnoDrawing() {
    return _annoDrawing.value
  }
  function isAnnoDragging() {
    return _annoDrag
  }

  onMounted(() => {
    if (typeof ResizeObserver !== 'undefined') _ro = new ResizeObserver(() => renderAnnos())
  })
  onUnmounted(() => {
    if (_renderRAF != null) {
      cancelAnimationFrame(_renderRAF)
      _renderRAF = null
    }
    _ro?.disconnect()
    unbindAnnoWindow()
  })

  return {
    annotations,
    annoTool,
    annoColor,
    annoWidth,
    annoSelected,
    annoColors,
    annoWidths,
    setAnnoTool,
    deleteAnno,
    hitTest,
    stagePoint,
    stageCoords,
    renderAnnos,
    annoStartAt,
    annoMoveAt,
    onAnnoMouseDown,
    onAnnoMouseMove,
    onAnnoMouseUp,
    onKeydown,
    resetAnnoGestures,
    isAnnoDrawing,
    isAnnoDragging,
  }
}
