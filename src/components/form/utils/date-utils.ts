// 日期工具 — Select 的 date / date-range / time 模式共用（本地时区，避免 UTC 偏移）
// ⛔ 保护 — 禁止：clamp() → px，本地时区构造 new Date(y, m, d) 改动

/** 补零 */
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** Date → format 字符串（YYYY/MM/DD 占位符替换） */
export function formatDate(d: Date, fmt: string): string {
  return fmt
    .replace(/YYYY/, String(d.getFullYear()))
    .replace(/MM/, pad2(d.getMonth() + 1))
    .replace(/DD/, pad2(d.getDate()))
}

/** format 字符串 → {y, m, d}，无法解析返回 null（不校验真实日期，如 2024-02-31 也能解析出数字） */
export function parseDate(str: string, fmt: string): { y: number; m: number; d: number } | null {
  if (!str) return null
  const sepMatch = fmt.match(/[^A-Za-z0-9]+/)
  if (!sepMatch) return null
  const sep = sepMatch[0]
  const fmtParts = fmt.split(sep)
  const valParts = str.split(sep)
  if (fmtParts.length !== valParts.length) return null
  let y = NaN
  let m = NaN
  let d = NaN
  fmtParts.forEach((part, i) => {
    const v = parseInt(valParts[i] || '', 10)
    if (Number.isNaN(v)) return
    if (part.includes('Y')) y = v
    else if (part.includes('M')) m = v
    else if (part.includes('D')) d = v
  })
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null
  return { y, m, d }
}

/** 校验 y/m/d 是否为真实存在的日期（如 2024-02-31、平年 2023-02-29 非法） */
export function isValidDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > 31) return false
  // setFullYear 避免 Date 构造器对 0-99 年映射到 1900+ 的歧义
  const dt = new Date(0)
  dt.setFullYear(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

/** 今天 iso（按 format 格式化） */
export function todayISO(fmt: string): string {
  return formatDate(new Date(), fmt)
}
