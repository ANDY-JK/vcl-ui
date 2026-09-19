<script setup lang="ts">
/**
 * 表单数据汇总弹窗 — 单个已存表单的收集记录查看
 *
 * 从「我的表单」抽屉的「数据」按钮打开：展示该表单的提交数/最新提交/记录明细，
 * 支持 CSV 导出（轻量，避免引入 xlsx 依赖；复杂导出走 FormCollect 的 Excel）。
 */
import { ref, computed, watch } from 'vue'
import { useT } from '@/components/_internal/i18n'
import IconSvg from '@/components/basic/IconSvg.vue'
import Button from '@/components/basic/Button.vue'
import ModalBox from '@/components/layout/ModalBox.vue'
import { downloadBlob } from '@/components/_internal/utils'
import { computePageButtons } from '@/components/form/utils/pagination'
import type { CollectRecord } from './types'
import { getActiveFormStore, type FormStore, type FormMetaItem } from './store'

const t = useT()

const props = defineProps<{
  visible: boolean
  /** 目标表单（含 collectKey） */
  item: FormMetaItem | null
  /** 存储实现（默认全局活动 store） */
  store?: FormStore
}>()

const emit = defineEmits<{
  'update:visible': [v: boolean]
}>()

const activeStore = () => props.store ?? getActiveFormStore()

const records = ref<CollectRecord[]>([])
const loading = ref(false)
const error = ref('')

/** 打开时加载记录（immediate：初始 visible=true 也加载） */
watch(
  () => props.visible,
  async (v) => {
    if (!v || !props.item) return
    loading.value = true
    error.value = ''
    try {
      records.value = await activeStore().loadRecords(props.item.collectKey)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      records.value = []
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

/** 汇总统计（computed：模板不可重复调用函数，500 条记录会 O(行×记录×字段) 卡死） */
const totalCount = computed(() => records.value.length)
const latest = computed(() => records.value[0] ?? null)

/** 合并所有记录的字段 key（按出现顺序，computed 单次计算） */
const keys = computed<string[]>(() => {
  const seen: string[] = []
  const set = new Set<string>()
  for (const r of records.value) {
    for (const k of Object.keys(r.data)) {
      if (!set.has(k)) {
        set.add(k)
        seen.push(k)
      }
    }
  }
  return seen
})

// ════════════════════════════════════════
// 明细表分页（500 条全量渲染会卡死弹窗）
// ════════════════════════════════════════

const PAGE_SIZE = 20
const currentPage = ref(1)
const totalPages = computed(() => Math.ceil(records.value.length / PAGE_SIZE) || 1)
const pagedRecords = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return records.value.slice(start, start + PAGE_SIZE)
})
const pageButtons = computed<number[]>(() => computePageButtons(currentPage.value, totalPages.value))
// 记录刷新后页码回位（可能不足当前页）
watch(records, () => {
  currentPage.value = 1
})

function cellValue(v: unknown): string {
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'boolean') return v ? t('common.yes') : t('common.no')
  if (v === null || v === undefined) return ''
  return String(v)
}

/** CSV 导出（UTF-8 BOM 保证 Excel 中文不乱码；全量记录不随分页截断） */
function exportCsv(): void {
  const ks = keys.value
  const header = [t('fbd.submittedAt'), ...ks]
  const escape = (s: string): string =>
    s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  const lines = [header.map(escape).join(',')]
  for (const r of records.value) {
    lines.push([r.time, ...ks.map((k) => escape(cellValue(r.data[k])))].join(','))
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, `${props.item?.name ?? 'form'}-${records.value.length}${t('fbd.countSuffix')}.csv`)
}
</script>

<template>
  <ModalBox
    :visible="visible"
    :title="t('fbd.formDataTitle', { name: item?.name ?? '' })"
    modal-type="default"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="ld-data-summary">
      <!-- 加载/错误/空态 -->
      <div v-if="loading" class="ld-data-state" role="status">{{ t('fbd.loadingList') }}</div>
      <div v-else-if="error" class="ld-data-state ld-data-error" role="alert">{{ error }}</div>
      <div v-else-if="!records.length" class="ld-data-state">{{ t('fbd.noCollectRecords') }}</div>

      <template v-else>
        <!-- 统计卡 -->
        <div class="ld-data-stats">
          <div class="ld-data-stat">
            <span class="ld-data-stat-num">{{ totalCount }}</span>
            <span class="ld-data-stat-label">{{ t('fbd.statTotal') }}</span>
          </div>
          <div class="ld-data-stat">
            <span class="ld-data-stat-num" :title="latest?.time">{{ latest?.time }}</span>
            <span class="ld-data-stat-label">{{ t('fbd.latestSubmit') }}</span>
          </div>
        </div>

        <!-- 记录明细（紧凑表格，分页渲染防大数据卡死） -->
        <div class="ld-data-table-wrap">
          <table class="ld-data-table">
            <thead>
              <tr>
                <th>{{ t('fbd.submittedAt') }}</th>
                <th v-for="k in keys" :key="k">{{ k }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in pagedRecords" :key="r.id">
                <td class="ld-data-time">{{ r.time }}</td>
                <td v-for="k in keys" :key="k">{{ cellValue(r.data[k]) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 分页控件 -->
        <div v-if="totalPages > 1" class="ld-data-page">
          <button class="ld-data-page-btn" :disabled="currentPage === 1" @click="currentPage--">
            <IconSvg type="chevron-left" size="xs" />
          </button>
          <template v-for="(p, i) in pageButtons" :key="i">
            <span v-if="p === -1" class="ld-data-page-ellipsis">…</span>
            <button v-else class="ld-data-page-btn" :class="{ active: p === currentPage }" @click="currentPage = p">
              {{ p }}
            </button>
          </template>
          <button class="ld-data-page-btn" :disabled="currentPage === totalPages" @click="currentPage++">
            <IconSvg type="chevron-right" size="xs" />
          </button>
        </div>
      </template>
    </div>

    <template #footer>
      <Button :text="t('common.cancel')" variant="secondary" @click="emit('update:visible', false)" />
      <Button
        :text="t('fbd.exportCsv')"
        variant="primary"
        :icon="'download'"
        :disabled="!records.length || loading"
        @click="exportCsv"
      />
    </template>
  </ModalBox>
</template>
