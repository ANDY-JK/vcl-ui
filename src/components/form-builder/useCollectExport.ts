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

/** 把一条记录摊平成"表头 → 单元格"的对象（纯函数，便于单测） */
export function buildExportRow(
  record: { time?: string; data: Record<string, unknown> },
  columns: ExportColumn[],
  translate: (key: string) => string,
): Record<string, unknown> {
  const row: Record<string, unknown> = { [translate('fbd.submittedAt')]: record.time ?? '' }
  for (const col of columns) {
    const val = record.data[col.key]
    if (Array.isArray(val)) row[col.label] = val.join(', ')
    else if (typeof val === 'boolean') row[col.label] = val ? translate('common.yes') : translate('common.no')
    else if (val === null || val === undefined) row[col.label] = ''
    else row[col.label] = val
  }
  return row
}

/** 解析导出列：宿主自定义优先，否则按字段自动生成（排除布局字段） */
export function resolveExportColumns(fields: DesignerField[], custom?: ExportColumn[]): ExportColumn[] {
  if (custom && custom.length) return custom
  return fields
    .filter((f) => !isLayoutField(f.type))
    .map((f) => ({ key: String(f.key ?? ''), label: f.label ?? String(f.key ?? '') }))
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
      const ws = XLSX.utils.json_to_sheet(rows)
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
