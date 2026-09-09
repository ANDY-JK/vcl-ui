/**
 * useIdCompat.ts — `useId` 的跨版本兼容出口
 *
 * 框架在 Vue 3.5 才提供 `useId()`（用来给 label/aria 生成页面内唯一 id）。
 * 本库 peer 声明的是 `^3.4.0`，而下游存在锁 3.4 的项目，所以这里做特性探测：
 *   - 3.5+ → 用框架原生实现（行为与官方一致）
 *   - 3.4  → 退化为模块级自增 id
 *
 * ⚠ 不能用 `import { useId } from 'vue'`：3.4 下具名导入缺失导出会在运行期直接抛
 *   "does not provide an export named 'useId'"，所以必须走命名空间取属性来探测。
 *
 * 边界：退化路径的 id 依赖模块求值顺序，服务端渲染时两端可能不一致。
 * 本库不支持 SSR 同构渲染（`_internal/ssr-guard` 仅保证服务端 import 不崩），
 * 且这些 id 只用于 label[for] / aria-controls / aria-activedescendant 关联，
 * 不参与任何内容 hydration 比对。将来若要 SSR，改为由宿主注入稳定前缀。
 */
import * as Vue from 'vue'

/** 框架原生 useId；Vue < 3.5 时为 undefined */
const nativeUseId = (Vue as unknown as { useId?: () => string }).useId

let seq = 0

/**
 * 取一个页面内唯一的元素 id。必须在 setup 同步阶段调用。
 * @param prefix 语义前缀，便于 DOM 审查时辨认归属（如 'input'、'select-panel'）
 */
export function useIdSafe(prefix = 'id'): string {
  if (nativeUseId) return nativeUseId()
  seq += 1
  return `vcl-${prefix}-${seq}`
}

/** 是否运行在支持原生 useId 的 Vue 版本上（诊断/测试用） */
export const hasNativeUseId: boolean = typeof nativeUseId === 'function'
