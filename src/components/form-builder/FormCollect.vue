<script setup lang="ts">
/**
 * FormCollect — 数据收集组件
 *
 * 功能：
 * 1. 接收设计器产出的 fields + meta，渲染表单
 * 2. 校验 + 提交 → 生成收集记录
 * 3. 记录列表：查看详情、删除、清空
 * 4. Excel 导出（动态加载 xlsx）
 * 5. 存储抽象层（localStorage 默认，可注入 SaaS 实现）
 *
 * 使用方式：
 * ```vue
 * <FormCollect :fields="designerFields" :meta="formMeta" @submit="onSubmit" />
 * ```
 */
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { formatDateZh, formatDateTimeZh } from '@/components/form/utils/date-utils'
import FormBuilder from './FormBuilder.vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import Button from '@/components/basic/Button.vue'
import ModalBox from '@/components/layout/ModalBox.vue'
import ConfirmModal from '@/components/feedback/ConfirmModal.vue'
import Toast from '@/components/feedback/Toast.vue'
import {
  toFormSchema,
  collectStorageKey,
  genRecordId,
  type DesignerField,
  type FormMeta,
  type CollectRecord,
  type FormDesign,
} from './designer/types'
import { getActiveFormStore, type FormStore } from './designer/store'
import { encodeShareCode, shareShortLink, shareFullLink } from './designer/share'
import QRCode from 'qrcode/lib/browser.js'
import { isLayoutField } from './fieldRegistry'
import { buildHeaderMap, parseCsvRecords, parseJsonRecords, normalizeRecords, dedupeRecords } from './importRecords'

const t = useT()

const toastRef = ref<InstanceType<typeof Toast>>()
const showTip = (msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') =>
  toastRef.value?.show(msg, type, 2000)

const props = withDefaults(
  defineProps<{
    /** 设计器产出的字段配置 */
    fields: DesignerField[]
    /** 表单元信息 */
    meta?: FormMeta
    /** 收集数据存储 key（默认按字段结构自动生成） */
    storageKey?: string
    /** 存储实现（默认全局活动 store；设计器切换本地/云端后自动跟随，接入 SaaS 时注入 API 实现） */
    store?: FormStore
    /**
     * 导出 Excel 时的列配置
     * 不传则按 fields 顺序 + field.label 自动生成列
     * 传入则按指定顺序和列名导出
     */
    exportColumns?: { key: string; label: string }[]
    /** 导出 Excel 的自定义文件名（不含扩展名，默认用表单标题） */
    exportFileName?: string
  }>(),
  {
    meta: () => ({}),
    // 默认走全局活动 store：设计器「存储方式」切到云端后，收集端自动跟随（同一份表单数据）
    store: () => getActiveFormStore(),
  },
)

const emit = defineEmits<{
  submit: [data: Record<string, unknown>, record: CollectRecord]
}>()

// ════════════════════════════════════════
// 数据与校验
// ════════════════════════════════════════
const formData = ref<Record<string, unknown>>({})
const errorMsg = ref('')
const okMsg = ref('')

const storageKey = computed(() => props.storageKey || collectStorageKey(props.fields))
const records = ref<CollectRecord[]>([])
/** 组件根节点（模板 ref，滚动定位限定在当前实例内） */
const rootEl = ref<HTMLElement | null>(null)

// ════════════════════════════════════════
// 顶部工具栏（分享 / 新建）
// ════════════════════════════════════════

/** 分享弹窗状态 */
const shareVisible = ref(false)
const shareLink = ref('')
const shareCode = ref('')
/** 发布链接二维码（dataURL，动态加载 qrcode 生成） */
const shareQr = ref('')
/** 二维码生成失败提示（链接过长超出二维码容量） */
const shareQrError = ref('')

/**
 * 打开分享弹窗：将本组件承接的表单设计编码为分享码/发布链接。
 * FormCollect 由外部传入 fields/meta（不含完整 FormDesign），这里重建 FormDesign 结构。
 * 发布链接用短链（设计先存入 store 拿 id，链接只带 id → 二维码容量有限也能放下）。
 */
async function openShare(): Promise<void> {
  const design: FormDesign = { meta: { ...props.meta }, nodes: props.fields }
  shareCode.value = encodeShareCode(design)
  try {
    // 存入 store（已有同名表单则复用 id，避免重复保存）
    let formId = shareFormId.value
    if (!formId) {
      const item = await props.store.saveForm(null, design, design.meta.title || t('fbd.untitled'))
      formId = item.id
      shareFormId.value = formId
    }
    shareLink.value = shareShortLink(formId)
  } catch {
    // store 不可用时退回完整分享码链接（跨设备可靠，长表单链接超长）
    shareLink.value = shareFullLink(shareCode.value)
  }
  // 异步生成二维码（不阻塞弹窗打开）
  void generateQr()
  shareVisible.value = true
}

/** 分享已存入 store 的表单 id（组件生命周期内复用，避免反复保存同一表单） */
const shareFormId = ref('')

/** 发布链接 → 二维码 dataURL（qrcode 浏览器端实现；短链只有几十字符，任何表单都能放下） */
async function generateQr(): Promise<void> {
  shareQr.value = ''
  shareQrError.value = ''
  try {
    shareQr.value = await QRCode.toDataURL(shareLink.value, {
      width: 180,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
  } catch {
    shareQr.value = ''
    shareQrError.value = t('fbd.qrGenFail')
  }
}

/** 浏览器剪贴板复制（降级 execCommand） */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

async function copyShareLink(): Promise<void> {
  const ok = await copyText(shareLink.value)
  showTip(ok ? t('fbd.shareLinkCopied') : t('fbd.copyFail'), ok ? 'success' : 'error')
}

async function copyShareCode(): Promise<void> {
  const ok = await copyText(shareCode.value)
  showTip(ok ? t('fbd.shareCopied') : t('fbd.copyFail'), ok ? 'success' : 'error')
}

/** 新建：清空表单并聚焦填写区 */
function startNewRecord(): void {
  formData.value = {}
  errorMsg.value = ''
  okMsg.value = ''
  nextTick(() => {
    rootEl.value?.querySelector('.ldc-form-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

// ════════════════════════════════════════
// 记录级查看 / 审核（旧版 DynamicForm 三模式承接：view=只读 / review=可编辑+提交）
// ════════════════════════════════════════

/** 记录操作弹窗类型：null=关闭 / 'view'=查看 / 'review'=审核 */
const recordModal = ref<'view' | 'review' | null>(null)
/** 当前操作的目标记录 */
const recordTarget = ref<CollectRecord | null>(null)
/** 记录弹窗内表单数据（回填自记录） */
const recordFormData = ref<Record<string, unknown>>({})
/** 记录弹窗内提交 loading / 错误 / 完成态 */
const recordSubmitting = ref(false)
const recordError = ref('')
/** 审核提交完成（弹窗内显示成功态，替代 Toast——页面存在多个 Toast 实例时 Toast 会重复弹） */
const recordDone = ref(false)

/** 打开记录查看 / 审核弹窗：回填记录数据，按 mode 注入表单模式 */
function openRecordModal(mode: 'view' | 'review', record: CollectRecord): void {
  recordTarget.value = record
  recordFormData.value = { ...(record.data ?? {}) }
  recordError.value = ''
  recordDone.value = false
  recordModal.value = mode
}

/** 记录弹窗表单 schema（view=全字段只读；review=全字段可编辑+提交） */
const recordSchema = computed(() => {
  if (!recordModal.value) return null
  const schema = toFormSchema(props.fields, props.meta)
  schema.submitConfig = {
    mode: recordModal.value,
    // view 模式只读展示，不触发提交链路；review 提交走下方 handleRecordSubmit
    apiUrl: '',
    saveUrl: '',
  }
  return schema
})

/** 审核提交：原地更新被审核的记录（无 updateRecord 能力时降级为删+增，保持位置） */
async function handleRecordSubmit(data: Record<string, unknown>): Promise<void> {
  const record = recordTarget.value
  if (!record || recordSubmitting.value) return
  recordSubmitting.value = true
  recordError.value = ''
  try {
    if (typeof props.store.updateRecord === 'function') {
      await props.store.updateRecord(storageKey.value, record.id, data)
    } else {
      // 降级：外部注入的旧实现无 updateRecord —— 删除后重新写入
      // （store 接口只有 appendRecord，重插后该记录排在列表顶部，无法保持原位）
      await props.store.removeRecord(storageKey.value, record.id)
      await props.store.appendRecord(storageKey.value, { ...record, data: { ...data } })
    }
    await refreshRecords()
    recordDone.value = true
  } catch (e) {
    recordError.value = t('fbd.reviewRecordFail', { err: e instanceof Error ? e.message : String(e) })
  } finally {
    recordSubmitting.value = false
  }
}

/** 格式化值显示 */
function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '-'
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'boolean') return v ? t('common.yes') : t('common.no')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** 异步兼容的记录刷新 */
async function refreshRecords(): Promise<void> {
  const result = await props.store.loadRecords(storageKey.value)
  records.value = Array.isArray(result) ? result : []
}

onMounted(() => {
  refreshRecords()
})

const formSchema = computed(() => toFormSchema(props.fields, props.meta))
const requiredCount = computed(() => props.fields.filter((f) => f.required).length)

/** 今日记录数 */
const todayCount = computed(() => {
  const today = formatDateZh()
  return records.value.filter((r) => {
    try {
      return formatDateZh(new Date(r.time)) === today
    } catch {
      return false
    }
  }).length
})

/** 统计卡片数据 */
const stats = computed(() => [
  { label: t('fbd.statTotal'), value: records.value.length, icon: 'database', color: '#3b82f6' },
  { label: t('fbd.statToday'), value: todayCount.value, icon: 'calendar', color: '#10b981' },
  {
    label: t('fbd.statFields'),
    value: props.fields.filter((f) => !isLayoutField(f.type)).length,
    icon: 'layout-grid',
    color: '#8b5cf6',
  },
])

// ════════════════════════════════════════
// 提交
// ════════════════════════════════════════
async function handleSubmit(data: Record<string, unknown>): Promise<void> {
  errorMsg.value = ''

  const record: CollectRecord = {
    id: genRecordId(),
    time: formatDateTimeZh(),
    data: { ...data },
  }
  await props.store.appendRecord(storageKey.value, record)
  await refreshRecords()
  emit('submit', { ...data }, record)
  okMsg.value = t('formBuilder.submitSuccess')
  formData.value = {}
  // 滚动到反馈区（限定在当前实例内）
  nextTick(() => {
    const el = rootEl.value?.querySelector('.ldc-feedback.ldc-ok')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
  setTimeout(() => {
    okMsg.value = ''
  }, 3000)
}

// ════════════════════════════════════════
// 记录管理 + 搜索筛选
// ════════════════════════════════════════
const showRecords = ref(false)
const searchQuery = ref('')

/** 按搜索词过滤记录（匹配时间或数据值） */
const filteredRecords = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return records.value
  return records.value.filter((r) => {
    // 匹配时间
    if (r.time.toLowerCase().includes(q)) return true
    // 匹配数据值
    const dataStr = JSON.stringify(r.data).toLowerCase()
    return dataStr.includes(q)
  })
})

// 搜索时重置页码
watch(searchQuery, () => {
  currentPage.value = 1
})

// ════════════════════════════════════════
// 分页
// ════════════════════════════════════════
const PAGE_SIZE = 20
const currentPage = ref(1)

/** 总页数 */
const totalPages = computed(() => Math.ceil(filteredRecords.value.length / PAGE_SIZE) || 1)

/** 当前页的记录 */
const pagedRecords = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredRecords.value.slice(start, start + PAGE_SIZE)
})

/** 分页按钮列表 */
const pageButtons = computed(() => {
  const pages: number[] = []
  const tp = totalPages.value
  const cp = currentPage.value
  if (tp <= 7) {
    for (let i = 1; i <= tp; i++) pages.push(i)
  } else {
    pages.push(1)
    if (cp > 4) pages.push(-1) // 省略号
    for (let i = Math.max(2, cp - 1); i <= Math.min(tp - 1, cp + 1); i++) pages.push(i)
    if (cp < tp - 3) pages.push(-1)
    pages.push(tp)
  }
  return pages
})

async function removeRecord(id: string): Promise<void> {
  await props.store.removeRecord(storageKey.value, id)
  await refreshRecords()
}

// 确认弹窗状态
const confirmVisible = ref(false)
const confirmMessage = ref('')

async function clearRecords(): Promise<void> {
  if (!records.value.length) return
  confirmMessage.value = t('formBuilder.clearRecordsTitle') + ` (${records.value.length} ${t('formBuilder.records')})`
  confirmVisible.value = true
}

async function onConfirmClear(): Promise<void> {
  confirmVisible.value = false
  await props.store.clearRecords(storageKey.value)
  records.value = []
}

// ════════════════════════════════════════
// Excel 导出
// ════════════════════════════════════════
const exporting = ref(false)

async function exportExcel(): Promise<void> {
  if (!records.value.length) {
    errorMsg.value = t('formBuilder.exportEmpty')
    return
  }
  exporting.value = true
  try {
    const XLSX = await import('xlsx')
    // 优先使用自定义列配置，否则按 fields 自动生成
    const headers: { key: string; label: string }[] =
      props.exportColumns ??
      props.fields.filter((f) => !isLayoutField(f.type)).map((f) => ({ key: f.key ?? f.id, label: f.label }))
    const rows = records.value.map((r) => {
      const row: Record<string, unknown> = { [t('fbd.submittedAt')]: r.time }
      for (const h of headers) {
        const val = r.data[h.key]
        // 数组类型（如 checkbox/upload）转为逗号分隔字符串
        if (Array.isArray(val)) {
          row[h.label] = val.join(', ')
        } else if (typeof val === 'boolean') {
          row[h.label] = val ? t('common.yes') : t('common.no')
        } else if (val === null || val === undefined) {
          row[h.label] = ''
        } else {
          row[h.label] = val
        }
      }
      return row
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, t('fbd.sheetName'))
    const title = props.exportFileName || props.meta.title || t('fbd.defaultFileName')
    XLSX.writeFile(wb, `${title}-${records.value.length}${t('fbd.countSuffix')}.xlsx`)
    okMsg.value = t('formBuilder.exportDone')
    setTimeout(() => {
      okMsg.value = ''
    }, 3000)
  } catch (e) {
    errorMsg.value = t('fbd.exportFailMsg', { err: e instanceof Error ? e.message : String(e) })
  } finally {
    exporting.value = false
  }
}

// ════════════════════════════════════════
// 批量导入（P1-8：JSON / CSV / Excel）
// ════════════════════════════════════════
const importing = ref(false)
const importVisible = ref(false)
const importError = ref('')
/** 预览：待导入记录（归一化后） */
const importPreview = ref<Record<string, unknown>[]>([])
const importSkipped = ref(0)
const importInvalid = ref(0)
const importFileName = ref('')

/** 导入字段定义（取非布局字段的 key/label/type） */
const importFields = computed(() =>
  props.fields.filter((f) => !isLayoutField(f.type)).map((f) => ({ key: f.key ?? f.id, label: f.label, type: f.type })),
)

/** 预览弹窗表头（导入列） */
const importHeaders = computed(() => {
  if (!importPreview.value.length) return []
  return Object.keys(importPreview.value[0]).map((k) => {
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
    const first = importPreview.value[0]
    const keys = Object.keys(first).slice(0, 3)
    parts.push(
      keys
        .map((k) => `${importHeaders.value.find((h) => h.key === k)?.label ?? k}: ${formatValue(first[k])}`)
        .join(' · '),
    )
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
    const rows = await readFileToRows(file, name)
    const headerMap = buildHeaderMap(importFields.value)
    const { records: parsedRecs, invalid } = normalizeRecords(rows, headerMap, importFields.value)
    if (!parsedRecs.length) {
      importError.value = t('fbd.importEmpty')
      importVisible.value = false
      return
    }
    const { toImport, skipped } = dedupeRecords(parsedRecs, records.value)
    importPreview.value = toImport
    importSkipped.value = skipped
    importInvalid.value = invalid
    importFileName.value = file.name
    importVisible.value = true
  } catch (e) {
    importError.value = t('fbd.importParseFail', { err: e instanceof Error ? e.message : String(e) })
    importVisible.value = false
  } finally {
    importing.value = false
  }
}

/** 文件 → 二维行（JSON 转为 {label/key} 对象行） */
async function readFileToRows(file: File, name: string): Promise<string[][]> {
  const text = await file.text()
  if (name.endsWith('.json')) {
    const recs = parseJsonRecords(text)
    // JSON 记录：表头取字段 key/label 并集，值为 String（cleanCell 再按类型清洗）
    const keys = Array.from(new Set(recs.flatMap((r) => Object.keys(r))))
    const headerMap = buildHeaderMap(importFields.value)
    const keyToHeader: Record<string, string> = {}
    for (const k of keys) keyToHeader[k] = headerMap[k] ?? k
    const rows: string[][] = [keys.map((k) => keyToHeader[k])]
    for (const rec of recs) rows.push(keys.map((k) => (rec[k] === undefined ? '' : String(rec[k]))))
    return rows
  }
  if (name.endsWith('.csv')) return parseCsvRecords(text)
  // Excel（.xlsx/.xls）：动态加载 xlsx 库
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false }) as string[][]
}

/** 确认导入：批量写入存储 */
async function confirmImport(): Promise<void> {
  const list = importPreview.value
  if (!list.length) return
  importing.value = true
  importError.value = ''
  try {
    // 复用 appendRecord 逐条写入（本地/云端实现内建数量上限保护）
    for (const data of list) {
      await props.store.appendRecord(storageKey.value, {
        id: genRecordId(),
        time: formatDateTimeZh(),
        data: { ...data },
      })
    }
    await refreshRecords()
    importVisible.value = false
    importPreview.value = []
    okMsg.value = t('fbd.importDone', { n: list.length })
    setTimeout(() => {
      okMsg.value = ''
    }, 3000)
  } catch (e) {
    importError.value = t('fbd.importFailMsg', { err: e instanceof Error ? e.message : String(e) })
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div ref="rootEl" class="ldc">
    <!-- 表单头 -->
    <div class="ldc-head">
      <div v-if="meta.title" class="ldc-head-icon">
        <IconSvg type="file-text" size="md" />
      </div>
      <div>
        <h3 class="ldc-title">{{ meta.title || t('fbd.untitled') }}</h3>
        <p v-if="meta.description" class="ldc-desc">{{ meta.description }}</p>
      </div>
      <div class="ldc-meta-badge">
        <span>{{ t('fbd.fieldsCount', { n: fields.filter((f) => !isLayoutField(f.type)).length }) }}</span>
        <span class="ldc-dot">·</span>
        <span v-if="requiredCount">{{ t('fbd.requiredCount', { n: requiredCount }) }}</span>
        <span v-else>{{ t('fbd.noRequired') }}</span>
      </div>
    </div>

    <!-- 填写区 -->
    <div class="ldc-form-wrap">
      <FormBuilder v-model="formData" :schema="formSchema" @submit="handleSubmit" />
    </div>

    <!-- 反馈 -->
    <Transition name="ldc-fade">
      <p v-if="errorMsg" class="ldc-feedback ldc-error">
        <IconSvg type="alert-circle" size="sm" />
        {{ errorMsg }}
      </p>
    </Transition>
    <Transition name="ldc-fade">
      <p v-if="okMsg" class="ldc-feedback ldc-ok">
        <IconSvg type="circle-check" size="sm" />
        {{ okMsg }}
      </p>
    </Transition>

    <!-- 统计卡片 -->
    <div v-if="records.length || todayCount" class="ldc-stats">
      <div v-for="s in stats" :key="s.label" class="ldc-stat-card">
        <div class="ldc-stat-icon" :style="{ color: s.color, background: s.color + '15' }">
          <IconSvg :type="s.icon" size="sm" />
        </div>
        <div class="ldc-stat-info">
          <span class="ldc-stat-value">{{ s.value }}</span>
          <span class="ldc-stat-label">{{ s.label }}</span>
        </div>
      </div>
    </div>

    <!-- 操作栏 -->
    <div class="ldc-actions">
      <Button variant="outline" size="sm" @click="openShare">
        <IconSvg type="share" size="xs" />
        {{ t('fbd.share') }}
      </Button>
      <Button variant="primary" size="sm" @click="startNewRecord">
        <IconSvg type="plus" size="xs" />
        {{ t('fbd.newRecord') }}
      </Button>
      <Button variant="outline" size="sm" :loading="exporting" :disabled="!records.length" @click="exportExcel">
        <IconSvg type="download" size="xs" />
        {{ t('fbd.exportExcel') }}
      </Button>
      <label class="ldc-import-btn">
        <IconSvg type="upload" size="xs" />
        {{ t('fbd.importRecords') }}
        <input
          type="file"
          accept=".json,.csv,.xlsx,.xls"
          class="ldc-import-input"
          :disabled="importing"
          @change="onImportFile"
        />
      </label>
      <Button variant="ghost" size="sm" @click="showRecords = !showRecords">
        {{ t('formBuilder.collected') }} {{ records.length }} {{ t('formBuilder.records') }}
        <IconSvg :type="showRecords ? 'chevron-up' : 'chevron-down'" size="xs" />
      </Button>
      <Button v-if="records.length" variant="ghost" size="sm" class="ldc-danger-btn" @click="clearRecords">
        <IconSvg type="trash-2" size="xs" />
        {{ t('fbd.clear') }}
      </Button>
    </div>

    <!-- 收集记录 -->
    <Transition name="ldc-expand">
      <div v-if="showRecords" class="ldc-records">
        <!-- 搜索框 -->
        <div v-if="records.length > 3" class="ldc-search">
          <IconSvg type="search" size="sm" />
          <input v-model="searchQuery" class="ldc-search-input" :placeholder="t('fbd.searchRecordsPh')" />
          <button v-if="searchQuery" class="ldc-search-clear" @click="searchQuery = ''">
            <IconSvg type="x" size="xs" />
          </button>
        </div>
        <div v-if="!filteredRecords.length" class="ldc-empty">
          <IconSvg :type="searchQuery ? 'search-x' : 'inbox'" size="lg" />
          <span>{{ searchQuery ? t('fbd.noMatchRecords') : t('fbd.noCollectRecords') }}</span>
        </div>
        <div v-for="r in pagedRecords" :key="r.id" class="ldc-record">
          <div class="ldc-record-head">
            <span class="ldc-record-time">
              <IconSvg type="clock" size="xs" />
              {{ r.time }}
            </span>
            <div class="ldc-record-btns">
              <Button variant="ghost" size="sm" @click="openRecordModal('view', r)">
                <IconSvg type="eye" size="xs" />
                {{ t('fbd.viewRecordTitle') }}
              </Button>
              <Button variant="ghost" size="sm" class="ldc-review-btn" @click="openRecordModal('review', r)">
                <IconSvg type="pen" size="xs" />
                {{ t('fbd.review') }}
              </Button>
              <Button variant="ghost" size="sm" class="ldc-del-btn" @click="removeRecord(r.id)">
                <IconSvg type="trash-2" size="xs" />
              </Button>
            </div>
          </div>
        </div>
        <!-- 分页控件 -->
        <div v-if="totalPages > 1" class="ldc-pagination">
          <button class="ldc-page-btn" :disabled="currentPage === 1" @click="currentPage--">
            <IconSvg type="chevron-left" size="xs" />
          </button>
          <template v-for="(p, i) in pageButtons" :key="i">
            <span v-if="p === -1" class="ldc-page-ellipsis">…</span>
            <button v-else class="ldc-page-btn" :class="{ active: p === currentPage }" @click="currentPage = p">
              {{ p }}
            </button>
          </template>
          <button class="ldc-page-btn" :disabled="currentPage === totalPages" @click="currentPage++">
            <IconSvg type="chevron-right" size="xs" />
          </button>
          <span class="ldc-page-info">{{ t('fbd.pageInfo', { n: filteredRecords.length, p: totalPages }) }}</span>
        </div>
      </div>
    </Transition>

    <!-- 导入预览弹窗 -->
    <ConfirmModal
      :visible="importVisible"
      :title="t('fbd.importPreviewTitle')"
      :message="importSummaryText"
      :confirm-text="t('fbd.importConfirm')"
      :loading="importing"
      variant="primary"
      @update:visible="importVisible = $event"
      @confirm="confirmImport"
    />

    <!-- 确认弹窗 -->
    <ConfirmModal
      :visible="confirmVisible"
      :title="t('formBuilder.clearRecordsTitle')"
      :message="confirmMessage"
      :confirm-text="t('fbd.clear')"
      variant="danger"
      @update:visible="confirmVisible = $event"
      @confirm="onConfirmClear"
    />

    <!-- 分享弹窗（生成发布链接 / 分享码） -->
    <ModalBox
      :visible="shareVisible"
      :title="t('fbd.shareTitle')"
      modal-type="default"
      @update:visible="shareVisible = $event"
    >
      <div class="ldc-share">
        <!-- 左侧：发布链接二维码（手机扫码即开填写） -->
        <div class="ldc-share-qr">
          <img v-if="shareQr" class="ldc-share-qr-img" :src="shareQr" alt="QR" />
          <div v-else-if="shareQrError" class="ldc-share-qr-error" role="alert">
            <IconSvg type="alert-circle" size="sm" />
            <span>{{ shareQrError }}</span>
          </div>
          <div v-else class="ldc-share-qr-placeholder" role="status">{{ t('fbd.qrLoading') }}</div>
          <p class="ldc-share-qr-hint">{{ t('fbd.shareQrHint') }}</p>
        </div>
        <!-- 右侧：分享码 / 发布链接，点击卡片即复制 -->
        <div class="ldc-share-cols">
          <button type="button" class="ldc-share-copy" :title="t('fbd.clickCopy')" @click="copyShareCode">
            <span class="ldc-share-copy-label">{{ t('fbd.shareCode') }}</span>
            <span class="ldc-share-copy-value">{{ shareCode }}</span>
            <span class="ldc-share-copy-tip">{{ t('fbd.clickCopy') }}</span>
          </button>
          <button type="button" class="ldc-share-copy" :title="t('fbd.clickCopy')" @click="copyShareLink">
            <span class="ldc-share-copy-label">{{ t('fbd.shareLink') }}</span>
            <span class="ldc-share-copy-value">{{ shareLink }}</span>
            <span class="ldc-share-copy-tip">{{ t('fbd.clickCopy') }}</span>
          </button>
        </div>
      </div>
      <template #footer>
        <Button :text="t('common.cancel')" variant="secondary" @click="shareVisible = false" />
        <Button :text="t('fbd.shareCopied')" variant="ghost" :icon="'code'" @click="copyShareCode" />
        <Button :text="t('fbd.shareLinkCopy')" variant="primary" :icon="'link'" @click="copyShareLink" />
      </template>
    </ModalBox>

    <!-- 记录查看 / 审核弹窗（旧版 DynamicForm 三模式：view=只读 / review=可编辑+提交） -->
    <ModalBox
      :visible="!!recordModal"
      :title="recordModal === 'review' ? t('fbd.reviewRecordTitle') : t('fbd.viewRecordTitle')"
      modal-type="default"
      size="lg"
      @update:visible="recordModal = null"
    >
      <div class="ldc-record-modal">
        <!-- 审核完成态（弹窗内反馈，替代 Toast——页面多个 Toast 实例会重复弹） -->
        <div v-if="recordDone" class="ldc-record-done" role="status">
          <IconSvg type="circle-check" size="lg" color="var(--color-success, #059669)" />
          <p>{{ t('fbd.reviewRecordDone') }}</p>
          <Button :text="t('common.confirm')" variant="primary" @click="recordModal = null" />
        </div>
        <template v-else>
          <p v-if="recordError" class="ldc-record-error" role="alert">{{ recordError }}</p>
          <FormBuilder
            v-if="recordSchema && recordTarget"
            v-model="recordFormData"
            :schema="recordSchema"
            :readonly="recordModal === 'view'"
            @submit="handleRecordSubmit"
          />
        </template>
      </div>
    </ModalBox>

    <Toast ref="toastRef" variant="toast" position="top" />
  </div>
</template>

<style scoped>
.ldc {
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 10px);
  background: var(--color-bg, #fff);
  padding: var(--space-5, 20px);
}

/* ── 头部 ── */
.ldc-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: var(--space-4, 16px);
  padding-bottom: var(--space-4, 16px);
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
}
.ldc-head-icon {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  background: linear-gradient(135deg, #eef1ff 0%, #dde6ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary, #4f6ef7);
  flex-shrink: 0;
}
.ldc-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 4px;
  color: var(--color-text, #1e293b);
}
.ldc-desc {
  font-size: 13px;
  color: var(--color-text-muted, #64748b);
  margin: 0;
  line-height: 1.5;
}
.ldc-meta-badge {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  background: var(--color-bg-alt, #f8fafc);
  padding: 5px 12px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
}
.ldc-dot {
  margin: 0 4px;
}

/* ── 表单区域 ── */
.ldc-form-wrap {
  margin-bottom: var(--space-3, 12px);
}

/* ── 统计卡片 ── */
.ldc-stats {
  display: flex;
  gap: 10px;
  margin: 8px 0 12px;
  flex-wrap: wrap;
}
.ldc-stat-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid var(--color-border-light, #f1f5f9);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-alt, #fafbfc);
  flex: 1;
  min-width: 100px;
}
.ldc-stat-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ldc-stat-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.ldc-stat-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text, #1e293b);
  line-height: 1.1;
}
.ldc-stat-label {
  font-size: 11px;
  color: var(--color-text-muted, #94a3b8);
}

/* ── 反馈消息 ── */
.ldc-feedback {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  padding: 8px 14px;
  border-radius: var(--radius-md, 8px);
  margin: 8px 0;
}
.ldc-error {
  color: var(--color-danger, #dc2626);
  background: #fef2f2;
  border: 1px solid #fecaca;
}
.ldc-ok {
  color: #15803d;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}

/* ── 操作栏 ── */
.ldc-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border-light, #f1f5f9);
  flex-wrap: wrap;
}
.ldc-danger-btn {
  color: var(--color-danger, #dc2626) !important;
}
.ldc-danger-btn:hover {
  background: #fef2f2 !important;
}

/* 导入按钮（label 包装 file input） */
.ldc-import-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  background: var(--color-bg, #fff);
  color: var(--color-text-secondary, #64748b);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.ldc-import-btn:hover {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}
.ldc-import-input {
  display: none;
}

/* ── 收集记录 ── */
.ldc-records {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ldc-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--color-text-muted, #94a3b8);
  font-size: 13px;
}

.ldc-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--color-border-light, #f1f5f9);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg, #fff);
  margin-bottom: 8px;
}
.ldc-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--color-text, #1e293b);
}
.ldc-search-input::placeholder {
  color: var(--color-text-muted, #94a3b8);
}
.ldc-search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: var(--color-bg-alt, #f1f5f9);
  cursor: pointer;
  color: var(--color-text-muted, #94a3b8);
  flex-shrink: 0;
}
.ldc-search-clear:hover {
  background: #fef2f2;
  color: var(--color-danger, #dc2626);
}

.ldc-record {
  padding: 10px 14px;
  border: 1px solid var(--color-border-light, #f1f5f9);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-alt, #fafbfc);
  transition: background 0.15s;
}
.ldc-record:hover {
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.ldc-record-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.ldc-record-time {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  font-family: 'Cascadia Code', monospace;
}
.ldc-record-btns {
  display: flex;
  gap: 4px;
}
.ldc-del-btn {
  color: var(--color-text-muted, #94a3b8) !important;
}
.ldc-del-btn:hover {
  color: var(--color-danger, #dc2626) !important;
  background: #fef2f2 !important;
}

.ldc-detail {
  width: 100%;
  background: var(--color-bg, #fff);
  border: 1px solid var(--color-border-light, #f1f5f9);
  border-radius: var(--radius-md, 8px);
  padding: 8px 12px;
  margin-top: 8px;
}
.ldc-detail-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
  border-bottom: 1px solid var(--color-border-light, #f8fafc);
}
.ldc-detail-row:last-child {
  border-bottom: none;
}
.ldc-detail-key {
  flex-shrink: 0;
  min-width: 80px;
  color: var(--color-text-muted, #64748b);
  font-weight: 500;
}
.ldc-detail-val {
  flex: 1;
  color: var(--color-text, #1e293b);
  word-break: break-all;
}
.ldc-detail-reuse {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 4px 12px;
  border: 1px solid var(--color-primary, #3b82f6);
  border-radius: var(--radius-sm, 6px);
  background: rgba(59, 130, 246, 0.06);
  color: var(--color-primary, #3b82f6);
  cursor: pointer;
  font-size: 11.5px;
  font-weight: 500;
  transition: all 0.15s ease;
}
.ldc-detail-reuse:hover {
  background: var(--color-primary, #3b82f6);
  color: #fff;
}

/* ── 分页 ── */
.ldc-pagination {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 0 4px;
  flex-wrap: wrap;
}
.ldc-page-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 4px;
  background: var(--color-bg, #fff);
  color: var(--color-text-secondary, #6b7280);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s;
}
.ldc-page-btn:hover:not(:disabled) {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}
.ldc-page-btn.active {
  background: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
  color: #fff;
}
.ldc-page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ldc-page-ellipsis {
  padding: 0 4px;
  color: var(--color-text-muted, #9ca3af);
  font-size: 12px;
}
.ldc-page-info {
  margin-left: 8px;
  font-size: 11px;
  color: var(--color-text-muted, #94a3b8);
}

/* ── 过渡动画 ── */
.ldc-fade-enter-active,
.ldc-fade-leave-active {
  transition: all 0.2s ease;
}
.ldc-fade-enter-from,
.ldc-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.ldc-expand-enter-active,
.ldc-expand-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}
.ldc-expand-enter-from,
.ldc-expand-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
}
.ldc-expand-enter-to,
.ldc-expand-leave-from {
  opacity: 1;
  max-height: 600px;
  margin-top: 14px;
}

.ldc-expand-inner-enter-active,
.ldc-expand-inner-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.ldc-expand-inner-enter-from,
.ldc-expand-inner-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
  padding: 0;
}
.ldc-expand-inner-enter-to,
.ldc-expand-inner-leave-from {
  opacity: 1;
  max-height: 300px;
}

/* ── 分享弹窗：左二维码 + 右点击复制卡片 ── */
.ldc-share {
  display: flex;
  gap: 16px;
  align-items: stretch;
}
.ldc-share-qr {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--color-border-light, #f1f5f9);
  border-radius: 10px;
  background: var(--color-bg-alt, #fafbfc);
}
.ldc-share-qr-img {
  width: 180px;
  height: 180px;
  display: block;
}
.ldc-share-qr-placeholder {
  width: 180px;
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
}
.ldc-share-qr-error {
  width: 180px;
  height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--color-danger, #dc2626);
  text-align: center;
  box-sizing: border-box;
}
.ldc-share-qr-hint {
  margin: 0;
  font-size: 11px;
  color: var(--color-text-muted, #94a3b8);
  text-align: center;
}
.ldc-share-cols {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ldc-share-copy {
  flex: 1;
  min-height: 96px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 14px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  background: var(--color-bg, #fff);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.ldc-share-copy:hover {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.12);
}
.ldc-share-copy-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
}
.ldc-share-copy-value {
  width: 100%;
  font-size: 11px;
  line-height: 1.5;
  color: var(--color-text-secondary, #64748b);
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ldc-share-copy-tip {
  margin-top: auto;
  font-size: 11px;
  color: var(--color-primary, #3b82f6);
}

/* ── 记录查看 / 审核弹窗 ── */
.ldc-record-modal {
  min-height: 160px;
}
.ldc-record-done {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 40px 0;
  min-height: 200px;
  color: var(--color-success, #059669);
  font-size: 14px;
  font-weight: 500;
}
.ldc-record-done p {
  margin: 0;
}
.ldc-record-error {
  margin: 0 0 10px;
  padding: 8px 12px;
  border-radius: var(--radius-sm, 6px);
  background: var(--color-danger-light, #fef2f2);
  color: var(--color-danger, #dc2626);
  font-size: 13px;
}

/* 记录操作列按钮 */
.ldc-review-btn {
  color: var(--color-warning, #d97706) !important;
}
.ldc-review-btn:hover {
  background: #fffbeb !important;
  color: var(--color-warning, #d97706) !important;
}
</style>
