<script setup lang="ts">
/**
 * FormShareView — 表单发布填写端（低代码闭环「发布」环节）
 *
 * 设计器分享弹窗生成的发布链接 `#/form/<FD1.分享码>` 指向本组件：
 * - 解析分享码（或直接传 design 对象）→ 渲染可填写表单
 * - 提交时把记录写入活动存储（与 FormCollect 同链路，本地/云端自动跟随）
 * - 提交成功显示结果页；multiple 模式可「再填一份」
 *
 * 使用方式：
 * ```vue
 * <!-- 路由：<Route path="/form/:code" component={FormShareView} props={true} /> -->
 * <FormShareView code="FD1.xxx" />
 * <!-- 或宿主内嵌： -->
 * <FormShareView :design="design" />
 * ```
 */
import { ref, computed, onMounted } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { formatDateTimeZh } from '@/components/form/utils/date-utils'
import FormBuilder from './FormBuilder.vue'
import Result from '@/components/feedback/Result.vue'
import Button from '@/components/basic/Button.vue'
import { toFormSchema, collectStorageKey, genRecordId, type FormDesign, type CollectRecord } from './designer/types'
import { decodeShareCode } from './designer/share'
import { getActiveFormStore, type FormStore } from './designer/store'

const t = useT()

const props = withDefaults(
  defineProps<{
    /** 发布链接中的分享码（FD1. 前缀；与 design 二选一，design 优先） */
    code?: string
    /** 直接传设计对象（宿主内嵌场景；与 code 二选一，优先于此） */
    design?: FormDesign
    /** 存储实现（默认全局活动 store：设计器切换本地/云端后自动跟随） */
    store?: FormStore
    /** 覆盖表单标题（不传用 meta.title） */
    title?: string
  }>(),
  {
    code: '',
    design: undefined,
    store: undefined,
    title: '',
  },
)

const emit = defineEmits<{
  /** 提交成功，携带写入的收集记录 */
  submitted: [record: CollectRecord]
}>()

/** 解析结果：null 表示无有效设计（分享码无效/未传入） */
const parsed = ref<FormDesign | null>(null)

function resolveDesign(): FormDesign | null {
  if (props.design) return props.design
  if (props.code) return decodeShareCode(props.code)
  return null
}

onMounted(() => {
  parsed.value = resolveDesign()
})

const invalid = computed(() => !parsed.value)
const nodes = computed(() => parsed.value?.nodes ?? parsed.value?.fields ?? [])
const formSchema = computed(() =>
  parsed.value ? toFormSchema(parsed.value.nodes ?? parsed.value.fields ?? [], parsed.value.meta ?? {}) : null,
)
/** 收集记录存储 key（与 FormCollect 同算法：按字段结构指纹） */
const collectKey = computed(() => (parsed.value ? collectStorageKey(nodes.value) : ''))
const activeStore = computed<FormStore>(() => props.store ?? getActiveFormStore())

const formData = ref<Record<string, unknown>>({})
const submitting = ref(false)
const submitted = ref(false)
const error = ref('')

async function handleSubmit(data: Record<string, unknown>): Promise<void> {
  if (!parsed.value) return
  submitting.value = true
  error.value = ''
  try {
    const record: CollectRecord = {
      id: genRecordId(),
      time: formatDateTimeZh(),
      data,
    }
    await activeStore.value.appendRecord(collectKey.value, record)
    submitted.value = true
    emit('submitted', record)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    submitting.value = false
  }
}

/** multiple 模式：提交成功后重新填写 */
function fillAgain(): void {
  formData.value = {}
  submitted.value = false
  error.value = ''
}

const canFillAgain = computed(() => formSchema.value?.submitMode === 'multiple')
</script>

<template>
  <div class="fsv">
    <!-- 无效分享码 / 无设计 -->
    <div v-if="invalid" class="fsv-state" role="alert">
      <Result status="error" :title="t('fbd.formExpired')" :description="t('fbd.formExpiredHint')" />
    </div>

    <!-- 提交成功结果页 -->
    <div v-else-if="submitted" class="fsv-state">
      <Result status="success" :title="t('fbd.submitOk')" :description="t('fbd.submitOkHint')">
        <template #extra>
          <Button v-if="canFillAgain" :text="t('fbd.fillAgain')" variant="primary" @click="fillAgain" />
        </template>
      </Result>
    </div>

    <!-- 填写表单 -->
    <div v-else class="fsv-form">
      <template v-if="formSchema">
        <h2 v-if="title || formSchema.title" class="fsv-title">{{ title || formSchema.title }}</h2>
        <p v-if="formSchema.description" class="fsv-desc">{{ formSchema.description }}</p>
        <p v-if="error" class="fsv-error" role="alert">{{ error }}</p>
        <FormBuilder v-model="formData" :schema="formSchema" @submit="handleSubmit" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.fsv {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px;
}
.fsv-state {
  padding: 48px 0;
}
.fsv-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text, #1e293b);
}
.fsv-desc {
  margin: 0 0 20px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-secondary, #64748b);
}
.fsv-error {
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: var(--radius-sm, 6px);
  background: var(--color-danger-light, #fef2f2);
  color: var(--color-danger, #dc2626);
  font-size: 13px;
}
</style>
