/**
 * 高德导航深度链接生成器
 * 支持 iOS / Android / Web 三端调起高德 APP 导航
 *
 * URL Scheme 文档：
 * - iOS: iosamap://path?...
 * - Android: amap://route/plan/?...
 * - Web: https://uri.amap.com/navigation?...&callnative=1
 */
import type { DayPlan, NavLink } from '@/components/route-planner/types'

/** 检测当前平台 */
export function detectPlatform(): 'ios' | 'android' | 'web' {
  if (typeof navigator === 'undefined') return 'web'
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  return 'web'
}

/** 坐标点 */
interface NavPoint {
  lon: number
  lat: number
  name: string
}

/**
 * 生成单段导航链接（A → B，可选途经点）
 */
export function buildLegNavLink(
  from: NavPoint,
  to: NavPoint,
  waypoints: NavPoint[] = [],
): NavLink {
  const label = `${from.name} → ${to.name}`
  const platform = detectPlatform()

  // 途经点串：lon,lat;lon,lat;...
  const viaStr = waypoints.map(wp => `${wp.lon},${wp.lat}`).join(';')

  // Web URL（通用，callnative=1 尝试调起 APP）
  const webParams = new URLSearchParams({
    from: `${from.lon},${from.lat},${from.name}`,
    to: `${to.lon},${to.lat},${to.name}`,
    mode: 'car',
  })
  if (viaStr) webParams.set('via', viaStr)
  webParams.set('callnative', '1')
  const webUrl = `https://uri.amap.com/navigation?${webParams.toString()}`

  // iOS: iosamap://path?...
  const iosParams = new URLSearchParams({
    sourceApplication: 'route-planner',
    sid: 'SV1',
    slat: String(from.lat),
    slon: String(from.lon),
    sname: from.name,
    did: 'SV2',
    dlat: String(to.lat),
    dlon: String(to.lon),
    dname: to.name,
    dev: '0', // 0=GPS坐标
    t: '0',   // 0=驾车
  })
  if (waypoints.length > 0) {
    // iOS 途经点：via=lon,lat,name;lon,lat,name
    iosParams.set('via', waypoints.map(wp => `${wp.lon},${wp.lat},${wp.name}`).join(';'))
  }
  const iosUrl = `iosamap://path?${iosParams.toString()}`

  // Android: amap://route/plan/?...
  const androidParams = new URLSearchParams({
    sid: 'SV1',
    slat: String(from.lat),
    slon: String(from.lon),
    sname: from.name,
    did: 'SV2',
    dlat: String(to.lat),
    dlon: String(to.lon),
    dname: to.name,
    dev: '0',
    t: '0',
  })
  if (waypoints.length > 0) {
    androidParams.set('via', waypoints.map(wp => `${wp.lon},${wp.lat},${wp.name}`).join(';'))
  }
  const androidUrl = `amap://route/plan/?${androidParams.toString()}`

  const url = platform === 'ios' ? iosUrl : platform === 'android' ? androidUrl : webUrl

  return { label, url, webUrl }
}

/**
 * 为一天的行程生成导航链接
 * 路线：起点/住宿 → 门店1 → 门店2 → ... → 住宿/起点
 * 最后一天回到起点形成闭环
 */
export function buildDayNavLink(
  day: DayPlan,
  startPoint?: { lat: number; lon: number; name?: string } | null,
  prevAccommodation?: { lat: number; lon: number; name?: string } | null,
  isLastDay: boolean = false,
): NavLink | null {
  if (day.stores.length === 0) return null

  const points: NavPoint[] = []

  // 起点：Day 1 用 startPoint，后续天用前一天住宿
  if (startPoint && startPoint.lat && startPoint.lon) {
    points.push({ lon: startPoint.lon, lat: startPoint.lat, name: startPoint.name || '起点' })
  } else if (prevAccommodation && prevAccommodation.lat && prevAccommodation.lon) {
    points.push({ lon: prevAccommodation.lon, lat: prevAccommodation.lat, name: prevAccommodation.name || '住宿点' })
  }

  // 门店
  for (const s of day.stores) {
    if (s.longitude != null && s.latitude != null) {
      points.push({ lon: s.longitude, lat: s.latitude, name: s.name || '门店' })
    }
  }

  // 终点：最后一天回到起点，其他天到住宿点
  if (isLastDay && startPoint) {
    points.push({ lon: startPoint.lon, lat: startPoint.lat, name: startPoint.name || '起点（回程）' })
  } else if (day.accommodation) {
    points.push({ lon: day.accommodation.lon, lat: day.accommodation.lat, name: day.accommodation.name || '住宿' })
  }

  if (points.length < 2) return null

  const origin = points[0]
  const destination = points[points.length - 1]
  const waypoints = points.slice(1, -1)

  return buildLegNavLink(origin, destination, waypoints)
}

/**
 * 为每个门店段生成导航链接
 * 最后一天包含回程段（最后一个门店/住宿 → 起点）
 */
export function buildStoreLegNavLinks(
  day: DayPlan,
  isLastDay: boolean = false,
  startPoint?: { lat: number; lon: number; name?: string } | null,
): NavLink[] {
  const links: NavLink[] = []
  const allPoints: NavPoint[] = []

  // 收集当天所有点
  for (const s of day.stores) {
    if (s.longitude != null && s.latitude != null) {
      allPoints.push({ lon: s.longitude, lat: s.latitude, name: s.name || '门店' })
    }
  }

  // 非最后一天：终点是住宿
  if (!isLastDay && day.accommodation) {
    allPoints.push({ lon: day.accommodation.lon, lat: day.accommodation.lat, name: day.accommodation.name || '住宿' })
  }

  // 逐段生成
  for (let i = 0; i < allPoints.length - 1; i++) {
    const link = buildLegNavLink(allPoints[i], allPoints[i + 1])
    links.push(link)
  }

  // 最后一天：添加回程段
  if (isLastDay && startPoint && allPoints.length > 0) {
    const lastPoint = allPoints[allPoints.length - 1]
    const returnLink = buildLegNavLink(
      lastPoint,
      { lon: startPoint.lon, lat: startPoint.lat, name: startPoint.name || '起点（回程）' },
    )
    links.push(returnLink)
  }

  return links
}

/**
 * 为整个计划生成所有导航链接
 * 适配闭环结构：最后一天回到起点
 */
export function buildAllNavLinks(
  days: DayPlan[],
  startPoint?: { lat: number; lon: number; name?: string } | null,
): void {
  const totalDays = days.length

  for (let i = 0; i < totalDays; i++) {
    const day = days[i]
    const isLastDay = i === totalDays - 1
    const prevAcc = i > 0 ? days[i - 1].accommodation : null
    const sp = i === 0 ? startPoint : null

    // 当天整体导航（最后一天包含回程到起点）
    day.navLink = buildDayNavLink(day, sp, prevAcc, isLastDay) ?? undefined

    // 每个门店段导航
    day.legNavLinks = buildStoreLegNavLinks(day, isLastDay, startPoint)
  }
}
