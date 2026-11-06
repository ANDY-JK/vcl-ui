/**
 * routeTsp — 路线局部优化：2-opt 与最近邻（#463 从 route-planning.ts 拆出）
 *
 * 两个经典启发式，只依赖「距离函数」与坐标：
 *   1. `twoOptOptimize`：交换两条边的连接方式减少总里程，消除"之字形"走位；
 *      2% 阈值避免微小震荡，100 轮安全上限。
 *   2. `nearestNeighborSort`：从起点开始每次取最近未访问门店。
 *
 * 本模块无 i18n / 无业务类型依赖（只读经纬度）。
 */
import type { Store } from '@/components/route-planner/types'
import { calcDistance as calculateDistance } from '@/components/amap'

/** 计算两个门店间的直线距离（米）；任一坐标缺失按 0 处理（调用方已过滤） */
export function distBetween(a: Store, b: Store): number {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return 0
  return calculateDistance(a.latitude, a.longitude, b.latitude, b.longitude)
}

/** 反转数组中 [start, end] 闭区间内的元素（原地） */
export function reverseSegment<T>(arr: T[], start: number, end: number): void {
  while (start < end) {
    ;[arr[start], arr[end]] = [arr[end], arr[start]]
    start++
    end--
  }
}

/**
 * 2-opt 局部路线优化
 * 通过交换两条边的连接方式减少总里程，消除"之字形"走位
 *
 * 原理：遍历所有边对 (A→B, C→D)，若交换为 (A→C, B→D) 后总距离更短则执行
 * 重复直到无法进一步优化
 *
 * @param stores 已排序门店列表
 * @returns 优化后的门店列表（新数组，不 mutate 入参）
 */
export function twoOptOptimize(stores: Store[]): Store[] {
  if (stores.length <= 2) return [...stores]
  const route = [...stores]
  let improved = true
  let iterations = 0
  const maxIterations = 100 // 安全上限

  while (improved && iterations < maxIterations) {
    improved = false
    iterations++

    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 2; j < route.length - 1; j++) {
        // 边对：(i→i+1) 和 (j→j+1)
        const a = route[i]
        const b = route[i + 1]
        const c = route[j]
        const d = route[j + 1]

        const currentDist = distBetween(a, b) + distBetween(c, d)
        const swappedDist = distBetween(a, c) + distBetween(b, d)

        if (swappedDist < currentDist * 0.98) {
          // 2% 阈值避免微小震荡
          reverseSegment(route, i + 1, j)
          improved = true
          break // 改进后重新开始外层循环
        }
      }
      if (improved) break
    }
  }

  return route
}

/** 最近邻排序：从起点开始每次取最近的未访问门店 */
export function nearestNeighborSort(stores: Store[], start: { lat: number; lon: number }): Store[] {
  if (stores.length <= 1) return [...stores]
  const remaining = [...stores]
  const ordered: Store[] = []
  let current = start
  while (remaining.length > 0) {
    let nearestIdx = 0,
      nearestDist = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i]
      if (s.latitude == null || s.longitude == null) continue
      const dist = calculateDistance(current.lat, current.lon, s.latitude, s.longitude)
      if (dist < nearestDist) {
        nearestDist = dist
        nearestIdx = i
      }
    }
    const [nearest] = remaining.splice(nearestIdx, 1)
    ordered.push(nearest)
    if (nearest.latitude != null && nearest.longitude != null) {
      current = { lat: nearest.latitude, lon: nearest.longitude }
    }
  }
  return ordered
}

/** 方位角（0-360°）：从 A 看 B 的方向，用于按角度聚类 */
export function computeBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const radLat1 = (lat1 * Math.PI) / 180
  const radLat2 = (lat2 * Math.PI) / 180
  const y = Math.sin(dLon) * Math.cos(radLat2)
  const x = Math.cos(radLat1) * Math.sin(radLat2) - Math.sin(radLat1) * Math.cos(radLat2) * Math.cos(dLon)
  const bearing = (Math.atan2(y, x) * 180) / Math.PI
  return (bearing + 360) % 360
}
