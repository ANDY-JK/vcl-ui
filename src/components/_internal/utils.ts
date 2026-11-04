import { reportWarn } from '@/components/_internal/runtime-observer'
import { truncateGraphemes } from './text-slice'
/**
 * utils — 通用工具函数统一入口
 *
 * 收敛库内重复逻辑，供组件与下游项目复用。所有函数带容错/降级：
 * - 校验：接受 unknown 输入（运行时可能是数字/对象等脏数据）
 * - 行政区划：纯后缀正则，零硬编码名单
 * - 下载：SSR / createObjectURL 缺失 / WebView / 异常 四级降级
 * - 深拷贝：null / undefined / 原始值原样返回
 */
import { isBrowser, safeDocument } from './ssr-guard'
import { useT } from './i18n'

/**
 * 模块级翻译函数（模式 3）— 用于 Error 消息 / 相对时间等 UI 可见文案。
 * 命名 _t：本文件多处局部变量名为 t（如 formatRelativeTime 的 Date），避免遮蔽。
 */
const _t = useT()

// ════════════════════════════════════════
// 基础：安全转字符串
// ════════════════════════════════════════

/**
 * 任意值安全转字符串（null/undefined → 空串）
 *
 * ⚠️ TD-85（第 32 轮）：**只把「能表达成文本」的原始值转成字符串**。
 * 旧实现是无条件 `String(v)`，于是对象变 `'[object Object]'`、Symbol 变 `'Symbol(x)'`、
 * 数组变 `'1,2'` —— 这些字符串会被上层拼进用户可见文本（`escapeHtml` / `parseRegion`
 * 的 detail / `maskIdCard` 的脱敏结果 / `truncate` 的截断值全是这条路径）。
 * 文件的头注释承诺"接受 unknown 输入"，但"接受"不等于"把内部表示泄漏到界面"：
 * 对象/数组/Symbol/函数**没有对应的文本形态**，给空串才是正确降级。
 */
// 文本原语已下沉到叶子模块 text-primitives（TD-72 / #279：与 region.ts 曾互为环）。
// 这里 re-export 保持公开 API 不变。
export { toStr, stripSpace } from './text-primitives'
import { toStr, stripSpace } from './text-primitives'

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
// 文件下载
// ════════════════════════════════════════

/** 文件名安全化（2026-10-31，#253/#254）：Windows 非法字符（\ / : * ? " < > |）与
 *  控制字符 → `_`，剥首尾点/空格，清洗后为空回默认名。所有下载入口共用 ——
 *  标题/日期/表名都可能进文件名，清洗修在出口（downloadBlob/downloadScreenshot）
 *  而非调用点，新入口自动继承。 */
export function sanitizeDownloadName(name: unknown, fallback = 'download'): string {
  // TD-85：守卫自己不能抛错 —— 原签名 name: string 下传对象/Symbol 会 `name.replace is not a function`，
  // 下载链路直接崩、用户点"下载"没反应。经 toStr 归一（非原始值 → 空串 → 回落 fallback）。
  const cleaned = toStr(name)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\\/:*?"<>|]/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim()
  return cleaned || fallback
}

/**
 * 在新标签打开外部链接 —— **必带 `noopener,noreferrer`**（#404）。
 *
 * 为什么必须走这个函数、而不是直接 `window.open(url, '_blank')`：
 *
 * `window.open()` 默认把新窗口的 `window.opener` 指向本页 —— 目标站只要执行
 * `window.opener.location = '仿冒页'`，就能把**用户当前的正版页面**换掉（反向标签劫持）。
 * 本仓对 `<a target="_blank">` 已有两处防护（sanitize 给链接补 `rel`、LowCodeNav 手写
 * `rel="noopener noreferrer"`），但 `window.open` 的三处调用全漏了 —— 而它们打开的
 * 恰恰是最不可信的地址：通知里的 url、路线规划的第三方导航链接、以及下载降级用的 blob。
 *
 * `noreferrer` 顺带掐掉 Referer（不把内部地址与查询串带给第三方站）。
 *
 * @returns 新窗口引用；SSR/被拦截时返回 null
 */
export function openExternalUrl(url: string): Window | null {
  if (!isBrowser) return null
  return window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * 触发浏览器下载 Blob 文件，返回是否成功触发下载。
 * - 文件名先过 sanitizeDownloadName（#254：调用方给的标题可能带 Windows 非法字符）
 * - SSR（无 document）静默返回 false
 * - createObjectURL 不可用（极老环境）降级 FileReader 读 data URL
 * - download 属性不支持（部分 WebView）降级 openExternalUrl（同样带 noopener）
 * - 任何异常兜底返回 false，不阻断调用方主流程
 */
export function downloadBlob(blob: Blob, rawFilename: string): boolean {
  const filename = sanitizeDownloadName(rawFilename)
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
          openExternalUrl(url)
        }
        return true
      } finally {
        // revoke 让出一轮宏任务（#430；与 useImageExport #429 同一判据）：
        // 上面的 `a.click()` 只是**发起**下载 —— 浏览器真正读取 blob URL 是异步的
        // （下一轮任务才开始拉数据）。在 finally 里同步撤销，等于在读取前把 URL 抽走：
        // Chrome/Safari 上表现为"点了下载、文件没下来或 0 字节"，且**不报错**
        // （click 不抛 → 本函数照样返回 true）。URL 会在页面卸载时被浏览器统一回收，
        // 延后一轮撤销不会泄漏。
        setTimeout(() => {
          try {
            URL.revokeObjectURL(url)
          } catch {
            /* 环境不支持则忽略：只影响回收时机，不影响已触发的下载 */
          }
        }, 0)
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
    reportWarn('[utils] 下载失败:', e)
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

/**
 * 小数位数归一（#407）。
 *
 * `Number.prototype.toFixed` 对越界参数**直接抛 RangeError**（必须是 0~100 的整数），
 * 而 `decimals` 常常来自列定义/宿主配置 —— 一个写错的 `-1` 或 `101` 就能让整个
 * 单元格渲染抛异常（表现为整表白屏 / 错误边界接管）。格式化选项不该有这种破坏力：
 * 夹到 0~20（超过 20 位已无意义，双精度只有 ~17 位有效数字），非有限值按 0 处理。
 */
function normalizeDecimals(d: number | undefined): number | undefined {
  if (d === undefined) return undefined
  if (!Number.isFinite(d)) return 0
  return Math.min(20, Math.max(0, Math.trunc(d)))
}

/**
 * 千分位 + 可选小数位数。非法数值返回空串。
 *
 * ⚠️ TD-84（第 29 轮）：此前是 `return String(n)` —— 对 `Infinity` / `NaN` 这两个
 * 非有限数，`String()` 给出的正是 `'Infinity'` / `'NaN'`，**原样显示给用户**。
 * "原样返回"对 `'abc'` 这类字符串输入是对的（保留用户原输入），但对非有限**数值**
 * 就不该：用户从没输入过 "Infinity"。两者要分开判。
 */
export function formatNumber(n: number | string, opts?: { decimals?: number; separator?: string }): string {
  // TD-85（第 32 轮）：签名是 number | string，但运行时可能来对象/数组/Symbol
  // （`{{field}}` 求值结果、宿主透传的脏数据）。这类值没有数字形态 → 空串；
  // 旧实现走 `String(n)` 分支，对象会变成 `'[object Object]'` 显示在金额列。
  if (typeof n !== 'number' && typeof n !== 'string') return ''
  // #407：空白字符串是「没填」，不是 0 —— `Number('') === 0`，旧实现会把空单元格
  // 渲染成 `0`、金额列渲染成 `¥0.00`，用户读到的是"金额为零"而不是"未填写"。
  // 这类"看起来正常的错数"比留空危险得多（与本文件 TD-84/85 同一原则）。
  if (typeof n === 'string' && n.trim() === '') return ''
  const value = typeof n === 'string' ? Number(n) : n
  // 非有限「数值」→ 空串（不显示 Infinity/NaN）；非数字「字符串」→ 原样（保留用户输入）
  if (!isFinite(value)) return typeof n === 'number' ? '' : String(n)
  const { decimals, separator = ',' } = opts ?? {}
  const digits = normalizeDecimals(decimals)
  const fixed = digits === undefined ? String(value) : value.toFixed(digits)
  const [int, dec] = fixed.split('.')
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, separator)
  return dec !== undefined ? `${intFormatted}.${dec}` : intFormatted
}

/** 金额格式化（默认 ¥ + 两位小数）。 */
export function formatMoney(
  n: number | string,
  opts?: { symbol?: string; decimals?: number; separator?: string },
): string {
  if (typeof n !== 'number' && typeof n !== 'string') return ''
  // #407：空白 = 没填，不能显示成 ¥0.00（见 formatNumber 同款说明）
  if (typeof n === 'string' && n.trim() === '') return ''
  const value = typeof n === 'string' ? Number(n) : n
  if (!isFinite(value)) return typeof n === 'number' ? '' : String(n)
  const { symbol = '¥', decimals = 2, separator = ',' } = opts ?? {}
  const sign = value < 0 ? '-' : ''
  return sign + symbol + formatNumber(Math.abs(value), { decimals, separator })
}

/**
 * 格式化文件大小（B/KB/MB/GB）。脏输入返回空串（第 187 轮）
 *
 * 分级判据用**四舍五入后的值**而不是原始比值（#410）：
 * `1048575 B` 只差 1 字节到 1 MB，比值是 `1023.999 KB`，`toFixed(1)` 得到 `"1024.0"` ——
 * 单位自己溢出成下一个单位的刻度，用户读到"1024.0 KB"（既不是合法 KB 数，也不像 1 MB）。
 * 先按最终显示的位数取整，再判"够不够进下一级"，就不会出现 1024.0 KB / 1024.0 MB。
 */
export function formatSize(bytes: number): string {
  // 本文件头部承诺「所有函数带容错/降级：接受 unknown 输入」，但这里原先没有守卫：
  // NaN / undefined / 'abc' 与任何阈值比较都为 false，一路落到 GB 分支拼出 "NaN GB"；
  // null 走 B 分支拼出 "null B"。上传组件直接把它渲染在文件条目上。
  if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return bytes + ' B'
  const kb = Number((bytes / 1024).toFixed(1))
  if (kb < 1024) return kb.toFixed(1) + ' KB'
  const mb = Number((bytes / 1024 / 1024).toFixed(1))
  if (mb < 1024) return mb.toFixed(1) + ' MB'
  // GB 是最大单位：1 TiB 只能显示成 1024.00 GB（没有 TB，保持与既有调用方兼容）
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

/**
 * 人民币大写（壹贰叁…佰仟万亿、元角分整）。
 * 算法移植（GB 金额大写规范），超 20 行属豁免场景。
 */
export function toChineseAmount(n: number | string): string {
  // TD-85：非 number/string 的运行时脏值（对象/Symbol）→ 空串，不抛错
  if (typeof n !== 'number' && typeof n !== 'string') return ''
  const value = typeof n === 'string' ? Number(n) : n
  if (!isFinite(value)) return ''
  // 超出「万亿」量级（≥1e16）无法用现役大数单位表达（bigRadices 只到「万亿」）。
  // 第 186 轮：此前不设界，分组数 > 4 时 bigRadices[4] 是 undefined，
  // 拼出 "壹undefined元整" —— 会直接印在单据上。与"不可表示"的既有约定一致：返回空串。
  if (Math.abs(value) >= 1e16) return ''

  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
  const radices = ['', '拾', '佰', '仟']
  const bigRadices = ['', '万', '亿', '万亿']

  /**
   * 按「分」取整（#408）：先四舍五入到分，再还原成元/角分。
   *
   * 旧的 `Math.round(Math.abs(value) * 100) / 100` 拿**二进制浮点**直接乘 100 再 round，
   * 于是同一个尾数在不同整数位上表现相反：
   *   · `0.005` → 0.5 → 进到 1 分 ✓
   *   · `1.005` → 100.49999999999999 → **舍成 100 分**（丢 1 分）✗
   * 金额大写是要印在单据上的，进位必须**按十进制一致**，不能取决于浮点表示。
   * 先把 `*100` 的值用 `toFixed(6)` 抹掉浮点噪声再 round，即"十进制半进位"。
   */
  const cents = Math.round(Number((Math.abs(value) * 100).toFixed(6)))
  // 取整后为 0 就不再带负号：`-0.004` 旧实现会印出「负零元整」（不是有效金额写法）
  const negative = value < 0 && cents > 0
  const intPart = Math.floor(cents / 100)
  const decPart = cents % 100

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

/**
 * 截断字符串并加后缀（默认 …），长度未超限原样返回。
 *
 * `len` 计的是**用户感知字符**（grapheme），不是 UTF-16 码元（2026-11-01 #277）。
 * 旧实现用 `s.slice(0, len)` 按码元切：emoji 占 2 码元，切在中间会留下**孤立代理**，
 * 渲染成豆腐块；`'😀'.length === 2` 也让"限 N 字"对 emoji 只能输一半。
 */
export function truncate(str: unknown, len: number, suffix = '…'): string {
  return truncateGraphemes(toStr(str), len, suffix)
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
  // 第 188 轮：非对象直接返回空串（旧实现 Object.entries(undefined/null) 抛 TypeError）
  if (!params || typeof params !== 'object') return ''
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

/**
 * 从 unknown 错误里取可读消息：Error 实例取 message，字符串原样返回，
 * 其它取 name 或 String()。catch (e: unknown) 后要给人看消息时用它，
 * 不必在每个调用点写 instanceof 链。
 */
export function errMessage(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  if (isPlainObject(err)) {
    const m = err.message ?? err.name
    if (typeof m === 'string') return m
  }
  // TD-84（第 29 轮）：`String(undefined)` 是 'undefined'，`String({})` 是
  // '[object Object]' —— 两者都会原样进 toast/错误条。只对基本类型取值，其余给空串。
  if (err === null || err === undefined) return ''
  return typeof err === 'number' || typeof err === 'boolean' ? String(err) : ''
}

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
  // TD-84（第 29 轮）：非手机号时回退 `toStr(phone)`，对对象/数组会给出
  // `[object Object]` / `1,2,3` 这类**不是用户填的内容**的串。回退只对
  // 基本类型有意义（数字/字符串/布尔），其余给空串。
  if (!/^1\d{10}$/.test(p)) {
    return typeof phone === 'string' || typeof phone === 'number' ? toStr(phone) : ''
  }
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
  // 第 187 轮：null/undefined 必须先挡掉。`new Date(null)` 是**合法的纪元 0**，
  // 于是"没有时间"被显示成 1970-01-01（与同函数对 'bad' 返回 '' 的口径不一致）。
  // 注意 0 是合法时间戳，不能一起砍。
  if (v === null || v === undefined) return null
  // TD-85（第 32 轮）：`new Date(Symbol())` 抛 TypeError（Symbol 不能隐式转原始值），
  // 对象/数组也会得到无意义结果。只接受三种声明过的类型。
  if (typeof v !== 'string' && typeof v !== 'number' && !(v instanceof Date)) return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d
}

/** 日历天差（两端都归零到本地当日 00:00 再相减；DST 时区里一天可能是 23/25 小时，故 round） */
function calendarDayDiff(t: Date, now: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const b = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()
  return Math.round((a - b) / 86400000)
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
  // 日历天口径（#413）：`昨天` 与 `N天前` 必须用**同一把尺子**。
  // 此前 `昨天` 按日历天判（isSameDay）、`N天前` 按「经过 24h 的整数倍」——
  // 同一条时间轴上于是有两种读数：以 08-24 00:30 为「现在」看 08-22 23:00
  // （25.5h 前，日历上是**前天**）报「1天前」，而看 08-23 00:30（47h 前，日历昨天）报「昨天」。
  // 列表按「天」扫读，混用口径会让相隔两天的两条记录看起来只差一天；
  // 折算成天数的唯一稳定口径是**日历天**（与「昨天」一致，也不受 DST 影响）。
  const days = calendarDayDiff(t, n)
  if (days === 1) return _t('utils.yesterday')
  if (days < 30) return _t('utils.daysAgo', { n: days })
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
  // 第 188 轮：非字符串直接判非法（旧实现 `hex.trim()` 对 null/数字/对象抛 TypeError）
  if (typeof hex !== 'string') return null
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
    // 第 188 轮：非有限分量（NaN/±Infinity）先归 0 —— 否则 Math.round(NaN) 仍是 NaN，
    // 最终拼出 "#NAN0A14" 这种非法颜色串（会直接写进 style）
    const safe = Number.isFinite(n) ? n : 0
    const clamped = Math.max(0, Math.min(255, Math.round(safe)))
    return clamped.toString(16).padStart(2, '0')
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

/** 判断字符串是否为合法 HEX 颜色 */
export function isHexColor(str: unknown): boolean {
  return isValidHex(toStr(str).trim())
}

/** 浏览器解析不出颜色时的兜底，与 <input type="color"> 无 value 时的默认黑一致 */
const NATIVE_COLOR_FALLBACK = '#000000'

/**
 * 计算样式里的颜色串（rgb()/rgba()）→ #RRGGBB。
 * 只认这两种：Chrome 对 hex/var()/命名色的计算输出就是 rgb()；oklch 等新记法原样回显，
 * 其中的数字不是 0~255 分量，宁可回退黑色也不能猜错颜色。
 */
function computedColorToHex(computed: string): string | null {
  const s = toStr(computed).trim()
  if (!/^rgba?\(/.test(s)) return null
  const nums = s.match(/[\d.]+/g)
  if (!nums || nums.length < 3) return null
  const [r, g, b] = nums.map(Number)
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null
  return rgbToHex(r!, g!, b!)
}

/** 临时把颜色挂进文档树读计算值，读完立刻摘掉 — 自定义属性只有挂在树里才解析得出来 */
function resolveCssColor(value: string): string {
  const doc = safeDocument()
  if (!doc || !value) return ''
  const view = doc.defaultView
  if (!view) return ''
  const probe = doc.createElement('span')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0;overflow:hidden;pointer-events:none'
  // 非法颜色串会被 CSSOM 直接拒收（回读为空），此时计算值是 html 继承来的正文色，
  // 读它就是把页面文字色当成用户选的色 —— 必须在读之前拦掉
  probe.style.color = value
  if (!probe.style.color) return ''
  doc.documentElement.appendChild(probe)
  try {
    return view.getComputedStyle(probe).color
  } catch {
    return ''
  } finally {
    probe.remove()
  }
}

/**
 * 归一成 <input type="color"> 收得了的 #rrggbb。
 * 原生取色器只认 #rrggbb 一种写法，传 var(--vcl-color-primary)、red、#abc、transparent
 * 浏览器会拒收并刷 console 警告（IconPicker 默认值即命中）。
 * 只影响喂给控件的值，调用方持有的原始颜色字符串不改——图标实际渲染仍走 var() 跟随主题。
 *
 * 认不出的一律回退黑：缺 # 的裸十六进制（'ff8800' 不是合法 CSS 颜色）、位数不对、
 * oklch() 等新记法（计算值原样回显，数字不是 0~255 分量，猜不得）。
 * 已知边界：var() 指向不存在的令牌时浏览器按继承色处理，取色块会显示成正文色；
 * 不存在的令牌本身就是错的，回传值与图标渲染都不受影响。
 */
export function toNativeColorValue(value: unknown): string {
  const raw = toStr(value).trim()
  if (raw.startsWith('#')) {
    const rgb = hexToRgb(raw)
    if (rgb) return rgbToHex(rgb.r, rgb.g, rgb.b)
  }
  return computedColorToHex(resolveCssColor(raw)) ?? NATIVE_COLOR_FALLBACK
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

// 行政区划已拆出（2026-11-01）：本入口继续转发，公开路径 './_internal/utils' 不变
export * from './region'
