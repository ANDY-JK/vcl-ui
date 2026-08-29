/**
 * gaode-navigator.ts — 高德导航深度链接业务逻辑
 *
 * 通用导航链接生成已迁移到 @/components/amap/amap-service.ts 的 buildNavLink
 * 此文件保留路线规划相关的业务逻辑（buildDayNavLink / buildAllNavLinks 等）
 */

// re-export 通用工具（保留原名，误导性别名 buildLegNavLink 已废弃）
export { detectPlatform, buildNavLink } from '@/components/amap'
export type { NavLink, NavPoint } from '@/components/amap'

import { buildNavLink } from '@/components/amap'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：错误消息与点位名按当前语言 */
const t = useT()
import type { NavLink, NavPoint } from '@/components/amap'
import type { DayPlan } from '@/components/route-planner/types'

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

  if (startPoint && startPoint.lat && startPoint.lon) {
    points.push({ lon: startPoint.lon, lat: startPoint.lat, name: startPoint.name || t('routePlanner.pointStart') })
  } else if (prevAccommodation && prevAccommodation.lat && prevAccommodation.lon) {
    points.push({
      lon: prevAccommodation.lon,
      lat: prevAccommodation.lat,
      name: prevAccommodation.name || t('routePlanner.pointAccommodation'),
    })
  }

  for (const s of day.stores) {
    if (s.longitude != null && s.latitude != null) {
      points.push({ lon: s.longitude, lat: s.latitude, name: s.name || t('routePlanner.pointStore') })
    }
  }

  if (isLastDay && startPoint) {
    points.push({
      lon: startPoint.lon,
      lat: startPoint.lat,
      name: startPoint.name || t('routePlanner.pointStartReturn'),
    })
  } else if (day.accommodation) {
    points.push({
      lon: day.accommodation.lon,
      lat: day.accommodation.lat,
      name: day.accommodation.name || t('routePlanner.pointAccommodationShort'),
    })
  }

  if (points.length < 2) return null

  const origin = points[0]
  const destination = points[points.length - 1]
  const waypoints = points.slice(1, -1)

  return buildNavLink(origin, destination, waypoints)
}

/**
 * 为每个门店段生成导航链接
 */
export function buildStoreLegNavLinks(
  day: DayPlan,
  isLastDay: boolean = false,
  startPoint?: { lat: number; lon: number; name?: string } | null,
): NavLink[] {
  const links: NavLink[] = []
  const allPoints: NavPoint[] = []

  for (const s of day.stores) {
    if (s.longitude != null && s.latitude != null) {
      allPoints.push({ lon: s.longitude, lat: s.latitude, name: s.name || t('routePlanner.pointStore') })
    }
  }

  if (!isLastDay && day.accommodation) {
    allPoints.push({
      lon: day.accommodation.lon,
      lat: day.accommodation.lat,
      name: day.accommodation.name || t('routePlanner.pointAccommodationShort'),
    })
  }

  for (let i = 0; i < allPoints.length - 1; i++) {
    links.push(buildNavLink(allPoints[i], allPoints[i + 1]))
  }

  if (isLastDay && startPoint && allPoints.length > 0) {
    const lastPoint = allPoints[allPoints.length - 1]
    links.push(
      buildNavLink(lastPoint, {
        lon: startPoint.lon,
        lat: startPoint.lat,
        name: startPoint.name || t('routePlanner.pointStartReturn'),
      }),
    )
  }

  return links
}

/**
 * 为整个计划生成所有导航链接
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

    day.navLink = buildDayNavLink(day, sp, prevAcc, isLastDay) ?? undefined
    day.legNavLinks = buildStoreLegNavLinks(day, isLastDay, startPoint)
  }
}
