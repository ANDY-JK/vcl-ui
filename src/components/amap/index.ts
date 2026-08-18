/**
 * amap 模块统一导出
 *
 * 使用方式：
 *   import { setAmapKey, keywordSearch, calcDistance, getDrivingRoute, AmapWidget } from '@/components/amap'
 *   setAmapKey('your-key')
 *
 * 或从组件库总入口导入：
 *   import { setAmapKey, calcDistance, AmapWidget } from '@/components'
 */

// 通用地图组件
export { default as AmapWidget } from './AmapWidget.vue'

// Key 管理
export { setAmapKey, setAmapKeys, getAmapJsKey, getAmapRestKey, getAmapSecurityCode } from './amap-key'

// REST API 服务
export {
  // 通用工具
  isValidLatLon,
  calcDistance,
  // POI 搜索
  keywordSearch,
  searchNearby,
  fetchPoiDetail,
  batchFetchPoiPhotos,
  // 驾车路线
  getDrivingRoute,
  // 地理编码辅助
  geocodeCalc,
  // 导航深度链接
  detectPlatform,
  buildNavLink,
} from './amap-service'

// 类型
export type { LatLng, PoiPhoto, PoiItem, DrivingRouteResult, NavLink, NavPoint } from './amap-service'
