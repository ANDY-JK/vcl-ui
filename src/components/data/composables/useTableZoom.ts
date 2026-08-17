// ==================== 缩放 & 密度切换 ====================
import { ref, type Ref, type ComputedRef } from 'vue'

export function useTableZoom(
  props: { dense?: boolean },
  isCardViewEffective: ComputedRef<boolean>,
  tableWrapRef: Ref<HTMLElement | null>,
  scrollContainerRef: Ref<HTMLElement | null>,
) {
  const _dense = ref(props.dense ?? false)
  const _zoomX = ref(1)
  const _zoomY = ref(1)
  const ZOOM_STEP = 0.1
  const ZOOM_MIN = 0.5
  const ZOOM_MAX = 3.0

  function toggleDense() {
    _dense.value = !_dense.value
  }

  function zoomIn() {
    _zoomX.value = Math.min(_zoomX.value + ZOOM_STEP, ZOOM_MAX)
    _zoomY.value = Math.min(_zoomY.value + ZOOM_STEP, ZOOM_MAX)
  }

  /** 当前活跃滚动容器是否有横向溢出 */
  function hasHScroll(): boolean {
    const el = isCardViewEffective.value
      ? tableWrapRef.value?.querySelector('.card-view-scroll') as HTMLElement | null
      : scrollContainerRef.value
    if (!el) return false
    return el.scrollWidth > el.clientWidth + 1
  }

  function zoomOut() {
    const canShrink = _zoomX.value > 1 + 1e-6 || hasHScroll()
    if (!canShrink) return
    const next = Math.max(_zoomX.value - ZOOM_STEP, ZOOM_MIN)
    _zoomX.value = next
    _zoomY.value = next
  }

  function resetZoom() {
    _zoomX.value = 1
    _zoomY.value = 1
  }

  function onTableWheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    if (e.deltaY < 0) zoomIn()
    else if (e.deltaY > 0) zoomOut()
  }

  /** 键盘快捷键：Ctrl+Plus/Minus/0 */
  function onZoomKeydown(e: KeyboardEvent): boolean {
    if (!(e.ctrlKey || e.metaKey)) return false
    const tag = (e.target as HTMLElement)?.tagName
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable
    if (isInput) return false
    if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd') { e.preventDefault(); zoomIn(); return true }
    if (e.key === '-' || e.code === 'NumpadSubtract') { e.preventDefault(); zoomOut(); return true }
    if (e.key === '0' || e.code === 'Numpad0') { e.preventDefault(); resetZoom(); return true }
    return false
  }

  return {
    _dense,
    _zoomX,
    _zoomY,
    toggleDense,
    zoomIn,
    zoomOut,
    resetZoom,
    onTableWheel,
    onZoomKeydown,
    hasHScroll,
  }
}
