/**
 * 湖南门店巡访路线规划器 — 类型定义
 */

/** 坐标来源 */
export type CoordSource = 'original' | 'address_geocode' | 'township_geocode' | 'manual' | 'none'

/** 门店 */
export interface Store {
  id: string
  name: string // 门店名
  address: string // 详细地址
  province: string // 省
  city: string // 市
  district: string // 区/县
  town: string // 镇/乡
  contact: string // 联系人
  phone: string // 电话
  longitude: number | null // 经度
  latitude: number | null // 纬度
  coordSource: CoordSource // 坐标来源
  skipped: boolean // 是否跳过
  note?: string // 备注
  /** 拜访预计耗时（分钟），默认 30 分钟 */
  visitMinutes?: number
  /** 原始四级乡镇字符串（Excel 导入时保留，地理编码降级用） */
  fullAddr?: string
  /** 是否为乡镇标记（仅有四级乡镇无具体门店名） */
  isTownshipMarker?: boolean
}

/** 门店分组 */
export interface StoreGroup {
  id: string
  name: string // 城市名
  storeIds: string[]
  color: string // 地图标记颜色
  centroid: { lat: number; lon: number } // 质心
}

/** 单段导航链接 */
export interface NavLink {
  label: string // 显示文字（如"门店A → 门店B"）
  url: string // 高德深度链接（iOS/Android）
  webUrl: string // Web 兜底 URL
}

/** 每日计划 */
export interface DayPlan {
  day: number
  stores: Store[] // 当天访问门店
  drivingTimeMin: number // 驾驶时间（分钟）
  drivingDistanceM: number // 驾驶距离（米）
  routePolyline?: [number, number][] // 路线坐标串
  accommodation: Accommodation | null // 住宿建议
  returnLeg?: { distanceM: number; timeMin: number } | null // 回程段（仅最后一天）
  navLink?: NavLink // 当天整体导航链接
  legNavLinks?: NavLink[] // 每个门店段的导航链接
}

/** 住宿建议 */
export interface Accommodation {
  name: string
  address: string
  lat: number
  lon: number
  distanceM?: number // 距当天最后一个门店的距离
  type?: string // 类型：酒店/宾馆/旅馆
}

/** 路线规划结果 */
export interface RoutePlan {
  days: DayPlan[]
  totalStores: number
  totalSkipped: number
  totalDays: number
  totalDrivingTimeMin: number
  totalDrivingDistanceM: number
  startPoint: { lat: number; lon: number }
  skippedStores: Store[]
}

/** 路线规划选项 */
export interface RouteOptions {
  stores: Store[]
  startPoint?: { lat: number; lon: number } // 起点（可选，默认使用第一个门店）
  dailyLimitHours?: number // 每日驾驶+拜访总时长上限（默认 8）
  maxStoresPerDay?: number // 每天最多门店数（默认 8）
  maxSegmentKm?: number // 单段最大距离（默认 100km）
  maxDetourKm?: number // 最大绕路成本（默认 50km），超过则跳过该门店
  roadFactor?: number // 道路系数（默认 1.4）
  avgSpeedKmh?: number // 平均速度（默认 50km/h）
  clusterRadiusKm?: number // 聚类半径（默认 30km）
  /** 每家门店默认拜访时长（分钟），门店自身的 visitMinutes 优先。默认 30 */
  defaultVisitMinutes?: number
  /** 每日驾驶时间上限（分钟），超过则分天。默认 240（4 小时），避免整天都在开车 */
  maxDrivingMinutesPerDay?: number
  /** 计划总天数（设置后自动调整每日上限以适配天数，默认 0=自动） */
  targetDays?: number
}

/** 坐标解析结果 */
export interface CoordResult {
  longitude: number
  latitude: number
  source: CoordSource
}

/** 导入结果 */
export interface ImportResult {
  stores: Partial<Store>[]
  needGeocode: Partial<Store>[]
  startPoint?: { name: string; address: string } | null
}

/** 进度回调 */
export type ProgressCallback = (current: number, total: number) => void
