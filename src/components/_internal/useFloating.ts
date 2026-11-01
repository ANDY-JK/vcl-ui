// ==================== 浮动定位通用模块 ====================
// 三种使用方式：
// 1. useFloating() — Vue composable，自动绑定 ref、监听 resize/ResizeObserver
// 2. computeFloatingPosition() — 纯函数，适合一次性定位（右键菜单、tooltip）
// 3. computePointerPosition() — 纯函数，跟随鼠标坐标定位（contextmenu 场景）
import { ref, onMounted, onUnmounted, watchEffect, type Ref } from 'vue'

export type FlipDirection = 'down' | 'up' | 'left' | 'right'

/** 布局坐标系下的可视区域边界 */
export interface ViewportBand {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * 取当前**可视区域**（布局坐标系）。
 *
 * - 有 `visualViewport`（移动端主流浏览器都有）：用它的 `offsetTop/height` ——
 *   键盘弹出、双指缩放时可视区域会缩小/偏移，而布局视口不变。
 * - 没有（桌面老浏览器、SSR、测试环境）：退化为整个布局视口。
 *
 * ⚠️ 返回的是**布局坐标**：`getBoundingClientRect()` 与 `position: fixed` 在移动端
 * 都以布局视口为基准，二者口径一致才能直接比较。
 */
export function getViewportBand(): ViewportBand {
  const vv = typeof window !== 'undefined' ? window.visualViewport : undefined
  if (!vv) {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 0
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0
    return { top: 0, bottom: vh, left: 0, right: vw }
  }
  const top = Math.round(vv.offsetTop)
  const left = Math.round(vv.offsetLeft)
  return {
    top,
    bottom: Math.round(top + vv.height),
    left,
    right: Math.round(left + vv.width),
  }
}

/** resize 连发时合并重算的静默窗口：停止改变这么久才重排一次浮层 */
const RESIZE_COALESCE_MS = 50

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
  /** 指向三角沿浮层主轴的偏移（up/down=距浮层左缘、left/right=距顶缘，已 clamp 到浮层内），
   *  消费方写进 --vcl-arrow-offset 供 .pop-arrow 定位；无触发器概念（pointer 模式）时指向锚点 */
  arrowOffset: number
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
  /**
   * 可视区域（**布局坐标系**里的上下左右边界）。
   *
   * 为什么需要：移动端键盘弹出时，iOS 的 `window.innerHeight` **不变**，
   * 只有 `visualViewport` 变矮。若继续按 innerHeight 算"下方还有多少空间"，
   * 面板会开到键盘下面去；翻转判断也会错。
   *
   * 不传时退化为"整个布局视口"（浏览器桌面默认），行为与改动前完全一致。
   */
  band?: ViewportBand
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
  const band: ViewportBand = input.band ?? { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }
  const { floatingW: fw, floatingH: fh, offset, defaultDirection } = input
  const containerLeft = input.containerLeft ?? band.left
  const containerRight = input.containerRight ?? band.right

  // 锚点坐标：element 模式用 rect 边框，pointer 模式用鼠标坐标
  const anchorLeft = input.rect ? input.rect.left : (input.clientX ?? 0)
  const anchorTop = input.rect ? input.rect.top : (input.clientY ?? 0)
  const anchorRight = input.rect ? input.rect.right : (input.clientX ?? 0)
  const anchorBottom = input.rect ? input.rect.bottom : (input.clientY ?? 0)

  // 1. 计算四个方向剩余空间
  const space = {
    down: band.bottom - anchorBottom - offset,
    up: anchorTop - band.top - offset,
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

    // 垂直居中按触发器「高度」算（此前误用宽度，宽触发器会把浮层推到偏下方）
    top = anchorTop + (input.rect && input.rect.height > 0 ? (input.rect.height - fh) / 2 : 0)
  }

  // 3. 边界裁剪（边距相对**可视**边缘）
  if (left < band.left + 8) left = band.left + 8
  if (left + fw > band.right - 8) left = Math.max(band.left + 8, band.right - fw - 8)

  const actualH = maxH || fh
  if (top + actualH > band.bottom - 8) top = Math.max(band.top + 8, band.bottom - actualH - 8)
  if (top < band.top + 8) top = band.top + 8

  // 4. 防重叠兜底
  if (dir === 'down' && top < anchorBottom + offset) {
    if (space.up >= actualH) {
      dir = 'up'
      top = anchorTop - actualH - offset
      maxH = null
    } else {
      top = anchorBottom + offset
      if (top + actualH > band.bottom - 8) top = Math.max(band.top + 8, band.bottom - actualH - 8)
    }
  } else if (dir === 'up' && top + actualH > anchorTop - offset) {
    if (space.down >= actualH) {
      dir = 'down'
      top = anchorBottom + offset
      maxH = null
    } else {
      top = Math.max(band.top + 8, anchorTop - actualH - offset)
    }
  }

  // 5. 指向三角偏移：触发器中心在浮层主轴上的投影，clamp 到浮层内留 14px 边距（箭头不飘出圆角）
  const ARROW_PAD = 14
  let arrowOffset: number
  if (dir === 'down' || dir === 'up') {
    const anchorCx = (anchorLeft + anchorRight) / 2
    arrowOffset = Math.min(Math.max(anchorCx - left, ARROW_PAD), fw - ARROW_PAD)
  } else {
    const anchorCy = (anchorTop + anchorBottom) / 2
    arrowOffset = Math.min(Math.max(anchorCy - top, ARROW_PAD), Math.max(actualH, 28) - ARROW_PAD)
  }

  return { top, left, direction: dir, maxHeight: maxH, above: dir === 'up', arrowOffset }
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
  const triggerRef: Ref<HTMLElement | null> = ref(null)
  const floatingRef: Ref<HTMLElement | null> = ref(null)
  const direction = ref<FlipDirection>(options.defaultDirection ?? 'down')
  const floatingStyle = ref<Record<string, string>>({})

  // 配置项在每次定位时读取，而非 setup 时解构：调用方可用 getter 传入随 props 变化的配置
  // （如 Popover 的 offset/minSize 随 isTooltip 切换），否则一次求值后动态改动不生效
  const optOffset = () => options.offset ?? 4
  const optDirection = () => options.defaultDirection ?? 'down'
  const optMinSize = () => options.minSize ?? 120
  const optMatchWidth = () => options.matchWidth ?? true
  const optMaxMatchWidth = () => options.maxMatchWidth ?? false
  const optZIndex = () => options.zIndex ?? 'var(--vcl-z-dropdown, 2000)'

  function applyStyle(
    top: number,
    left: number,
    dir: FlipDirection,
    maxH: number | null,
    triggerWidth: number,
    arrowOffset?: number,
  ) {
    const band = getViewportBand()
    const vw = band.right - band.left
    direction.value = dir
    const style: Record<string, string> = {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      zIndex: optZIndex(),
    }
    if (arrowOffset != null) style['--vcl-arrow-offset'] = `${Math.round(arrowOffset)}px`
    if (optMatchWidth() && triggerWidth > 0) {
      style.minWidth = `${triggerWidth}px`
      if (optMaxMatchWidth()) {
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
      if (style['--vcl-arrow-offset']) floating.style.setProperty('--vcl-arrow-offset', style['--vcl-arrow-offset'])
    }
  }

  function updatePosition(triggerEl?: HTMLElement) {
    const trigger = triggerEl || triggerRef.value
    const floating = floatingRef.value
    if (!trigger || !floating) return

    const r = trigger.getBoundingClientRect()
    const minSize = optMinSize()
    // matchWidth=false 时面板宽度独立于触发器（如日历面板固有宽度），定位须按面板真实宽度算，
    // 否则宽触发器会把 fw 抬高，右缘溢出判断多移位、面板与触发器脱开
    const fw = optMatchWidth()
      ? Math.max(floating.offsetWidth, minSize, r.width)
      : Math.max(floating.offsetWidth, minSize)
    const fh = floating.offsetHeight || minSize

    const result = computeFloatingPosition({
      rect: r,
      floatingW: fw,
      floatingH: fh,
      offset: optOffset(),
      defaultDirection: optDirection(),
      // 移动端键盘弹出时可视区域会缩小（innerHeight 不变），必须按可视区域算空间（#308）
      band: getViewportBand(),
    })
    applyStyle(result.top, result.left, result.direction, result.maxHeight, r.width, result.arrowOffset)
  }

  /** 打开前预定位到触发器附近，避免从左上角闪现 */
  function prepareOpen() {
    const trigger = triggerRef.value
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    const band = getViewportBand()
    const offset = optOffset()
    const spaceDown = band.bottom - r.bottom - offset
    const spaceUp = r.top - band.top - offset
    const shouldFlipUp = spaceDown < spaceUp * 0.3 && spaceUp > 100

    if (shouldFlipUp) {
      direction.value = 'up'
      applyStyle(Math.max(8, r.top - 200 - offset), r.left, 'up', null, r.width, r.width / 2)
    } else {
      direction.value = 'down'
      applyStyle(r.bottom + offset, r.left, 'down', null, r.width, r.width / 2)
    }
  }

  // 窗口大小变化时重算位置
  let timer: ReturnType<typeof setTimeout> | null = null
  let ro: ResizeObserver | null = null
  function onResize() {
    if (timer) clearTimeout(timer)
    // resize 是连发事件，合并到停止后一次重算（拖窗口时每帧重排浮层没有意义）
    timer = setTimeout(updatePosition, RESIZE_COALESCE_MS)
  }

  /**
   * 滚动时也要重算（#307）。
   *
   * 浮层是 `position: fixed`（**视口**坐标），而触发器在文档流里。页面一滚，
   * 触发器走了、浮层原地不动 —— 用户看到的是「下拉面板飘在半空」。
   * 内部滚动容器同理（如弹窗里的长列表），所以必须用**捕获阶段**：
   * `scroll` 事件不冒泡，document 上只有捕获才能收到内部容器的滚动。
   *
   * 未打开时（`floatingRef` 为空）直接返回，连定时器都不建 —— 页面上几十个
   * Select 全挂载时也不会因为滚动产生开销。
   */
  function onScroll() {
    if (!floatingRef.value) return
    onResize()
  }

  /**
   * 键盘弹出 / 双指缩放时重算（#308）。
   *
   * iOS Safari 在软键盘弹出时 **不触发 window.resize**（布局视口不变），
   * 只让 `visualViewport` 变小。若不单独监听，面板会停在键盘下面或翻转判断错。
   * 桌面无 `visualViewport` 时整段不执行，零成本。
   */
  function onViewportChange() {
    if (!floatingRef.value) return
    onResize()
  }

  onMounted(() => {
    window.addEventListener('resize', onResize)
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.visualViewport?.addEventListener('resize', onViewportChange)
    window.visualViewport?.addEventListener('scroll', onViewportChange, { passive: true })
  })
  onUnmounted(() => {
    window.removeEventListener('resize', onResize)
    document.removeEventListener('scroll', onScroll, { capture: true })
    window.visualViewport?.removeEventListener('resize', onViewportChange)
    window.visualViewport?.removeEventListener('scroll', onViewportChange)
    if (timer) clearTimeout(timer)
    ro?.disconnect()
  })

  // 触发器与浮层任一尺寸变化都要重算：浮层内异步内容撑高后不重算会溢出视口/翻转方向脱节
  watchEffect(() => {
    ro?.disconnect()
    if (typeof ResizeObserver === 'undefined') return
    ro = new ResizeObserver(() => updatePosition())
    if (triggerRef.value) ro.observe(triggerRef.value)
    if (floatingRef.value) ro.observe(floatingRef.value)
  })

  return { triggerRef, floatingRef, direction, floatingStyle, updatePosition, prepareOpen }
}
