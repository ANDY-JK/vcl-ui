/**
 * annotation-types — ImagePreview 标注类型族（自 ImagePreview.vue 下沉，M3 持续拆分）
 * 类型导出使标注绘制/导出等工具模块（image-anno-paint 等）可共享同一契约而不反向
 * import 组件文件。
 */

/** 标注工具：仅保留矩形 / 圆形 / 画笔 */
export type AnnoType = 'rect' | 'circle' | 'pen'

interface AnnoBase {
  type: AnnoType
  id: string
  color: string
  /** 线宽 */
  lw: number
}

/** 矩形标注（stage 坐标；负宽/高 = 向左/上拖拽，绘制时归一化） */
export interface RectAnno extends AnnoBase {
  type: 'rect'
  x: number
  y: number
  w: number
  h: number
}

/** 圆形（椭圆）标注 */
export interface CircleAnno extends AnnoBase {
  type: 'circle'
  x: number
  y: number
  w: number
  h: number
}

/** 画笔自由路径 */
export interface PenAnno extends AnnoBase {
  type: 'pen'
  points: { x: number; y: number }[]
}

export type Annotation = RectAnno | CircleAnno | PenAnno
