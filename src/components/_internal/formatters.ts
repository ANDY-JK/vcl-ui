/**
 * 数字 / 金额格式化（#439 从 `_internal/utils.ts` 拆出）。
 *
 * 拆分原因：`utils.ts` 一度 797 行、距 810 止涨线只剩 13 行（TD-54 挂号）。
 * 这 4 个格式化函数 + 私有 `normalizeDecimals` 共约 167 行，是文件里最大的一块内聚逻辑，
 * 且只有两个外部消费者（Upload.vue / 主入口），搬走成本最低。
 *
 * ⚠️ 与 utils.ts 的分工：这里只放"数值 → 文本"的格式化；其余工具（校验/字符串/随机/文件）留在 utils.ts。
 */

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
