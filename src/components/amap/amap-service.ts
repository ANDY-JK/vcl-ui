import { reportEvent, reportWarn } from '@/components/_internal/runtime-observer'
/**
 * amap-service.ts — 高德地图 REST API 统一服务层
 *
 * 合并原 geolocation.ts + driving-direction.ts 中的所有 REST API 调用，
 * 统一 Key 管理、统一 safeFetch、统一错误处理。
 *
 * 功能清单：
 *   - Key 管理：setAmapKey / getAmapRestKey / getAmapJsKey / getAmapSecurityCode
 *   - 距离计算：calcDistance（纯函数，不调用 API）
 *   - 关键词搜索：keywordSearch
 *   - 周边搜索：searchNearby（多页去重）
 *   - POI 详情：fetchPoiDetail
 *   - 批量照片：batchFetchPoiPhotos
 *   - 驾车路线：getDrivingRoute（多途经点）
 *   - 地理编码辅助：geocodeCalc（重试策略）
 *   - 导航深度链接：buildNavLink / detectPlatform
 */
import { getAmapRestKey } from './amap-key'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：服务层错误消息按当前语言生成 */
const t = useT()

// ════════════════════════════════════════
// 通用类型
// ════════════════════════════════════════

/** 经纬度坐标 */
export interface LatLng {
  latitude: number
  longitude: number
}

/** POI 照片 */
export interface PoiPhoto {
  title: string
  url: string
}

/** POI 条目 */
export interface PoiItem {
  id?: string
  name: string
  address: string
  latitude: number
  longitude: number
  photos?: PoiPhoto[]
  type?: string
  typecode?: string
  distance?: number
}

/** 驾车路线结果 */
export interface DrivingRouteResult {
  distance: number
  duration: number
  polyline: [number, number][]
  tolls?: number
  traffic_lights?: number
}

/** 导航深度链接 */
export interface NavLink {
  label: string
  url: string
  webUrl: string
}

// ════════════════════════════════════════
// Key 管理 — re-export
// ════════════════════════════════════════
export { setAmapKey, setAmapKeys, getAmapJsKey, getAmapRestKey, getAmapSecurityCode } from './amap-key'

// ════════════════════════════════════════
// 通用工具
// ════════════════════════════════════════

/** 单次请求超时：高德 REST 正常几百 ms 内返回，15s 还没回来就是网络/服务端问题，别再占着批次 */
const _FETCH_TIMEOUT_MS = 15000
/** 地理编码可信半径（米）：解析结果离原坐标超过这个距离就认为漂到了别处，改用地址口径重试。
 *  取值来自"同城同地址的定位误差"经验量级，未实测分布 —— 调小会增多重试请求。 */
const _GEOCODE_ACCEPT_RADIUS_M = 700

/** 按名称补查照片的**单轮并发窗口**：一次 Promise.allSettled 最多并发这么多请求，
 *  多出来的排到下一轮顺序跑完（见 batchFetchPoiPhotos）。放大这个值才会把高德 QPS 打满；
 *  总量上限不在这里，是调用方传的 count。 */
const _NAME_SEARCH_BATCH_MAX = 10

/** 失败后的退避重试间隔：消掉一次网络抖动，避免批量解析把失败项永久标成 none */
const _RETRY_BACKOFF_MS = 800

/** 单次 fetch：_FETCH_TIMEOUT_MS 超时 */
async function fetchOnce(url: string): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), _FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * fetch 封装：超时 + 一次退避重试。
 * 一次网络抖动就让坐标解析失败且批量路径会把失败项永久标 none（batchResolveCoordinates），
 * 重试一轮能消掉绝大部分瞬时抖动。
 */
async function safeFetch(url: string): Promise<Response> {
  try {
    return await fetchOnce(url)
  } catch {
    await new Promise((r) => setTimeout(r, _RETRY_BACKOFF_MS))
    return fetchOnce(url)
  }
}

/** 验证经纬度是否合法。(0,0) 视为无效——它是占位/解析失败的典型值，不是真实门店坐标 */
export function isValidLatLon(lat: number, lon: number): boolean {
  if (lat === 0 && lon === 0) return false
  return !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}

/**
 * 归一化中国范围经纬度：自动纠正经纬度互换（如录入时经度纬度写反）。
 * 互换判断基于中国范围启发式（经度 73~135，纬度 3~54），互换后仍非法则返回 null。
 */
export function normalizeChinaLatLon(lat: number, lon: number): { latitude: number; longitude: number } | null {
  const lonIsValid = lon >= 73 && lon <= 135
  const latIsValid = lat >= 3 && lat <= 54
  const lonAsLat = lon >= 3 && lon <= 54
  const latAsLon = lat >= 73 && lat <= 135
  if (!lonIsValid && !latIsValid && latAsLon && lonAsLat) {
    ;[lat, lon] = [lon, lat]
  }
  if (!isValidLatLon(lat, lon)) return null
  return { latitude: lat, longitude: lon }
}

/**
 * 球面余弦定理距离计算（纯函数，不调用 API）
 * 对标 Excel 公式，地球半径 6371004 米
 */
export function calcDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const raw =
    1 -
    (Math.pow(
      Math.sin(((90 - lat1) * Math.PI) / 180) * Math.cos((lon1 * Math.PI) / 180) -
        Math.sin(((90 - lat2) * Math.PI) / 180) * Math.cos((lon2 * Math.PI) / 180),
      2,
    ) +
      Math.pow(
        Math.sin(((90 - lat1) * Math.PI) / 180) * Math.sin((lon1 * Math.PI) / 180) -
          Math.sin(((90 - lat2) * Math.PI) / 180) * Math.sin((lon2 * Math.PI) / 180),
        2,
      ) +
      Math.pow(Math.cos(((90 - lat1) * Math.PI) / 180) - Math.cos(((90 - lat2) * Math.PI) / 180), 2)) /
      2
  return 6371004 * Math.acos(Math.min(1, Math.max(-1, raw)))
}

// ════════════════════════════════════════
// POI 搜索
// ════════════════════════════════════════

/**
 * 高德 POI 关键词搜索，返回第一条结果的经纬度
 * @param keywords 关键词（门店名、地址等）
 * @param city 城市限定（可选，避免同名地址匹配到外省）
 */
export async function keywordSearch(
  keywords: string,
  city?: string,
): Promise<{ latitude: number | null; longitude: number | null }> {
  try {
    const params = new URLSearchParams({
      key: getAmapRestKey(),
      keywords,
      types: '',
      children: '1',
      offset: '20',
      page: '1',
      extensions: 'all',
    })
    if (city) params.set('city', city)
    const resp = await safeFetch(`https://restapi.amap.com/v5/place/text?${params.toString()}`)
    const data = (await resp.json()) as { infocode: string; info?: string; pois: Array<{ location: string }> }
    // Key 无效/QPS 超限/配额耗尽时高德返回 status:'0' + 错误 infocode，pois 为空——
    // 显式暴露错误（此前静默返回 null，调用方无法区分“无结果”与“API 报错”）
    if (data.infocode && data.infocode !== '10000') {
      reportWarn(`[amap] 关键词搜索 API 错误: infocode=${data.infocode} info=${data.info ?? ''}`, keywords)
      return { latitude: null, longitude: null }
    }
    const location = data.pois?.[0]?.location || ''
    if (!location) return { latitude: null, longitude: null }
    const [longitude, latitude] = location.split(',')
    return { latitude: parseFloat(latitude), longitude: parseFloat(longitude) }
  } catch {
    reportEvent('amap/keyword-search-failed', '[amap] 关键词搜索失败:', { keywords, city }, 'warn')
    return { latitude: null, longitude: null }
  }
}

/** 解析高德 API 响应为 PoiItem[] */
async function parseAroundResp(resp: Response): Promise<PoiItem[]> {
  const data = (await resp.json()) as {
    infocode: string
    info?: string
    pois: Array<{
      name: string
      address: string
      location: string
      photos?: Array<{ title: string; url: string }>
      type?: string
      typecode?: string
      distance?: number
      id?: string
    }>
  }
  // API 错误（Key 无效/QPS 超限）显式暴露，避免与“无结果”混淆
  if (data.infocode && data.infocode !== '10000') {
    reportWarn(`[amap] 周边/搜索 API 错误: infocode=${data.infocode} info=${data.info ?? ''}`)
    return []
  }
  return (data.pois || [])
    .map((p) => {
      const [lon2, lat2] = (p.location || '').split(',').map(Number)
      return {
        id: p.id,
        name: p.name || '',
        address: p.address || '',
        latitude: lat2 || 0,
        longitude: lon2 || 0,
        photos: p.photos,
        type: p.type,
        typecode: p.typecode,
        distance: p.distance ? Number(p.distance) : undefined,
      }
    })
    .filter((p) => p.latitude !== 0 && p.longitude !== 0)
}

/** 周边搜索单页条数 —— 高德 v5 place 接口 offset 的上限即 25。
 *  请求参数和「这一页是否满了、还有下一页」的判定必须是同一个值：两处分开写时一旦改请求数，
 *  判定就永远不再成立，结果静默停在第一页。 */
const POI_PAGE_SIZE = 25

/** 搜索一页周边 POI */
async function searchNearbyPage(
  lat: number,
  lon: number,
  radius: number,
  page: number,
  types?: string,
): Promise<PoiItem[]> {
  try {
    const base = `key=${getAmapRestKey()}&location=${lon},${lat}&radius=${radius}&offset=${POI_PAGE_SIZE}&page=${page}&extensions=all`
    const url = types
      ? `https://restapi.amap.com/v5/place/around?${base}&types=${encodeURIComponent(types)}`
      : `https://restapi.amap.com/v5/place/around?${base}`
    return await parseAroundResp(await safeFetch(url))
  } catch {
    reportEvent('amap/nearby-search-failed', '[amap] 周边搜索失败', undefined, 'warn')
    return []
  }
}

/** 去重 key 生成 */
function dedupKey(p: { name: string; latitude: number; longitude: number }): string {
  return `${p.name}|${p.latitude}|${p.longitude}`
}

/**
 * 周边搜索：合并前两页，指定 types 时补无 types 的剩余 POI
 * @param lat 纬度
 * @param lon 经度
 * @param radius 搜索半径（米，默认 100）
 * @param types POI 类型代码（可选）
 */
export async function searchNearby(lat: number, lon: number, radius: number = 100, types?: string): Promise<PoiItem[]> {
  const seen = new Set<string>()
  const merged: PoiItem[] = []

  async function fetchDedup(page: number, t?: string): Promise<PoiItem[]> {
    const items = await searchNearbyPage(lat, lon, radius, page, t)
    return items.filter((p) => {
      const k = dedupKey(p)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }

  const page1 = await fetchDedup(1, types)
  merged.push(...page1)
  if (page1.length >= POI_PAGE_SIZE) {
    const page2 = await fetchDedup(2, types)
    merged.push(...page2)
  }

  if (types) {
    const extra = await fetchDedup(1)
    merged.push(...extra)
    if (extra.length >= POI_PAGE_SIZE) {
      const extra2 = await fetchDedup(2)
      merged.push(...extra2)
    }
  }

  return merged
}

/** 根据 POI ID 获取详情（含照片） */
export async function fetchPoiDetail(id: string): Promise<{
  photos?: PoiPhoto[]
  type?: string
  typecode?: string
  address?: string
  name?: string
} | null> {
  try {
    const resp = await safeFetch(
      `https://restapi.amap.com/v5/place/detail?key=${getAmapRestKey()}&id=${encodeURIComponent(id)}`,
    )
    const data = (await resp.json()) as {
      infocode: string
      pois?: Array<{
        name: string
        address: string
        type: string
        typecode: string
        photos?: Array<{ title: string; url: string }>
      }>
    }
    if (!data.pois || data.pois.length === 0) return null
    const p = data.pois[0]
    return { photos: p.photos, type: p.type, typecode: p.typecode, address: p.address, name: p.name }
  } catch {
    return null
  }
}

/** 根据 POI 名称搜索照片（place/text 搜索） */
async function searchPoiPhotosByName(name: string, lat: number, lon: number): Promise<PoiPhoto[] | null> {
  try {
    const query = `key=${getAmapRestKey()}&keywords=${encodeURIComponent(name)}&location=${lon},${lat}&radius=200&offset=5&page=1&extensions=all`
    const resp = await safeFetch(`https://restapi.amap.com/v5/place/text?${query}`)
    const data = (await resp.json()) as {
      pois?: Array<{ photos?: Array<{ title: string; url: string }> }>
    }
    if (!data.pois || data.pois.length === 0) return null
    const all: PoiPhoto[] = []
    const seen = new Set<string>()
    for (const p of data.pois) {
      if (p.photos) {
        for (const ph of p.photos) {
          if (!seen.has(ph.url)) {
            seen.add(ph.url)
            all.push(ph)
          }
        }
      }
    }
    return all.length > 0 ? all : null
  } catch {
    return null
  }
}

/**
 * 批量获取 POI 照片
 * 第一轮按 ID 查 detail，第二轮按名称搜索兜底
 */
export async function batchFetchPoiPhotos(
  items: { id?: string; name: string; latitude: number; longitude: number }[],
  count: number = 20,
  centerLat?: number,
  centerLon?: number,
): Promise<Map<string, PoiPhoto[]>> {
  const result = new Map<string, PoiPhoto[]>()
  const targets = items.slice(0, count)
  if (targets.length === 0) return result

  const idTargets = targets.filter((p) => p.id)
  const detailResponses = await Promise.allSettled(idTargets.map((p) => fetchPoiDetail(p.id!)))
  const idPhotoMap = new Map<string, PoiPhoto[]>()
  for (let i = 0; i < idTargets.length; i++) {
    const r = detailResponses[i]
    if (r.status === 'fulfilled' && r.value?.photos && r.value.photos.length > 0) {
      idPhotoMap.set(idTargets[i].id!, r.value.photos)
      result.set(idTargets[i].id!, r.value.photos)
    }
  }

  const needNameSearch = targets.filter((p) => {
    if (!p.id) return true
    return !idPhotoMap.has(p.id)
  })

  // 顺序分块跑完，不再只查前 _NAME_SEARCH_BATCH_MAX 个就把其余静默丢掉。
  // 该常量是**单轮并发窗口**（放大它才会把高德 QPS 打满），不是总量上限；
  // 这条链路的数量上限由调用方传的 count 决定。
  for (let i = 0; i < needNameSearch.length; i += _NAME_SEARCH_BATCH_MAX) {
    const batch = needNameSearch.slice(i, i + _NAME_SEARCH_BATCH_MAX)
    const nameResponses = await Promise.allSettled(
      batch.map((p) => searchPoiPhotosByName(p.name, centerLat ?? p.latitude, centerLon ?? p.longitude)),
    )
    for (let j = 0; j < batch.length; j++) {
      const r = nameResponses[j]
      if (r.status === 'fulfilled' && r.value) {
        const item = batch[j]
        const syntheticKey = `${item.name}|${item.latitude}|${item.longitude}`
        result.set(syntheticKey, r.value)
        if (item.id) result.set(item.id, r.value)
      }
    }
  }

  return result
}

// ════════════════════════════════════════
// 驾车路线
// ════════════════════════════════════════

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
  if (!key) throw new Error(t('amap.driveRouteNoKey'))

  const params = new URLSearchParams({
    key,
    origin: origin.join(','),
    destination: destination.join(','),
    extensions: 'all',
    output: 'JSON',
  })

  if (waypoints.length > 0) {
    params.set('waypoints', waypoints.map((wp) => wp.join(',')).join(';'))
  }

  const url = `https://restapi.amap.com/v5/direction/driving?${params.toString()}`

  try {
    const resp = await safeFetch(url)
    const data = (await resp.json()) as {
      infocode: string
      route?: {
        paths?: Array<{
          distance: string
          duration: string
          tolls?: string
          traffic_lights?: string
          steps?: Array<{ polyline: string }>
        }>
      }
    }

    if (data.infocode !== '10000' || !data.route?.paths?.length) {
      throw new Error(`${t('amap.driveRouteFailed')}: ${data.infocode}`)
    }

    const path = data.route.paths[0]
    const polyline: [number, number][] = []
    for (const step of path.steps || []) {
      if (step.polyline) {
        const points = step.polyline.split(';')
        for (const pt of points) {
          const [lon, lat] = pt.split(',').map(Number)
          if (!isNaN(lon) && !isNaN(lat)) polyline.push([lon, lat])
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
  } catch (e) {
    if (e instanceof Error && e.message.startsWith(t('amap.driveRouteFailed'))) throw e
    throw new Error(t('amap.driveRouteNetwork'), { cause: e })
  }
}

// ════════════════════════════════════════
// 地理编码辅助（重试策略）
// ════════════════════════════════════════

/**
 * 执行高德搜索 + 距离计算（重试策略）
 * 先用"门店名称 + 地址"，超 700m 时只用地址，再不行用"地址 + 门店名"
 * 取所有成功结果中距离最近的那个
 */
export async function geocodeCalc(params: {
  address: string
  storeName: string
  targetLat: number
  targetLon: number
  city?: string
}): Promise<{
  distance: number
  amapLat: number
  amapLon: number
  exceeded: boolean
}> {
  const { address, storeName, targetLat, targetLon, city } = params
  const validResults: { latitude: number; longitude: number; distance: number; query: string }[] = []

  async function performQuery(query: string, retryType: 'none' | 'address' | 'address_store'): Promise<void> {
    const { latitude, longitude } = await keywordSearch(query, city)

    if (
      latitude === null ||
      longitude === null ||
      isNaN(latitude) ||
      isNaN(longitude) ||
      !isValidLatLon(latitude, longitude)
    ) {
      if (retryType === 'none') return performQuery(address, 'address')
      if (retryType === 'address') return performQuery(`${address} ${storeName}`, 'address_store')
      return
    }

    const distance = calcDistance(latitude, longitude, targetLat, targetLon)
    validResults.push({ latitude, longitude, distance, query })

    if (distance > _GEOCODE_ACCEPT_RADIUS_M) {
      if (retryType === 'none') return performQuery(address, 'address')
      if (retryType === 'address') return performQuery(`${address} ${storeName}`, 'address_store')
    }
  }

  await performQuery(`${storeName} ${address}`, 'none')

  if (validResults.length === 0) throw new Error(t('amap.invalidRouteResults'))

  const best = validResults.reduce((prev, curr) => (prev.distance < curr.distance ? prev : curr))
  return {
    distance: best.distance,
    amapLat: best.latitude,
    amapLon: best.longitude,
    exceeded: best.distance > 700,
  }
}

// ════════════════════════════════════════
// 导航深度链接
// ════════════════════════════════════════

/** 检测当前平台 */
export function detectPlatform(): 'ios' | 'android' | 'web' {
  if (typeof navigator === 'undefined') return 'web'
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  return 'web'
}

/** 坐标点（导航用） */
export interface NavPoint {
  lon: number
  lat: number
  name: string
}

/**
 * 生成单段导航链接（A → B，可选途经点）
 * 自动适配 iOS / Android / Web 三端
 */
export function buildNavLink(from: NavPoint, to: NavPoint, waypoints: NavPoint[] = []): NavLink {
  const label = `${from.name} → ${to.name}`
  const platform = detectPlatform()

  const viaStr = waypoints.map((wp) => `${wp.lon},${wp.lat}`).join(';')

  const webParams = new URLSearchParams({
    from: `${from.lon},${from.lat},${from.name}`,
    to: `${to.lon},${to.lat},${to.name}`,
    mode: 'car',
  })
  if (viaStr) webParams.set('via', viaStr)
  webParams.set('callnative', '1')
  const webUrl = `https://uri.amap.com/navigation?${webParams.toString()}`

  const iosParams = new URLSearchParams({
    sourceApplication: 'vcl-ui',
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
    iosParams.set('via', waypoints.map((wp) => `${wp.lon},${wp.lat},${wp.name}`).join(';'))
  }
  const iosUrl = `iosamap://path?${iosParams.toString()}`

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
    androidParams.set('via', waypoints.map((wp) => `${wp.lon},${wp.lat},${wp.name}`).join(';'))
  }
  const androidUrl = `amap://route/plan/?${androidParams.toString()}`

  const url = platform === 'ios' ? iosUrl : platform === 'android' ? androidUrl : webUrl

  return { label, url, webUrl }
}

/**
 * 反向地理编码：坐标 → 结构化地址（2026-10-19）
 *
 * 用途：地图选点后自动把文字地址回填给 `address` 字段——用户点一下地图，
 * 不必再手打一遍省市和街道。
 *
 * 与 `geocodeCalc` 的区别：那个是**正向**（地址→坐标，用于核对门店位置是否偏移），
 * 这个是**反向**（坐标→地址）。两者不共用实现。
 *
 * 返回值刻意给**结构化**的省/市/区/街道/门牌，而不是一整串拼好的字符串：
 * 宿主要拼成什么格式、要不要省略"中国"，是宿主的口径，库不该替它决定。
 * 同时给 `formatted` 便于直接展示。
 *
 * 失败语义：无 key / 网络失败 / 接口返回非 1 → 返回 null（**不抛**）——
 * 反向地理编码只是"锦上添花"，它失败不该让用户已经选好的坐标作废。
 */
export async function reverseGeocode(
  lng: number,
  lat: number,
): Promise<{
  /** 高德返回的整串地址（如「北京市东城区东华门街道东长安街」） */
  formatted: string
  province: string
  city: string
  district: string
  township: string
  street: string
  /** 门牌号（可能为空：街道级位置常无门牌） */
  streetNumber: string
} | null> {
  if (!isValidLatLon(lat, lng)) return null
  const key = getAmapRestKey()
  if (!key) return null

  const params = new URLSearchParams({
    key,
    location: `${lng},${lat}`,
    extensions: 'base',
  })

  try {
    const resp = await safeFetch(`https://restapi.amap.com/v3/geocode/regeo?${params.toString()}`)
    if (!resp.ok) return null
    const json = (await resp.json()) as {
      status?: string
      regeocode?: {
        formatted_address?: string
        addressComponent?: {
          province?: string
          city?: string
          district?: string
          township?: string
          streetNumber?: { street?: string; number?: string }
        }
      }
    }
    // 高德约定 status === '1' 为成功，其余（无 key 权限/超限/坐标无效）都可能返回 '0'
    if (json.status !== '1' || !json.regeocode) return null
    const ac = json.regeocode.addressComponent ?? {}
    // 直辖市（北京/上海/天津/重庆）的 city 字段是空数组，用 province 顶上
    const city = typeof ac.city === 'string' ? ac.city : (ac.province ?? '')
    return {
      formatted: json.regeocode.formatted_address ?? '',
      province: typeof ac.province === 'string' ? ac.province : '',
      city,
      district: typeof ac.district === 'string' ? ac.district : '',
      township: typeof ac.township === 'string' ? ac.township : '',
      street: ac.streetNumber?.street ?? '',
      streetNumber: ac.streetNumber?.number ?? '',
    }
  } catch {
    return null
  }
}
