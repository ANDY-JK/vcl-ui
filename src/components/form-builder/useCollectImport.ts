/**
 * useCollectImport —— 收集页的批量导入（JSON / CSV / Excel）
 *
 * 从 `FormCollect.vue` 抽出（TD-29 余量，第 61 轮）。原实现散在该文件 319–435 行：
 * 8 个状态 ref + 3 个 computed + 2 个 handler，与页面其余逻辑混在一起，
 * 而该文件长期贴着 form-builder 域止涨线，改一次就触线。
 *
 * ## 口径（抽出来时逐条对齐，未改行为）
 *
 * - 字段：取非布局字段，映射为 `{ key, label, type }`
 * - 解析：`readFileToRows` → `buildHeaderMap` → `normalizeRecords`（含重复表头识别）
 * - 去重：`dedupeRecords` 与**已有记录**比对，被跳过的条数与无效条数分别计数
 * - 空结果 → 报 "没有可导入的行" 并**不打开预览**；体量超限单独提示（TD-78 ③）
 * - 确认导入：逐条 `appendRecord`（本地/云端各自内建数量上限保护），成功后刷新列表
 *
 * ## 为什么状态放在这里而不是页面
 *
 * 预览弹窗的表头/汇总文案都由这批状态派生，页面只需要把它们绑到模板上；
 * 派生逻辑跟着状态走，避免"状态在页面、派生在页面、handler 在别处"的三处分散。
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { recordTimeNow } from '@/components/form/utils/date-utils'
import { isLayoutField } from '@/components/form-builder/fieldRegistry'
import type { DesignerField } from '@/components/form-builder/designer/types'
import type { CollectRecord } from '@/components/form-builder/designer/types'
import {
  buildHeaderMap,
  dedupeRecords,
  ImportFileTooLargeError,
  normalizeRecords,
  readFileToRows,
} from './importRecords'

/** 导入字段定义 */
export interface ImportField {
  key: string
  label: string
  type: string
}

export interface CollectImportOptions {
  /** 表单字段 */
  fields: () => DesignerField[]
  /** 存储 key（写入用） */
  storageKey: () => string
  /** 已有记录（去重基准） */
  records: Ref<CollectRecord[]>
  /** 写入一条记录 */
  appendRecord: (key: string, rec: { id: string; time: string; data: Record<string, unknown> }) => Promise<void>
  /** 记录 id 生成 */
  genRecordId: () => string
  /** 写入完成后刷新列表 */
  refreshRecords: () => Promise<void> | void
  /** 成功提示（导入完成后） */
  onOk: (msg: string) => void
  /** 成功提示停留时长 */
  okMsgTtlMs: number
  /** 单元格值格式化（汇总文案里预览用） */
  formatValue: (v: unknown) => string
}

export function useCollectImport(opts: CollectImportOptions) {
  const t = useT()

  const importing = ref(false)
  const importVisible = ref(false)
  const importError = ref('')
  /** 预览：待导入记录（归一化后） */
  const importPreview = ref<Record<string, unknown>[]>([])
  const importSkipped = ref(0)
  const importInvalid = ref(0)
  /** 重复表头（同一字段被多列映射，只保留第一列）—— #272 */
  const importDupHeaders = ref<string[]>([])
  const importFileName = ref('')

  /** 导入字段定义（取非布局字段的 key/label/type） */
  const importFields: ComputedRef<ImportField[]> = computed(() =>
    opts
      .fields()
      .filter((f) => !isLayoutField(f.type))
      .map((f) => ({ key: String(f.key ?? ''), label: f.label ?? '', type: f.type })),
  )

  /** 预览弹窗表头（导入列） */
  const importHeaders = computed(() => {
    if (!importPreview.value.length) return []
    return Object.keys(importPreview.value[0]!).map((k) => {
      const f = importFields.value.find((x) => x.key === k)
      return { key: k, label: f?.label || k }
    })
  })

  /** 导入预览汇总文案 */
  const importSummaryText = computed(() => {
    const parts = [
      t('fbd.importSummary', {
        n: importPreview.value.length,
        skipped: importSkipped.value,
        invalid: importInvalid.value,
      }),
    ]
    if (importPreview.value.length) {
      const first = importPreview.value[0]!
      const keys = Object.keys(first).slice(0, 3)
      parts.push(
        keys
          .map((k) => `${importHeaders.value.find((h) => h.key === k)?.label ?? k}: ${opts.formatValue(first[k])}`)
          .join(' · '),
      )
    }
    // 重复表头单列一行：用户必须知道"有一列没进来"，否则他会以为导入是全的（#272）
    if (importDupHeaders.value.length) {
      parts.push(t('fbd.importDupHeaders', { cols: importDupHeaders.value.join('、') }))
    }
    return parts.join('\n')
  })

  /** 解析文件 → 归一化 + 去重 → 打开预览 */
  async function onImportFile(e: Event): Promise<void> {
    const target = e.target as HTMLInputElement
    const file = target.files?.[0]
    target.value = '' // 允许重复选择同一文件
    if (!file) return
    importing.value = true
    importError.value = ''
    try {
      const name = file.name.toLowerCase()
      const rows = await readFileToRows(file, name, importFields.value)
      const headerMap = buildHeaderMap(importFields.value)
      const { records: parsedRecs, invalid, duplicateHeaders } = normalizeRecords(rows, headerMap, importFields.value)
      // 重复表头：只保留第一列，其余列的数据不会入库 —— 必须告诉用户少了哪几列（#272）
      importDupHeaders.value = duplicateHeaders
      if (!parsedRecs.length) {
        importError.value = t('fbd.importEmpty')
        importVisible.value = false
        return
      }
      const { toImport, skipped } = dedupeRecords(parsedRecs, opts.records.value)
      importPreview.value = toImport
      importSkipped.value = skipped
      importInvalid.value = invalid
      importFileName.value = file.name
      importVisible.value = true
    } catch (e) {
      // 体量超限单独提示（TD-78 ③）：笼统的"解析失败"会让用户以为文件坏了、反复重试
      importError.value =
        e instanceof ImportFileTooLargeError
          ? t('fbd.importFileTooLarge', { limit: Math.round(e.limit / 1024 / 1024) })
          : t('fbd.importParseFail', { err: e instanceof Error ? e.message : String(e) })
      importVisible.value = false
    } finally {
      importing.value = false
    }
  }

  /** 确认导入：批量写入存储 */
  async function confirmImport(): Promise<void> {
    const list = importPreview.value
    if (!list.length) return
    // 重入守卫（#313）：按钮 loading 只是**界面层**的保护，程序化触发/连点仍能进来。
    // 没有它时，慢存储下第二次确认会把同一批记录**再写一遍**（8 条变 16 条）。
    if (importing.value) return
    importing.value = true
    importError.value = ''
    try {
      // 逐条写入（本地/云端实现各自内建数量上限保护）
      for (const data of list) {
        await opts.appendRecord(opts.storageKey(), {
          id: opts.genRecordId(),
          time: recordTimeNow(),
          data: { ...data },
        })
      }
      await opts.refreshRecords()
      importVisible.value = false
      importPreview.value = []
      opts.onOk(t('fbd.importDone', { n: list.length }))
      setTimeout(() => opts.onOk(''), opts.okMsgTtlMs)
    } catch (e) {
      importError.value = t('fbd.importFailMsg', { err: e instanceof Error ? e.message : String(e) })
    } finally {
      importing.value = false
    }
  }

  return {
    importing,
    importVisible,
    importError,
    importPreview,
    importSkipped,
    importInvalid,
    importDupHeaders,
    importFileName,
    importFields,
    importHeaders,
    importSummaryText,
    onImportFile,
    confirmImport,
  }
}
