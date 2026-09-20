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

// ════════════════════════════════════════════════════════════
// 高德 JS SDK 运行时边界（@vuemap/vue-amap 不提供完整类型，AMap 是运行时全局）
//
// 为什么是 any：这些符号来自高德运行时注入的全局 AMap（插件加载后才存在），
// 官方 @amap/amap-jsapi-types 与 vuemap 的封装都没把它们的构造签名导全。
// 本文件只声明 AmapWidget 实际用到的最小面 —— 新增用法时在此扩展，
// 不要把 any 散回组件里（那会让"SDK 边界"和"偷懒"混为一谈）。
// ════════════════════════════════════════════════════════════

/** 经纬度（高德 LngLat 的最小面） */
export interface AmapLngLat {
  getLng(): number
  getLat(): number
}

/** 地图实例（AmapWidget 实际用到的方法） */
export interface AmapMapInstance {
  plugin(plugins: string[], cb: () => void): void
  addControl(ctrl: unknown): void
  on(event: string, cb: (e: unknown) => void): void
  add(marker: unknown): void
  remove(marker: unknown): void
  destroy(): void
  setCenter(center: [number, number]): void
  setZoom(zoom: number): void
  setZoomAndCenter(zoom: number, center: [number, number]): void
  clearMap(): void
  setFitView(overlays: unknown, immediately: boolean, padding: [number, number, number, number]): void
}

/** 信息窗实例（AmapWidget 实际用到的方法） */
export interface AmapInfoWindow {
  setContent(html: string): void
  // map 参数收 unknown：高德 InfoWindow.open 的地图参数与 vuemap 封装的 Map 类型
  // 是两套类型，此处只表达「需要传地图实例」这个意图，不绑定任一家的完整形状
  open(map: unknown, position: unknown): void
  close(): void
}

/** 地图点击事件（只用 lnglat） */
export interface AmapMapClickEvent {
  lnglat?: AmapLngLat
}

/** 高德全局命名空间：构造器在运行时按需存在，故值为 unknown，组件侧按需断言 */
export type AmapNamespace = Record<string, unknown>

/** 标记点击事件 */
export interface AmapMarkerClickEvent {
  target?: { getExtData?: () => unknown }
}

/**
 * 从 AMap 命名空间取构造器的断言辅助：
 *   AMap 是运行时全局，命名空间里取出的值是 unknown；SDK 的构造签名官方类型没导全，
 *   这里用「可 new + 收 unknown 参数」的最小形状表达。四个构造点（InfoWindow/Pixel/
 *   Marker/Icon）共用这一个断言，比四处裸构造断言更能说明这是 SDK 边界。
 */
export type AmapCtor<T = unknown> = new (...args: unknown[]) => T

/** 标记实例（AmapWidget 实际用到的方法） */
export interface AmapMarkerInstance {
  on(event: string, cb: () => void): void
  getPosition(): [number, number]
}
