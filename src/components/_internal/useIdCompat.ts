/**
 * useIdCompat.ts — `useId` 的跨版本兼容出口
 *
 * 框架在 Vue 3.5 才提供 `useId()`（用来给 label/aria 生成页面内唯一 id）。
 * 本库 peer 声明的是 `^3.4.0`，而下游存在锁 3.4 的项目，所以这里做特性探测：
 *   - 3.5+ **且有活动组件实例** → 用框架原生实现（行为与官方一致）
 *   - 3.4，或 3.5 但在实例之外调用 → 退化为模块级自增 id
 *
 * ⚠ 不能用 `import { useId } from 'vue'`：3.4 下具名导入缺失导出会在运行期直接抛
 *   "does not provide an export named 'useId'"，所以必须走命名空间取属性来探测。
 *
 * ⚠ 为什么还要探测"有没有活动实例"（#484）：`useId()` 在没有 `currentInstance` 时
 *   **返回空串**（并在 dev 打一条 Vue 警告）。而 `useIdSafe` 的返回值会直接进
 *   `label[for]` / `aria-controls` / `aria-activedescendant` —— 空 id 让关联静默失效，
 *   多个调用还都拿到同一个 `''`。最现实的触发路径：在 `await` 之后（实例上下文已丢）
 *   或 setup 之外调用。所以**没有实例就不调原生实现**，退回自增序列。
 *
 * 边界：退化路径的 id 依赖模块求值顺序，因此**不支持 SSR 同构渲染** —— 原生 `useId`
 * 路径是 SSR 一致的，退化路径不是（`_internal/ssr-guard` 只保证服务端 import 不崩）。
 * 这些 id 只用于 label/aria 关联，不参与内容 hydration 比对。
 */
import * as Vue from 'vue'

type VueAug = {
  useId?: () => string
  getCurrentInstance?: () => unknown
}

/** 框架原生 useId；Vue < 3.5 时为 undefined */
const nativeUseId = (Vue as unknown as VueAug).useId
/** 框架的实例探测（3.0 起就有，用于判断能否安全调用 useId） */
const getInstance = (Vue as unknown as VueAug).getCurrentInstance

let seq = 0

/**
 * 取一个页面内唯一的元素 id。**在 setup 同步阶段调用**才能拿到框架原生 id；
 * 其余时机（`await` 之后、setup 之外）退回本库自增序列，不会返回空串。
 * @param prefix 语义前缀，便于 DOM 审查时辨认归属（如 'input'、'select-panel'）；
 *   仅退化路径会带进 id，原生路径上不生效（`useId()` 不吃参数）
 */
export function useIdSafe(prefix = 'id'): string {
  if (nativeUseId) {
    const hasInstance = getInstance ? !!getInstance() : true
    const id = hasInstance ? nativeUseId() : ''
    if (id) return id
  }
  seq += 1
  return `vcl-${prefix}-${seq}`
}

/** 是否运行在支持原生 useId 的 Vue 版本上（诊断/测试用） */
export const hasNativeUseId: boolean = typeof nativeUseId === 'function'
