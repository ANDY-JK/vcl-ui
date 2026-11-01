/**
 * computeFloatingPosition —— 纯函数定位算法的边界分支（#293）
 *
 * ## 为什么补
 *
 * 覆盖率实测该文件 79.26% / 分支 66.44%，**未覆盖的正是最容易出事的那几段**：
 * `140-169`（边界裁剪 + 防重叠兜底 + flip）、`227`（arrow 偏移 clamp）、
 * `248-265`（限高分支）、`297-320`（resize/scroll 重算）。
 * 而这几段正是"下拉框在屏幕底部弹不出来""浮层盖住触发器""箭头飘出圆角"的直接原因。
 *
 * ## 手法
 *
 * 视口在 happy-dom 里可写：`window.innerWidth/innerHeight` 直接赋值即可。
 * 全部用整数坐标，避免浮点断言抖动。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { computeFloatingPosition } from '@/components/_internal/useFloating'

const VW = 1200
const VH = 800

const origW = Object.getOwnPropertyDescriptor(window, 'innerWidth')
const origH = Object.getOwnPropertyDescriptor(window, 'innerHeight')

function setViewport(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true, writable: true })
}

/** 造一个 DOMRect（只需 left/top/right/bottom/width/height） */
function rect(left: number, top: number, w: number, h: number): DOMRect {
  return {
    left,
    top,
    right: left + w,
    bottom: top + h,
    width: w,
    height: h,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

describe('computeFloatingPosition · 边界与翻转', () => {
  beforeEach(() => setViewport(VW, VH))
  afterEach(() => {
    if (origW) Object.defineProperty(window, 'innerWidth', origW)
    if (origH) Object.defineProperty(window, 'innerHeight', origH)
  })

  it('空间充足：按默认方向向下展开', () => {
    const r = computeFloatingPosition({
      rect: rect(100, 100, 120, 32),
      floatingW: 200,
      floatingH: 150,
      offset: 6,
      defaultDirection: 'down',
    })
    expect(r.direction).toBe('down')
    expect(r.top).toBe(138) // 100 + 32 + 6
    expect(r.maxHeight).toBe(null)
    expect(r.above).toBe(false)
  })

  it('**下方不够、上方够 → 翻转到上方**', () => {
    const r = computeFloatingPosition({
      rect: rect(100, 700, 120, 32),
      floatingW: 200,
      floatingH: 200,
      offset: 6,
      defaultDirection: 'down',
    })
    expect(r.direction).toBe('up')
    expect(r.above).toBe(true)
    expect(r.top).toBe(700 - 200 - 6)
  })

  it('**上下都不够 → 取空间大的一侧并限高**', () => {
    // 视口 800：触发器在中间，上下各约 380，浮层要 700 装不下
    const r = computeFloatingPosition({
      rect: rect(100, 380, 120, 32),
      floatingW: 200,
      floatingH: 700,
      offset: 6,
      defaultDirection: 'down',
    })
    expect(r.maxHeight, '限高必须给出').not.toBe(null)
    expect(r.maxHeight!, '至少留 80px 可用').toBeGreaterThanOrEqual(80)
    // 选空间大的一侧：上面 380 vs 下面 800-412-6=382 → 下面略大
    expect(r.direction).toBe('down')
    // 关键：限高后不许把浮层顶到视口外
    expect(r.top + r.maxHeight!).toBeLessThanOrEqual(VH)
    expect(r.top).toBeGreaterThanOrEqual(0)
  })

  it('**水平方向不许超出视口**（贴右边时左移）', () => {
    const r = computeFloatingPosition({
      rect: rect(1150, 100, 40, 32),
      floatingW: 300,
      floatingH: 100,
      offset: 6,
      defaultDirection: 'down',
    })
    expect(r.left + 300).toBeLessThanOrEqual(VW)
    expect(r.left).toBeGreaterThanOrEqual(0)
  })

  it('**贴左边时不留负坐标**', () => {
    const r = computeFloatingPosition({
      rect: rect(2, 100, 40, 32),
      floatingW: 300,
      floatingH: 100,
      offset: 6,
      defaultDirection: 'down',
    })
    expect(r.left).toBeGreaterThanOrEqual(0)
  })

  it('**箭头偏移被 clamp 在浮层内**（浮层很窄时也不飘出圆角）', () => {
    // 触发器中心在浮层最左缘附近
    const r = computeFloatingPosition({
      rect: rect(600, 100, 10, 32),
      floatingW: 60,
      floatingH: 100,
      offset: 6,
      defaultDirection: 'down',
    })
    expect(r.arrowOffset).toBeGreaterThanOrEqual(14)
    expect(r.arrowOffset).toBeLessThanOrEqual(60 - 14)
  })

  it('容器边界（非视口）参与水平裁剪', () => {
    const r = computeFloatingPosition({
      rect: rect(900, 100, 40, 32),
      floatingW: 200,
      floatingH: 100,
      offset: 6,
      defaultDirection: 'down',
      containerLeft: 100,
      containerRight: 1000,
    })
    expect(r.left + 200).toBeLessThanOrEqual(1000)
    expect(r.left).toBeGreaterThanOrEqual(100)
  })
})
