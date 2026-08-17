// ==================== 滚动进度条（可点击跳转 + 可拖拽滚动） ====================
import { ref, watch, onUnmounted, nextTick, type Ref, type ComputedRef } from 'vue'

export function useTableScrollProgress(
  tableWrapRef: Ref<HTMLElement | null>,
  scrollContainerRef: Ref<HTMLElement | null>,
  isCardViewEffective: ComputedRef<boolean>,
  /** 跟踪的响应式数据（数据变化后重新检测溢出） */
  displayData: ComputedRef<Record<string, any>[]>,
  /** 缩放系数（缩放后重新检测） */
  zoomX: Ref<number>,
  zoomY: Ref<number>,
) {
  const _scrollProgress = ref(0)
  const _scrollable = ref(false)
  let _progressRafId = 0

  function onScrollProgress(e: Event) {
    if (_progressRafId) return
    _progressRafId = requestAnimationFrame(() => {
      _progressRafId = 0
      const el = e.target as HTMLElement
      const max = el.scrollHeight - el.clientHeight
      _scrollable.value = max > 0
      _scrollProgress.value = max > 0 ? Math.round((el.scrollTop / max) * 100) : 0
    })
  }

  /** 从进度条向上找到 .table-wrap，再向下找当前活跃的滚动容器 */
  function findScrollEl(barEl: HTMLElement): HTMLElement | null {
    const wrap = barEl.closest('.table-wrap')
    if (!wrap) return null
    return wrap.querySelector('.card-view-scroll') ?? wrap.querySelector('.table-scroll')
  }

  function seekScroll(clientX: number, barEl: HTMLElement) {
    const el = findScrollEl(barEl)
    if (!el) return
    const rect = barEl.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const target = Math.round(pct * (el.scrollHeight - el.clientHeight))
    el.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior })
    const progress = barEl.querySelector('.table-progress') as HTMLElement
    if (progress) progress.style.width = Math.round(pct * 100) + '%'
  }

  let _dragBar: HTMLElement | null = null
  function onProgressDragMove(e: MouseEvent) {
    if (_dragBar) seekScroll(e.clientX, _dragBar)
  }
  function onProgressDragEnd() {
    _dragBar = null
    document.removeEventListener('mousemove', onProgressDragMove)
    document.removeEventListener('mouseup', onProgressDragEnd)
  }
  function onProgressMouseDown(e: MouseEvent) {
    _dragBar = e.currentTarget as HTMLElement
    seekScroll(e.clientX, _dragBar)
    document.addEventListener('mousemove', onProgressDragMove)
    document.addEventListener('mouseup', onProgressDragEnd)
  }

  /** 主动检测当前活跃滚动容器是否有纵向溢出，驱动进度条显隐 */
  function checkScrollable() {
    nextTick(() => {
      const el = isCardViewEffective.value
        ? tableWrapRef.value?.querySelector('.card-view-scroll') as HTMLElement | null
        : scrollContainerRef.value
      if (el) {
        _scrollable.value = el.scrollHeight > el.clientHeight
      }
    })
  }

  // 挂载 + 数据变更后重新检测
  watch([displayData, isCardViewEffective], () => checkScrollable())
  // 缩放后重新检测
  watch([zoomX, zoomY], () => { nextTick(() => checkScrollable()) })

  onUnmounted(() => { if (_progressRafId) cancelAnimationFrame(_progressRafId) })

  return {
    _scrollProgress,
    _scrollable,
    onScrollProgress,
    onProgressMouseDown,
    checkScrollable,
  }
}
