/**
 * image-anno-paint — ImagePreview 标注的纯绘制/映射函数（自 ImagePreview.vue 下沉，M3 持续拆分）
 *
 * paintAnno：把一条标注画到 canvas 上下文（s 为缩放因子，导出合成图时按图片像素重绘；
 * sel 为选中高亮：虚线框 + 四角白色把手）。纯函数——无组件状态，仅吃 ctx/标注数据，
 * 可直接单测（mock CanvasRenderingContext2D 断言调用序列）。
 * mapAnnoToImage：stage 坐标 → 图片像素坐标的映射（导出合成用，纯函数可测）。
 */
import type { Annotation } from './annotation-types'

/** 绘制单条标注；s 为缩放因子（导出合成图时按图片像素重绘），sel 为选中高亮 */
export function paintAnno(ctx: CanvasRenderingContext2D, a: Annotation, sel: boolean, s = 1): void {
  // 导出时线宽保底 2px：过细描边（如 1.5px）抗锯齿后几乎不可见
  const lw = Math.max(2, a.lw * s)
  ctx.strokeStyle = a.color
  ctx.fillStyle = a.color
  ctx.lineWidth = lw

  if (a.type === 'rect') {
    // 宽高**逐轴**归一化（#497）：拖拽有四个方向，w 与 h 可以异号（左下拖 / 右上拖）。
    // canvas 的 strokeRect 对负 w/h 本来就会自动归一化，但**命中检测那边不会** ——
    // 两边必须用同一个矩形，否则"画得出来却点不中"。这里统一成永远为正的区域，
    // 让绘制与 hitTest 的形状在代码上也一致，而不是靠 canvas 隐形兜底。
    const rx = a.w >= 0 ? a.x : a.x + a.w
    const ry = a.h >= 0 ? a.y : a.y + a.h
    const rw = Math.abs(a.w)
    const rh = Math.abs(a.h)
    if (sel) ctx.setLineDash([5, 3])
    else ctx.setLineDash([])
    ctx.strokeRect(rx, ry, rw, rh)
    if (sel) {
      const corners = [
        { x: rx, y: ry },
        { x: rx + rw, y: ry },
        { x: rx, y: ry + rh },
        { x: rx + rw, y: ry + rh },
      ]
      ctx.setLineDash([])
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1
      for (const c of corners) {
        ctx.fillRect(c.x - 4, c.y - 4, 8, 8)
        ctx.strokeRect(c.x - 4, c.y - 4, 8, 8)
      }
    }
  } else if (a.type === 'circle') {
    const cx = a.x + a.w / 2
    const cy = a.y + a.h / 2
    const rx = Math.abs(a.w) / 2
    const ry = Math.abs(a.h) / 2
    if (sel) ctx.setLineDash([5, 3])
    else ctx.setLineDash([])
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
    if (sel) {
      ctx.setLineDash([])
      const corners = [
        { x: a.x, y: a.y },
        { x: a.x + a.w, y: a.y },
        { x: a.x, y: a.y + a.h },
        { x: a.x + a.w, y: a.y + a.h },
      ]
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1
      for (const c of corners) {
        ctx.fillRect(c.x - 4, c.y - 4, 8, 8)
        ctx.strokeRect(c.x - 4, c.y - 4, 8, 8)
      }
    }
  } else if (a.type === 'pen') {
    ctx.lineCap = 'round'
    ctx.setLineDash([])
    const trace = () => {
      ctx.beginPath()
      for (let i = 0; i < a.points.length; i++) {
        const p = a.points[i]
        if (i === 0) {
          ctx.moveTo(p.x, p.y)
        } else {
          ctx.lineTo(p.x, p.y)
        }
      }
    }
    // 选中高亮 = 白色描边**垫底**（第 182 轮）：此前 sel 分支只 stroke 一次白线，
    // 把彩色线条整个替换掉 —— 浅色图片上选中的画笔标注几乎隐形。
    // rect/circle 的选中语义是「彩色本体 + 高亮装饰」，pen 应同口径：白描边在下，彩线在上。
    if (sel) {
      trace()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = lw + 2 * s
      ctx.stroke()
    }
    ctx.strokeStyle = a.color
    ctx.lineWidth = lw
    trace()
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.globalAlpha = 1
}

/** 标注坐标从 stage 像素映射到图片像素（导出合成图时按当前缩放平移对齐） */
export function mapAnnoToImage(a: Annotation, sx: number, sy: number, offX: number, offY: number): Annotation {
  if (a.type === 'pen') return { ...a, points: a.points.map((p) => ({ x: (p.x - offX) * sx, y: (p.y - offY) * sy })) }
  return { ...a, x: (a.x - offX) * sx, y: (a.y - offY) * sy, w: a.w * sx, h: a.h * sy }
}
