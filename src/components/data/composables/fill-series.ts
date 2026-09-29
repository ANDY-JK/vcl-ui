// ==================== Excel 式填充柄取值规则（纯函数） ====================
// 只负责「给定源选区 + 方向 + 格数 → 生成哪些值」，不碰 DOM/选区/写入。
// 调用方（useTableEdit.applyFill）负责把偏移映射成 rowKey/colKey 并过滤列约束。

export type FillDirection = 'down' | 'up' | 'right' | 'left'

/** 一个待写入的填充格：偏移相对「源选区左上角」，行列均按显示顺序 */
export interface FillCell {
  rowOffset: number
  colOffset: number
  value: string
}

/** 严格十进制数字（不含千分位；千分位由调用方先行归一化，填充不做归一化） */
const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86400000

function parseNum(v: string): number | null {
  const s = v.trim()
  if (!NUM_RE.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** 数字 → 字符串：抹掉浮点噪声（0.1+0.2 类）与多余的 .0 */
function formatNum(n: number): string {
  return String(Number(n.toFixed(10)))
}

function parseYmd(v: string): { y: number; m: number; d: number } | null {
  const m = DATE_RE.exec(v.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return { y, m: mo, d }
}

/** y/m/d → 时间戳（本地时区；setFullYear 规避 0-99 年映射歧义，与库内 date-utils 同口径） */
function toTime(y: number, m: number, d: number): number {
  const dt = new Date(0)
  dt.setFullYear(y, m - 1, d)
  // 归一化非法日期（如 2-31 会溢出到 3-3）：回读校验，不一致则视为非日期
  if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return NaN
  return dt.getTime()
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function fmtDate(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 循环取值（支持倒序，用于 up/left 往前补） */
function cyclic(values: string[], i: number, forward: boolean): string {
  const n = values.length
  const idx = forward ? i % n : (((n - 1 - i) % n) + n) % n
  return values[idx]
}

/** 单条线（垂直时为一列、水平时为一行）的系列推断：返回沿方向新增的 count 个值。
 *  forward=true → 追加在末尾（down/right）；false → 插在开头（up/left）。
 *
 *  规则（对齐 Excel 常用行为，非全量）：
 *   - 全数字：单格步长 1；多格步长 = (末-首)/(n-1)（线性外推的简化，不拟合最小二乘）
 *   - 全日期：按天步进，同上
 *   - 其它：循环重复源序列（**不**做「尾部数字递增」，避免静默改写 SKU/电话等编码）
 */
export function fillLine(values: string[], count: number, forward: boolean): string[] {
  if (count <= 0) return []
  if (!values.length) return Array(count).fill('')

  const nums = values.map(parseNum)
  if (nums.every((n) => n !== null)) {
    const ns = nums as number[]
    const step = ns.length === 1 ? 1 : (ns[ns.length - 1] - ns[0]) / (ns.length - 1)
    const anchor = forward ? ns[ns.length - 1] : ns[0]
    return Array.from({ length: count }, (_, i) =>
      formatNum(forward ? anchor + step * (i + 1) : anchor - step * (i + 1)),
    )
  }

  const ymds = values.map(parseYmd)
  if (ymds.every((v) => v !== null)) {
    const ts = (ymds as { y: number; m: number; d: number }[]).map((v) => toTime(v.y, v.m, v.d))
    if (ts.every((t) => !Number.isNaN(t))) {
      const stepDays = ts.length === 1 ? 1 : (ts[ts.length - 1] - ts[0]) / DAY_MS / (ts.length - 1)
      const anchor = forward ? ts[ts.length - 1] : ts[0]
      return Array.from({ length: count }, (_, i) => {
        const delta = Math.round(stepDays * (i + 1)) * DAY_MS
        return fmtDate(forward ? anchor + delta : anchor - delta)
      })
    }
  }

  return Array.from({ length: count }, (_, i) => cyclic(values, i, forward))
}

/**
 * 依据源选区矩阵生成填充值矩阵。
 *
 * @param source    R 行 × C 列源值（按显示顺序）
 * @param direction 填充方向
 * @param count     沿该方向新增的行数（垂直）或列数（水平）
 */
export function buildFillCells(source: string[][], direction: FillDirection, count: number): FillCell[] {
  if (count <= 0) return []
  const R = source.length
  const C = source[0]?.length ?? 0
  if (R === 0 || C === 0) return []

  const forward = direction === 'down' || direction === 'right'
  const vertical = direction === 'down' || direction === 'up'
  const out: FillCell[] = []

  if (vertical) {
    // 每条线 = 一列：逐列推断系列
    for (let c = 0; c < C; c++) {
      const gen = fillLine(
        source.map((row) => row[c] ?? ''),
        count,
        forward,
      )
      for (let i = 0; i < count; i++) {
        out.push({ rowOffset: forward ? R + i : -(i + 1), colOffset: c, value: gen[i] })
      }
    }
  } else {
    // 每条线 = 一行：逐行推断系列
    for (let r = 0; r < R; r++) {
      const gen = fillLine(source[r] ?? [], count, forward)
      for (let i = 0; i < count; i++) {
        out.push({ rowOffset: r, colOffset: forward ? C + i : -(i + 1), value: gen[i] })
      }
    }
  }

  return out
}
