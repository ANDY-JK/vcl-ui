/**
 * useSlider — 滑块拖动逻辑
 * 提取自 ProgressBar.vue 的 interactive 模式
 *
 * 用法：
 *   const { percent, dragging, onPointerDown, onTrackPointerDown, bindGlobalEvents, unbindGlobalEvents } = useSlider({ ... })
 */
import { ref, watch, type Ref } from 'vue'

export interface UseSliderOptions {
  /** 最小值 */
  min: () => number
  /** 最大值 */
  max: () => number
  /** 步进 */
  step: () => number
  /** 是否禁用 */
  disabled: () => boolean
  /** 拖动过程中实时回调（用于 v-model 更新） */
  onDrag: (value: number) => void
  /** 拖动结束回调 */
  onDragEnd: (value: number) => void
}

export interface UseSliderReturn {
  /** 当前百分比 (0-100) */
  percent: Ref<number>
  /** 是否正在拖动 */
  dragging: Ref<boolean>
  /** 滑块拇指 pointerdown */
  onPointerDown: (e: PointerEvent) => void
  /** 轨道 pointerdown */
  onTrackPointerDown: (e: PointerEvent) => void
  /** 绑定全局 pointermove/pointerup */
  bindGlobalEvents: () => void
  /** 解绑全局事件 */
  unbindGlobalEvents: () => void
}

/**
 * 将值吸附到 step 网格
 */
function snapToStep(val: number, min: number, step: number, max: number): number {
  if (step <= 0) return Math.max(min, Math.min(max, val))
  const stepped = Math.round((val - min) / step) * step + min
  return Math.max(min, Math.min(max, stepped))
}

/**
 * 根据 clientX 计算轨道上的值
 */
function posToValue(
  clientX: number,
  trackEl: HTMLElement | null,
  min: number,
  max: number,
  step: number,
): number {
  if (!trackEl) return min
  const rect = trackEl.getBoundingClientRect()
  if (rect.width <= 0) return min
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  return snapToStep(min + ratio * (max - min), min, step, max)
}

export function useSlider(
  options: UseSliderOptions,
  trackRef: Ref<HTMLElement | null>,
  currentValue: () => number,
): UseSliderReturn {
  const percent = ref<number>(0)
  const dragging = ref(false)

  // 同步 percent 到 currentValue
  function syncPercent() {
    const min = options.min()
    const max = options.max()
    const range = max - min
    if (range <= 0) {
      percent.value = 0
    } else {
      percent.value = ((currentValue() - min) / range) * 100
    }
  }

  // 初始化
  syncPercent()

  // 当外部 modelValue 变化时，重新同步 percent
  watch(currentValue, () => syncPercent())

  function handlePointerMove(e: PointerEvent) {
    if (!dragging.value) return
    const val = posToValue(
      e.clientX,
      trackRef.value,
      options.min(),
      options.max(),
      options.step(),
    )
    options.onDrag(val)
  }

  function handlePointerUp() {
    if (dragging.value) {
      options.onDragEnd(currentValue())
    }
    dragging.value = false
  }

  function onPointerDown(e: PointerEvent) {
    if (options.disabled()) return
    dragging.value = true
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    e.preventDefault()
    const val = posToValue(
      e.clientX,
      trackRef.value,
      options.min(),
      options.max(),
      options.step(),
    )
    options.onDrag(val)
  }

  function onTrackPointerDown(e: PointerEvent) {
    if (options.disabled()) return
    dragging.value = true
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const val = posToValue(
      e.clientX,
      trackRef.value,
      options.min(),
      options.max(),
      options.step(),
    )
    options.onDrag(val)
  }

  function bindGlobalEvents() {
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  function unbindGlobalEvents() {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
  }

  return {
    percent,
    dragging,
    onPointerDown,
    onTrackPointerDown,
    bindGlobalEvents,
    unbindGlobalEvents,
  }
}
