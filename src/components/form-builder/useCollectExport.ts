/**
 * useCollectExport —— 收集页的 Excel 导出（从 `FormCollect.vue` 抽出，TD-29 余量）
 *
 * ## 为什么抽
 *
 * `FormCollect.vue` 长期贴着 form-builder 域的止涨线（810 行）：改一次就触线，
 * 触线后只能"先抽再改"。#258 抽了分享段（805→753）、#265 抽了记录弹窗段（753→718），
 * 本次把导出段抽出。抽出后 `check:constants` 报的该域最大值由 `FormCollect.vue` 让位给
 * 别的文件，改动它不必再先做重构。
 *
 * ## 口径（抽出来时逐条核对，勿改）
 *
 * - 列：优先 `exportColumns`（宿主自定义），否则按 `fields` 过滤掉布局字段后自动生成
 * - 值：数组 → `, ` 连接；布尔 → 是/否；null/undefined → 空串；其余原样
 * - 首列固定是"提交时间"
 * - 空记录不导出，直接给错误提示（避免生成一个只有表头的空表）
 *
 * ⚠️ 这里**不做 CSV 公式注入防护**：本方法导出的是 **xlsx**，SheetJS 的
 * `json_to_sheet` 把字符串一律写成文本单元格（实测 `{v:'=1+1', t:'s'}`，无 `f` 字段），
 * Excel 不会当公式执行。CSV/TSV 路径才需要 `csvCell`/`tsvCell`（见 #282）。
 */
import { ref, type Ref } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { isLayoutField } from '@/components/form-builder/fieldRegistry'
import type { DesignerField } from '@/components/form-builder/designer/types'

/** 导出列定义：key 取值、label 表头 */
export interface ExportColumn {
  key: string
  label: string
}

export interface CollectExportOptions {
  /** 当前全部记录（导出不受分页影响） */
  records: Ref<{ time?: string; data: Record<string, unknown> }[]>
  /** 表单元数据（取标题做文件名） */
  meta: () => { title?: string }
  /** 字段定义（自动生成列时用） */
  fields: () => DesignerField[]
  /** 宿主自定义列；给定时优先 */
  exportColumns?: () => ExportColumn[] | undefined
  /** 宿主指定文件名（不含扩展名） */
  exportFileName?: () => string | undefined
  /** 成功提示停留时长（ms）；不传用 3000，与页面既有口径一致 */
  okMsgTtlMs?: number
  /** 提示回写（页面顶部消息条） */
  onError: (msg: string) => void
  onOk: (msg: string) => void
}

/** 成功提示自动消失时间 */
const DEFAULT_OK_MSG_TTL_MS = 3000

/** 提交时间的 Excel 数字格式（日期时间列必须带格式，否则 Excel 显示成一串序列号） */
export const EXPORT_TIME_FORMAT = 'yyyy-mm-dd hh:mm:ss'

/**
 * 把记录里的"本地化展示字符串"解析成 Date，解析不出来返回 null（#303）。
 *
 * 为什么需要：收集页把 `time` 存成 `2026/8/23 14:30:00` 这种**展示字符串**（TD-94）。
 * 导出 Excel 时若原样写字符串，那一列在 Excel 里是**文本** —— 用户按时间排序会得到
 * 字典序（"2026/10/1" 排在 "2026/9/1" 前面）、筛选也不认日期区间。
 *
 * 这里用**宽容解析**（先试原生 Date.parse，再把 `YYYY/M/D H:m:s` 规范化），
 * 解析失败就**保持原字符串**——导出宁可少一个日期类型，也不能丢内容。
 */
export function parseRecordTime(raw: string | undefined): Date | null {
  if (!raw) return null
  const direct = new Date(raw)
  if (!Number.isNaN(direct.getTime())) return direct
  // 某些环境不认 `2026/8/23 14:30:00` 里的斜杠或没有秒；补零后重试一次
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw.trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0))
  return Number.isNaN(d.getTime()) ? null : d
}

/** 把一条记录摊平成"表头 → 单元格"的对象（纯函数，便于单测） */
export function buildExportRow(
  record: { time?: string; data: Record<string, unknown> },
  columns: ExportColumn[],
  translate: (key: string) => string,
): Record<string, unknown> {
  // 首列"提交时间"：能解析成 Date 就写 Date（Excel 里是可排序/可筛选的日期），
  // 解析不出来回退原字符串，绝不丢内容（#303）
  const row: Record<string, unknown> = {
    [translate('fbd.submittedAt')]: parseRecordTime(record.time) ?? record.time ?? '',
  }
  for (const col of columns) {
    const val = record.data[col.key]
    if (Array.isArray(val)) row[col.label] = val.join(', ')
    else if (typeof val === 'boolean') row[col.label] = val ? translate('common.yes') : translate('common.no')
    else if (val === null || val === undefined) row[col.label] = ''
    else row[col.label] = val
  }
  return row
}

/**
 * 同名表头加序号，避免对象键冲突吞掉列（#304）。
 *
 * 为什么必须做：`buildExportRow` 用 **label 当对象键**，而字段 label 是自由文本
 * （设计器只保证 key 唯一）。两个字段都叫「姓名」时，后一个会**覆盖**前一个 ——
 * 导出的 Excel 里少一整列，且**没有任何报错**。用户只会奇怪"我填的那列哪去了"。
 */
export function dedupeExportLabels(cols: ExportColumn[]): ExportColumn[] {
  const seen = new Map<string, number>()
  return cols.map((col) => {
    const n = (seen.get(col.label) ?? 0) + 1
    seen.set(col.label, n)
    return n === 1 ? col : { ...col, label: `${col.label} (${n})` }
  })
}

/** 解析导出列：宿主自定义优先，否则按字段自动生成（排除布局字段）；同名表头自动加序号 */
export function resolveExportColumns(fields: DesignerField[], custom?: ExportColumn[]): ExportColumn[] {
  if (custom && custom.length) return dedupeExportLabels(custom)
  const generated = fields
    .filter((f) => !isLayoutField(f.type))
    .map((f) => ({ key: String(f.key ?? ''), label: f.label ?? String(f.key ?? '') }))
  return dedupeExportLabels(generated)
}

export function useCollectExport(opts: CollectExportOptions) {
  const t = useT()
  const exporting = ref(false)

  async function exportExcel(): Promise<void> {
    if (!opts.records.value.length) {
      opts.onError(t('formBuilder.exportEmpty'))
      return
    }
    exporting.value = true
    try {
      const XLSX = await import('@/components/_internal/xlsx/xlsx.mjs')
      const columns = resolveExportColumns(opts.fields(), opts.exportColumns?.())
      const rows = opts.records.value.map((r) => buildExportRow(r, columns, t))
      // cellDates: true —— 让 Date 值写成真正的日期单元格（而不是序列号或文本），
      // 并把时间列套上格式，用户打开就是「2026-08-23 14:30:00」且可排序/筛选（#303）
      const ws = XLSX.utils.json_to_sheet(rows, { cellDates: true })
      if (columns.length || rows.length) {
        for (let r = 0; r < rows.length; r++) {
          const addr = XLSX.utils.encode_cell({ c: 0, r: r + 1 })
          const cell = (ws as Record<string, unknown>)[addr] as { t?: string; z?: string } | undefined
          if (cell && cell.t === 'd') cell.z = EXPORT_TIME_FORMAT
        }
      }
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, t('fbd.sheetName'))
      const title = opts.exportFileName?.() || opts.meta().title || t('fbd.defaultFileName')
      XLSX.writeFile(wb, `${title}-${opts.records.value.length}${t('fbd.countSuffix')}.xlsx`)
      opts.onOk(t('formBuilder.exportDone'))
      setTimeout(() => opts.onOk(''), opts.okMsgTtlMs ?? DEFAULT_OK_MSG_TTL_MS)
    } catch (e) {
      opts.onError(t('fbd.exportFailMsg', { err: e instanceof Error ? e.message : String(e) }))
    } finally {
      exporting.value = false
    }
  }

  return { exporting, exportExcel }
}
