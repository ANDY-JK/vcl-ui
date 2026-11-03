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

// ════════════════════════════════════════
// 展示格式化（原 store.ts / FormCollect 各自内联的 toLocaleString）
//
// ## 为什么名字带 Zh、为什么保留
//
// 这两个函数**默认仍是 zh-CN**（历史调用方与已存记录都按这个格式），但库本身支持多语言，
// 宿主在英文部署下拿到的是「2026/8/23」这种中文习惯的日期 —— 名称把"中文"写死了，
// 调用方也没有任何途径改（#302）。
//
// 本轮只做**加法**：补一个可选的 `locale` 参数，传了就按它格式化；不传保持原样。
// 这样宿主不必等重命名/破坏性变更就能本地化。
//
// ⚠️ 更大的问题不在格式化，而在**存储**：收集页把 `time` 存成**本地化展示字符串**
// （见 TD-94）。切换语言后新旧记录会混着两种格式，且这些字符串不可跨语言解析。
// 正确的终局是「存 ISO、展示时按 locale 格式化」，那需要数据迁移，登记在台账里。
// ════════════════════════════════════════

/** 默认展示 locale（与库默认语言一致） */
const DEFAULT_DATE_LOCALE = 'zh-CN'

/** 日期：默认 zh-CN → 2026/8/23；传 locale 按对应习惯格式化 */
export function formatDateZh(d: Date = new Date(), locale: string = DEFAULT_DATE_LOCALE): string {
  return d.toLocaleDateString(locale)
}

/** 日期时间（24 小时制）：默认 → 2026/8/23 14:30:00 */
export function formatDateTimeZh(d: Date = new Date(), locale: string = DEFAULT_DATE_LOCALE): string {
  return d.toLocaleString(locale, { hour12: false })
}

// ════════════════════════════════════════
// 收集记录的时间戳：**存 ISO、展示按 locale**（TD-94，#391）
//
// ## 原来的问题
//
// 收集页把 `time` 直接存成 `formatDateTimeZh()` 的结果（`2026/8/23 14:30:00`）：
//   ① 切语言后新旧记录混着两种格式；
//   ② 这些字符串不可靠地跨语言解析（`new Date(...)` 靠引擎宽松兜底）；
//   ③ 导出到 Excel 是文本列，排序/筛选不认日期。
// #303 已让**导出**宽容解析并写成真日期单元格（② 解了），但存储层一直是展示字符串。
//
// ## 现在的口径
//
//   · 写入：`recordTimeNow()` → `new Date().toISOString()`（**不含任何本地化信息**）
//   · 展示/比较：`formatRecordTime()` / `recordTimeDate()`
//     对**历史记录**（旧的展示字符串）宽容解析后照常格式化，解析不了就原样返回 —— 不丢内容，
//     所以**不需要一次性数据迁移**：新旧记录会并存一段时间，但都显示正确。
// ════════════════════════════════════════

/** 收集记录的时间戳：ISO 8601（存储口径，不含任何本地化信息） */
export function recordTimeNow(now: Date = new Date()): string {
  return now.toISOString()
}

/**
 * 宽容解析记录里的时间（ISO 或历史的展示字符串）。
 *
 * 解析顺序：原生 `new Date(raw)` → 再试 `YYYY/M/D H:m[:s]`（补零后按本地时区构造）。
 * 解析不出来返回 `null` —— 调用方决定回退（展示原样、导出原字符串）。
 */
export function recordTimeDate(raw: string | undefined | null): Date | null {
  if (!raw) return null
  const direct = new Date(raw)
  if (!Number.isNaN(direct.getTime())) return direct
  // 某些环境不认 `2026/8/23 14:30:00` 里的斜杠或没有秒；补零后重试一次
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw.trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * 展示用：ISO → 按 locale 格式化；历史展示字符串 → 解析后同样格式化；
 * 完全解析不出来 → **原样返回**（宁可显示一段看不懂的文本，也不能吞掉用户数据）。
 */
export function formatRecordTime(raw: string | undefined | null, locale: string = DEFAULT_DATE_LOCALE): string {
  const d = recordTimeDate(raw)
  if (!d) return String(raw ?? '')
  return formatDateTimeZh(d, locale)
}
