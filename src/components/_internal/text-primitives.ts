/**
 * 文本原语 —— **叶子模块**（不 import 任何同域模块，只依赖语言内建）
 *
 * ## 为什么单独抽出（TD-72 / #279）
 *
 * `utils.ts` 与 `region.ts` 曾互相 import 形成**真实环**：
 * - `region.ts` → `utils.ts`（要用 `stripSpace`）
 * - `utils.ts` → `region.ts`（`export * from './region'` 保留公开路径）
 *
 * 这种环在 ESM 下不报错，只在**顶层求值**时让某一侧的绑定是 `undefined`。
 * 当时恰好只在函数体里用 `stripSpace`（调用时机晚于模块初始化），所以没炸；
 * 但只要将来有人在模块顶层用它，就会得到 `stripSpace is not a function`，
 * 而 tsc / eslint 都不会报。
 *
 * 修法：把两边都要用的文本原语下沉到这个叶子模块，`utils.ts` 与 `region.ts`
 * 都指向它（`utils.ts` 继续 re-export 以保持公开 API 不变）。
 */

/**
 * 任意输入 → 文本。
 *
 * **只有原始值才有文本形态**：`object` / `symbol` / `function` 一律空串
 * （旧实现无条件 `String(v)`，会把对象变成 `[object Object]` 泄漏进用户可见文本，
 * 见 #268）。`null` / `undefined` 也是空串。
 */
export function toStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  const t = typeof v
  if (t === 'string') return v as string
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v)
  return ''
}

/** 去掉全部空白（内部走 `toStr`，脏输入不抛错） */
export function stripSpace(input: unknown): string {
  return toStr(input).replace(/\s+/g, '')
}
