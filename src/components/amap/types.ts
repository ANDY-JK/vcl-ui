/**
 * amap 域类型定义 — 独立文件，供 AmapWidget 与外部消费方复用
 *
 * 注意：MarkerItem 定义在独立模块（而非 <script setup> 内），
 * 以便 vite-plugin-dts 生成类型声明时不触发 TS4082「私有名」错误。
 */

/** 地图标记项 */
export interface MarkerItem<T = Record<string, unknown>> {
  /** 经度 */
  longitude: number
  /** 纬度 */
  latitude: number
  /** 标记标题 */
  title?: string
  /** 标记颜色：red / blue / green（默认 blue） */
  color?: 'red' | 'blue' | 'green'
  /** 自定义图标 URL */
  iconUrl?: string
  /** 标记大小 [width, height] */
  iconSize?: [number, number]
  /** 弹出信息窗内容（HTML 字符串） */
  infoWindow?: string
  /** 自定义数据（emit 时回传） */
  data?: T
}
