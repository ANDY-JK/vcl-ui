/**
 * utils — 通用工具函数统一入口
 *
 * 收敛库内重复逻辑，供组件与下游项目复用。所有函数带容错/降级：
 * - 校验：接受 unknown 输入（运行时可能是数字/对象等脏数据）
 * - 行政区划：纯后缀正则，零硬编码名单
 * - 下载：SSR / createObjectURL 缺失 / WebView / 异常 四级降级
 * - 深拷贝：null / undefined / 原始值原样返回
 */
import { isBrowser } from './ssr-guard'
import { useT } from './i18n'

/**
 * 模块级翻译函数（模式 3）— 用于 Error 消息 / 相对时间等 UI 可见文案。
 * 命名 _t：本文件多处局部变量名为 t（如 formatRelativeTime 的 Date），避免遮蔽。
 */
const _t = useT()

// ════════════════════════════════════════
// 基础：安全转字符串
// ════════════════════════════════════════

/** 任意值安全转字符串（null/undefined → 空串） */
function toStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  return typeof v === 'string' ? v : String(v)
}

/** 去掉全部空白 */
function stripSpace(input: unknown): string {
  return toStr(input).replace(/\s+/g, '')
}

// ════════════════════════════════════════
// 格式校验
// ════════════════════════════════════════

/** 校验中国大陆手机号（11 位，1 开头） */
export function isValidPhone(v?: unknown): boolean {
  return /^1[3-9]\d{9}$/.test(stripSpace(v))
}

/** 校验邮箱格式 */
export function isValidEmail(v?: unknown): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toStr(v).trim())
}

/** 校验 18 位身份证号（17 位数字 + 1 位数字/X，仅格式校验） */
export function isValidIdCard(v?: unknown): boolean {
  return /^\d{17}[\dXx]$/.test(toStr(v).trim())
}

/** 校验 URL 格式（http/https 开头） */
export function isValidUrl(v?: unknown): boolean {
  return /^https?:\/\/.+/.test(toStr(v).trim())
}

// ════════════════════════════════════════
// 行政区划 / 地址
// ════════════════════════════════════════

/** 行政区划拆分结果（省 → 市 → 区县 → 乡镇，剩余部分为详细地址） */
export interface Region {
  /** 省级：省 / 自治区 / 特别行政区 */
  province: string
  /** 地级：市 / 自治州 / 地区 / 盟 */
  city: string
  /** 县级：区 / 县 / 旗 / 县级市 */
  district: string
  /** 乡级：镇 / 乡 / 街道 / 苏木 / 民族乡 */
  town: string
  /** 剩余详细地址（门牌号、路名、村/社区等） */
  detail: string
}

/**
 * 中国地址四级行政区划拆分（纯后缀规则，零硬编码名单）。
 *
 * 按「省 → 市 → 区县 → 乡镇」顺序逐级剥取，剩余部分归入 detail。
 * - 直辖市（北京市等）无「省」后缀，按「市」归入 city，province 保持为空
 * - 无省级前缀的地址（如 "深圳市南山区"）也能正确落入对应层级
 *
 * @example
 * parseRegion('广东省深圳市南山区科技园路1号')
 * // { province:'广东省', city:'深圳市', district:'南山区', town:'', detail:'科技园路1号' }
 * parseRegion('北京市朝阳区三里屯街道工体北路')
 * // { province:'', city:'北京市', district:'朝阳区', town:'三里屯街道', detail:'工体北路' }
 */
export function parseRegion(input?: unknown): Region {
  let addr = stripSpace(input)
  const region: Region = { province: '', city: '', district: '', town: '', detail: '' }

  // 省级：省 / 自治区 / 特别行政区
  const p = addr.match(/^(.+?省|.+?自治区|.+?特别行政区)/)
  if (p) {
    region.province = p[1]
    addr = addr.slice(p[1].length)
  }

  // 地级：自治州 / 地区 / 盟 / 市
  const c = addr.match(/^(.+?(?:自治州|地区|盟|市|州))/)
  if (c) {
    region.city = c[1]
    addr = addr.slice(c[1].length)
  }

  // 县级：自治县 / 自治旗 / 新区 / 区 / 县 / 旗 / 市
  const d = addr.match(/^(.+?(?:自治县|自治旗|新区|区|县|旗|市))/)
  if (d) {
    region.district = d[1]
    addr = addr.slice(d[1].length)
  }

  // 乡级：街道 / 民族乡 / 苏木 / 镇 / 乡
  const t = addr.match(/^(.+?(?:街道|民族乡|苏木|镇|乡))/)
  if (t) {
    region.town = t[1]
    addr = addr.slice(t[1].length)
  }

  region.detail = addr
  return region
}

/** parseRegion 的语义别名（地址拆分 = 行政区划拆分 + 详细地址） */
export const parseAddress = parseRegion

/** 拼接区域名（省市区，可选乡镇/详细地址） */
export function formatRegion(region: Region | string, opts?: { withTown?: boolean; withDetail?: boolean }): string {
  const r = typeof region === 'string' ? parseRegion(region) : region
  const parts: string[] = []
  if (r.province) parts.push(r.province)
  if (r.city) parts.push(r.city)
  if (r.district) parts.push(r.district)
  if (opts?.withTown && r.town) parts.push(r.town)
  if (opts?.withDetail && r.detail) parts.push(r.detail)
  return parts.join('')
}

/** 把完整地址拆成「区域」与「详细地址」两部分 */
export function splitRegionDetail(input?: unknown): { region: string; detail: string } {
  const r = parseRegion(input)
  return { region: formatRegion(r, { withTown: true }), detail: r.detail }
}

// ════════════════════════════════════════
// 文件下载
// ════════════════════════════════════════

/**
 * 触发浏览器下载 Blob 文件，返回是否成功触发下载。
 * - SSR（无 document）静默返回 false
 * - createObjectURL 不可用（极老环境）降级 FileReader 读 data URL
 * - download 属性不支持（部分 WebView）降级 window.open
 * - 任何异常兜底返回 false，不阻断调用方主流程
 */
export function downloadBlob(blob: Blob, filename: string): boolean {
  if (!isBrowser) return false
  try {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(blob)
      try {
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        if ('download' in a) {
          document.body.appendChild(a)
          a.click()
          a.remove()
        } else {
          window.open(url, '_blank')
        }
        return true
      } finally {
        URL.revokeObjectURL(url)
      }
    }

    if (typeof FileReader !== 'undefined') {
      const reader = new FileReader()
      reader.onload = () => {
        const a = document.createElement('a')
        a.href = reader.result as string
        a.download = filename
        a.click()
      }
      reader.readAsDataURL(blob)
      return true
    }

    return false
  } catch (e) {
    console.warn('[utils] 下载失败:', e)
    return false
  }
}

// ════════════════════════════════════════
// 对象
// ════════════════════════════════════════

/** JSON 深拷贝（要求值是 JSON 可序列化的纯数据，如设计器节点树） */
export function deepClone<T>(value: T): T {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}

// ════════════════════════════════════════
// 数字 / 金额
// ════════════════════════════════════════

/** 千分位 + 可选小数位数。非法数值原样返回字符串。 */
export function formatNumber(n: number | string, opts?: { decimals?: number; separator?: string }): string {
  const value = typeof n === 'string' ? Number(n) : n
  if (!isFinite(value)) return String(n)
  const { decimals, separator = ',' } = opts ?? {}
  const fixed = decimals === undefined ? String(value) : value.toFixed(decimals)
  const [int, dec] = fixed.split('.')
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, separator)
  return dec !== undefined ? `${intFormatted}.${dec}` : intFormatted
}

/** 金额格式化（默认 ¥ + 两位小数）。 */
export function formatMoney(
  n: number | string,
  opts?: { symbol?: string; decimals?: number; separator?: string },
): string {
  const value = typeof n === 'string' ? Number(n) : n
  if (!isFinite(value)) return String(n)
  const { symbol = '¥', decimals = 2, separator = ',' } = opts ?? {}
  const sign = value < 0 ? '-' : ''
  return sign + symbol + formatNumber(Math.abs(value), { decimals, separator })
}

/** 格式化文件大小（B/KB/MB/GB） */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

/**
 * 人民币大写（壹贰叁…佰仟万亿、元角分整）。
 * 算法移植（GB 金额大写规范），超 20 行属豁免场景。
 */
export function toChineseAmount(n: number | string): string {
  const value = typeof n === 'string' ? Number(n) : n
  if (!isFinite(value)) return ''

  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
  const radices = ['', '拾', '佰', '仟']
  const bigRadices = ['', '万', '亿', '万亿']

  const negative = value < 0
  const amount = Math.round(Math.abs(value) * 100) / 100
  const intPart = Math.floor(amount)
  const decPart = Math.round((amount - intPart) * 100)

  let result = negative ? '负' : ''

  if (intPart === 0) {
    result += '零'
  } else {
    const intStr = String(intPart)
    const groups: string[] = []
    let s = intStr
    while (s.length > 0) {
      groups.unshift(s.slice(-4))
      s = s.slice(0, -4)
    }
    let zero = false
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      if (Number(g) === 0) {
        zero = true
        continue
      }
      if (i !== 0 && zero) result += '零'
      let gz = false
      for (let j = 0; j < g.length; j++) {
        const d = Number(g[j])
        const pos = g.length - 1 - j
        if (d === 0) {
          gz = true
        } else {
          if (gz) {
            result += '零'
            gz = false
          }
          result += digits[d] + radices[pos]
        }
      }
      result += bigRadices[groups.length - 1 - i]
      zero = false
    }
  }
  result += '元'

  if (decPart === 0) {
    result += '整'
  } else {
    const jiao = Math.floor(decPart / 10)
    const fen = decPart % 10
    result += jiao > 0 ? digits[jiao] + '角' : '零'
    if (fen > 0) result += digits[fen] + '分'
  }
  return result
}

// ════════════════════════════════════════
// 字符串
// ════════════════════════════════════════

/** 截断字符串并加后缀（默认 …），长度未超限原样返回。 */
export function truncate(str: unknown, len: number, suffix = '…'): string {
  const s = toStr(str)
  if (s.length <= len) return s
  return s.slice(0, len) + suffix
}

/** 安全 JSON 解析，失败返回 fallback（不抛异常）。 */
export function safeParseJSON<T>(str: unknown, fallback: T): T {
  try {
    return JSON.parse(toStr(str)) as T
  } catch {
    return fallback
  }
}

/** 解析查询字符串（可带前导 ?）为对象，decodeURIComponent 失败时保留原值。 */
export function parseQueryString(query: string): Record<string, string> {
  const result: Record<string, string> = {}
  const q = toStr(query).replace(/^\?/, '')
  if (!q) return result
  for (const pair of q.split('&')) {
    if (!pair) continue
    const idx = pair.indexOf('=')
    const rawKey = idx >= 0 ? pair.slice(0, idx) : pair
    const rawVal = idx >= 0 ? pair.slice(idx + 1) : ''
    try {
      result[decodeURIComponent(rawKey)] = decodeURIComponent(rawVal)
    } catch {
      result[rawKey] = rawVal
    }
  }
  return result
}

/** 对象 → 查询字符串（跳过 null/undefined 值）。 */
export function buildQueryString(params: Record<string, string | number | boolean | null | undefined>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  }
  return parts.join('&')
}

// ════════════════════════════════════════
// 随机 / ID
// ════════════════════════════════════════

/** 闭区间随机整数 [min, max] */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** 随机字符串（默认字母数字） */
export function randomString(
  len: number,
  charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
): string {
  let result = ''
  for (let i = 0; i < len; i++) result += charset[Math.floor(Math.random() * charset.length)]
  return result
}

/** 生成唯一 ID（时间戳 base36 + 随机），可带前缀。 */
export function uuid(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

// ════════════════════════════════════════
// 文件 / 数据转换
// ════════════════════════════════════════

/** File/Blob → data URL（base64） */
export function fileToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error(_t('utils.fileReaderUnavailable')))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error(_t('utils.readFileFail')))
    reader.readAsDataURL(blob)
  })
}

/** Blob → base64（fileToBase64 语义别名） */
export const blobToBase64 = fileToBase64

/** data URL → Blob（base64 解码），非法格式或环境不支持返回 null。 */
export function dataURLtoBlob(dataURL: string): Blob | null {
  const match = dataURL.match(/^data:([^;,]+)[;,](.+)$/)
  if (!match || typeof atob !== 'function') return null
  try {
    const mime = match[1]
    const base64 = match[2].includes(',') ? match[2].slice(match[2].indexOf(',') + 1) : match[2]
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  } catch {
    return null
  }
}

// ════════════════════════════════════════
// 数组
// ════════════════════════════════════════

/** 数组按字段或函数去重，保留首次出现顺序。 */
export function uniqueBy<T>(arr: T[], key: string | ((item: T) => unknown)): T[] {
  if (!Array.isArray(arr)) return []
  const getKey = typeof key === 'function' ? key : (item: T) => (item as Record<string, unknown>)[key]
  const seen = new Set<unknown>()
  const result: T[] = []
  for (const item of arr) {
    const k = getKey(item)
    if (seen.has(k)) continue
    seen.add(k)
    result.push(item)
  }
  return result
}

/** 数组按 size 分组；size<=0 或非数组返回空数组。 */
export function chunk<T>(arr: T[], size: number): T[][] {
  if (!Array.isArray(arr) || size <= 0) return []
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

// ════════════════════════════════════════
// 对象比较
// ════════════════════════════════════════

/** 判断是否为普通对象（排除 null/数组/Date 等） */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/** 深比较（支持 Date/NaN/数组/嵌套对象，不处理循环引用）。 */
export function isEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => isEqual(v, b[i]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    if (ka.length !== kb.length) return false
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && isEqual(a[k], b[k]))
  }
  return false
}

// ════════════════════════════════════════
// 脱敏（纯规则，零硬编码）
// ════════════════════════════════════════

/** 姓名脱敏：保留首字符，其余打 *。不做复姓识别（避免硬编码姓氏表）。 */
export function maskName(name?: unknown): string {
  const n = stripSpace(name)
  if (!n) return ''
  if (n.length === 1) return n
  return n[0] + '*'.repeat(n.length - 1)
}

/** 手机号脱敏：138****8000；非 1 开头 11 位原样返回。 */
export function maskPhone(phone?: unknown): string {
  const p = stripSpace(phone)
  if (!/^1\d{10}$/.test(p)) return toStr(phone)
  return p.slice(0, 3) + '****' + p.slice(7)
}

/** 身份证脱敏：保留前 4 后 4；长度不足 8 原样返回。 */
export function maskIdCard(id?: unknown): string {
  const s = toStr(id).trim()
  if (s.length < 8) return s
  return s.slice(0, 4) + '*'.repeat(s.length - 8) + s.slice(-4)
}

// ════════════════════════════════════════
// 相对时间
// ════════════════════════════════════════

/** 任意输入转 Date，非法返回 null */
function toDate(v: Date | number | string): Date | null {
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d
}

/** 是否同一天（本地时区） */
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** 绝对日期（同年 MM-DD，跨年 YYYY-MM-DD） */
function formatAbsDate(t: Date, now: Date): string {
  const mm = String(t.getMonth() + 1).padStart(2, '0')
  const dd = String(t.getDate()).padStart(2, '0')
  return t.getFullYear() === now.getFullYear() ? `${mm}-${dd}` : `${t.getFullYear()}-${mm}-${dd}`
}

/**
 * 相对时间：刚刚 / N分钟前 / N小时前 / 昨天 / N天前 / 具体日期。
 * 未来时间按具体日期显示。
 */
export function formatRelativeTime(time: Date | number | string, now: Date | number = Date.now()): string {
  const t = toDate(time)
  const n = toDate(now)
  if (!t || !n) return ''

  const diff = n.getTime() - t.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < 0) return formatAbsDate(t, n)
  if (diff < minute) return _t('utils.justNow')
  if (diff < hour) return _t('utils.minutesAgo', { n: Math.floor(diff / minute) })
  if (diff < day) return _t('utils.hoursAgo', { n: Math.floor(diff / hour) })
  if (isSameDay(t, new Date(n.getTime() - day))) return _t('utils.yesterday')
  if (diff < 30 * day) return _t('utils.daysAgo', { n: Math.floor(diff / day) })
  return formatAbsDate(t, n)
}

// ════════════════════════════════════════
// 类型判断
// ════════════════════════════════════════

/** 是否可转为有限数字（数字/纯数字字符串） */
export function isNumeric(v: unknown): boolean {
  if (typeof v === 'number') return isFinite(v)
  if (typeof v === 'string') {
    const s = v.trim()
    if (s === '') return false
    return isFinite(Number(s))
  }
  return false
}

/** 是否为空（null/undefined/空串/空数组/空对象/空 Map/Set） */
export function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  if (v instanceof Map || v instanceof Set) return v.size === 0
  if (isPlainObject(v)) return Object.keys(v).length === 0
  return false
}

// ════════════════════════════════════════
// HTML 转义
// ════════════════════════════════════════

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** HTML 特殊字符转义（用于把用户输入安全插入为纯文本） */
export function escapeHtml(str: unknown): string {
  return toStr(str).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch])
}

/** 反转义（escapeHtml 的逆操作） */
export function unescapeHtml(str: unknown): string {
  return toStr(str)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

// ════════════════════════════════════════
// 颜色转换
// ════════════════════════════════════════

/** 判断是否为合法 #RRGGBB / #RGB */
function isValidHex(hex: string): boolean {
  return /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hex)
}

/** HEX（#RGB 或 #RRGGBB）→ { r, g, b }，非法返回 null。 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

/** { r, g, b } → #RRGGBB，分量自动钳制到 0~255 并四舍五入。 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(n)))
    return clamped.toString(16).padStart(2, '0')
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

/** 判断字符串是否为合法 HEX 颜色 */
export function isHexColor(str: unknown): boolean {
  return isValidHex(toStr(str).trim())
}

/**
 * 浅比较两个对象（避免 JSON.stringify 性能损耗）。
 * 从 FormBuilder 下沉为通用工具（表单数据变化检测用）。
 */
export function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false
  }
  return true
}
