/**
 * Solar 图标本地化注册模块
 *
 * 将 Solar 图标集的 SVG 数据动态注册到 @iconify/vue 的运行时缓存中，
 * 使 Icon 组件在渲染 `solar:xxx` 图标时直接从内存取数据，不发起网络请求。
 *
 * 数据来源：Iconify API (https://api.iconify.design/solar.json)
 * 图标范围：solar-icons.ts 中列出的 ~346 个图标
 * 更新方式：node scripts/download-solar-icons.mjs
 *
 * ⚠️ 性能：solar-icons-data.json 约 235KB，采用动态 import 拆分为独立 chunk，
 *    仅在 provider='solar' 时按需加载，避免随 IconSvg（默认 lucide）打入主包。
 */
import { addCollection, iconExists } from '@iconify/vue'

let registered = false
let pending: Promise<void> | null = null

/** 确保 Solar 图标集已注册到 @iconify/vue 内存缓存（动态加载，返回 Promise） */
export function ensureSolarIcons(): Promise<void> {
  if (registered) return Promise.resolve()
  if (pending) return pending
  pending = import('./solar-icons-data.json').then(({ default: solarData }) => {
    if (!iconExists('solar:full-screen-linear')) {
      addCollection(solarData as never)
    }
    registered = true
  })
  return pending
}

/** Solar 图标数据是否已注册（同步判断，供渲染降级用） */
export function isSolarReady(): boolean {
  return registered
}

/** 检查某个 solar 图标是否在本地数据中存在（会触发异步加载） */
export function hasSolarIcon(iconName: string): Promise<boolean> {
  return ensureSolarIcons().then(() => iconExists(`solar:${iconName}`))
}
