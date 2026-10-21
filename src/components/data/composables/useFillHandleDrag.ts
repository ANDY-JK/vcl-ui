// ==================== 填充柄拖拽（Excel 行为：拖选区右下角小方块批量填充） ====================
//
// 2026-10-21 从 DataTable.vue 下沉（M3 第十一刀）。原因：DataTable.vue 已到 **2904 行**、
// data 域止涨线 2950 —— 余量只剩 46 行，任何功能迭代都会被逼着半路拆分，风险高。
// 这块是 script 区剩余最大的**内聚机械块**（约 105 行纯指针/状态机逻辑，不碰渲染骨架）。
//
// 为什么这块适合下沉：它只做三件事 —— 起拖（快照源选区）→ 随指针换算扩展格数 → 松手交给 `applyFill`。
// 业务语义（填什么值）完全在 `applyFill` 里，这里只管"拖了几格、朝哪拖"。
//
// 刻意不搬的部分：数据变更时取消拖拽的那个 `watch` 留在宿主编排层 ——
// 它同时要做 `clearRange()` / `setDisplayMatrix()`，属于宿主的状态协调，搬进来会引入反向依赖。
import { ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { FillDirection } from './fill-series'

/** 显示索引的矩形边界 */
export interface FillBounds {
  r0: number
  r1: number
  c0: number
  c1: number
}

export interface FillHandleDragDeps {
  /** 当前是否允许填充（宿主按 props/权限决定） */
  fillable: Ref<boolean> | ComputedRef<boolean>
  /** 源选区边界（宿主已有 `rangeBounds` 语义，直接传入） */
  fillHandleRange: ComputedRef<FillBounds | null>
  /** 打开"有浮层"标记（与拖选共用，用于宿主决定是否临时关掉 hover 等） */
  markLayerOpen: () => void
  /** 松手时真正执行填充（方向 + 扩展格数），由宿主的 useCellFill 提供 */
  applyFill: (direction: FillDirection, count: number) => void
}

export function useFillHandleDrag(deps: FillHandleDragDeps) {
  const { fillable, fillHandleRange, markLayerOpen, applyFill } = deps

  /** 拖拽中的预览边界（显示索引）；null = 未在拖拽。由响应式状态驱动单元格高亮，不做 DOM 测量 */
  const _fillPreview = ref<FillBounds | null>(null)

  /** 拖拽会话状态（非响应式：只在指针事件里读写，进响应式系统只会白增开销） */
  let drag: {
    /** 源选区边界（拖拽开始时快照，拖拽过程中不变） */
    r0: number
    r1: number
    c0: number
    c1: number
    dir: FillDirection | null
    count: number
  } | null = null

  /** 预览中的格是否高亮 */
  function isInFillPreview(ri: number, ci: number): boolean {
    const b = _fillPreview.value
    if (!b) return false
    return ri >= b.r0 && ri <= b.r1 && ci >= b.c0 && ci <= b.c1
  }

  function onFillHandleMouseDown(e: MouseEvent) {
    if (e.button !== 0 || !fillable.value) return
    const b = fillHandleRange.value
    if (!b) return
    // 阻止 mousedown 冒泡到 td：否则会同时启动「矩形拖选」，两个拖拽互相打架
    e.preventDefault()
    e.stopPropagation()
    markLayerOpen()
    drag = { ...b, dir: null, count: 0 }
    document.body.classList.add('dt-fill-dragging')
    document.addEventListener('mousemove', onFillHandleMove)
    document.addEventListener('mouseup', onFillHandleUp)
  }

  /** 拖拽中：用指针命中的单元格换算扩展格数（与拖选同一手法，虚拟滚动/缩放天然兼容） */
  function onFillHandleMove(e: MouseEvent) {
    const d = drag
    if (!d) return
    const td = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest(
      'td[data-row-idx][data-col-idx]',
    ) as HTMLElement | null
    if (!td) return
    const ri = Number(td.dataset.rowIdx)
    const ci = Number(td.dataset.colIdx)
    if (!Number.isFinite(ri) || !Number.isFinite(ci)) return

    // 方向：以「指针相对源选区」判断，选位移更大的轴
    const outUp = ri < d.r0
    const outDown = ri > d.r1
    const outLeft = ci < d.c0
    const outRight = ci > d.c1
    let dir: FillDirection | null = null
    if (outDown) dir = 'down'
    else if (outUp) dir = 'up'
    else if (outRight) dir = 'right'
    else if (outLeft) dir = 'left'
    if (!dir) {
      // 仍在源选区内：不预览
      if (_fillPreview.value) _fillPreview.value = null
      d.dir = null
      d.count = 0
      return
    }

    const count = dir === 'down' ? ri - d.r1 : dir === 'up' ? d.r0 - ri : dir === 'right' ? ci - d.c1 : d.c0 - ci
    d.dir = dir
    d.count = count
    const b = { r0: d.r0, r1: d.r1, c0: d.c0, c1: d.c1 }
    if (dir === 'down') b.r1 = d.r1 + count
    else if (dir === 'up') b.r0 = d.r0 - count
    else if (dir === 'right') b.c1 = d.c1 + count
    else b.c0 = d.c0 - count
    _fillPreview.value = b
  }

  /** 结束填充拖拽并清理全部残留（监听器 / body 类 / 预览 / 状态）。
   *  卸载与数据变更都要走这里，避免悬空监听与「索引已失效仍在拖」。
   *
   *  ⚠️ **必须容忍无 DOM 环境**：宿主的数据变更 `watch` 是 `immediate` 的，SSR 下
   *  setup 期间就会同步调到这里；若直接访问 `document` 会抛 `document is not defined`
   *  （下沉时漏了原代码的 `if (_fillDrag)` 守卫，被 SSR 冒烟测试当场抓到）。
   *  这里改为显式的 SSR 守卫，比依赖"恰好没有拖拽会话"这种巧合更可靠。 */
  function cancelFillDrag() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('mousemove', onFillHandleMove)
      document.removeEventListener('mouseup', onFillHandleUp)
      document.body.classList.remove('dt-fill-dragging')
    }
    drag = null
    _fillPreview.value = null
  }

  function onFillHandleUp() {
    const d = drag
    cancelFillDrag()
    if (!d || !d.dir || d.count <= 0) return
    applyFill(d.dir, d.count)
  }

  return {
    /** 预览边界（模板高亮用；`isInFillPreview` 已封装了判空，通常不需要直接用） */
    _fillPreview,
    isInFillPreview,
    onFillHandleMouseDown,
    /** 卸载 / 数据变更时清理（宿主必须在 onUnmounted 里调用，否则会留悬空监听） */
    cancelFillDrag,
  }
}
