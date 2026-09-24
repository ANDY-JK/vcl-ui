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
import { copyText } from '@/components/_internal/useCopy'
import { formatDateZh, formatDateTimeZh } from '@/components/form/utils/date-utils'
import { computePageButtons } from '@/components/form/utils/pagination'
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
import { buildHeaderMap, normalizeRecords, dedupeRecords, readFileToRows } from './importRecords'

/** 成功提示（okMsg）停留时长 —— 三处同一个事实，别各写一份 */
const _OK_MSG_TTL_MS = 3000

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
  /** 收集提交：[表单数据, 收集记录（含时间戳/指纹等）]（落库由内置存储完成，宿主可接此上报） */
  submit: [data: Record<string, unknown>, record: CollectRecord]
}>()

// ══ 数据与校验 ══
const formData = ref<Record<string, unknown>>({})
const errorMsg = ref('')
const okMsg = ref('')

const storageKey = computed(() => props.storageKey || collectStorageKey(props.fields))
const records = ref<CollectRecord[]>([])
/** 组件根节点（模板 ref，滚动定位限定在当前实例内） */
const rootEl = ref<HTMLElement | null>(null)

// ══ 顶部工具栏（分享 / 新建） ══

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

// ══ 记录级查看 / 审核（旧版 DynamicForm 三模式承接：view=只读 / review=可编辑+提交） ══

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

// ══ 提交 ══
async function handleSubmit(data: Record<string, unknown>): Promise<void> {
  errorMsg.value = ''

  const record: CollectRecord = {
    id: genRecordId(),
    time: formatDateTimeZh(),
    data: { ...data },
  }
  try {
    await props.store.appendRecord(storageKey.value, record)
    await refreshRecords()
  } catch (e) {
    // 云端模式写入失败若静默，用户会误以为提交成功
    errorMsg.value = t('fbd.collectSubmitFail', { err: e instanceof Error ? e.message : String(e) })
    return
  }
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
  }, _OK_MSG_TTL_MS)
}

// ══ 记录管理 + 搜索筛选 ══
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

// ══ 分页 ══
const PAGE_SIZE = 20
const currentPage = ref(1)

/** 总页数 */
const totalPages = computed(() => Math.ceil(filteredRecords.value.length / PAGE_SIZE) || 1)

/** 当前页的记录 */
const pagedRecords = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredRecords.value.slice(start, start + PAGE_SIZE)
})

/** 分页按钮列表（纯函数在 form/utils/pagination，与汇总弹窗共用） */
const pageButtons = computed(() => computePageButtons(currentPage.value, totalPages.value))

/** 待删除的记录 id（单条删除需确认，误删不可恢复） */
const pendingDeleteId = ref<string | null>(null)
const confirmTitle = ref('')
// 确认弹窗状态
const confirmVisible = ref(false)
const confirmMessage = ref('')

/** 单条删除：先弹确认，onConfirmClear 按 pendingDeleteId 分流 */
function removeRecord(id: string): void {
  pendingDeleteId.value = id
  confirmTitle.value = t('fbd.deleteRecordTitle')
  confirmMessage.value = t('fbd.deleteRecordConfirm')
  confirmVisible.value = true
}

async function clearRecords(): Promise<void> {
  if (!records.value.length) return
  pendingDeleteId.value = null
  confirmTitle.value = t('formBuilder.clearRecordsTitle')
  confirmMessage.value = t('formBuilder.clearRecordsTitle') + ` (${records.value.length} ${t('formBuilder.records')})`
  confirmVisible.value = true
}

async function onConfirmClear(): Promise<void> {
  confirmVisible.value = false
  const id = pendingDeleteId.value
  pendingDeleteId.value = null
  if (id) {
    await props.store.removeRecord(storageKey.value, id)
    await refreshRecords()
    return
  }
  await props.store.clearRecords(storageKey.value)
  records.value = []
}

// ══ Excel 导出 ══
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
    }, _OK_MSG_TTL_MS)
  } catch (e) {
    errorMsg.value = t('fbd.exportFailMsg', { err: e instanceof Error ? e.message : String(e) })
  } finally {
    exporting.value = false
  }
}

// ══ 批量导入（P1-8：JSON / CSV / Excel） ══
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
    const rows = await readFileToRows(file, name, importFields.value)
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
    }, _OK_MSG_TTL_MS)
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

    <!-- 确认弹窗（清空全部 / 单条删除共用，按 pendingDeleteId 分流） -->
    <ConfirmModal
      :visible="confirmVisible"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-text="t('common.delete')"
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

<style scoped src="./FormCollect.css"></style>
