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
import { dedupeFieldLabels } from './fieldLabels'
import { recordTimeDate } from '@/components/form/utils/date-utils'
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
  /**
   * xlsx 模块加载器（#313）。默认走动态 import；测试与宿主可注入。
   *
   * 注入的理由不是"灵活"，而是**可测**：导出连点的重入窗口就发生在 `await import()` 这一段，
   * 不把它变成可控 Promise，测试就只能靠 sleep 赌时序（#312 的教训）。
   */
  loadXlsx?: () => Promise<XlsxLike>
}

/** 导出用到的 xlsx API 子集（便于注入替身，避免测试依赖真实实现） */
export interface XlsxLike {
  utils: {
    json_to_sheet: (rows: unknown[], opts?: unknown) => Record<string, unknown>
    book_new: () => unknown
    book_append_sheet: (wb: unknown, ws: unknown, name: string) => void
    encode_cell: (addr: { c: number; r: number }) => string
  }
  writeFile: (wb: unknown, filename: string) => void
}

/** 成功提示自动消失时间 */
const DEFAULT_OK_MSG_TTL_MS = 3000

/** 提交时间的 Excel 数字格式（日期时间列必须带格式，否则 Excel 显示成一串序列号） */
export const EXPORT_TIME_FORMAT = 'yyyy-mm-dd hh:mm:ss'

/**
 * 把记录里的时间解析成 Date，解析不出来返回 null（#303；#391 起统一到 `recordTimeDate`）。
 *
 * 为什么需要：导出 Excel 时若原样写字符串，那一列在 Excel 里是**文本** —— 用户按时间排序
 * 会得到字典序（"2026/10/1" 排在 "2026/9/1" 前面）、筛选也不认日期区间。
 *
 * TD-94（#391）之后记录里存的是 ISO，**历史记录仍是本地化的展示字符串** ——
 * 两种都要认。宽容解析的实现只在 `date-utils.recordTimeDate` 里有一份（同一个契约
 * 分散成两份实现就会漏，见 TD-79），这里只是保留导出模块的公开名字。
 */
export function parseRecordTime(raw: string | undefined): Date | null {
  return recordTimeDate(raw)
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

// 同名表头去重与导入共用同一份实现（#304/#305）——此前导出在这里自己写了一份，
// 而导入用"后者覆盖"，两边规则相反，导致「导出 → 改 → 再导入」写错字段。
export { dedupeFieldLabels as dedupeExportLabels } from './fieldLabels'

/** 解析导出列：宿主自定义优先，否则按字段自动生成（排除布局字段）；同名表头自动加序号 */
export function resolveExportColumns(fields: DesignerField[], custom?: ExportColumn[]): ExportColumn[] {
  if (custom && custom.length) return dedupeFieldLabels(custom)
  const generated = fields
    .filter((f) => !isLayoutField(f.type))
    .map((f) => ({ key: String(f.key ?? ''), label: f.label ?? String(f.key ?? '') }))
  return dedupeFieldLabels(generated)
}

export function useCollectExport(opts: CollectExportOptions) {
  const t = useT()
  const exporting = ref(false)

  async function exportExcel(): Promise<void> {
    if (!opts.records.value.length) {
      opts.onError(t('formBuilder.exportEmpty'))
      return
    }
    // 重入守卫（#313）：连点两次会**触发两次下载**（浏览器可能弹两个文件，或第二次静默失败）
    if (exporting.value) return
    exporting.value = true
    try {
      const XLSX = await (opts.loadXlsx?.() ?? import('@/components/_internal/xlsx/xlsx.mjs'))
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
      const wb = XLSX.utils.book_new() as never
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
