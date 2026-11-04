// ==================== 单元格输入归一化（纯函数，零环境依赖） ====================
// 目标：让 editable DataTable 双击编辑的输入贴近 Excel 习惯 —— 如 date 列输入 9/12 → 2026-09-12。
//
// 三条设计约束（改动前先读）：
//  1) opt-in —— 仅当列显式声明 Column.type 时才归一化；type 未声明（undefined）原样返回，
//     存量表格零行为变化，也杜绝「文本列被误判成日期」。
//  2) 提交层归一化 —— 返回值即写入 _cellOverrides 的值，导出/筛选读到同一口径；
//     展示格式化交给 Column.render，本模块绝不参与渲染。
//  3) 纯函数 —— 除注入的 now 外不读任何环境（无 DOM / 无 i18n），便于单测与复用。

export type CellValueType = 'text' | 'number' | 'date' | 'datetime' | 'time'

/** 两段数字月/日的解释顺序：
 *  'MDY' → 9/12 视为 9月12日（中文/美式 Excel 默认）；'DMY' → 视为 12月9日。
 *  ⚠️ 当月日都 ≤12 时这是真歧义，无法自动消歧，只能由使用方声明。 */
export type DateOrder = 'MDY' | 'DMY'

export type NormalizeErrorKey = 'table.invalidNumber' | 'table.invalidDate' | 'table.invalidTime'

export interface NormalizeOptions {
  /** 列值类型；未声明 = 不归一化（原样返回） */
  type?: CellValueType
  /** 仅对两段数字日期生效，默认 'MDY' */
  dateOrder?: DateOrder
  /** 当前时间注入点（测试用），默认 new Date() */
  now?: Date
}

export interface NormalizeResult {
  ok: boolean
  /** ok=true：写入单元格的规范值（可能已改写）；ok=false：等于入参原值，调用方不得落库 */
  value: string
  /** ok=false 时的 i18n key，供组件弹提示 */
  errorKey?: NormalizeErrorKey
}

// ==================== 基础判定 ====================

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** y/m/d 是否为真实存在的日期（含闰年判定）。
 *  setFullYear 规避 Date 构造器把 0-99 年映射到 1900+ 的歧义。 */
function isValidYmd(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(0)
  dt.setFullYear(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

/** 两位年补全（对齐 Excel）：0-29 → 20xx，30-99 → 19xx */
function expandYear(y: number): number {
  if (y >= 100) return y
  return y <= 29 ? 2000 + y : 1900 + y
}

interface Ymd {
  y: number
  m: number
  d: number
}

interface Hm {
  h: number
  m: number
  sec?: number
}

/** 两段数字归月/日：优先按 order 解释；主解释非法时尝试交换。
 *  交换是为了对齐 Excel 的容错（US 区域输入 13/12 会自动理解成 12月13日）。
 *  两种解释都非法时返回主解释，交由上层判非法并给出统一 errorKey。 */
function resolveMd(a: number, b: number, order: DateOrder, year: number): Ymd {
  const primary: Ymd = order === 'DMY' ? { y: year, m: b, d: a } : { y: year, m: a, d: b }
  if (isValidYmd(primary.y, primary.m, primary.d)) return primary
  const swapped: Ymd = { y: primary.y, m: primary.d, d: primary.m }
  if (isValidYmd(swapped.y, swapped.m, swapped.d)) return swapped
  return primary
}

// ==================== 日期 / 时间解析 ====================

/** 单段纯数字日期：YYYYMMDD / YYMMDD / MMDD（补当前年） */
function parseCompactDigits(digits: string, order: DateOrder, now: Date): Ymd | null {
  if (!/^\d+$/.test(digits)) return null
  if (digits.length === 8) {
    return {
      y: Number(digits.slice(0, 4)),
      m: Number(digits.slice(4, 6)),
      d: Number(digits.slice(6, 8)),
    }
  }
  if (digits.length === 6) {
    return {
      y: expandYear(Number(digits.slice(0, 2))),
      m: Number(digits.slice(2, 4)),
      d: Number(digits.slice(4, 6)),
    }
  }
  if (digits.length === 4) {
    return resolveMd(Number(digits.slice(0, 2)), Number(digits.slice(2, 4)), order, now.getFullYear())
  }
  return null
}

/** 分段数字日期：两段（9/12 + 当前年）/ 三段（年在前 2026/9/12 或 年在后 9/12/26） */
function parseSegmented(parts: string[], order: DateOrder, now: Date): Ymd | null {
  if (!parts.every((p) => /^\d+$/.test(p))) return null
  // 两段：同事诉求的 9/12 → 2026-09-12 走这里
  if (parts.length === 2) {
    return resolveMd(Number(parts[0]), Number(parts[1]), order, now.getFullYear())
  }
  if (parts.length === 3) {
    if (parts[0].length >= 3) {
      return { y: expandYear(Number(parts[0])), m: Number(parts[1]), d: Number(parts[2]) }
    }
    // 前两段为月日（按 order，含 13/12 交换容错），末段为年
    return resolveMd(Number(parts[0]), Number(parts[1]), order, expandYear(Number(parts[2])))
  }
  return null
}

/** 解析日期部分；无法识别返回 null。
 *  order 仅决定两段纯数字的月/日归属，三位以上年份一律按「年在前/年在后」识别。 */
function parseYmd(raw: string, order: DateOrder, now: Date): Ymd | null {
  const s = raw.trim()
  if (!s) return null

  // 中文写法：2026年9月12日 / 9月12日
  const zh = s.match(/^(?:(\d{2,4})\s*年)?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/)
  if (zh) {
    const y = zh[1] ? expandYear(Number(zh[1])) : now.getFullYear()
    return { y, m: Number(zh[2]), d: Number(zh[3]) }
  }

  const parts = s.split(/[/\-.\s]+/).filter(Boolean)
  if (parts.length === 1) return parseCompactDigits(parts[0], order, now)
  return parseSegmented(parts, order, now)
}

/** 解析时间部分：14:30 / 14:30:05 / 1430 / 930；非法返回 null */
function parseHm(raw: string): Hm | null {
  const t = raw.trim()
  if (!t) return null

  const colon = t.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/)
  if (colon) {
    const h = Number(colon[1])
    const mi = Number(colon[2])
    const sec = colon[3] === undefined ? undefined : Number(colon[3])
    if (h > 23 || mi > 59 || (sec !== undefined && sec > 59)) return null
    return { h, m: mi, sec }
  }

  // 紧凑写法：1430 → 14:30，930 → 09:30
  const compact = t.match(/^(\d{3,4})$/)
  if (compact) {
    const d = compact[1].padStart(4, '0')
    const h = Number(d.slice(0, 2))
    const mi = Number(d.slice(2, 4))
    if (h > 23 || mi > 59) return null
    return { h, m: mi }
  }

  return null
}

function formatHm(hm: Hm): string {
  const base = `${pad2(hm.h)}:${pad2(hm.m)}`
  return hm.sec === undefined ? base : `${base}:${pad2(hm.sec)}`
}

function formatYmd(ymd: Ymd): string {
  return `${ymd.y}-${pad2(ymd.m)}-${pad2(ymd.d)}`
}

/** 解析日期时间：`9/12 14:30` / `2026-09-12T14:30` / 仅时间 `14:30`（补今天）；非法返回 null */
function parseDateTime(raw: string, order: DateOrder, now: Date): { ymd: Ymd; hm: Hm } | null {
  const s = raw.trim()
  if (!s) return null

  // 仅时间 → 补今天
  if (/^\d{1,2}:\d{1,2}(?::\d{1,2})?$/.test(s)) {
    const hm = parseHm(s)
    if (!hm) return null
    return { ymd: { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }, hm }
  }

  // 日期 + 时间（空格或 T 分隔）
  const m = s.match(/^(.+?)[\sT]+(\d{1,2}:\d{1,2}(?::\d{1,2})?)$/)
  if (!m) return null
  const ymd = parseYmd(m[1], order, now)
  const hm = parseHm(m[2])
  if (!ymd || !hm) return null
  return { ymd, hm }
}

// ==================== 数字解析 ====================

/** 把数值转成十进制字符串：String(n) 在 |n| ≥ 1e21 或 < 1e-6 时会切科学计数，
 *  这里用 toFixed 还原可读十进制，避免把 1e-7 写成 '1e-7' 落库。
 *  返回 null = 无法无损还原（≥1e21 展开后仍是指数形式；极小数会被 toFixed 抹成 '0'），
 *  由调用方保原样 —— 静默改值比"留个不好看的写法"危险得多。 */
function numToPlainString(n: number): string | null {
  const s = String(n)
  if (!/[eE]/.test(s)) return s
  const plain = n.toFixed(20).replace(/0+$/, '').replace(/\.$/, '')
  if (/[eE]/.test(plain) || Number(plain) !== n) return null
  return plain
}

/**
 * 统一小数点与千分位（#406）。
 *
 * 旧实现无条件 `replace(/[,\s]/g, '')` —— 把逗号一律当千分位，于是**欧式写法被静默改值**：
 *   · `1.234,56`（1234.56）→ `1.23456` —— **小了 1000 倍**
 *   · `1,23`（1.23）→ `123` —— **大了 100 倍**
 *   · `1,2` → `12`；`1,23,4` → `1234`（乱码也能"成功"）
 * 这类"看起来正常的错数"比报错危险得多（本文件其它处已反复强调同一原则）。
 *
 * 判定规则（能判就判，判不了就报非法，绝不猜）：
 *  1. 两种分隔符都有 → **最后出现的那个是小数点**（'1.234,56' 欧式 / '1,234.56' 美式）；
 *  2. 只有逗号 → 严格千分位（`1,234,567`）去掉；`数字,1~2位` 视为小数逗号；其余判非法；
 *  3. 只有点号 → 维持既有语义（小数点是点号）。
 *
 * @returns 统一后的字符串；null = 分隔符形态无法判定（交由调用方报 invalidNumber）
 */
function unifyDecimalSeparators(t: string): string | null {
  const lastComma = t.lastIndexOf(',')
  const lastDot = t.lastIndexOf('.')
  if (lastComma === -1 && lastDot === -1) return t
  if (lastComma !== -1 && lastDot !== -1) {
    return lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  }
  if (lastComma !== -1) {
    if (/^[+-]?\d{1,3}(,\d{3})+$/.test(t)) return t.replace(/,/g, '')
    if (/^[+-]?\d+,\d{1,2}$/.test(t)) return t.replace(',', '.')
    return null
  }
  return t
}

/** 数字归一化：去千分位/货币符号/空白，会计负数 (123) → -123，全角转半角 */
function normalizeNumber(raw: string): NormalizeResult {
  const invalid: NormalizeResult = {
    ok: false,
    value: raw,
    errorKey: 'table.invalidNumber',
  }

  let t = raw.trim()
  if (!t) return { ok: true, value: '' }

  // 会计写法：(123) / （123） → 负数
  const accounting = t.match(/^[（(]\s*(.+?)\s*[)）]$/)
  if (accounting) t = `-${accounting[1]}`

  // 全角数字/符号 → 半角
  t = t
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[－—−]/g, '-')
    .replace(/／/g, '/')
    .replace(/[．。]/g, '.')

  // 去空白与货币符号（先做，避免干扰分隔符判定）
  t = t.replace(/[\s]/g, '').replace(/[￥¥$€£]|元|人民币/g, '')
  if (!t) return invalid
  // 小数点/千分位统一（#406）：欧式写法此前会被静默改值
  const unified = unifyDecimalSeparators(t)
  if (unified === null) return invalid
  t = unified
  if (!t) return invalid
  // 前导零（007 / 01.5 / -007）：Excel 一般列把它当**文本**——静默转成 7 会损毁编码/工号/电话，
  // 保原样（半角化后）比「归一化出错误数字」安全。'0' / '0.5' 不受影响（0 后第二位不是数字）。
  if (/^[+-]?0\d/.test(t)) return { ok: true, value: t }
  // 严格数字形态：整数/小数/科学计数，杜绝 Number() 对 ''、'0x10'、'Infinity' 的宽松接受
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return invalid

  const n = Number(t)
  if (!Number.isFinite(n)) return invalid
  // 超出安全整数范围的纯整数（银行卡 19 位 / 身份证 18 位 / 流水号）：Number 会静默抹掉尾数
  // （6210001234567890123 → 6210001234567890000），落库后不可逆。与前导零同策略保原样。
  if (/^[+-]?\d+$/.test(t) && !Number.isSafeInteger(n)) return { ok: true, value: t }
  const plain = numToPlainString(n)
  // 展开不成十进制的写法（1e21 / 1e-21）同样保原样，不返回被改坏的值
  return { ok: true, value: plain ?? t }
}

// ==================== 对外入口 ====================

/**
 * 单元格输入归一化 —— 唯一对外入口。
 *
 * @param raw  输入框原始文本
 * @param opts 列类型与日期顺序（type 未声明 = 原样放行，保证 opt-in）
 *
 * 统一约定：**空串/纯空白一律放行并归一为 ''**，保证「清空单元格」在带类型的列上仍然可用。
 */
export function normalizeCellInput(raw: string, opts: NormalizeOptions = {}): NormalizeResult {
  const { type, dateOrder = 'MDY' } = opts

  // opt-in：未声明 type 或显式 text 的列完全保持现状（text 不 trim，与既有行为一致）
  if (!type || type === 'text') return { ok: true, value: raw }

  // 清空放行（Delete 清空与手动清空走同一提交口径）
  if (!raw || raw.trim() === '') return { ok: true, value: '' }

  const now = opts.now ?? new Date()

  switch (type) {
    case 'number':
      return normalizeNumber(raw)

    case 'date': {
      const ymd = parseYmd(raw, dateOrder, now)
      if (!ymd || !isValidYmd(ymd.y, ymd.m, ymd.d)) {
        return { ok: false, value: raw, errorKey: 'table.invalidDate' }
      }
      return { ok: true, value: formatYmd(ymd) }
    }

    case 'time': {
      const hm = parseHm(raw)
      if (!hm) return { ok: false, value: raw, errorKey: 'table.invalidTime' }
      return { ok: true, value: formatHm(hm) }
    }

    case 'datetime': {
      const dt = parseDateTime(raw, dateOrder, now)
      if (!dt || !isValidYmd(dt.ymd.y, dt.ymd.m, dt.ymd.d)) {
        return { ok: false, value: raw, errorKey: 'table.invalidDate' }
      }
      return { ok: true, value: `${formatYmd(dt.ymd)} ${formatHm(dt.hm)}` }
    }

    default:
      return { ok: true, value: raw }
  }
}
