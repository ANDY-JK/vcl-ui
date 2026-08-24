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
import ConfirmModal from '@/components/feedback/ConfirmModal.vue'
import {
  toFormSchema, collectStorageKey, genRecordId,
  type DesignerField, type FormMeta, type CollectRecord,
} from './designer/types'
import { createLocalFormStore, type FormStore } from './designer/store'

const t = useT()

const props = withDefaults(defineProps<{
  /** 设计器产出的字段配置 */
  fields: DesignerField[]
  /** 表单元信息 */
  meta?: FormMeta
  /** 收集数据存储 key（默认按字段结构自动生成） */
  storageKey?: string
  /** 存储实现（默认 localStorage；接入 SaaS 时注入 API 实现） */
  store?: FormStore
  /**
   * 导出 Excel 时的列配置
   * 不传则按 fields 顺序 + field.label 自动生成列
   * 传入则按指定顺序和列名导出
   */
  exportColumns?: { key: string; label: string }[]
  /** 导出 Excel 的自定义文件名（不含扩展名，默认用表单标题） */
  exportFileName?: string
}>(), {
  meta: () => ({}),
  store: () => createLocalFormStore(),
})

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

/** 格式化值显示 */
function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '-'
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** 详情表头（复用导出列配置） */
const detailHeaders = computed(() =>
  props.exportColumns ?? props.fields
    .filter(f => f.type !== 'divider' && f.type !== 'title')
    .map(f => ({ key: f.key ?? f.id, label: f.label })),
)

/** 异步兼容的记录刷新 */
async function refreshRecords(): Promise<void> {
  const result = await props.store.loadRecords(storageKey.value)
  records.value = Array.isArray(result) ? result : []
}

onMounted(() => { refreshRecords() })

const formSchema = computed(() => toFormSchema(props.fields, props.meta))
const requiredCount = computed(() => props.fields.filter(f => f.required).length)

/** 今日记录数 */
const todayCount = computed(() => {
  const today = formatDateZh()
  return records.value.filter(r => {
    try { return formatDateZh(new Date(r.time)) === today }
    catch { return false }
  }).length
})

/** 统计卡片数据 */
const stats = computed(() => [
  { label: '总记录', value: records.value.length, icon: 'database', color: '#3b82f6' },
  { label: '今日', value: todayCount.value, icon: 'calendar', color: '#10b981' },
  { label: '字段数', value: props.fields.filter(f => f.type !== 'divider' && f.type !== 'title').length, icon: 'layout-grid', color: '#8b5cf6' },
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
  // 滚动到反馈区
  nextTick(() => {
    const el = document.querySelector('.ldc-feedback.ldc-ok')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
  setTimeout(() => { okMsg.value = '' }, 3000)
}

// ════════════════════════════════════════
// 记录管理 + 搜索筛选
// ════════════════════════════════════════
const showRecords = ref(false)
const detail = ref<CollectRecord | null>(null)
const searchQuery = ref('')

/** 按搜索词过滤记录（匹配时间或数据值） */
const filteredRecords = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return records.value
  return records.value.filter(r => {
    // 匹配时间
    if (r.time.toLowerCase().includes(q)) return true
    // 匹配数据值
    const dataStr = JSON.stringify(r.data).toLowerCase()
    return dataStr.includes(q)
  })
})

// 搜索时收起详情并重置页码
watch(searchQuery, () => { detail.value = null; currentPage.value = 1 })

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

/** 用记录数据填充表单（快速复用） */
function fillFormFromRecord(record: CollectRecord): void {
  formData.value = { ...record.data }
  detail.value = null
  // 滚动到表单顶部
  nextTick(() => {
    document.querySelector('.ldc-form-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
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
    const headers: { key: string; label: string }[] = props.exportColumns ?? props.fields
      .filter(f => f.type !== 'divider' && f.type !== 'title')
      .map(f => ({ key: f.key ?? f.id, label: f.label }))
    const rows = records.value.map(r => {
      const row: Record<string, unknown> = { '提交时间': r.time }
      for (const h of headers) {
        const val = r.data[h.key]
        // 数组类型（如 checkbox/upload）转为逗号分隔字符串
        if (Array.isArray(val)) {
          row[h.label] = val.join(', ')
        } else if (typeof val === 'boolean') {
          row[h.label] = val ? '是' : '否'
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
    XLSX.utils.book_append_sheet(wb, ws, '收集数据')
    const title = props.exportFileName || props.meta.title || '表单收集'
    XLSX.writeFile(wb, `${title}-${records.value.length}条.xlsx`)
    okMsg.value = t('formBuilder.exportDone')
    setTimeout(() => { okMsg.value = '' }, 3000)
  } catch (e) {
    errorMsg.value = t('formBuilder.exportFail') + '：' + (e instanceof Error ? e.message : String(e))
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="ldc">
    <!-- 表单头 -->
    <div class="ldc-head">
      <div class="ldc-head-icon" v-if="meta.title">
        <IconSvg type="file-text" size="md" />
      </div>
      <div>
        <h3 class="ldc-title">{{ meta.title || '未命名表单' }}</h3>
        <p v-if="meta.description" class="ldc-desc">{{ meta.description }}</p>
      </div>
      <div class="ldc-meta-badge">
        <span>{{ fields.filter(f => f.type !== 'divider' && f.type !== 'title').length }} 个字段</span>
        <span class="ldc-dot">·</span>
        <span v-if="requiredCount">必填 {{ requiredCount }} 项</span>
        <span v-else>无必填项</span>
      </div>
    </div>

    <!-- 填写区 -->
    <div class="ldc-form-wrap">
      <FormBuilder
        v-model="formData"
        :schema="formSchema"
        @submit="handleSubmit"
      />
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
      <Button
        variant="outline"
        size="sm"
        :loading="exporting"
        :disabled="!records.length"
        @click="exportExcel"
      >
        <IconSvg type="download" size="xs" />
        导出 Excel
      </Button>
      <Button
        variant="ghost"
        size="sm"
        @click="showRecords = !showRecords"
      >
        已收集 {{ records.length }} 条
        <IconSvg :type="showRecords ? 'chevron-up' : 'chevron-down'" size="xs" />
      </Button>
      <Button
        v-if="records.length"
        variant="ghost"
        size="sm"
        class="ldc-danger-btn"
        @click="clearRecords"
      >
        <IconSvg type="trash-2" size="xs" />
        清空
      </Button>
    </div>

    <!-- 收集记录 -->
    <Transition name="ldc-expand">
      <div v-if="showRecords" class="ldc-records">
        <!-- 搜索框 -->
        <div v-if="records.length > 3" class="ldc-search">
          <IconSvg type="search" size="sm" />
          <input
            v-model="searchQuery"
            class="ldc-search-input"
            placeholder="搜索记录（时间或数据值）..."
          >
          <button v-if="searchQuery" class="ldc-search-clear" @click="searchQuery = ''">
            <IconSvg type="x" size="xs" />
          </button>
        </div>
        <div v-if="!filteredRecords.length" class="ldc-empty">
          <IconSvg :type="searchQuery ? 'search-x' : 'inbox'" size="lg" />
          <span>{{ searchQuery ? '未找到匹配的记录' : '暂无收集记录' }}</span>
        </div>
        <div v-for="r in pagedRecords" :key="r.id" class="ldc-record">
          <div class="ldc-record-head">
            <span class="ldc-record-time">
              <IconSvg type="clock" size="xs" />
              {{ r.time }}
            </span>
            <div class="ldc-record-btns">
              <Button
                variant="ghost"
                size="sm"
                @click="detail = detail?.id === r.id ? null : r"
              >
                {{ detail?.id === r.id ? '收起' : '详情' }}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="ldc-del-btn"
                @click="removeRecord(r.id)"
              >
                <IconSvg type="trash-2" size="xs" />
              </Button>
            </div>
          </div>
            <Transition name="ldc-expand-inner">
            <div v-if="detail?.id === r.id" class="ldc-detail">
              <div v-for="h in detailHeaders" :key="h.key" class="ldc-detail-row">
                <span class="ldc-detail-key">{{ h.label }}</span>
                <span class="ldc-detail-val">{{ formatValue(r.data[h.key]) }}</span>
              </div>
              <button class="ldc-detail-reuse" @click="fillFormFromRecord(r)">
                <IconSvg type="copy" size="xs" />
                复用此数据
              </button>
            </div>
            </Transition>
        </div>
        <!-- 分页控件 -->
        <div v-if="totalPages > 1" class="ldc-pagination">
          <button class="ldc-page-btn" :disabled="currentPage === 1" @click="currentPage--">
            <IconSvg type="chevron-left" size="xs" />
          </button>
          <template v-for="(p, i) in pageButtons" :key="i">
            <span v-if="p === -1" class="ldc-page-ellipsis">…</span>
            <button
              v-else
              class="ldc-page-btn"
              :class="{ active: p === currentPage }"
              @click="currentPage = p"
            >{{ p }}</button>
          </template>
          <button class="ldc-page-btn" :disabled="currentPage === totalPages" @click="currentPage++">
            <IconSvg type="chevron-right" size="xs" />
          </button>
          <span class="ldc-page-info">{{ filteredRecords.length }} 条 / {{ totalPages }} 页</span>
        </div>
      </div>
    </Transition>

    <!-- 确认弹窗 -->
    <ConfirmModal
      :visible="confirmVisible"
      title="清空收集记录"
      :message="confirmMessage"
      confirm-text="清空"
      variant="danger"
      @update:visible="confirmVisible = $event"
      @confirm="onConfirmClear"
    />
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
.ldc-dot { margin: 0 4px; }

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
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
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
</style>
