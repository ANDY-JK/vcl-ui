// ⛔ 保护 — 浮动定位，禁止：position 计算逻辑，flip 方向算法
//    需我确认：FlipDirection 枚举扩展、offset 参数默认值
import { ref, onMounted, onUnmounted, watchEffect, type Ref } from 'vue'

export type FlipDirection = 'down' | 'up' | 'left' | 'right'

interface FloatingOptions {
  offset?: number
  defaultDirection?: FlipDirection
  minSize?: number
  /** 浮层最小宽度是否跟随触发器（minWidth = trigger.width） */
  matchWidth?: boolean
  /** 浮层最大宽度是否也跟随触发器（maxWidth = trigger.width），需 matchWidth=true 才生效 */
  maxMatchWidth?: boolean
  /** 浮动面板 z-index，默认 '2000'，弹窗内需调高 */
  zIndex?: string
}

export function useFloating(options: FloatingOptions = {}) {
  const {
    offset = 4,
    defaultDirection = 'down',
    minSize = 120,
    matchWidth = true,
    maxMatchWidth = false,
    zIndex = '2000',
  } = options

  const triggerRef: Ref<HTMLElement | null> = ref(null)
  const floatingRef: Ref<HTMLElement | null> = ref(null)
  const direction = ref<FlipDirection>(defaultDirection)
  const floatingStyle = ref<Record<string, string>>({})

  function updatePosition(triggerEl?: HTMLElement) {
    const trigger = triggerEl || triggerRef.value
    const floating = floatingRef.value
    if (!trigger || !floating) return

    const r = trigger.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const fw = Math.max(floating.offsetWidth, minSize, r.width)
    // 面板实际渲染高度（受 CSS max-height 限制后的值）
    // 面板刚渲染时可能 fh=0，用 minSize 兜底避免方向判断错误
    const fh = floating.offsetHeight || minSize

    // 1. 计算四个方向剩余空间
    const space = {
      down: vh - r.bottom - offset,
      up: r.top - offset,
      right: vw - r.right - offset,
      left: r.left - offset,
    }

    // 2. 选方向：默认方向优先，够就选；不够试反方向；再不够选空间大的
    let dir: FlipDirection
    let top: number
    let left: number
    let maxH: number | null = null

    if (defaultDirection === 'down' || defaultDirection === 'up') {
      // 垂直轴：下/上
      const primaryDown = defaultDirection === 'down'
      const primary = primaryDown ? 'down' : 'up'
      const fallback = primaryDown ? 'up' : 'down'

      if (space[primary] >= fh) {
        dir = primary
      } else if (space[fallback] >= fh) {
        dir = fallback
      } else {
        // 上下都不够 → 选空间大的，动态限高
        dir = space.down >= space.up ? 'down' : 'up'
        maxH = Math.max(space[dir], 80)
      }

      // 计算 top
      if (dir === 'down') {
        top = r.bottom + offset
      } else {
        top = r.top - (maxH || fh) - offset
      }

      // 计算 left：优先左对齐，溢出则右对齐，都溢出贴边
      left = r.left
      if (left + fw > vw - 8) {
        left = r.right - fw
      }
    } else {
      // 水平轴：左/右
      const primaryRight = defaultDirection === 'right'
      const primary = primaryRight ? 'right' : 'left'
      const fallback = primaryRight ? 'left' : 'right'

      if (space[primary] >= fw) {
        dir = primary
      } else if (space[fallback] >= fw) {
        dir = fallback
      } else {
        dir = space.right >= space.left ? 'right' : 'left'
      }

      // 计算 left
      if (dir === 'right') {
        left = r.right + offset
      } else {
        left = r.left - fw - offset
      }

      // 计算 top：垂直居中偏触发器
      top = r.top + (r.height - fh) / 2
    }

    // 3. 边界裁剪（不重叠触发器）
    if (left < 8) left = 8
    if (left + fw > vw - 8) left = Math.max(8, vw - fw - 8)

    const actualH = maxH || fh
    if (top + actualH > vh - 8) top = Math.max(8, vh - actualH - 8)
    if (top < 8) top = 8

    // 4. 防重叠兜底：面板不应盖住触发器
    if (dir === 'down' && top < r.bottom + offset) {
      if (space.up >= actualH) {
        dir = 'up'
        top = r.top - actualH - offset
        maxH = null
      } else {
        top = r.bottom + offset
        if (top + actualH > vh - 8) top = Math.max(8, vh - actualH - 8)
      }
    } else if (dir === 'up' && top + actualH > r.top - offset) {
      if (space.down >= actualH) {
        dir = 'down'
        top = r.bottom + offset
        maxH = null
      } else {
        top = Math.max(8, r.top - actualH - offset)
      }
    }

    // 5. 输出
    direction.value = dir
    const style: Record<string, string> = {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      zIndex,
    }
    if (matchWidth) {
      style.minWidth = `${r.width}px`
      if (maxMatchWidth) {
        style.maxWidth = `${r.width}px`
      }
    }
    if (!style.maxWidth) style.maxWidth = `${Math.max(r.width, vw - 16)}px`
    if (maxH) style.maxHeight = `${maxH}px`
    floatingStyle.value = style
    // 直接操作 DOM 确保即时生效（Vue 异步更新可能导致 requestAnimationFrame 中看到旧值）
    if (floating) {
      floating.style.position = style.position
      floating.style.top = style.top
      floating.style.left = style.left
      floating.style.zIndex = style.zIndex
      if (style.minWidth) floating.style.minWidth = style.minWidth
      if (style.maxWidth) floating.style.maxWidth = style.maxWidth
      if (style.maxHeight) floating.style.maxHeight = style.maxHeight
    }
  }

  /** 打开前预定位到触发器附近，避免从左上角闪现 */
  function prepareOpen() {
    const trigger = triggerRef.value
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    const vh = window.innerHeight
    // 预判方向：下方空间不足且上方更大 → 向上
    const spaceDown = vh - r.bottom - offset
    const spaceUp = r.top - offset
    const shouldFlipUp = spaceDown < spaceUp * 0.3 && spaceUp > 100

    if (shouldFlipUp) {
      direction.value = 'up'
      const style: Record<string, string> = {
        position: 'fixed',
        top: `${Math.max(8, r.top - 200 - offset)}px`, // 预估高度 200px，updatePosition 会修正
        left: `${r.left}px`,
        zIndex,
      }
      floatingStyle.value = style
      const floating = floatingRef.value
      if (floating) {
        floating.style.position = style.position
        floating.style.top = style.top
        floating.style.left = style.left
        floating.style.zIndex = style.zIndex
      }
    } else {
      direction.value = 'down'
      const style: Record<string, string> = {
        position: 'fixed',
        top: `${r.bottom + offset}px`,
        left: `${r.left}px`,
        zIndex,
      }
      floatingStyle.value = style
      const floating = floatingRef.value
      if (floating) {
        floating.style.position = style.position
        floating.style.top = style.top
        floating.style.left = style.left
        floating.style.zIndex = style.zIndex
      }
    }
  }

  // 窗口大小变化时重算位置，保持面板在视口内
  // 不监听 scroll：position:fixed 面板无需跟随滚动，重算反而导致抖动
  let timer: ReturnType<typeof setTimeout> | null = null
  let ro: ResizeObserver | null = null
  function onResize() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(updatePosition, 50)
  }

  onMounted(() => window.addEventListener('resize', onResize))
  onUnmounted(() => {
    window.removeEventListener('resize', onResize)
    if (timer) clearTimeout(timer)
    ro?.disconnect()
  })

  // 监听触发器元素自身尺寸/位置变化，确保浮层跟随
  watchEffect(() => {
    ro?.disconnect()
    if (triggerRef.value && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updatePosition())
      ro.observe(triggerRef.value)
    }
  })

  return { triggerRef, floatingRef, direction, floatingStyle, updatePosition, prepareOpen }
}
