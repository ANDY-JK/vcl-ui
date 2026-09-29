<script setup lang="ts">
/**
 * 表单审核弹窗内容 — 以 review 模式渲染已存表单
 *
 * 从「我的表单」智能表格操作列「审核」打开：
 * - 加载表单完整设计 → toFormSchema
 * - 注入 submitConfig.mode='review'（全字段可编辑）
 * - 审核通过后写入收集记录（与 FormCollect 同链路）
 *
 * 远程接口（可选）：传 apiUrl（GET 回填）/ saveUrl（防抖自动保存 + 提交 POST）才发请求；
 * 缺省纯前端——数据写收集记录，不依赖任何后端。
 */
import { ref, computed, onMounted } from 'vue'
import { useT } from '@/components/_internal/i18n'
import FormBuilder from '../FormBuilder.vue'
import { toFormSchema, type FormDesign } from './types'
import { getActiveFormStore, type FormStore, type FormMetaItem } from './store'
import { genRecordId } from './types'
import { formatDateTimeZh } from '@/components/form/utils/date-utils'

const t = useT()

const props = defineProps<{
  /** 目标表单（含 collectKey，用于审核通过后写收集记录） */
  item: FormMetaItem | null
  /** 存储实现（默认全局活动 store） */
  store?: FormStore
  /** 远程回填接口（GET 按 key 拉取数据）；不传不发请求 */
  apiUrl?: string
  /** 远程保存接口（防抖自动保存 + 提交 POST）；不传不发请求 */
  saveUrl?: string
  /** 自动保存防抖毫秒（仅 saveUrl 存在时生效，默认 3000） */
  reviewAutoSave?: number
}>()

const emit = defineEmits<{
  /** 审核完成（提交成功） */
  done: []
}>()

const activeStore = () => props.store ?? getActiveFormStore()

const design = ref<FormDesign | null>(null)
const loading = ref(false)
const error = ref('')
const submitted = ref(false)

/** 表单 schema（设计 → schema，注入 review 模式；远程接口仅按需注入） */
const formSchema = computed(() => {
  if (!design.value) return null
  const schema = toFormSchema(design.value.nodes ?? design.value.fields ?? [], design.value.meta ?? {})
  schema.submitConfig = {
    mode: 'review',
    ...(props.apiUrl ? { apiUrl: props.apiUrl } : {}),
    ...(props.saveUrl ? { saveUrl: props.saveUrl, reviewAutoSave: props.reviewAutoSave ?? 3000 } : {}),
  }
  return schema
})

const formData = ref<Record<string, unknown>>({})

onMounted(async () => {
  if (!props.item) return
  loading.value = true
  error.value = ''
  try {
    const d = await activeStore().loadForm(props.item.id)
    design.value = d
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
})

/** 提交：写入收集记录（与 FormCollect 同链路） */
async function handleSubmit(data: Record<string, unknown>): Promise<void> {
  if (!props.item) return
  try {
    await activeStore().appendRecord(props.item.collectKey, {
      id: genRecordId(),
      time: formatDateTimeZh(),
      data,
    })
    submitted.value = true
    emit('done')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <div class="frv">
    <div v-if="loading" class="frv-state" role="status">{{ t('fbd.loadingList') }}</div>
    <div v-else-if="error" class="frv-state frv-error" role="alert">{{ error }}</div>
    <div v-else-if="!formSchema" class="frv-state">{{ t('fbd.formExpired') }}</div>
    <div v-else-if="submitted" class="frv-state">
      <p class="frv-done">✓ {{ t('fbd.reviewDone') }}</p>
    </div>
    <FormBuilder v-else v-model="formData" :schema="formSchema" @submit="handleSubmit" />
  </div>
</template>

<style scoped>
.frv {
  min-height: 200px;
}
.frv-state {
  padding: 40px 0;
  text-align: center;
  color: var(--color-text-muted, #94a3b8);
}
.frv-error {
  color: var(--color-danger, #dc2626);
}
.frv-done {
  font-size: var(--fs-16);
  font-weight: 600;
  color: var(--color-success, #059669);
}
</style>
