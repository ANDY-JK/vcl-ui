/**
 * 高德 API Key 统一管理
 *
 * 组件库不内置任何 Key — 调用方必须自行设置：
 *   import { setAmapKey } from '@/components/route-planner/utils/amap-key'
 *   setAmapKey('your-key')
 * 或在 .env 中配置 VITE_AMAP_KEY
 *
 * JS API Key（前端地图 SDK）和 REST API Key（服务端接口）使用同一 Key，
 * 如需分别设置，用 setAmapKeys({ jsKey, restKey })
 */

/** 高德 Key 集合 */
interface AmapKeys {
  /** JS API Key — 用于前端地图 SDK（RouteMap.vue 的 @vuemap/vue-amap） */
  jsKey: string
  /** REST API Key — 用于服务端接口（驾车路线、地理编码、POI 搜索） */
  restKey: string
  /** JS API Security Code — 配合 JS API Key 使用的安全密钥 */
  securityCode: string
}

/** 从环境变量读取默认 Key（未配置则为空字符串） */
const ENV_KEYS: AmapKeys = {
  jsKey: import.meta.env.VITE_AMAP_KEY || '',
  restKey: import.meta.env.VITE_AMAP_KEY || '',
  securityCode: import.meta.env.VITE_AMAP_SECRET || '',
}

/** 运行时覆盖的 Key（优先于环境变量） */
let _override: Partial<AmapKeys> = {}

/** 是否已警告过未设置 Key */
let _warned = false

/** 获取当前生效的 Key 集合 */
function getKeys(): AmapKeys {
  return {
    jsKey: _override.jsKey || ENV_KEYS.jsKey,
    restKey: _override.restKey || ENV_KEYS.restKey,
    securityCode: _override.securityCode || ENV_KEYS.securityCode,
  }
}

/** 统一设置高德 Key（JS API 和 REST 共用） */
export function setAmapKey(key: string): void {
  _override = { jsKey: key, restKey: key, ..._override }
}

/** 分别设置高德 Key（JS API 和 REST 可不同） */
export function setAmapKeys(keys: { jsKey?: string; restKey?: string; securityCode?: string }): void {
  _override = { ..._override, ...keys }
}

/** 获取 JS API Key（前端地图 SDK 用） */
export function getAmapJsKey(): string {
  const key = getKeys().jsKey
  if (!key && !_warned) {
    console.warn('[route-planner] 未设置高德 JS API Key，请调用 setAmapKey() 或配置 VITE_AMAP_KEY')
    _warned = true
  }
  return key
}

/** 获取 REST API Key（驾车路线、地理编码等服务端接口用） */
export function getAmapRestKey(): string {
  const key = getKeys().restKey
  if (!key && !_warned) {
    console.warn('[route-planner] 未设置高德 REST API Key，请调用 setAmapKey() 或配置 VITE_AMAP_KEY')
    _warned = true
  }
  return key
}

/** 获取 JS API Security Code */
export function getAmapSecurityCode(): string {
  return getKeys().securityCode
}
