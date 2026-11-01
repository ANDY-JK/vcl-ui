/**
 * 移动端键盘 / 双指缩放对浮层定位的影响（#308）
 *
 * ## 缺陷
 *
 * iOS Safari 软键盘弹出时 **不触发 window.resize**（布局视口不变），只让
 * `visualViewport` 变矮。原来的定位全部读 `window.innerHeight`：
 *   · "下方还有多少空间"被高估 → 面板开到**键盘下面**
 *   · 翻转判断也跟着错（明明下方没空间却认为够）
 *
 * ## 口径
 *
 * `getViewportBand()` 返回**布局坐标系**下的可视边界（`visualViewport.offsetTop/height`），
 * 无 `visualViewport` 时退化为整个布局视口 —— 桌面行为零变化。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { getViewportBand, computeFloatingPosition } from '@/components/_internal/useFloating'

afterEach(() => {
  vi.unstubAllGlobals()
  delete (window as unknown as { visualViewport?: unknown }).visualViewport
})

/** 造一个可控的 visualViewport */
function stubVisualViewport(v: { offsetTop: number; offsetLeft?: number; height: number; width: number }) {
  Object.defineProperty(window, 'visualViewport', {
    value: {
      offsetTop: v.offsetTop,
      offsetLeft: v.offsetLeft ?? 0,
      height: v.height,
      width: v.width,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    configurable: true,
    writable: true,
  })
}

const rect = (top: number, height = 32): DOMRect =>
  ({ top, bottom: top + height, left: 20, right: 220, width: 200, height }) as DOMRect

describe('getViewportBand', () => {
  it('无 visualViewport → 整个布局视口', () => {
    const band = getViewportBand()
    expect(band.top).toBe(0)
    expect(band.left).toBe(0)
    expect(band.bottom).toBe(window.innerHeight)
    expect(band.right).toBe(window.innerWidth)
  })

  it('**键盘弹出后 bottom 跟着可视高度缩**（不是 innerHeight）', () => {
    stubVisualViewport({ offsetTop: 0, height: 320, width: 390 })
    const band = getViewportBand()
    expect(band.bottom, '可视高度只有 320，不能再用 innerHeight').toBe(320)
    expect(band.top).toBe(0)
  })

  it('**可视区域被顶上去时 top 跟着 offsetTop**', () => {
    stubVisualViewport({ offsetTop: 120, height: 400, width: 390 })
    const band = getViewportBand()
    expect(band.top).toBe(120)
    expect(band.bottom).toBe(520)
  })
})

describe('computeFloatingPosition · 用可视区域判定空间', () => {
  it('**键盘占掉下半屏 → 向下放不下，应翻到上方**', () => {
    // 触发器在 y=300，可视区域只到 320（键盘占了下面）
    const r = rect(300, 20)
    const downBand = { top: 0, bottom: 320, left: 0, right: 390 }
    const res = computeFloatingPosition({
      rect: r,
      floatingW: 200,
      floatingH: 160,
      offset: 4,
      defaultDirection: 'down',
      band: downBand,
    })
    expect(res.direction, '下方只剩 320-320-4=负空间，必须翻转').toBe('up')
    expect(res.top, '上翻后不能超出可视区域上沿').toBeGreaterThanOrEqual(downBand.top + 8)
  })

  it('**不传 band 时行为与改动前一致**（按整个布局视口）', () => {
    const r = rect(100, 32)
    const withDefault = computeFloatingPosition({
      rect: r,
      floatingW: 200,
      floatingH: 100,
      offset: 4,
      defaultDirection: 'down',
    })
    const withExplicit = computeFloatingPosition({
      rect: r,
      floatingW: 200,
      floatingH: 100,
      offset: 4,
      defaultDirection: 'down',
      band: { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth },
    })
    expect(withDefault).toEqual(withExplicit)
  })

  it('**浮层不被压到可视区域外**（band.top 偏移时下沿裁剪跟着走）', () => {
    const band = { top: 200, bottom: 500, left: 0, right: 390 }
    const res = computeFloatingPosition({
      rect: rect(440, 24),
      floatingW: 200,
      floatingH: 300,
      offset: 4,
      defaultDirection: 'down',
      band,
    })
    expect(res.top).toBeGreaterThanOrEqual(band.top + 8)
    const maxH = res.maxHeight ?? 300
    expect(res.top + maxH, '下沿不得超过可视区域（留 8px）').toBeLessThanOrEqual(band.bottom - 8 + 1)
  })
})
