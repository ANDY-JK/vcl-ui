/**
 * 矩形选区指针编排（M3 第十二刀下沉，2026-10-21 / 审查 TD-02）
 *
 * ## 这一层负责什么
 *
 * **只做"指针事件 → 选区指令"的翻译**，不持有选区状态本身：
 *
 *   mousedown → 记候选锚点 → 起长按计时
 *   长按到期 或 拖拽超阈值 → 调 startRange/updateRange 激活选区
 *   mousemove → 命中 td → updateRange（并处理边缘自动滚动）
 *   mouseup   → 收尾 + 抑制紧随的 click（否则会取消刚拖出来的选区）
 *
 * 选区的**数据状态机**（rangeSel / 快照 / 矩阵）已经在 `cell-select.ts`，
 * 这里不再重复实现，只把 DOM 事件接上去。
 *
 * ## 为什么单独拆出来（而不是留在 DataTable.vue）
 *
 * 这段 163 行有 12 个模块级可变变量（`_rangeTimer` / `_rangeCandidate` /
 * `_rangeScrollTimer` / 四个坐标 …）与 7 个 document 级监听器。
 * 它们全部是**同一个状态机**的一部分，散在 2800 行文件里时：
 *   · 谁在什么时候清 timer 无法一眼看清（泄漏的温床）
 *   · 卸载时是否摘干净监听器无法验证
 * 集中到一个 composable 后，`onUnmounted` 能一次性收口。
 *
 * ## 归零时机（调用方必须知道）
 *
 * 长按计时器 **不因 mousemove 而重置** —— 这是有意的：用户按住不动 300ms
 * 就该选中，期间手抖不算"移动"。只有 mouseup 或激活才清。
 */
import { onUnmounted, type Ref } from 'vue'

/** 长按多少毫秒后激活选区（按住不动即选中） */
const RANGE_LONGPRESS_MS = 300
/** 拖拽超过多少像素即激活选区（无需等长按） */
const RANGE_DRAG_THRESHOLD = 6
/** 拖选自动滚动的 tick 间隔（实测原值 50ms，与使用率相比 16ms 太快会抖） */
const RANGE_SCROLL_TICK_MS = 50
/** 选区激活后抑制 click 的时长（实测原值 200ms） */
const RANGE_CLICK_GUARD_MS = 200
/** 边缘自动滚动的触发距离（距容器边多少 px 内算贴近） */
const EDGE_ZONE_PX = 30
/** 边缘自动滚动速度（px/tick） */
const SCROLL_SPEED_PX = 16

interface RangeCandidate {
  ri: number
  ci: number
  rk: string
  ck: string
  value: string
}

export interface RangePointerDeps {
  /** 是否可编辑（不可编辑不参与拖选） */
  editable: () => boolean
  /** 当前是否处于单元格编辑中（编辑时不参与拖选） */
  editing: () => boolean
  /** 是否启用矩形选区 */
  cellSelection: () => boolean
  /** 渲染行显示索引（虚拟滚动/全屏时与分页数据对齐） */
  rowDisplayIndex: (idx: number) => number
  /** 行 key 快照（与模板渲染顺序一致） */
  rowsSnapshot: () => string[]
  /** 列 key 快照（与模板渲染顺序一致） */
  colsSnapshot: () => string[]
  /** 取单元格显示值（用于复制/粘贴锚点） */
  cellValue: (row: Record<string, unknown>, colKey: string) => string
  /** 行 key 查找 */
  rowKeyOf: (row: Record<string, unknown>) => string | undefined /** 选区状态（来自 cell-select） */
  rangeSel: Ref<unknown>
  /** 激活选区 */
  startRange: (ri: number, ci: number, rows: string[], cols: string[], value: string) => void
  /** 更新焦点 */
  updateRange: (ri: number, ci: number) => void
  /** 清空选区 */
  clearRange: () => void
  /** 滚动容器（自动滚动用） */
  scrollContainer: Ref<HTMLElement | null>
}

export function useRangePointer(deps: RangePointerDeps) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let candidate: RangeCandidate | null = null
  let active = false
  let suppressClick = false
  let startX = 0
  let startY = 0
  let lastX = 0
  let lastY = 0
  let scrollTimer: ReturnType<typeof setInterval> | null = null

  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function stopAutoScroll() {
    if (scrollTimer) {
      clearInterval(scrollTimer)
      scrollTimer = null
    }
  }

  /** 长按到期 / 拖拽超阈值 → 激活选区 */
  function activate() {
    clearTimer()
    if (active || !candidate) return
    active = true
    document.body.classList.add('dt-range-selecting')
    deps.startRange(candidate.ri, candidate.ci, deps.rowsSnapshot(), deps.colsSnapshot(), candidate.value)
    // 长按未移动时也选中锚点格
    deps.updateRange(candidate.ri, candidate.ci)
  }

  /** 拖选自动滚动：每 tick 滚动容器，靠 mousemove 继续扩展选区 */
  function autoScrollTick() {
    const el = deps.scrollContainer.value
    if (!el || !active) {
      stopAutoScroll()
      return
    }
    const rect = el.getBoundingClientRect()
    let dy = 0
    let dx = 0
    if (lastY < rect.top + EDGE_ZONE_PX) dy = -SCROLL_SPEED_PX
    else if (lastY > rect.bottom - EDGE_ZONE_PX) dy = SCROLL_SPEED_PX
    if (lastX < rect.left + EDGE_ZONE_PX) dx = -SCROLL_SPEED_PX
    else if (lastX > rect.right - EDGE_ZONE_PX) dx = SCROLL_SPEED_PX
    if (dx || dy) el.scrollBy(dx, dy)
    else stopAutoScroll()
  }

  function onMove(e: MouseEvent) {
    if (!candidate) return
    lastX = e.clientX
    lastY = e.clientY
    if (!active) {
      // 按下后直接拖动（无需等长按）：超过阈值即进入选区模式
      const dx = Math.abs(e.clientX - startX)
      const dy = Math.abs(e.clientY - startY)
      if (Math.max(dx, dy) >= RANGE_DRAG_THRESHOLD) activate()
      if (!active) return
    }
    if (!deps.rangeSel.value) return
    const td = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest(
      'td[data-row-idx][data-col-idx]',
    ) as HTMLElement | null
    if (!td) return
    const ri = Number(td.dataset.rowIdx)
    const ci = Number(td.dataset.colIdx)
    if (!Number.isFinite(ri) || !Number.isFinite(ci)) return
    deps.updateRange(ri, ci)
    // 拖到滚动容器边缘 → 自动滚动（继续扩展选区）
    const el = deps.scrollContainer.value
    if (el) {
      const rect = el.getBoundingClientRect()
      const nearEdge =
        lastY < rect.top + EDGE_ZONE_PX ||
        lastY > rect.bottom - EDGE_ZONE_PX ||
        lastX < rect.left + EDGE_ZONE_PX ||
        lastX > rect.right - EDGE_ZONE_PX
      if (nearEdge && !scrollTimer) {
        scrollTimer = setInterval(autoScrollTick, RANGE_SCROLL_TICK_MS)
      } else if (!nearEdge && scrollTimer) {
        stopAutoScroll()
      }
    }
  }

  function onUp() {
    clearTimer()
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    stopAutoScroll()
    if (active) {
      document.body.classList.remove('dt-range-selecting')
      // 抑制紧随的 click：拖选结束时浏览器仍会派发 click，
      // 若不拦掉会把刚拖出来的选区取消掉
      suppressClick = true
      setTimeout(() => {
        suppressClick = false
      }, RANGE_CLICK_GUARD_MS)
      active = false
    }
    candidate = null
  }

  /**
   * 单元格 mousedown 入口（模板上 @mousedown 绑定）
   *
   * 第 3 个参数收 `{ key: string }` 而不是裸 `string`：模板里传的是完整的 `Column`
   * 对象，只取 `key` 用。用结构类型而非 `Column` 是为了让本 composable 不依赖
   * 列定义的具体形状（下沉的模块不该反向 import 组件层的类型）。
   */
  function onCellMouseDown(e: MouseEvent, row: Record<string, unknown>, col: { key: string }, ri: number, ci: number) {
    // cellSelection=false 时不做拖选，也不阻止文本选择（保留浏览器默认行为）
    if (!deps.editable() || deps.editing() || !deps.cellSelection()) return
    if (e.button !== 0) return
    // 可交互元素（输入框/按钮/图片/图标等）不参与拖选
    //
    // ⚠️ `e.target` 可能为 null（下沉后单测里程序化派发 MouseEvent 就是这种情况）。
    // 原代码直接 `.closest(...)` 会在 target 为 null 时抛 TypeError —— 真实浏览器里
    // 用户点击一定有 target，所以线上没暴露；但这是实打实的健壮性缺口，
    // 而且它会让"给这段写单测"变成不可能。补上空值保护。
    const t = e.target as HTMLElement | null
    if (
      t &&
      typeof t.closest === 'function' &&
      t.closest('input,button,select,textarea,a,.cell-expand-icon,.cell-note-dot,.cell-options-arrow,.cell-image')
    )
      return
    // 阻止文本选择（click/dblclick 仍正常触发）
    e.preventDefault()
    deps.clearRange()
    candidate = {
      ri,
      ci,
      rk: deps.rowKeyOf(row) ?? '',
      ck: col.key,
      value: deps.cellValue(row, col.key),
    }
    startX = e.clientX
    startY = e.clientY
    active = false
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    timer = setTimeout(activate, RANGE_LONGPRESS_MS)
  }

  /** 是否应抑制紧随的 click（模板 click 处理器里判断） */
  function shouldSuppressClick(): boolean {
    return suppressClick
  }

  // 卸载时收口：不摘监听器会在组件销毁后继续响应 mousemove（内存泄漏 + 幽灵选区）
  onUnmounted(() => {
    clearTimer()
    stopAutoScroll()
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.classList.remove('dt-range-selecting')
  })

  return { onCellMouseDown, shouldSuppressClick, rowDisplayIndex: deps.rowDisplayIndex }
}
