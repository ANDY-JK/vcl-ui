/**
 * amap-key.ts — 高德 API Key 统一管理（唯一真相源）
 *
 * 组件库不内置任何 Key — 调用方必须自行设置：
 *   import { setAmapKey } from '@/components/amap'
 *   setAmapKey('your-key')
 *
 * .env 里的 VITE_AMAP_KEY / VITE_AMAP_SECRET 只是**开发期便利**（demo 站点免手填）：
 * 走 runtimeEnv() 守卫，生产构建下该分支被摇树消除，库产物不携带任何凭证。
 *
 * JS API Key（前端地图 SDK）和 REST API Key（服务端接口）默认共用一个 Key，
 * 如需分别设置，用 setAmapKeys({ jsKey, restKey, securityCode })
 */
import { envValue } from '@/components/_internal/env-guard'

/** 高德 Key 集合 */
interface AmapKeys {
  /** JS API Key — 用于前端地图 SDK（@vuemap/vue-amap） */
  jsKey: string
  /** REST API Key — 用于服务端接口（驾车路线、地理编码、POI 搜索） */
  restKey: string
  /** JS API Security Code — 配合 JS API Key 使用的安全密钥 */
  securityCode: string
}

/** 开发期从环境变量取默认 Key；生产构建恒为空字符串（未配置也为空） */
const ENV_KEYS: AmapKeys = {
  jsKey: envValue('VITE_AMAP_KEY') ?? '',
  restKey: envValue('VITE_AMAP_KEY') ?? '',
  securityCode: envValue('VITE_AMAP_SECRET') ?? '',
}

/** 运行时覆盖的 Key（优先于环境变量） */
let _override: Partial<AmapKeys> = {}

/** 是否已警告过未设置 Key */
let _warned = false

/** Key 变更订阅者（amap-loader 等需要感知 key 变化的模块注册） */
const _subscribers = new Set<(keys: AmapKeys) => void>()

/** 订阅 Key 变更（返回退订函数）。amap-loader 用它感知 setAmapKey 后的变化 */
export function onAmapKeyChange(fn: (keys: AmapKeys) => void): () => void {
  _subscribers.add(fn)
  return () => _subscribers.delete(fn)
}

function notifyChange(): void {
  const keys = getKeys()
  _subscribers.forEach((fn) => {
    try {
      fn(keys)
    } catch {
      /* 订阅者异常不影响主流程 */
    }
  })
}

/** 获取当前生效的 Key 集合 */
function getKeys(): AmapKeys {
  return {
    jsKey: _override.jsKey || ENV_KEYS.jsKey,
    restKey: _override.restKey || ENV_KEYS.restKey,
    securityCode: _override.securityCode || ENV_KEYS.securityCode,
  }
}

/** 统一设置高德 Key（JS API 和 REST 共用，保留已设置的 securityCode） */
export function setAmapKey(key: string): void {
  _override = { ..._override, jsKey: key, restKey: key }
  notifyChange()
}

/** 分别设置高德 Key（JS API 和 REST 可不同） */
export function setAmapKeys(keys: { jsKey?: string; restKey?: string; securityCode?: string }): void {
  _override = { ..._override, ...keys }
  notifyChange()
}

/** 获取 JS API Key（前端地图 SDK 用） */
export function getAmapJsKey(): string {
  const key = getKeys().jsKey
  if (!key && !_warned) {
    console.warn('[amap] 未设置高德 JS API Key，请调用 setAmapKey() 或配置 VITE_AMAP_KEY')
    _warned = true
  }
  return key
}

/** 获取 REST API Key（驾车路线、地理编码等服务端接口用） */
export function getAmapRestKey(): string {
  const key = getKeys().restKey
  if (!key && !_warned) {
    console.warn('[amap] 未设置高德 REST API Key，请调用 setAmapKey() 或配置 VITE_AMAP_KEY')
    _warned = true
  }
  return key
}

/** 获取 JS API Security Code */
export function getAmapSecurityCode(): string {
  return getKeys().securityCode
}
