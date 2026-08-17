/** 将 prop 值转为合法 CSS 尺寸：数字自动补 px，纯数字字符串也补 px */
export function toSize(val: number | string | undefined, fallback: string): string {
  if (val === undefined || val === null || val === '') return fallback
  if (typeof val === 'number') return `${val}px`
  if (/^\d+(\.\d+)?$/.test(val)) return `${val}px`
  return val
}
