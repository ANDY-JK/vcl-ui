// 设计令牌必须先于本域组件样式（Q3 域级 CSS 自包含；与主入口 index.ts 同口径）
import '../tokens.css'
/**
 * route-planner — 门店路线规划域统一出口
 *
 * 此前本域只有 utils / composables / types 三个分头入口，没有域级 index.ts，
 * 导致 package.json 无法提供 `<包名>/route-planner` 子路径
 * （组件虽在主入口导出，但按域导入没有目标文件）。本文件补齐该出口。
 *
 * 约定：组件在本文件声明；其余经各分头 barrel 转出，避免同一映射表写两份产生漂移。
 */

// 组件
export { default as RouteMap } from './RouteMap.vue'
export { default as RouteResult } from './RouteResult.vue'
export { default as StorePanel } from './StorePanel.vue'
export { default as StoreFormModal } from './StoreFormModal.vue'
export { default as ImportProgress } from './ImportProgress.vue'

// Composables（useStoreData / useCoordinateResolver / useRoutePlanner）
export * from './composables'

// 算法、坐标解析、Excel 导入、导航深链，以及转发的高德 Key 管理
export * from './utils'

// 类型
export type {
  CoordSource,
  Store,
  StoreGroup,
  NavLink,
  DayPlan,
  Accommodation,
  RoutePlan,
  RouteOptions,
  CoordResult,
  ImportResult,
  ProgressCallback,
} from './types'
