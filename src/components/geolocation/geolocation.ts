/**
 * 地理位置工具 — 高德搜索 + 距离计算 + 周边 POI
 *
 * 使用前必须设置自己的 Key：import { setAmapKey } from '...' → setAmapKey('your-key')
 * 或在 .env 中配置 VITE_AMAP_KEY
 */
const AMAP_DEFAULT_KEY = import.meta.env.VITE_AMAP_KEY || ''
let _amapKey = ''

/** 设置高德地图 API Key */
export function setAmapKey(key: string): void { _amapKey = key }
function getKey(): string {
  const key = _amapKey || AMAP_DEFAULT_KEY
  if (!key) {
    console.warn('[geolocation] 未设置高德 API Key，请调用 setAmapKey() 或配置 VITE_AMAP_KEY')
  }
  return key
}

/** fetch 封装：15s 超时 + 错误兜底 */
async function safeFetch(url: string): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** 高德地图 POI 关键词搜索，返回第一条结果的经纬度 */
export async function amapKeywordSearch(
  keywords: string,
  city?: string,
): Promise<{ latitude: number | null; longitude: number | null }> {
  try {
    const params = new URLSearchParams({
      key: getKey(),
      keywords,
      types: '',
      children: '1',
      offset: '20',
      page: '1',
      extensions: 'all',
    })
    // 指定城市范围，避免同名地址匹配到外省
    if (city) params.set('city', city)
    const resp = await safeFetch(`https://restapi.amap.com/v5/place/text?${params.toString()}`)
    const data = await resp.json() as { infocode: string; pois: Array<{ location: string }> }
    const location = data.pois?.[0]?.location || ''
    if (!location) return { latitude: null, longitude: null }
    const [longitude, latitude] = location.split(',')
    return { latitude: parseFloat(latitude), longitude: parseFloat(longitude) }
  } catch {
    console.warn('[geolocation] 高德关键词搜索失败:', keywords, city ? `城市: ${city}` : '')
    return { latitude: null, longitude: null }
  }
}

/** 验证经纬度是否合法 */
export function isValidLatLon(lat: number, lon: number): boolean {
  return !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}

/**
 * 球面余弦定理（对标 Excel 公式，90-lat）
 * B=AMap纬度 A=AMap经度 D=GPS纬度 C=GPS经度
 * =6371004*ACOS(1-(
 *   POWER(SIN((90-B)*PI()/180)*COS(A*PI()/180)-SIN((90-D)*PI()/180)*COS(C*PI()/180),2)+
 *   POWER(SIN((90-B)*PI()/180)*SIN(A*PI()/180)-SIN((90-D)*PI()/180)*SIN(C*PI()/180),2)+
 *   POWER(COS((90-B)*PI()/180)-COS((90-D)*PI()/180),2)
 * )/2)
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const raw = 1 - (
    Math.pow((Math.sin((90 - lat1) * Math.PI / 180) * Math.cos(lon1 * Math.PI / 180) -
      Math.sin((90 - lat2) * Math.PI / 180) * Math.cos(lon2 * Math.PI / 180)), 2) +
    Math.pow((Math.sin((90 - lat1) * Math.PI / 180) * Math.sin(lon1 * Math.PI / 180) -
      Math.sin((90 - lat2) * Math.PI / 180) * Math.sin(lon2 * Math.PI / 180)), 2) +
    Math.pow((Math.cos((90 - lat1) * Math.PI / 180) - Math.cos((90 - lat2) * Math.PI / 180)), 2)
  ) / 2
  // clamp 到 [-1, 1] 防止浮点舍入导致 NaN
  return 6371004 * Math.acos(Math.min(1, Math.max(-1, raw)))
}

/** 查询结果记录 */
interface QueryResult {
  latitude: number
  longitude: number
  distance: number
}

/**
 * 执行高德搜索 + 距离计算（对标旧版 geolocation()）
 * 重试策略：门店+地址 → 只用地址 → 地址+门店
 * 取所有成功结果中距离最近的那个
 * @param params.city 城市限定（避免同名地址匹配到外省）
 */
export async function geolocationCalc(params: {
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
  const validResults: (QueryResult & { query: string })[] = []

  /** 递归重试查询，取最近距离结果 */
  const performQuery = async (query: string, retryType: 'none' | 'address' | 'address_store'): Promise<void> => {
    const { latitude, longitude } = await amapKeywordSearch(query, city)

    // 查询结果无效，尝试下一级重试
    if (latitude === null || longitude === null || isNaN(latitude) || isNaN(longitude) || !isValidLatLon(latitude, longitude)) {
      if (retryType === 'none') return performQuery(address, 'address')
      if (retryType === 'address') return performQuery(`${address} ${storeName}`, 'address_store')
      return
    }

    const distance = calculateDistance(latitude, longitude, targetLat, targetLon)
    validResults.push({ latitude, longitude, distance, query })

    // 距离超 700 米，尝试下一级重试
    if (distance > 700) {
      if (retryType === 'none') return performQuery(address, 'address')
      if (retryType === 'address') return performQuery(`${address} ${storeName}`, 'address_store')
    }
  }

  // 开始查询：先用"门店名称 + 地址"
  await performQuery(`${storeName} ${address}`, 'none')

  if (validResults.length === 0) {
    throw new Error('查询结果无效，请检查地址或门店名称')
  }

  // 选距离最近的结果
  const best = validResults.reduce((prev, curr) => prev.distance < curr.distance ? prev : curr)
  return {
    distance: best.distance,
    amapLat: best.latitude,
    amapLon: best.longitude,
    exceeded: best.distance > 700,
  }
}

// ============================================================
// 新增：周边搜索
// ============================================================

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

/** 解析高德 API 响应为 PoiItem[] */
async function parseAroundResp(resp: Response): Promise<PoiItem[]> {
  const data = await resp.json() as {
    infocode: string
    pois: Array<{
      name: string; address: string; location: string
      photos?: Array<{ title: string; url: string }>
      type?: string; typecode?: string; distance?: number; id?: string
    }>
  }
  return (data.pois || []).map(p => {
    const [lon2, lat2] = (p.location || '').split(',').map(Number)
    return {
      id: p.id, name: p.name || '', address: p.address || '',
      latitude: lat2 || 0, longitude: lon2 || 0,
      photos: p.photos, type: p.type, typecode: p.typecode, distance: p.distance ? Number(p.distance) : undefined,
    }
  }).filter(p => p.latitude !== 0 && p.longitude !== 0)
}

/** 搜索一页周边 POI */
async function searchNearbyPage(
  lat: number, lon: number, radius: number, page: number,
  types?: string,
): Promise<PoiItem[]> {
  try {
    const base = `key=${getKey()}&location=${lon},${lat}&radius=${radius}&offset=25&page=${page}&extensions=all`
    const url = types
      ? `https://restapi.amap.com/v5/place/around?${base}&types=${encodeURIComponent(types)}`
      : `https://restapi.amap.com/v5/place/around?${base}`
    return await parseAroundResp(await safeFetch(url))
  } catch {
    console.warn('[geolocation] 周边搜索失败')
    return []
  }
}

/** 去重 key 生成 */
function dedupKey(p: { name: string; latitude: number; longitude: number }): string {
  return `${p.name}|${p.latitude}|${p.longitude}`
}

/** 周边搜索：合并前两页，固定建筑优先排列 */
export async function searchNearby(
  lat: number,
  lon: number,
  radius: number = 100,
  types?: string,
): Promise<PoiItem[]> {
  const seen = new Set<string>()
  const merged: PoiItem[] = []

  /** 取一页并去重 */
  async function fetchDedup(page: number, t?: string): Promise<PoiItem[]> {
    const items = await searchNearbyPage(lat, lon, radius, page, t)
    return items.filter(p => {
      const k = dedupKey(p)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }

  // 先取 typed 两页
  const page1 = await fetchDedup(1, types)
  merged.push(...page1)
  if (page1.length >= 25) {
    const page2 = await fetchDedup(2, types)
    merged.push(...page2)
  }

  // 指定了 types 时，补一版无 types 的剩余 POI（两页）
  if (types) {
    const extra = await fetchDedup(1)
    merged.push(...extra)
    if (extra.length >= 25) {
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
    const resp = await safeFetch(`https://restapi.amap.com/v5/place/detail?key=${getKey()}&id=${encodeURIComponent(id)}`)
    const data = await resp.json() as {
      infocode: string
      pois?: Array<{
        name: string; address: string; type: string; typecode: string
        photos?: Array<{ title: string; url: string }>
      }>
    }
    if (!data.pois || data.pois.length === 0) return null
    const p = data.pois[0]
    return { photos: p.photos, type: p.type, typecode: p.typecode, address: p.address, name: p.name }
  } catch { return null }
}

/** 根据 POI 名称搜索照片（place/text 搜索，可获取更丰富的照片数据） */
async function searchPoiPhotosByName(
  name: string,
  lat: number,
  lon: number,
): Promise<PoiPhoto[] | null> {
  try {
    const query = `key=${getKey()}&keywords=${encodeURIComponent(name)}&location=${lon},${lat}&radius=200&offset=5&page=1&extensions=all`
    const resp = await safeFetch(`https://restapi.amap.com/v5/place/text?${query}`)
    const data = await resp.json() as {
      pois?: Array<{ photos?: Array<{ title: string; url: string }> }>
    }
    if (!data.pois || data.pois.length === 0) return null
    // 合并所有结果中的照片
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
  } catch { return null }
}

/** 批量获取 POI 照片（并发请求，最多取前 count 个 POI）
 *  先尝试 place/detail（按 ID），无照片时 place/text（按名称）兜底 */
export async function batchFetchPoiPhotos(
  items: { id?: string; name: string; latitude: number; longitude: number }[],
  count: number = 20,
  centerLat?: number,
  centerLon?: number,
): Promise<Map<string, PoiPhoto[]>> {
  const result = new Map<string, PoiPhoto[]>()
  const targets = items.slice(0, count)
  if (targets.length === 0) return result

  // 第一轮：按 ID 查 detail
  const idTargets = targets.filter(p => p.id)
  const detailResponses = await Promise.allSettled(
    idTargets.map(p => fetchPoiDetail(p.id!))
  )
  const idPhotoMap = new Map<string, PoiPhoto[]>()
  for (let i = 0; i < idTargets.length; i++) {
    const r = detailResponses[i]
    if (r.status === 'fulfilled' && r.value?.photos && r.value.photos.length > 0) {
      idPhotoMap.set(idTargets[i].id!, r.value.photos)
      result.set(idTargets[i].id!, r.value.photos)
    }
  }

  // 第二轮：没照片的 POI 按名称搜索兜底（最多 10 个）
  const needNameSearch = targets.filter(p => {
    if (!p.id) return true
    return !idPhotoMap.has(p.id)
  }).slice(0, 10)

  if (needNameSearch.length > 0) {
    const nameResponses = await Promise.allSettled(
      needNameSearch.map(p => searchPoiPhotosByName(p.name, centerLat ?? p.latitude, centerLon ?? p.longitude))
    )
    for (let i = 0; i < needNameSearch.length; i++) {
      const r = nameResponses[i]
      if (r.status === 'fulfilled' && r.value) {
        // 用 name|lat|lon 作为合成 key，消费者可通过同样格式的 key 查找
        const item = needNameSearch[i]
        const syntheticKey = `${item.name}|${item.latitude}|${item.longitude}`
        result.set(syntheticKey, r.value)
        // 有 ID 的也挂到 ID key 上
        if (item.id) {
          result.set(item.id, r.value)
        }
      }
    }
  }

  return result
}
