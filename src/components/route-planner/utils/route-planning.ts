/**
 * 路线规划核心算法 — 闭环巡访回路
 *
 * 核心设计：
 * 1. 起点 → 门店1 → 门店2 → ... → 住宿1 → (次日) → 门店3 → ... → 住宿2 → ... → 回到起点
 * 2. 先聚类再路线：地理连贯优先，避免长距离跳跃
 * 3. 每天从住宿点（或起点）出发，访问当天门店，结束于住宿点
 * 4. 最后一天回到起点，形成闭环
 * 5. 偏离回路太远的门店自动跳过（基于绕路成本）
 * 6. 支持从任意位置重新规划剩余路线
 *
 * 策略改进：
 * - 聚类分组：将相近门店聚为一组，避免跨区长距离跳跃
 * - 组间排序：按质心最近邻排序各组
 * - 组内排序：最近邻或角度扫描
 * - 分天限制：每天最多8家、驾驶≤6小时、单段≤100km
 */
import { calcDistance as calculateDistance } from '@/components/amap'
import { twoOptOptimize, nearestNeighborSort, computeBearing } from './route-tsp'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：图表文案按当前语言 */
const t = useT()
import type { Store, DayPlan, RoutePlan, RouteOptions } from '@/components/route-planner/types'

/** 默认配置（RouteResult 等展示层复用估算参数，禁止单侧改魔数） */
export const DEFAULTS = {
  dailyLimitHours: 8, // 每天驾驶+拜访总时长上限（从 6h 提升到 8h，因为现在包含拜访时间）
  maxStoresPerDay: 8, // 每天最多门店数
  maxSegmentKm: 80, // 单段最大距离（超过则分天，80km≈1h 驾驶）
  maxDetourKm: 50, // 最大绕路成本
  roadFactor: 1.4,
  avgSpeedKmh: 50,
  clusterRadiusKm: 30, // 聚类半径（30km内的门店聚为一组）
  defaultVisitMinutes: 30, // 每家门店默认拜访耗时
  maxDrivingMinutesPerDay: 240, // 每日驾驶时间上限（分钟），避免整天浪费在开车上
}

/**
 * 主入口：路线规划
 */
export function planRoute(options: RouteOptions): RoutePlan {
  const opts = { ...DEFAULTS, ...options }
  const { stores } = opts

  // 过滤有效门店
  const validStores = stores.filter((s) => s.longitude != null && s.latitude != null && !s.skipped)
  const skippedStores = stores.filter((s) => s.skipped)

  // 确定起点
  let startPoint = opts.startPoint
  if (!startPoint && validStores.length > 0) {
    const first = validStores[0]
    startPoint = { lat: first.latitude!, lon: first.longitude! }
  }
  if (!startPoint) {
    return emptyPlan(undefined, skippedStores)
  }

  // 1. 聚类分组（地理相近 → 一组）
  const clusters = clusterStores(validStores, startPoint, opts.clusterRadiusKm)

  // 2. 组间排序：先试环形（角度），如果跳过太多则回退到最近邻
  const angularOrdered = orderClustersByAngle(clusters, startPoint)
  const nnOrdered = orderClustersByNN(clusters, startPoint)

  // 分别计算两种排序的完整路线
  const angularPlan = buildLoopFromClusters(angularOrdered, opts.startPoint || startPoint, skippedStores, opts)
  const nnPlan = buildLoopFromClusters(nnOrdered, opts.startPoint || startPoint, skippedStores, opts)

  // 门店数多者优先；数量相同时比总里程——角度环形排序只是启发式，不保证更短
  if (angularPlan.totalStores !== nnPlan.totalStores) {
    return angularPlan.totalStores > nnPlan.totalStores ? angularPlan : nnPlan
  }
  return angularPlan.totalDrivingDistanceM <= nnPlan.totalDrivingDistanceM ? angularPlan : nnPlan
}

/**
 * 从指定位置重新规划剩余路线
 */
export function replanFrom(
  currentLocation: { lat: number; lon: number },
  remainingStores: Store[],
  originalPlan: RoutePlan,
): RoutePlan {
  const options: RouteOptions = {
    stores: remainingStores,
    startPoint: currentLocation,
    dailyLimitHours: 8,
    maxStoresPerDay: 8,
    maxSegmentKm: 80,
    maxDetourKm: 50,
    maxDrivingMinutesPerDay: 240,
    roadFactor: 1.4,
    avgSpeedKmh: 50,
    clusterRadiusKm: 30,
    defaultVisitMinutes: 30,
  }
  const newPlan = planRoute(options)
  newPlan.startPoint = originalPlan.startPoint
  return newPlan
}

/**
 * 补充住宿建议（基于门店城市/区县，不搜具体酒店）
 * 用当天最后一个门店的城市+区县作为建议住宿区域
 */
export async function enrichAccommodations(plan: RoutePlan): Promise<RoutePlan> {
  for (const day of plan.days) {
    if (day.stores.length === 0) continue

    // 取当天最后一个门店，综合判断住宿区域
    const lastStore = day.stores[day.stores.length - 1]
    // 优先用当天门店中最常见的城市
    const cityCounts = new Map<string, number>()
    for (const s of day.stores) {
      if (s.city) cityCounts.set(s.city, (cityCounts.get(s.city) || 0) + 1)
    }
    let mainCity = ''
    let maxCount = 0
    for (const [city, count] of cityCounts) {
      if (count > maxCount) {
        maxCount = count
        mainCity = city
      }
    }

    // 住宿建议：城市 + 区县（如果有的话）
    const district = lastStore?.district || ''
    const locationParts = [mainCity]
    if (district && district !== mainCity) locationParts.push(district)
    const locationName = locationParts.filter(Boolean).join('')

    if (locationName && lastStore?.latitude != null && lastStore?.longitude != null) {
      day.accommodation = {
        name: t('routePlanner.nearbySuffix', { name: locationName }),
        address: lastStore.address || `${locationName}`,
        lat: lastStore.latitude,
        lon: lastStore.longitude,
        type: '建议住宿区域',
      }
    }
  }
  return plan
}

// ============================================================
// 聚类分组
// ============================================================

interface StoreCluster {
  stores: Store[]
  centroid: { lat: number; lon: number }
}

/**
 * 距离聚类：将相距小于 clusterRadiusKm 的门店聚为一组
 * 使用简单的贪心聚类：从离起点最近的门店开始，吸收附近的未分组门店
 */
function clusterStores(stores: Store[], startPoint: { lat: number; lon: number }, radiusKm: number): StoreCluster[] {
  const unassigned = [...stores]
  const clusters: StoreCluster[] = []
  const radiusM = radiusKm * 1000

  while (unassigned.length > 0) {
    // 找到离起点（或上一个聚类）最近的未分配门店作为种子
    let seedIdx = 0
    let seedDist = Infinity
    for (let i = 0; i < unassigned.length; i++) {
      const d = calculateDistance(startPoint.lat, startPoint.lon, unassigned[i].latitude!, unassigned[i].longitude!)
      if (d < seedDist) {
        seedDist = d
        seedIdx = i
      }
    }

    const seed = unassigned[seedIdx]
    const clusterStores_list: Store[] = [seed]
    unassigned.splice(seedIdx, 1)

    // 吸收附近的未分配门店
    let changed = true
    while (changed) {
      changed = false
      // 计算当前聚类的质心
      const centroid = calcCentroid(clusterStores_list)
      for (let i = unassigned.length - 1; i >= 0; i--) {
        const d = calculateDistance(centroid.lat, centroid.lon, unassigned[i].latitude!, unassigned[i].longitude!)
        if (d < radiusM) {
          clusterStores_list.push(unassigned[i])
          unassigned.splice(i, 1)
          changed = true
        }
      }
    }

    clusters.push({
      stores: clusterStores_list,
      centroid: calcCentroid(clusterStores_list),
    })
  }

  return clusters
}

/**
 * 从聚类列表构建完整路线并进行分天切割
 * 被 planRoute 用来比较不同聚类排序的效果
 */
function buildLoopFromClusters(
  orderedClusters: StoreCluster[],
  originalStart: { lat: number; lon: number },
  initialSkipped: Store[],
  opts: Required<
    Pick<
      RouteOptions,
      | 'dailyLimitHours'
      | 'maxStoresPerDay'
      | 'maxSegmentKm'
      | 'roadFactor'
      | 'avgSpeedKmh'
      | 'maxDetourKm'
      | 'clusterRadiusKm'
      | 'defaultVisitMinutes'
      | 'maxDrivingMinutesPerDay'
    >
  > & { targetDays?: number },
): RoutePlan {
  let currentStart = originalStart
  const loopStores: Store[] = []
  const storeClusterMap = new Map<string, number>()
  let clusterIdx = 0

  for (const cluster of orderedClusters) {
    const sorted = nearestNeighborSort(cluster.stores, currentStart)
    const optimized = twoOptOptimize(sorted)
    loopStores.push(...optimized)
    for (const s of optimized) {
      storeClusterMap.set(s.id, clusterIdx)
    }
    clusterIdx++
    const last = optimized[optimized.length - 1]
    if (last) {
      currentStart = { lat: last.latitude!, lon: last.longitude! }
    }
  }

  // 绕路检测跳过
  let filteredStores = loopStores
  let allSkipped = [...initialSkipped]
  for (let iter = 0; iter < 3; iter++) {
    const result = detectDetourSkips(filteredStores, originalStart, opts.maxDetourKm)
    if (result.skipped.length === 0) break
    filteredStores = filteredStores.filter((s) => result.kept.has(s.id))
    allSkipped = [...allSkipped, ...result.skipped]
  }

  // 分天切割
  let effectiveStores = filteredStores
  const timeSkipped: Store[] = []

  // 如果指定了计划天数，超出时间预算的门店直接跳过
  if (opts.targetDays && opts.targetDays > 0) {
    const dailyMin = opts.dailyLimitHours * 60
    const totalBudget = opts.targetDays * dailyMin

    // 预估每家店的开销：驾驶时间（到前一店的直线距离）+ 拜访时间
    let accumulated = 0
    const keepList: Store[] = []
    let prevPoint = originalStart

    for (const s of filteredStores) {
      if (s.latitude == null || s.longitude == null) continue
      const distM = calculateDistance(prevPoint.lat, prevPoint.lon, s.latitude, s.longitude)
      const driveMin = estimateDrivingTime(distM, opts)
      const visitMin = s.visitMinutes ?? opts.defaultVisitMinutes
      const cost = driveMin + visitMin

      if (accumulated + cost <= totalBudget) {
        accumulated += cost
        keepList.push(s)
        prevPoint = { lat: s.latitude, lon: s.longitude }
      } else {
        timeSkipped.push(s)
      }
    }

    effectiveStores = keepList
  }

  let dayStores = splitIntoDays(effectiveStores, originalStart, opts, storeClusterMap)
  dayStores = mergeSmallDays(dayStores, originalStart, opts, storeClusterMap)

  const days: DayPlan[] = dayStores.map((stores, idx) => ({
    day: idx + 1,
    stores,
    drivingTimeMin: 0,
    drivingDistanceM: 0,
    accommodation: null,
  }))

  // 估算每天驾驶距离和时间（不等异步 enrichDriving）
  let totalDistM = 0
  let totalTimeMin = 0
  let prevPoint = originalStart
  for (const day of days) {
    if (day.stores.length === 0) continue
    let dayDistM = 0
    for (const s of day.stores) {
      if (s.latitude != null && s.longitude != null) {
        const segM = calculateDistance(prevPoint.lat, prevPoint.lon, s.latitude, s.longitude)
        dayDistM += segM
        prevPoint = { lat: s.latitude, lon: s.longitude }
      }
    }
    const roadM = dayDistM * (opts.roadFactor || 1.4)
    day.drivingDistanceM = Math.round(roadM)
    day.drivingTimeMin = estimateDrivingTime(dayDistM, opts)
    // 兜底：如果时间算出来是 0 但距离不为 0，用距离反算
    if (day.drivingTimeMin === 0 && day.drivingDistanceM > 0) {
      day.drivingTimeMin = Math.round(day.drivingDistanceM / (((opts.avgSpeedKmh || 50) * 1000) / 60))
    }
    totalDistM += day.drivingDistanceM
    totalTimeMin += day.drivingTimeMin
  }

  return {
    days,
    totalStores: effectiveStores.length,
    totalSkipped: allSkipped.length + timeSkipped.length,
    totalDays: days.length,
    totalDrivingTimeMin: totalTimeMin,
    totalDrivingDistanceM: totalDistM,
    startPoint: originalStart,
    skippedStores: [...allSkipped, ...timeSkipped],
  }
}

// ============================================================
// 聚类排序策略
// ============================================================

/**
 * 策略 A：角度环形排序
 * 以起点为圆心按方位角排序，路线自然形成顺时针环形
 */
function orderClustersByAngle(clusters: StoreCluster[], start: { lat: number; lon: number }): StoreCluster[] {
  if (clusters.length <= 1) return [...clusters]
  return [...clusters].sort((a, b) => {
    const bearingA = computeBearing(start.lat, start.lon, a.centroid.lat, a.centroid.lon)
    const bearingB = computeBearing(start.lat, start.lon, b.centroid.lat, b.centroid.lon)
    return bearingA - bearingB
  })
}

/**
 * 策略 B：最近邻排序（回退方案）
 * 每次选离当前位置最近的聚类，适合分散分布
 */
function orderClustersByNN(clusters: StoreCluster[], start: { lat: number; lon: number }): StoreCluster[] {
  if (clusters.length <= 1) return [...clusters]
  const remaining = [...clusters]
  const ordered: StoreCluster[] = []
  let current = start
  while (remaining.length > 0) {
    let nearestIdx = 0,
      nearestDist = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = calculateDistance(current.lat, current.lon, remaining[i].centroid.lat, remaining[i].centroid.lon)
      if (d < nearestDist) {
        nearestDist = d
        nearestIdx = i
      }
    }
    const [nearest] = remaining.splice(nearestIdx, 1)
    ordered.push(nearest)
    current = nearest.centroid
  }
  return ordered
}

/**
 * 计算从点1到点2的方位角（0°~360°，正北为0，顺时针）
 */
/**
 * 分天切割（考虑地理连贯性 + 拜访时长 + 驾驶时间上限 + 同聚类优先保完整）
 *
 * 切割条件（满足任一即切）：
 * 1. 累计驾驶+拜访时间超限 —— 且当前门店与已有门店不在同一聚类
 * 2. 累计驾驶时间超限 —— 不管是否同聚类，避免整天开车
 * 3. 门店数达上限
 * 4. 单段距离超限 —— 且当天已有门店
 *
 * 同聚类保完整策略：
 * - 若当前门店与当天已有门店属于同一聚类，允许超出总时间上限 20%
 * - 但驾驶上限不因同聚类放宽（安全第一）
 */
function splitIntoDays(
  stores: Store[],
  startPoint: { lat: number; lon: number },
  opts: Required<
    Pick<
      RouteOptions,
      | 'dailyLimitHours'
      | 'maxStoresPerDay'
      | 'maxSegmentKm'
      | 'roadFactor'
      | 'avgSpeedKmh'
      | 'maxDetourKm'
      | 'clusterRadiusKm'
      | 'defaultVisitMinutes'
      | 'maxDrivingMinutesPerDay'
    >
  >,
  clusterMap: Map<string, number>,
): Store[][] {
  if (stores.length === 0) return []

  const limitMin = opts.dailyLimitHours * 60
  const maxDrivingMin = opts.maxDrivingMinutesPerDay
  const maxSegM = opts.maxSegmentKm * 1000
  const result: Store[][] = []
  let currentDay: Store[] = []
  let accumulatedMin = 0 // 驾驶 + 拜访
  let accumulatedDriving = 0 // 仅驾驶
  let dayStart = startPoint
  /** 当天已包含的聚类集合 */
  let dayClusters = new Set<number>()

  for (const store of stores) {
    if (store.latitude == null || store.longitude == null) continue

    const sLat = store.latitude
    const sLon = store.longitude

    // 驾驶时间：从当天起点/上一个门店到当前门店
    const distM = calculateDistance(dayStart.lat, dayStart.lon, sLat, sLon)
    const driveMin = estimateDrivingTime(distM, opts)

    // 拜访时间：门店自身耗时优先，否则用默认值
    const visitMin = store.visitMinutes ?? opts.defaultVisitMinutes

    // 新增总耗时
    const addedMin = driveMin + visitMin
    const projectedTotal = accumulatedMin + addedMin
    const projectedDriving = accumulatedDriving + driveMin

    // 判断当前门店与当天已有门店是否同一聚类
    const storeCluster = clusterMap.get(store.id)
    const isSameCluster = storeCluster != null && dayClusters.has(storeCluster)

    // 同聚类允许超出总时间 20%，但驾驶上限不因同聚类放宽
    const effectiveTotalLimit = isSameCluster ? limitMin * 1.2 : limitMin

    // 切割条件
    const shouldSplit =
      // 总时间超限（非同聚类严格限制）
      (projectedTotal > effectiveTotalLimit && currentDay.length > 0) ||
      // 驾驶时间超限（不管是否同聚类，安全第一）
      (projectedDriving > maxDrivingMin && currentDay.length > 0) ||
      // 门店数达上限
      currentDay.length >= opts.maxStoresPerDay ||
      // 单段距离超限（且当天已有门店，不用等）
      (distM > maxSegM && currentDay.length > 0)

    if (shouldSplit) {
      result.push(currentDay)
      currentDay = [store]
      accumulatedMin = addedMin
      accumulatedDriving = driveMin
      dayClusters = new Set<number>()
      if (storeCluster != null) dayClusters.add(storeCluster)
    } else {
      currentDay.push(store)
      accumulatedMin += addedMin
      accumulatedDriving += driveMin
      if (storeCluster != null) dayClusters.add(storeCluster)
    }

    dayStart = { lat: sLat, lon: sLon }
  }

  if (currentDay.length > 0) {
    result.push(currentDay)
  }

  return result
}

/**
 * 合并只有1家门店的天到相邻天
 * 如果某天只有1家门店，尝试合并到前一天或后一天（选择增加驾驶时间更少的）
 * 考虑拜访时长 + 驾驶时间上限
 */
function mergeSmallDays(
  days: Store[][],
  startPoint: { lat: number; lon: number },
  opts: Required<
    Pick<
      RouteOptions,
      | 'dailyLimitHours'
      | 'maxStoresPerDay'
      | 'maxSegmentKm'
      | 'roadFactor'
      | 'avgSpeedKmh'
      | 'maxDetourKm'
      | 'clusterRadiusKm'
      | 'defaultVisitMinutes'
      | 'maxDrivingMinutesPerDay'
    >
  >,
  _clusterMap: Map<string, number>,
): Store[][] {
  if (days.length <= 1) return days

  const limitMin = opts.dailyLimitHours * 60
  const maxDrivingMin = opts.maxDrivingMinutesPerDay
  const maxStores = opts.maxStoresPerDay
  const result = [...days]
  let changed = true

  while (changed) {
    changed = false
    for (let i = 0; i < result.length; i++) {
      if (result[i].length > 1) continue // 只处理单家天

      const singleStore = result[i][0]
      if (!singleStore) continue

      const singleVisit = singleStore.visitMinutes ?? opts.defaultVisitMinutes

      // 尝试合并到前一天
      let mergeToPrev = false
      if (i > 0 && result[i - 1].length + 1 <= maxStores) {
        const prevDay = result[i - 1]
        const lastOfPrev = prevDay[prevDay.length - 1]
        if (lastOfPrev.latitude != null && lastOfPrev.longitude != null) {
          const driveTime = estimateTimeBetween(lastOfPrev, singleStore, opts)
          const addedTime = driveTime + singleVisit
          const prevDayStart = i === 1 ? startPoint : { lat: prevDay[0].latitude!, lon: prevDay[0].longitude! }
          const prevDayDriving = estimateDayTime(prevDay, prevDayStart, opts)
          // 总时间 + 驾驶上限双重检查
          if (prevDayDriving + addedTime <= limitMin * 1.2 && prevDayDriving + driveTime <= maxDrivingMin) {
            mergeToPrev = true
          }
        }
      }

      // 尝试合并到后一天
      let mergeToNext = false
      if (!mergeToPrev && i < result.length - 1 && result[i + 1].length + 1 <= maxStores) {
        const nextDay = result[i + 1]
        const firstOfNext = nextDay[0]
        if (firstOfNext.latitude != null && firstOfNext.longitude != null) {
          const driveTime = estimateTimeBetween(singleStore, firstOfNext, opts)
          const addedTime = driveTime + singleVisit
          const nextDayDriving = estimateDayTime(
            nextDay,
            { lat: singleStore.latitude!, lon: singleStore.longitude! },
            opts,
          )
          if (nextDayDriving + addedTime <= limitMin * 1.2 && nextDayDriving + driveTime <= maxDrivingMin) {
            mergeToNext = true
          }
        }
      }

      // 执行合并（优先合并到前一天）
      if (mergeToPrev) {
        result[i - 1].push(singleStore)
        result.splice(i, 1)
        changed = true
        break
      } else if (mergeToNext) {
        result[i + 1].unshift(singleStore)
        result.splice(i, 1)
        changed = true
        break
      }
    }
  }

  return result
}

/** 估算两点间驾驶时间（分钟） */
function estimateTimeBetween(a: Store, b: Store, opts: Pick<RouteOptions, 'roadFactor' | 'avgSpeedKmh'>): number {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return 0
  const distM = calculateDistance(a.latitude, a.longitude, b.latitude, b.longitude)
  return estimateDrivingTime(distM, opts)
}

/** 估算一天的驾驶时间（分钟） */
function estimateDayTime(
  day: Store[],
  start: { lat: number; lon: number },
  opts: Pick<RouteOptions, 'roadFactor' | 'avgSpeedKmh'>,
): number {
  let total = 0
  let from = start
  for (const s of day) {
    if (s.latitude == null || s.longitude == null) continue
    const distM = calculateDistance(from.lat, from.lon, s.latitude, s.longitude)
    total += estimateDrivingTime(distM, opts)
    from = { lat: s.latitude, lon: s.longitude }
  }
  return total
}

/**
 * 基于闭环绕路成本的跳过检测（迭代直到稳定）
 */
function detectDetourSkips(
  orderedStores: Store[],
  startPoint: { lat: number; lon: number },
  maxDetourKm: number = 50,
): { kept: Set<string>; skipped: Store[] } {
  const kept = new Set<string>()
  const skipped: Store[] = []

  if (orderedStores.length === 0) return { kept, skipped }
  if (orderedStores.length === 1) {
    kept.add(orderedStores[0].id)
    return { kept, skipped }
  }

  const points: Array<{ lat: number; lon: number; storeId?: string }> = [{ lat: startPoint.lat, lon: startPoint.lon }]
  for (const s of orderedStores) {
    if (s.latitude != null && s.longitude != null) {
      points.push({ lat: s.latitude, lon: s.longitude, storeId: s.id })
    }
  }
  points.push({ lat: startPoint.lat, lon: startPoint.lon })

  const segmentDistances: number[] = []
  for (let i = 0; i < points.length - 1; i++) {
    segmentDistances.push(calculateDistance(points[i].lat, points[i].lon, points[i + 1].lat, points[i + 1].lon))
  }

  const avgSegment =
    segmentDistances.length > 1
      ? segmentDistances.slice(0, -1).reduce((a, b) => a + b, 0) / (segmentDistances.length - 1)
      : segmentDistances[0] || 10000

  const adaptiveThresholdM = Math.min(avgSegment * 1.5, maxDetourKm * 1000)
  const thresholdM = Math.max(adaptiveThresholdM, 10000)

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const next = points[i + 1]
    if (curr.storeId == null) continue

    const distToCurr = calculateDistance(prev.lat, prev.lon, curr.lat, curr.lon)
    const distCurrToNext = calculateDistance(curr.lat, curr.lon, next.lat, next.lon)
    const distDirect = calculateDistance(prev.lat, prev.lon, next.lat, next.lon)
    const detourCost = distToCurr + distCurrToNext - distDirect

    if (detourCost > thresholdM) {
      skipped.push(orderedStores.find((s) => s.id === curr.storeId)!)
    } else {
      kept.add(curr.storeId)
    }
  }

  return { kept, skipped }
}

/** 计算质心 */
function calcCentroid(stores: Store[]): { lat: number; lon: number } {
  const valid = stores.filter((s) => s.latitude != null && s.longitude != null)
  if (valid.length === 0) return { lat: 0, lon: 0 }
  const sum = valid.reduce((acc, s) => ({ lat: acc.lat + s.latitude!, lon: acc.lon + s.longitude! }), {
    lat: 0,
    lon: 0,
  })
  return { lat: sum.lat / valid.length, lon: sum.lon / valid.length }
}

/** 估算驾驶时间（分钟） */
function estimateDrivingTime(straightDistM: number, opts: Pick<RouteOptions, 'roadFactor' | 'avgSpeedKmh'>): number {
  const roadDistM = straightDistM * (opts.roadFactor ?? 1.4)
  const speedMmin = ((opts.avgSpeedKmh ?? 50) * 1000) / 60
  return Math.round(roadDistM / speedMmin)
}

/** 空计划 */
function emptyPlan(startPoint: { lat: number; lon: number } | undefined, skippedStores: Store[]): RoutePlan {
  return {
    days: [],
    totalStores: 0,
    totalSkipped: skippedStores.length,
    totalDays: 0,
    totalDrivingTimeMin: 0,
    totalDrivingDistanceM: 0,
    startPoint: startPoint || { lat: 0, lon: 0 },
    skippedStores,
  }
}
