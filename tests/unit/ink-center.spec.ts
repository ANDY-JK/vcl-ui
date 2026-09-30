// inkCenter · 动态光学居中：量当前字体墨迹写 --vcl-ink-dy（替代写死的 translateY 补偿）
// 锁定：无 canvas 优雅降级、墨迹范围→em 值换算、异常值夹回安全边界、无墨迹退回 0、幂等。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { applyInkCentering } from '@/components/_internal/inkCenter'

const rootEl = () => document.documentElement

/** 把 canvas 的 getContext 打成可注入假墨迹的桩：inkTop/inkBot 控制行区间，extent=bot-top */
function stubCanvas(inkTop: number | null, inkBot: number | null, fontSizePx = 13): void {
  const H = 4 * fontSizePx
  const W = 200
  const data = new Uint8ClampedArray(W * H * 4)
  if (inkTop !== null && inkBot !== null) {
    for (let y = inkTop; y <= inkBot; y++) {
      for (let x = 0; x < W; x++) data[(y * W + x) * 4 + 3] = 255 // alpha 通道置满 = 该行有墨迹
    }
  }
  const fakeCtx = {
    clearRect() {},
    fillText() {},
    font: '',
    textBaseline: 'alphabetic',
    fillStyle: '#000',
    getImageData(_x: number, _y: number, w: number, h: number) {
      return { data: data.slice(0, w * h * 4), width: w, height: h }
    },
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D)
}

afterEach(() => {
  vi.restoreAllMocks()
  rootEl().style.removeProperty('--vcl-ink-dy')
})

describe('applyInkCentering · 动态量墨迹写 --vcl-ink-dy', () => {
  it('无 canvas（getContext 返回 null）：返回 0，不写字面，优雅降级到基线', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as unknown as CanvasRenderingContext2D)
    const em = applyInkCentering(13)
    expect(em).toBe(0)
    expect(rootEl().style.getPropertyValue('--vcl-ink-dy')).toBe('')
  })

  it('墨迹范围 12 < em 13：写负 em（向上收），值 = (12-13)/(2*13) ≈ -0.038', () => {
    stubCanvas(21, 33) // extent = 33-21 = 12
    const em = applyInkCentering(13)
    expect(em).toBeCloseTo((12 - 13) / (2 * 13), 4) // -0.0385
    expect(rootEl().style.getPropertyValue('--vcl-ink-dy')).toBe('-0.038em')
  })

  it('墨迹范围异常大（59 > em）：夹回安全上限 0.25em，不甩出控件', () => {
    stubCanvas(0, 59) // extent = 59
    const em = applyInkCentering(13)
    expect(em).toBe(0.25)
    expect(rootEl().style.getPropertyValue('--vcl-ink-dy')).toBe('0.250em')
  })

  it('样本无墨迹（全透明）：退回 0，不写字面', () => {
    stubCanvas(null, null)
    const em = applyInkCentering(13)
    expect(em).toBe(0)
    expect(rootEl().style.getPropertyValue('--vcl-ink-dy')).toBe('')
  })

  it('亚像素噪声（|em|<0.004）归零：写 0，不产生无意义位移', () => {
    stubCanvas(21, 34) // extent = 13 = em → e=0
    const em = applyInkCentering(13)
    expect(em).toBe(0)
    expect(rootEl().style.getPropertyValue('--vcl-ink-dy')).toBe('0')
  })

  it('幂等：重复调用按同一字体重算，值稳定', () => {
    stubCanvas(21, 33)
    const a = applyInkCentering(13)
    const b = applyInkCentering(13)
    expect(a).toBe(b)
    expect(a).toBeCloseTo(-1 / 26, 4)
  })
})
