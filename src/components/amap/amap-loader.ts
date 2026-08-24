/**
 * amap-loader.ts — 高德地图 SDK 加载协调器
 *
 * 解决"模块加载时同步初始化"导致的 key 锁死问题：
 * - @vuemap/vue-amap 的 initAMapApiLoader 是全局单例，第一次调用即锁死 key（幂等 return）
 * - 原实现（AmapWidget/RouteMap）在 <script setup> 模块作用域同步执行，
 *   组件 import 时 key 就被捕获，运行时 setAmapKey() 对地图渲染无效
 *
 * 本协调器：
 * - ensureInit(key)：首次用当前 key 初始化；重复调用幂等（不重载）
 * - onKeyChanged(key)：初始化前变更 → 记录待用；初始化后变更 → 返回 true 提示需刷新
 *   （高德 JS SDK 已加载后无法热换 key，诚实提示而非假装支持）
 *
 * 依赖注入 loadScript（默认 @vuemap/vue-amap 的 initAMapApiLoader），便于测试。
 */
import { initAMapApiLoader } from '@vuemap/vue-amap'
import { onAmapKeyChange } from './amap-key'

export interface AmapLoaderConfig {
  /** 实际加载高德 SDK 的函数（默认 @vuemap/vue-amap 的 initAMapApiLoader） */
  loadScript?: (config: { key: string; version: string; plugins?: string[] }) => void
}

export interface AmapLoader {
  /** 确保 SDK 已用当前 key 初始化（幂等） */
  ensureInit(key: string): void
  /** 是否已初始化 */
  isInitialized(): boolean
  /** key 变更回调：返回 true 表示已初始化后变更（需刷新页面才能生效） */
  onKeyChanged(key: string): boolean
}

export function createAmapLoader(config: AmapLoaderConfig = {}): AmapLoader {
  const loadScript = config.loadScript ?? ((c) => initAMapApiLoader(c as never))
  let initialized = false

  return {
    ensureInit(key: string) {
      if (initialized) return
      initialized = true
      loadScript({ key, version: '2.0', plugins: ['AMap.ToolBar', 'AMap.Scale'] })
    },

    isInitialized() {
      return initialized
    },

    onKeyChanged(_key: string): boolean {
      // 未初始化：key 已记录在 amap-key 的 _override 中，ensureInit 时会读到最新值
      if (!initialized) return false
      // 已初始化：SDK 已加载，无法热换 key，提示需刷新
      return true
    },
  }
}

/** 组件库共享的单例协调器（AmapWidget / RouteMap 共用同一实例） */
export const amapLoader = createAmapLoader()

// 订阅 Key 变更：初始化后变更 → 打印提示（高德 JS SDK 已加载无法热换 key）
onAmapKeyChange((keys) => {
  if (amapLoader.isInitialized() && keys.jsKey) {
    console.warn('[amap] 高德地图已用旧 Key 初始化，新 Key 需刷新页面才能生效（JS SDK 无法热换）')
  }
})
