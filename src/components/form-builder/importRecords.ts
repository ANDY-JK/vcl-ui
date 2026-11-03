/**
 * 收集记录批量导入 — 解析/归一化/去重纯函数（P1-8）
 *
 * 数据流：文件（JSON/CSV/Excel）→ 原始行 → normalizeRecords 归一化为
 * {key: value} 记录 → dedupeRecords 内容指纹去重 → 批量写入存储。
 *
 * 职责边界：
 * - 纯函数、无 DOM/文件 IO，可单测锁定行为
 * - 表头反查：CSV/Excel 表头（通常是字段 label）映射回 field.key
 * - 值清洗：数组字段（checkbox/upload/date-range）按逗号/分号拆数组，
 *   number 字段转数字，未知列丢弃
 * - 去重指纹：data 按 key 排序后 JSON 序列化，与已有记录及批内去重
 */

import type { CollectRecord } from './designer/types'
import { dedupeFieldLabels } from './fieldLabels'

/** 导入字段的最小描述（FormCollect 的 DesignerField 子集） */
export interface ImportField {
  key?: string
  label?: string
  type?: string
}

/** 归一化后的一条记录（仅含已知字段） */
export interface NormalizedRecord {
  data: Record<string, unknown>
}

/** 去重结果 */
export interface DedupeResult {
  /** 待导入记录（已含 data） */
  toImport: Record<string, unknown>[]
  /** 重复跳过条数 */
  skipped: number
}

/** 数组类字段类型：CSV 值按分隔符拆分为数组 */
const ARRAY_FIELD_TYPES = new Set(['checkbox', 'upload', 'image-upload', 'camera', 'date-range'])

/** 值拆分分隔符：英文逗号 / 中文逗号 / 分号 / 竖线 */
const ARRAY_SPLIT_RE = /[,，;；|]+/

/** 去掉 UTF-8 BOM（第 179 轮）：Excel/PowerShell/记事本的导出常带 U+FEFF。
 *  CSV 那边表头 trim() 恰好能吃掉它，但 JSON.parse 不容忍 BOM 会直接抛错，
 *  所以统一在解析入口剥掉，两个解析器都不再各判一次。 */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

// ════════════════════════════════════════
// 表头映射
// ════════════════════════════════════════

/**
 * 构建「表头文本 → field.key」映射
 *
 * 表头既支持字段 label（中文，导出格式）也支持字段 key 本身。
 *
 * **同 label 冲突时取"第一个"**（2026-11-01 #305）。此前是"后者覆盖"，
 * 与导出规则相反：导出给第一个字段写 `姓名`、第二个写 `姓名 (2)`，
 * 而导入把 `姓名` 映射给最后一个字段 —— 「导出 → 在 Excel 里改 → 再导入」
 * 会把数据写进错字段，`姓名 (2)` 还被当成未知列丢掉。
 * 现在两边共用 `dedupeFieldLabels()`：第一个保持原名，其后加 ` (n)`。
 */
export function buildHeaderMap(fields: ImportField[]): Record<string, string> {
  const map: Record<string, string> = {}
  // 两趟：先登记所有 label，再登记所有 key（2026-11-01 #272）。
  //
  // 单趟写法有个静默覆盖：字段 A 的 **key** 会被后面字段 B 的 **label** 抢走 ——
  // 例如 A={key:'memo',label:'备注'}、B={key:'note',label:'memo'}，
  // 单趟结果是 `memo → note`：CSV 表头写着 `memo`（明明是 A 的 key）却导进 B 字段。
  // 表头字面量等于某字段 key 时，那个字段才是用户的意图 → key 必须最后写、优先级最高。
  // 先按"导出同款"规则算出唯一显示名，再登记 —— 保证同名 label 分别映射到不同 key（#305）
  const labeled = dedupeFieldLabels(
    fields
      .filter((f): f is ImportField & { key: string; label: string } => Boolean(f.key && f.label))
      .map((f) => ({ label: f.label, key: f.key })),
  )
  for (const f of labeled) map[f.label] = f.key
  for (const f of fields) {
    if (f.key) map[f.key] = f.key
  }
  return map
}

// ════════════════════════════════════════
// 解析
// ════════════════════════════════════════

/**
 * 解析 CSV 文本为二维数组
 *
 * 支持引号转义（字段内含逗号/引号/换行）、空行忽略。
 *
 * ## 两处"别比 Excel 更严"的修正（#398）
 *
 * 1. **引号只在单元格开头才有"包裹"语义**。手改/第三方导出的 CSV 里，
 *    `量杯5"口径` 这种单元格中间的引号很常见 —— 此前一律进入引号模式，
 *    于是紧随其后的逗号被吞进同一格：**两列并成一列**，导入后数据落错字段。
 * 2. **引号不成对时按字面重解析**。少一个引号（`"abc,def` 后面没了）此前会让解析器
 *    一直停在引号模式里，把**文件剩余部分全吞成一格** —— 用户看到"只导入了 1 条"，
 *    而后面的行人间蒸发。现在检测到"结尾仍在引号内"就退回字面模式重解析：
 *    宁可把引号当普通字符保留，也不能吞行吞列。
 */
export function parseCsvRecords(text: string): string[][] {
  const src = stripBom(text).replace(/\r\n?/g, '\n')
  const parsed = parseCsvRows(src, false)
  // 引号不成对 → 字面模式重解析（只重试一次，不会递归）
  return parsed ?? parseCsvRows(src, true) ?? []
}

/**
 * CSV 状态机。
 * @param literalQuotes 为 true 时引号一律按普通字符处理（用于"引号不成对"的退路）
 * @returns 正常返回行数组；解析到结尾仍在引号内且非字面模式时返回 null（交给调用方重试）
 */
function parseCsvRows(src: string, literalQuotes: boolean): string[][] | null {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"' && !literalQuotes && cell === '') {
      // 只有"单元格第一个字符是引号"才进入包裹模式（Excel/RFC 4180 同款）
      inQuotes = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (inQuotes && !literalQuotes) return null
  // 末尾行（无换行结尾）
  row.push(cell)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

/**
 * 解析 JSON 文本为记录数组
 *
 * 支持两种形态：
 * - `[{ "key": value }]`（field key 直接作键）
 * - `[{ "字段label": value }]`（导出/手工格式，由 normalize 反查 key）
 */
export function parseJsonRecords(text: string): Record<string, unknown>[] {
  // BOM 必须先去：JSON.parse 不容忍 U+FEFF，带 BOM 的文件会抛
  // "Unexpected token ''"，用户看到的是一句 JS 内部报错（第 179 轮）
  const data = JSON.parse(stripBom(text))
  if (!Array.isArray(data)) throw new Error('JSON 根节点必须是数组')
  return data as Record<string, unknown>[]
}

// ════════════════════════════════════════
// 归一化
// ════════════════════════════════════════

/** 判断字段是否为数组类（值按分隔符拆分） */
function isArrayField(fields: ImportField[], key: string): boolean {
  const f = fields.find((x) => x.key === key)
  return !!f && ARRAY_FIELD_TYPES.has(f.type ?? '')
}

/** 清洗单个单元格值：按字段类型转数组/数字，未知类型保留字符串 */
function cleanCell(key: string, raw: unknown, fields: ImportField[]): unknown {
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'number' || typeof raw === 'boolean') return raw
  // 单元格内制表符归一为空格（TD-78 ①）：TSV 另存为 CSV 时常见 `a\tb`。
  // 制表符在单值里没有任何合法语义（分列已由 CSV 逗号承担），留着会原样入库，
  // 下游导出/打印时表现为列错位。换行**不动** —— CSV 引号内的多行文本是合法内容。
  const str = String(raw).replace(/\t/g, ' ').trim()
  if (isArrayField(fields, key)) {
    if (str === '') return []
    return str
      .split(ARRAY_SPLIT_RE)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  const f = fields.find((x) => x.key === key)
  if (f?.type === 'number' && str !== '') {
    // 千分位剥离（TD-78 ②）：Excel 里 `1,234` 被另存为 CSV 时带逗号（或被引号包裹），
    // Number('1,234') 是 NaN → 原串保留 → 下游"金额列是文本、求和为 0"。
    // 只在**严格的千分位形态**下剥（`-?digits,ddd,ddd[.ddd]`），别把 '1,2' 这类
    // 真·多值/编码值误当数字。
    const thousands = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(str) ? str.replace(/,/g, '') : str
    const n = Number(thousands)
    // 只接受**有限数**（第 179 轮）：`isNaN` 放过 ±Infinity，而 'Infinity' / '1e400'
    // 转成 Infinity 后 JSON.stringify 会写成 null —— 导入完用户看到的是"金额为空"，
    // 数据静默丢失。非有限数保留原串，至少不篡改。
    return Number.isFinite(n) ? n : str
  }
  return str
}

/**
 * 归一化原始行为 {key: value} 记录
 *
 * - 表头行（第一行）→ 通过 headerMap 反查 field.key，未知列丢弃
 * - 数据行 → 只保留已知字段，值按字段类型清洗
 * - 全部已知字段为空的行视为无效（不计入）
 *
 * @param rows 二维数组（第一行为表头）
 * @param headerMap buildHeaderMap 产物
 * @param fields 字段定义（用于类型清洗）
 * @returns { records, invalid }
 */
export function normalizeRecords(
  rows: string[][],
  headerMap: Record<string, string>,
  fields: ImportField[],
): { records: Record<string, unknown>[]; invalid: number; duplicateHeaders: string[] } {
  if (rows.length < 2) return { records: [], invalid: 0, duplicateHeaders: [] }
  const header = rows[0]
  // 表头 → 字段 key（按列序）
  const colKeys: (string | null)[] = header.map((h) => headerMap[h.trim()] ?? null)
  const records: Record<string, unknown>[] = []
  let invalid = 0

  // 同一字段被**多列**映射（CSV 里两列都叫「备注」）时必须上报（2026-11-01 #272）。
  // 旧实现让后面的列静默覆盖前面的列：用户导入后只看到后一列的值，前一列整列消失，
  // 且没有任何提示 —— 这是"数据少了但没人知道"的典型形态。
  const firstColOf = new Map<string, number>()
  const duplicateHeaders: string[] = []
  for (let c = 0; c < colKeys.length; c++) {
    const key = colKeys[c]
    if (!key) continue
    if (firstColOf.has(key)) {
      const name = header[c]?.trim() || key
      if (!duplicateHeaders.includes(name)) duplicateHeaders.push(name)
    } else {
      firstColOf.set(key, c)
    }
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const rec: Record<string, unknown> = {}
    let hasKnown = false
    for (let c = 0; c < colKeys.length; c++) {
      const key = colKeys[c]
      if (!key) continue
      const val = row[c] ?? ''
      if (val !== '') hasKnown = true
      // 重复列：**保留第一列**（用户按导出顺序写的，第一列才是那一路数据），
      // 覆盖问题由上方的 duplicateHeaders 报给宿主，让用户改表头而不是默默丢数据。
      if (firstColOf.get(key) !== c) continue
      rec[key] = cleanCell(key, val, fields)
    }
    if (hasKnown) records.push(rec)
    else invalid++
  }
  return { records, invalid, duplicateHeaders }
}

// ════════════════════════════════════════
// 去重
// ════════════════════════════════════════

/** 内容指纹：data 按 key 排序后 JSON 序列化（键顺序无关） */
function fingerprint(data: Record<string, unknown>): string {
  return JSON.stringify(Object.entries(data).sort((a, b) => (a[0] < b[0] ? -1 : 1)))
}

/**
 * 内容指纹去重
 *
 * 与已有记录重复（全部字段值相同）及批内重复都跳过。
 * 收集记录无天然唯一键，内容指纹是防重复导入同一批数据的最简可靠策略。
 */
export function dedupeRecords(records: Record<string, unknown>[], existing: CollectRecord[]): DedupeResult {
  const seen = new Set(existing.map((r) => fingerprint(r.data)))
  const toImport: Record<string, unknown>[] = []
  let skipped = 0
  for (const rec of records) {
    const fp = fingerprint(rec)
    if (seen.has(fp)) {
      skipped++
    } else {
      seen.add(fp)
      toImport.push(rec)
    }
  }
  return { toImport, skipped }
}

// ════════════════════════════════════════
// 文件 → 二维行（供 FormCollect 导入链路；JSON 转为 {label/key} 对象行）
// ════════════════════════════════════════

/** 文件 → 二维行：JSON 转 {label/key} 对象行；CSV 原样；Excel 动态加载 xlsx 库 */
/** 导入文件体量上限（TD-78 ③）：超过即拒绝并给出可读错误。
 *  解析在主线程逐字符同步进行（CSV）或整包读入（Excel），5MB 以上的文件会让
 *  页面明显卡顿；真需要更大文件时应改分片或 Worker，而不是把门槛静默抬掉。 */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024

/** 体量超限错误（宿主可据此提示"文件过大，请拆分后导入"） */
export class ImportFileTooLargeError extends Error {
  constructor(
    readonly size: number,
    readonly limit: number,
  ) {
    super(`import file too large: ${size} > ${limit}`)
    this.name = 'ImportFileTooLargeError'
  }
}

export async function readFileToRows(
  file: File,
  name: string,
  importFields: { key?: string; label?: string; type?: string }[],
): Promise<string[][]> {
  if (file.size > MAX_IMPORT_FILE_BYTES) throw new ImportFileTooLargeError(file.size, MAX_IMPORT_FILE_BYTES)
  const text = await file.text()
  if (name.endsWith('.json')) {
    const recs = parseJsonRecords(text)
    // JSON 记录：表头取字段 key/label 并集，值为 String（cleanCell 再按类型清洗）
    const keys = Array.from(new Set(recs.flatMap((r) => Object.keys(r))))
    const headerMap = buildHeaderMap(importFields)
    const keyToHeader: Record<string, string> = {}
    for (const k of keys) keyToHeader[k] = headerMap[k] ?? k
    const rows: string[][] = [keys.map((k) => keyToHeader[k])]
    for (const rec of recs) rows.push(keys.map((k) => (rec[k] === undefined ? '' : String(rec[k]))))
    return rows
  }
  if (name.endsWith('.csv')) return parseCsvRecords(text)
  // Excel（.xlsx/.xls）：动态加载 xlsx 库
  const XLSX = await import('@/components/_internal/xlsx/xlsx.mjs')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false }) as string[][]
}
