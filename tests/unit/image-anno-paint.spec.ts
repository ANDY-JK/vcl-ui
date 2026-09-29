// image-anno-paint 纯函数锁定（M3 下沉：标注绘制/映射从 ImagePreview.vue 抽出）
// mapAnnoToImage：stage 像素 → 图片像素映射（导出合成图的对齐依据）
// paintAnno：标注绘制契约（mock 2D 上下文断言关键调用序列）
import { describe, it, expect } from 'vitest'
import { paintAnno, mapAnnoToImage } from '@/components/data/composables/image-anno-paint'
import type { Annotation } from '@/components/data/composables/annotation-types'

describe('mapAnnoToImage · 坐标映射', () => {
  it('rect：x/y/w/h 按 (p-off)*scale 平移缩放', () => {
    const a = mapAnnoToImage({ type: 'rect', id: '1', color: '#f00', lw: 2, x: 100, y: 50, w: 40, h: 20 }, 2, 3, 10, 5)
    expect(a).toMatchObject({ x: 180, y: 135, w: 80, h: 60 })
  })

  it('pen：每个点独立映射，点数量守恒', () => {
    const pts = [
      { x: 10, y: 10 },
      { x: 20, y: 30 },
      { x: 40, y: 50 },
    ]
    const a = mapAnnoToImage({ type: 'pen', id: 'p', color: '#000', lw: 4, points: pts }, 2, 2, 0, 0)
    expect(a.type).toBe('pen')
    if (a.type !== 'pen') return
    expect(a.points).toHaveLength(3)
    expect(a.points[1]).toEqual({ x: 40, y: 60 })
  })

  it('元数据（id/color/lw/type）原样保留', () => {
    const out = mapAnnoToImage({ type: 'circle', id: 'c', color: '#123', lw: 6, x: 1, y: 1, w: 1, h: 1 }, 1, 1, 0, 0)
    expect(out).toMatchObject({ type: 'circle', id: 'c', color: '#123', lw: 6 })
  })

  it('零缩放/零偏移=恒等', () => {
    const a: Annotation = { type: 'circle', id: 'c', color: '#000', lw: 2, x: 5, y: 6, w: 7, h: 8 }
    expect(mapAnnoToImage(a, 1, 1, 0, 0)).toEqual(a)
  })
})

/** 2D 上下文 mock：记录调用序列供断言 */
function mockCtx(): { ctx: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = []
  const rec = (m: string) => calls.push(m)
  const ctx = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: 'butt' as CanvasLineCap,
    globalAlpha: 1,
    setLineDash(d: number[]) {
      rec(`dash:${d.join(',')}`)
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      rec(`strokeRect:${x},${y},${w},${h}`)
    },
    fillRect() {
      rec('fillRect')
    },
    beginPath() {
      rec('beginPath')
    },
    ellipse(cx: number, cy: number, rx: number, ry: number) {
      rec(`ellipse:${cx},${cy},${rx},${ry}`)
    },
    stroke() {
      rec('stroke')
    },
    moveTo(x: number, y: number) {
      rec(`moveTo:${x},${y}`)
    },
    lineTo(x: number, y: number) {
      rec(`lineTo:${x},${y}`)
    },
  } as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

describe('paintAnno · 绘制契约', () => {
  it('rect 未选中：实线描边（dash 空）', () => {
    const { ctx, calls } = mockCtx()
    paintAnno(ctx, { type: 'rect', id: '1', color: '#f00', lw: 3, x: 1, y: 2, w: 10, h: 5 }, false)
    expect(calls).toContain('dash:')
    expect(calls).toContain('strokeRect:1,2,10,5')
    expect(calls).not.toContain('fillRect')
  })

  it('rect 选中：虚线 + 四角白把手（fillRect×4）', () => {
    const { ctx, calls } = mockCtx()
    paintAnno(ctx, { type: 'rect', id: '1', color: '#f00', lw: 3, x: 1, y: 2, w: 10, h: 5 }, true)
    expect(calls).toContain('dash:5,3')
    expect(calls).toContain('fillRect')
    expect(calls.filter((c) => c === 'fillRect')).toHaveLength(4)
  })

  it('负宽高拖拽：归一化为正区域描边', () => {
    const { ctx, calls } = mockCtx()
    // 从 (10,10) 向左拖到 (0,0)：w=-10,h=-5 → 归一化 x=0,y=5,w=10,h=5
    paintAnno(ctx, { type: 'rect', id: '1', color: '#000', lw: 2, x: 10, y: 10, w: -10, h: -5 }, false)
    expect(calls).toContain('strokeRect:0,5,10,5')
  })

  it('pen：moveTo 首点 + lineTo 后续，选中加粗白描边', () => {
    const { ctx, calls } = mockCtx()
    const pen = {
      type: 'pen' as const,
      id: 'p',
      color: '#000',
      lw: 2,
      points: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
    }
    paintAnno(ctx, pen, false)
    expect(calls).toContain('moveTo:1,1')
    expect(calls).toContain('lineTo:2,2')
    paintAnno(ctx, pen, true)
    expect(calls.filter((c) => c === 'lineTo:2,2')).toHaveLength(2)
  })

  it('lineWidth 保底 2px（导出 s=1 时 1.5px 描边按 2 画）', () => {
    const { ctx } = mockCtx()
    paintAnno(ctx, { type: 'rect', id: '1', color: '#000', lw: 1.5, x: 0, y: 0, w: 1, h: 1 }, false)
    expect(ctx.lineWidth).toBe(2)
  })
})
