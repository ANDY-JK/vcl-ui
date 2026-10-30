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
 * 同 label 冲突时后者覆盖（罕见，取最后一个）。
 */
export function buildHeaderMap(fields: ImportField[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const f of fields) {
    if (!f.key) continue
    if (f.label) map[f.label] = f.key
    map[f.key] = f.key
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
 */
export function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  // 换行归一（第 179 轮）：`\r\n` 与**裸 `\r`** 都算换行。
  // 此前只替换 CRLF —— 老式导出（CR-only）会被当成一行，表头里还夹着 `\r`，
  // 归一化后 0 条记录，用户只看到"没有可导入数据"，完全看不出问题在哪。
  const src = stripBom(text).replace(/\r\n?/g, '\n')
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
    } else if (ch === '"') {
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
  const str = String(raw).trim()
  if (isArrayField(fields, key)) {
    if (str === '') return []
    return str
      .split(ARRAY_SPLIT_RE)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  const f = fields.find((x) => x.key === key)
  if (f?.type === 'number' && str !== '') {
    const n = Number(str)
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
): { records: Record<string, unknown>[]; invalid: number } {
  if (rows.length < 2) return { records: [], invalid: 0 }
  const header = rows[0]
  // 表头 → 字段 key（按列序）
  const colKeys: (string | null)[] = header.map((h) => headerMap[h.trim()] ?? null)
  const records: Record<string, unknown>[] = []
  let invalid = 0

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const rec: Record<string, unknown> = {}
    let hasKnown = false
    for (let c = 0; c < colKeys.length; c++) {
      const key = colKeys[c]
      if (!key) continue
      const val = row[c] ?? ''
      if (val !== '') hasKnown = true
      rec[key] = cleanCell(key, val, fields)
    }
    if (hasKnown) records.push(rec)
    else invalid++
  }
  return { records, invalid }
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
export async function readFileToRows(
  file: File,
  name: string,
  importFields: { key?: string; label?: string; type?: string }[],
): Promise<string[][]> {
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
