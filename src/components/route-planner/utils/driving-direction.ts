/**
 * driving-direction.ts — 驾车路线业务逻辑
 *
 * REST API 调用已迁移到 @/components/amap/amap-service.ts 的 getDrivingRoute
 * 此文件保留路线规划业务逻辑（enrichWithDrivingRoutes 等）
 */

// re-export 统一 API
export { getDrivingRoute } from '@/components/amap'
export type { DrivingRouteResult } from '@/components/amap'

import { getDrivingRoute, searchNearby } from '@/components/amap'
import type { DayPlan, RoutePlan, Accommodation } from '@/components/route-planner/types'

/**
 * 搜索附近住宿
 * @param lat 纬度
 * @param lon 经度
 * @param radius 搜索半径（米，默认 5000）
 */
export async function findNearbyAccommodation(
  lat: number,
  lon: number,
  radius: number = 5000,
): Promise<Accommodation | null> {
  try {
    // POI 类型 100000 = 住宿服务
    const pois = await searchNearby(lat, lon, radius, '100000')
    if (pois.length === 0) return null

    const nearest = pois[0]
    return {
      name: nearest.name,
      address: nearest.address,
      lat: nearest.latitude,
      lon: nearest.longitude,
      distanceM: nearest.distance,
      type: nearest.type,
    }
  } catch {
    return null
  }
}

/**
 * 为路线规划结果补充实际驾车数据
 * 每天的路线在闭环中的位置：
 *   Day 1: startPoint → 门店1 → ... → 住宿1
 *   Day 2: 住宿1 → 门店2 → ... → 住宿2
 *   Day N: 住宿(N-1) → 门店N → ... → startPoint（回到起点）
 */
export async function enrichWithDrivingRoutes(
  plan: RoutePlan,
  onProgress?: (current: number, total: number) => void,
): Promise<RoutePlan> {
  const total = plan.days.length

  for (let i = 0; i < total; i++) {
    const day = plan.days[i]
    onProgress?.(i + 1, total)

    if (day.stores.length === 0) continue

    const isLastDay = i === total - 1
    const prevAccommodation = i > 0 ? plan.days[i - 1].accommodation : null
    const points = collectDayPoints(day, plan.startPoint, prevAccommodation, i === 0, isLastDay)
    if (points.length < 2) continue

    const origin = points[0]
    const destination = points[points.length - 1]
    const waypoints = points.slice(1, -1)

    try {
      const route = await getDrivingRoute(origin, destination, waypoints)
      if (route.distance > 0) day.drivingDistanceM = route.distance
      if (route.duration > 0) day.drivingTimeMin = Math.round(route.duration / 60)
      if (route.polyline.length > 0) day.routePolyline = route.polyline
    } catch {
      // 驾车 API 失败，保留已有估算值不覆盖
    }

    // 限速
    if (i < total - 1) {
      await new Promise((r) => setTimeout(r, 800))
    }
  }

  // 重新汇总
  plan.totalDrivingDistanceM = plan.days.reduce((s, d) => s + d.drivingDistanceM, 0)
  plan.totalDrivingTimeMin = plan.days.reduce((s, d) => s + d.drivingTimeMin, 0)

  return plan
}

/**
 * 收集当天的路线点序列（含起点和终点）
 * 形成完整的闭环回路中的一段
 */
function collectDayPoints(
  day: DayPlan,
  startPoint: { lat: number; lon: number } | undefined,
  prevAccommodation: Accommodation | null,
  isFirstDay: boolean,
  isLastDay: boolean,
): [number, number][] {
  const points: [number, number][] = []

  if (isFirstDay && startPoint) {
    points.push([startPoint.lon, startPoint.lat])
  } else if (prevAccommodation) {
    points.push([prevAccommodation.lon, prevAccommodation.lat])
  }

  for (const s of day.stores) {
    if (s.longitude != null && s.latitude != null) {
      points.push([s.longitude, s.latitude])
    }
  }

  if (isLastDay && startPoint) {
    points.push([startPoint.lon, startPoint.lat])
  } else if (day.accommodation) {
    points.push([day.accommodation.lon, day.accommodation.lat])
  }

  return points
}
