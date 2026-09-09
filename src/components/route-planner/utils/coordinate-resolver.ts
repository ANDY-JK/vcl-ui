/**
 * coordinate-resolver.ts — 三级坐标解析器
 *
 * REST API 调用已统一到 @/components/amap/amap-service.ts
 * Priority 1: 已有经纬度 → 直接用
 * Priority 2: 门店名+详细地址 → 高德地理编码
 * Priority 3: 四级地址+人民政府 → 高德地理编码（直接用 Excel 原始字符串，不拆解重建）
 */

// re-export 统一 Key 管理
export { setAmapKey } from '@/components/amap'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：错误消息与点位名按当前语言 */
const t = useT()

import { keywordSearch, isValidLatLon } from '@/components/amap'
import type { Store, CoordResult, CoordSource, ProgressCallback } from '@/components/route-planner/types'

/**
 * 解析单个门店的坐标（三级策略）
 * 每级都传入 city 限定，避免同名地址匹配到外省
 */
export async function resolveCoordinate(store: Partial<Store>): Promise<CoordResult> {
  // 提取城市限定词（优先用城市名，其次用区/县名）
  const cityLimit = store.city || store.district || ''

  // Priority 1: 已有经纬度
  if (store.longitude != null && store.latitude != null && isValidLatLon(store.latitude, store.longitude)) {
    return {
      longitude: store.longitude,
      latitude: store.latitude,
      source: 'original',
    }
  }

  // Priority 2: 门店名 + 详细地址（带城市限定）
  if (store.name || store.address) {
    const query2 = [store.name, store.address].filter(Boolean).join(' ')
    const result2 = await keywordSearch(query2, cityLimit)
    if (result2.latitude != null && result2.longitude != null && isValidLatLon(result2.latitude, result2.longitude)) {
      return {
        longitude: result2.longitude,
        latitude: result2.latitude,
        source: 'address_geocode',
      }
    }
    // 降级：只用地址（去掉门店名干扰）+ 城市限定
    if (store.address && store.name) {
      const result2b = await keywordSearch(store.address, cityLimit)
      if (
        result2b.latitude != null &&
        result2b.longitude != null &&
        isValidLatLon(result2b.latitude, result2b.longitude)
      ) {
        return {
          longitude: result2b.longitude,
          latitude: result2b.latitude,
          source: 'address_geocode',
        }
      }
    }
  }

  // Priority 3: 四级地址 + 人民政府定位
  // 优先用 Excel 原始「四级乡镇」列拼接，无则用拆解后的省市区镇字段回退。
  // 必须有城市限定且至少有地域信息：否则会拼出裸查询「人民政府」，
  // 命中任意政府大楼被当成门店坐标（比无坐标更糟）。
  const hasTownshipParts = !!(store.fullAddr || store.province || store.city || store.district || store.town)
  if (cityLimit && hasTownshipParts) {
    const townshipQuery = store.fullAddr
      ? `${store.fullAddr}人民政府`
      : [store.province, store.city, store.district, store.town, '人民政府'].filter(Boolean).join('')
    const result3 = await keywordSearch(townshipQuery, cityLimit)
    if (result3.latitude != null && result3.longitude != null && isValidLatLon(result3.latitude, result3.longitude)) {
      return {
        longitude: result3.longitude,
        latitude: result3.latitude,
        source: 'township_geocode',
      }
    }
  }

  // 全部失败
  throw new Error(
    t('routePlanner.coordResolveFailed', { name: store.name || store.address || t('routePlanner.unknownStore') }),
  )
}

/**
 * 批量解析坐标（带进度回调 + 限速）
 * @param stores 待解析门店
 * @param onProgress 进度回调
 * @param delayMs 每次请求间隔（默认 1200ms，高德限制 5次/秒）
 */
export async function batchResolveCoordinates(
  stores: Partial<Store>[],
  onProgress?: ProgressCallback,
  delayMs: number = 1200,
): Promise<Store[]> {
  const results: Store[] = []
  const total = stores.length

  for (let i = 0; i < total; i++) {
    const partial = stores[i]
    onProgress?.(i + 1, total)

    // 已有坐标直接保留
    if (partial.longitude != null && partial.latitude != null && isValidLatLon(partial.latitude, partial.longitude)) {
      results.push(
        toFullStore(partial, {
          longitude: partial.longitude,
          latitude: partial.latitude,
          source: 'original',
        }),
      )
      continue
    }

    // 需要编码
    try {
      const coord = await resolveCoordinate(partial)
      results.push(toFullStore(partial, coord))
    } catch {
      // 编码失败，保留但标记为 none
      results.push(
        toFullStore(partial, {
          longitude: null,
          latitude: null,
          source: 'none',
        }),
      )
    }

    // 限速延迟
    if (i < total - 1) {
      await sleep(delayMs)
    }
  }

  return results
}

/** 将 Partial<Store> + CoordResult 合并为完整 Store */
function toFullStore(
  partial: Partial<Store>,
  coord: {
    longitude: number | null
    latitude: number | null
    source: CoordSource
  },
): Store {
  return {
    id: partial.id || generateId(),
    name: partial.name || '',
    address: partial.address || '',
    province: partial.province || '',
    city: partial.city || '',
    district: partial.district || '',
    town: partial.town || '',
    contact: partial.contact || '',
    phone: partial.phone || '',
    longitude: coord.longitude,
    latitude: coord.latitude,
    coordSource: coord.source,
    skipped: false,
    note: partial.note,
    // 透传解析前已有的业务字段：乡镇标记身份/四级原始地址/自定义拜访时长
    // （缺省会导致 Excel 导入的乡镇标记丢失身份、visitMinutes 全部退回默认值）
    fullAddr: partial.fullAddr,
    isTownshipMarker: partial.isTownshipMarker,
    visitMinutes: partial.visitMinutes,
  }
}

/** 生成唯一 ID */
function generateId(): string {
  return `store_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 延时 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
