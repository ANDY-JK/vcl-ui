/**
 * 路线规划器 — 统一导出
 * 其他 Vue 组件 import 入口
 */
export { resolveCoordinate, batchResolveCoordinates } from './coordinate-resolver'
export { setAmapKey, setAmapKeys, getAmapJsKey, getAmapRestKey, getAmapSecurityCode } from './amap-key'
export { getDrivingRoute, findNearbyAccommodation, enrichWithDrivingRoutes } from './driving-direction'
export { planRoute, enrichAccommodations, replanFrom } from './route-planning'
export { parseExcel } from './excel-import'
export { buildAllNavLinks, buildDayNavLink, buildLegNavLink, detectPlatform } from './gaode-navigator'
export type { DrivingRouteResult } from './driving-direction'
