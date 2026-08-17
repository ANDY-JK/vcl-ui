/**
 * 高德驾车路线 API 封装
 * 端点: restapi.amap.com/v5/direction/driving
 */
import { searchNearby } from '@/components/geolocation/geolocation'
import type { DayPlan, RoutePlan, Accommodation } from '@/components/route-planner/types'

import { getAmapRestKey } from './amap-key'

/** 驾车路线结果 */
export interface DrivingRouteResult {
  distance: number                    // 总距离（米）
  duration: number                    // 总时间（秒）
  polyline: [number, number][]        // 路线坐标串
  tolls?: number                      // 过路费（元）
  traffic_lights?: number             // 红绿灯数量
}

/**
 * 获取驾车路线（支持多途经点）
 * @param origin 起点 [lon, lat]
 * @param destination 终点 [lon, lat]
 * @param waypoints 途经点 [[lon, lat], ...]
 */
export async function getDrivingRoute(
  origin: [number, number],
  destination: [number, number],
  waypoints: [number, number][] = [],
): Promise<DrivingRouteResult> {
  const key = getAmapRestKey()
  if (!key) throw new Error('驾车路线查询失败: 未设置高德 API Key')

  const params = new URLSearchParams({
    key,
    origin: origin.join(','),
    destination: destination.join(','),
    extensions: 'all',
    output: 'JSON',
  })

  if (waypoints.length > 0) {
    params.set('waypoints', waypoints.map(wp => wp.join(',')).join(';'))
  }

  const url = `https://restapi.amap.com/v5/direction/driving?${params.toString()}`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)

  try {
    const resp = await fetch(url, { signal: ctrl.signal })
    const data = await resp.json() as {
      infocode: string
      route?: {
        paths?: Array<{
          distance: string
          duration: string
          tolls?: string
          traffic_lights?: string
          steps?: Array<{
            polyline: string
          }>
        }>
      }
    }

    if (data.infocode !== '10000' || !data.route?.paths?.length) {
      throw new Error(`驾车路线查询失败: ${data.infocode}`)
    }

    const path = data.route.paths[0]

    // 解析 polyline（高德返回的是分号分隔的坐标串）
    const polyline: [number, number][] = []
    for (const step of path.steps || []) {
      if (step.polyline) {
        const points = step.polyline.split(';')
        for (const pt of points) {
          const [lon, lat] = pt.split(',').map(Number)
          if (!isNaN(lon) && !isNaN(lat)) {
            polyline.push([lon, lat])
          }
        }
      }
    }

    return {
      distance: parseFloat(path.distance) || 0,
      duration: parseFloat(path.duration) || 0,
      polyline,
      tolls: path.tolls ? parseFloat(path.tolls) : undefined,
      traffic_lights: path.traffic_lights ? parseInt(path.traffic_lights) : undefined,
    }
  } finally {
    clearTimeout(timer)
  }
}

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

    // 取最近的
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
 *
 * 每个门店都是途经点，高德会按顺序导航
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

    // 构建当天的完整路线点序列
    const isLastDay = i === total - 1
    const prevAccommodation = i > 0 ? plan.days[i - 1].accommodation : null
    const points = collectDayPoints(day, plan.startPoint, prevAccommodation, i === 0, isLastDay)
    if (points.length < 2) continue

    const origin = points[0]
    const destination = points[points.length - 1]
    const waypoints = points.slice(1, -1)

	    try {
	      const route = await getDrivingRoute(origin, destination, waypoints)
	      // 只在 API 返回有效数据时才覆盖估算值
	      if (route.distance > 0) day.drivingDistanceM = route.distance
	      if (route.duration > 0) day.drivingTimeMin = Math.round(route.duration / 60)
	      if (route.polyline.length > 0) day.routePolyline = route.polyline
	    } catch {
	      // 驾车 API 失败，保留已有估算值不覆盖
	    }

    // 限速
    if (i < total - 1) {
      await new Promise(r => setTimeout(r, 800))
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

  // 起点：Day 1 用 plan.startPoint，后续天用前一天住宿
  if (isFirstDay && startPoint) {
    points.push([startPoint.lon, startPoint.lat])
  } else if (prevAccommodation) {
    points.push([prevAccommodation.lon, prevAccommodation.lat])
  }

  // 门店（途经点）
  for (const s of day.stores) {
    if (s.longitude != null && s.latitude != null) {
      points.push([s.longitude, s.latitude])
    }
  }

  // 终点：最后一天回到原起点，其他天到住宿点
  if (isLastDay && startPoint) {
    points.push([startPoint.lon, startPoint.lat])
  } else if (day.accommodation) {
    points.push([day.accommodation.lon, day.accommodation.lat])
  }

  return points
}
