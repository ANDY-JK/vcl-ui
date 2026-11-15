/**
 * 纯数字字符串（可带正负号与前置小数点）。`+8` / `.5` / `020` 都是合法的数字写法，
 * CSS 却不认（长度必须有单位），所以这一支必须由我们统一补 `px`。
 */
const NUMERIC = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/

/** 字符串形式的非有限数：`'NaN'` 当尺寸发出去同样是无效声明，按"没有值"处理 */
const NON_FINITE = /^[+-]?(?:NaN|Infinity)$/i

/**
 * 将 prop 值转为合法 CSS 尺寸。
 *
 * 契约（docs-site/components/chart.md：「数字 px 或 CSS 值」）：
 * - **有限数字 / 纯数字字符串**（含负数、`.5`、`+8`、首尾空白）→ 归一并补 `px`；
 * - **非有限数字**（`NaN` / `±Infinity`，含其字符串形式）、空值、纯空白 → `fallback`；
 * - **其余 CSS 值**（`%` / `calc()` / `var()` / 带单位）→ 去掉首尾空白后原样透传。
 *
 * 为什么非有限数必须挡：旧实现会拼出 `NaNpx`，浏览器整条丢弃该声明，
 * 图表容器高度变 auto、图直接消失，控制台一句提示都没有。而 `NaN` 不是边缘输入 ——
 * 宿主 `parseFloat(config.height)` 拿到空串、或 `容器高 - 内边距` 减成负数都能造出来。
 * 这类值**没有正确尺寸可表达**，退回 fallback 才是唯一诚实的选择。
 */
export function toSize(val: number | string | undefined, fallback: string): string {
  if (val === undefined || val === null) return fallback
  if (typeof val === 'number') return Number.isFinite(val) ? `${val}px` : fallback
  const v = val.trim()
  if (!v || NON_FINITE.test(v)) return fallback
  // `Number(v)` 归一：'020' → 20、'.5' → 0.5、'+8' → 8
  if (NUMERIC.test(v)) return `${Number(v)}px`
  return v
}
