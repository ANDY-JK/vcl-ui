// ==================== 浮动定位通用模块 ====================
// 三种使用方式：
// 1. useFloating() — Vue composable，自动绑定 ref、监听 resize/ResizeObserver
// 2. computeFloatingPosition() — 纯函数，适合一次性定位（右键菜单、tooltip）
// 3. computePointerPosition() — 纯函数，跟随鼠标坐标定位（contextmenu 场景）
import { ref, onMounted, onUnmounted, watchEffect, type Ref } from 'vue'

export type FlipDirection = 'down' | 'up' | 'left' | 'right'

/** 定位锚点模式 */
export type AnchorMode = 'element' | 'pointer'

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
  /** 锚点模式：'element' 相对触发元素边框 | 'pointer' 相对鼠标坐标（右键菜单场景） */
  anchor?: AnchorMode
}

// ==================== 纯函数：核心定位算法 ====================

export interface PositionResult {
  top: number
  left: number
  direction: FlipDirection
  maxHeight: number | null
  above: boolean
}

interface PositionInput {
  /** 触发元素的 rect（anchor='element' 时必须） */
  rect?: DOMRect
  /** 鼠标坐标（anchor='pointer' 时必须） */
  clientX?: number
  clientY?: number
  /** 浮层宽度 */
  floatingW: number
  /** 浮层高度（渲染前可传预估高度） */
  floatingH: number
  /** 间距 */
  offset: number
  /** 默认方向 */
  defaultDirection: FlipDirection
  /** 容器边界（用于水平裁剪，默认视口） */
  containerLeft?: number
  containerRight?: number
}

/**
 * 纯函数：计算浮层最佳定位
 * - anchor='element'：以触发元素 rect 为锚点（下拉框、tooltip）
 * - anchor='pointer'：以鼠标坐标为锚点（右键菜单）
 * - 自动 flip：默认方向空间不足时翻转到反方向
 * - 动态限高：上下都不够时选空间大的方向并限高
 * - 边界裁剪：不超出视口/容器
 */
export function computeFloatingPosition(input: PositionInput): PositionResult {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const { floatingW: fw, floatingH: fh, offset, defaultDirection } = input
  const containerLeft = input.containerLeft ?? 0
  const containerRight = input.containerRight ?? vw

  // 锚点坐标：element 模式用 rect 边框，pointer 模式用鼠标坐标
  const anchorLeft = input.rect ? input.rect.left : (input.clientX ?? 0)
  const anchorTop = input.rect ? input.rect.top : (input.clientY ?? 0)
  const anchorRight = input.rect ? input.rect.right : (input.clientX ?? 0)
  const anchorBottom = input.rect ? input.rect.bottom : (input.clientY ?? 0)
  const anchorWidth = input.rect ? input.rect.width : 0

  // 1. 计算四个方向剩余空间
  const space = {
    down: vh - anchorBottom - offset,
    up: anchorTop - offset,
    right: containerRight - anchorRight - offset,
    left: anchorLeft - containerLeft - offset,
  }

  let dir: FlipDirection
  let top: number
  let left: number
  let maxH: number | null = null

  if (defaultDirection === 'down' || defaultDirection === 'up') {
    const primaryDown = defaultDirection === 'down'
    const primary = primaryDown ? 'down' : 'up'
    const fallback = primaryDown ? 'up' : 'down'

    if (space[primary] >= fh) {
      dir = primary
    } else if (space[fallback] >= fh) {
      dir = fallback
    } else {
      dir = space.down >= space.up ? 'down' : 'up'
      maxH = Math.max(space[dir], 80)
    }

    if (dir === 'down') {
      top = anchorBottom + offset
    } else {
      top = anchorTop - (maxH || fh) - offset
    }

    left = anchorLeft
    if (left + fw > containerRight) left = anchorRight - fw
  } else {
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

    if (dir === 'right') {
      left = anchorRight + offset
    } else {
      left = anchorLeft - fw - offset
    }

    top = anchorTop + (anchorWidth > 0 ? (anchorWidth - fh) / 2 : 0)
  }

  // 3. 边界裁剪
  if (left < 8) left = 8
  if (left + fw > vw - 8) left = Math.max(8, vw - fw - 8)

  const actualH = maxH || fh
  if (top + actualH > vh - 8) top = Math.max(8, vh - actualH - 8)
  if (top < 8) top = 8

  // 4. 防重叠兜底
  if (dir === 'down' && top < anchorBottom + offset) {
    if (space.up >= actualH) {
      dir = 'up'
      top = anchorTop - actualH - offset
      maxH = null
    } else {
      top = anchorBottom + offset
      if (top + actualH > vh - 8) top = Math.max(8, vh - actualH - 8)
    }
  } else if (dir === 'up' && top + actualH > anchorTop - offset) {
    if (space.down >= actualH) {
      dir = 'down'
      top = anchorBottom + offset
      maxH = null
    } else {
      top = Math.max(8, anchorTop - actualH - offset)
    }
  }

  return { top, left, direction: dir, maxHeight: maxH, above: dir === 'up' }
}

/**
 * 纯函数：右键菜单定位（跟随鼠标坐标）
 * 返回 { left, top, above } — above=true 时调用方应使用 bottom 定位
 */
export function computePointerPosition(
  clientX: number,
  clientY: number,
  menuW: number,
  menuH: number,
  container?: HTMLElement | null,
): { left: number; top: number; above: boolean } {
  const containerRect = container?.getBoundingClientRect()
  const result = computeFloatingPosition({
    clientX,
    clientY,
    floatingW: menuW,
    floatingH: menuH,
    offset: 4,
    defaultDirection: 'down',
    containerLeft: containerRect?.left,
    containerRight: containerRect?.right,
  })
  // above 模式下 top 保留原始 clientY，调用方用 bottom 定位让菜单底边贴着点击点
  return {
    left: result.left,
    top: result.above ? clientY : result.top,
    above: result.above,
  }
}

// ==================== Vue Composable ====================

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

  function applyStyle(top: number, left: number, dir: FlipDirection, maxH: number | null, triggerWidth: number) {
    const vw = window.innerWidth
    direction.value = dir
    const style: Record<string, string> = {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      zIndex,
    }
    if (matchWidth && triggerWidth > 0) {
      style.minWidth = `${triggerWidth}px`
      if (maxMatchWidth) {
        style.maxWidth = `${triggerWidth}px`
      }
    }
    if (!style.maxWidth) style.maxWidth = `${Math.max(triggerWidth, vw - 16)}px`
    if (maxH) style.maxHeight = `${maxH}px`
    floatingStyle.value = style
    // 直接操作 DOM 确保即时生效
    const floating = floatingRef.value
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

  function updatePosition(triggerEl?: HTMLElement) {
    const trigger = triggerEl || triggerRef.value
    const floating = floatingRef.value
    if (!trigger || !floating) return

    const r = trigger.getBoundingClientRect()
    // matchWidth=false 时面板宽度独立于触发器（如日历面板固有宽度），定位须按面板真实宽度算，
    // 否则宽触发器会把 fw 抬高，右缘溢出判断多移位、面板与触发器脱开
    const fw = matchWidth ? Math.max(floating.offsetWidth, minSize, r.width) : Math.max(floating.offsetWidth, minSize)
    const fh = floating.offsetHeight || minSize

    const result = computeFloatingPosition({
      rect: r,
      floatingW: fw,
      floatingH: fh,
      offset,
      defaultDirection,
    })
    applyStyle(result.top, result.left, result.direction, result.maxHeight, r.width)
  }

  /** 打开前预定位到触发器附近，避免从左上角闪现 */
  function prepareOpen() {
    const trigger = triggerRef.value
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    const vh = window.innerHeight
    const spaceDown = vh - r.bottom - offset
    const spaceUp = r.top - offset
    const shouldFlipUp = spaceDown < spaceUp * 0.3 && spaceUp > 100

    if (shouldFlipUp) {
      direction.value = 'up'
      applyStyle(Math.max(8, r.top - 200 - offset), r.left, 'up', null, r.width)
    } else {
      direction.value = 'down'
      applyStyle(r.bottom + offset, r.left, 'down', null, r.width)
    }
  }

  // 窗口大小变化时重算位置
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

  watchEffect(() => {
    ro?.disconnect()
    if (triggerRef.value && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updatePosition())
      ro.observe(triggerRef.value)
    }
  })

  return { triggerRef, floatingRef, direction, floatingStyle, updatePosition, prepareOpen }
}
