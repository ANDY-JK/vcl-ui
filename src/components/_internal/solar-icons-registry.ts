/**
 * Solar 图标本地化注册模块
 *
 * 将 Solar 图标集的 SVG 数据预注册到 @iconify/vue 的运行时缓存中，
 * 使 Icon 组件在渲染 `solar:xxx` 图标时直接从内存取数据，不发起网络请求。
 *
 * 模式参考：与 pinyin-pro 本地化一致——数据下载到本地，运行时零网络依赖。
 *
 * 数据来源：Iconify API (https://api.iconify.design/solar.json)
 * 图标范围：solar-icons.ts 中列出的 ~346 个图标
 * 更新方式：node scripts/download-solar-icons.mjs
 */
import { addCollection, iconExists } from '@iconify/vue'
import solarData from './solar-icons-data.json'

let registered = false

/** 确保 Solar 图标集已注册到 @iconify/vue 内存缓存 */
export function ensureSolarIcons(): void {
  if (registered) return
  if (iconExists('solar:full-screen-linear')) {
    registered = true
    return
  }
  addCollection(solarData as any)
  registered = true
}

/** 检查某个 solar 图标是否在本地数据中存在 */
export function hasSolarIcon(iconName: string): boolean {
  ensureSolarIcons()
  return iconExists(`solar:${iconName}`)
}
