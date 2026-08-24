/**
 * 路线规划器 — 统一导出
 * 其他 Vue 组件 import 入口
 */
// Key 管理 — 从统一 amap 模块 re-export
export { setAmapKey, setAmapKeys, getAmapJsKey, getAmapRestKey, getAmapSecurityCode } from '@/components/amap'

// 坐标解析
export { resolveCoordinate, batchResolveCoordinates } from './coordinate-resolver'

// 驾车路线
export { getDrivingRoute, findNearbyAccommodation, enrichWithDrivingRoutes } from './driving-direction'
export type { DrivingRouteResult } from './driving-direction'

// 路线规划算法
export { planRoute, enrichAccommodations, replanFrom } from './route-planning'

// Excel 导入
export { parseExcel } from './excel-import'

// 导航深度链接
export { buildAllNavLinks, buildDayNavLink, buildLegNavLink, detectPlatform } from './gaode-navigator'
