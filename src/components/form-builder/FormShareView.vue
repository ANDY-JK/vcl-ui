<script setup lang="ts">
/**
 * FormShareView — 表单发布填写端（低代码闭环「发布」环节）
 *
 * 设计器分享弹窗生成的发布链接指向本组件，支持两种：
 * - `#/form/<FD1.分享码>`：完整设计编码在链接里（跨设备可靠，长表单链接超长）
 * - `#/form/<S.表单id>`：短链，设计已存 store，按 id 加载（二维码容量有限，短链保证可扫码）
 *
 * 使用方式：
 * ```vue
 * <!-- 路由：<Route path="/form/:code" component={FormShareView} props={true} /> -->
 * <FormShareView code="FD1.xxx" /> 或 <FormShareView code="S.f_xxx" />
 * <!-- 或宿主内嵌： -->
 * <FormShareView :design="design" />
 * ```
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { formatDateTimeZh } from '@/components/form/utils/date-utils'
import FormBuilder from './FormBuilder.vue'
import FormTargetCollect from './FormTargetCollect.vue'
import Result from '@/components/feedback/Result.vue'
import Button from '@/components/basic/Button.vue'
import { toFormSchema, collectStorageKey, genRecordId, type FormDesign, type CollectRecord } from './designer/types'
import { decodeShareCode, parseShareId } from './designer/share'
import { getActiveFormStore, type FormMetaItem, type FormStore } from './designer/store'

const t = useT()

const props = withDefaults(
  defineProps<{
    /** 发布链接中的标识（FD1.分享码 或 S.表单id；与 design 二选一，design 优先） */
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

/** 解析结果：null 表示无有效设计（标识无效/未传入） */
const parsed = ref<FormDesign | null>(null)
/** 短链异步加载中（S. 前缀需从 store 拉设计） */
const loading = ref(false)
/** 短链命中的索引项：collectKey 的权威来源（表单 id 才是记录桶的锚） */
const storedItem = ref<FormMetaItem | null>(null)

const activeStore = computed<FormStore>(() => props.store ?? getActiveFormStore())

async function resolveDesign(): Promise<void> {
  if (props.design) {
    parsed.value = props.design
    return
  }
  const code = (props.code ?? '').trim()
  if (!code) {
    parsed.value = null
    return
  }
  // 短链：S.<formId> → 从 store 加载设计
  const formId = parseShareId(code)
  if (formId) {
    loading.value = true
    try {
      parsed.value = await activeStore.value.loadForm(formId)
      // 索引项决定 collectKey；按字段指纹重算会与写入端错桶（结构相同的表单更会串台）
      storedItem.value = (await activeStore.value.listForms()).find((x) => x.id === formId) ?? null
    } catch {
      parsed.value = null
    } finally {
      loading.value = false
    }
    return
  }
  // 完整分享码
  parsed.value = decodeShareCode(code)
}

onMounted(() => {
  void resolveDesign()
})

const invalid = computed(() => !parsed.value)
const nodes = computed(() => parsed.value?.nodes ?? parsed.value?.fields ?? [])
const formSchema = computed(() =>
  parsed.value ? toFormSchema(parsed.value.nodes ?? parsed.value.fields ?? [], parsed.value.meta ?? {}) : null,
)
/** 目标收集模式：meta.collectType === 'target' */
const isTargetCollect = computed(() => parsed.value?.meta?.collectType === 'target' && !!formSchema.value)
/** 目标清单（目标收集模式用；缺省空数组由组件降级处理） */
const targets = computed(() => parsed.value?.meta?.targets ?? [])
/** 收集记录存储 key：短链用索引里的 item.collectKey（id 锚）；
 *  完整分享码没有表单 id，只能退回字段指纹（与 FormCollect 独立嵌入同一口径） */
const collectKey = computed(() => {
  if (!parsed.value) return ''
  return storedItem.value?.collectKey || collectStorageKey(nodes.value)
})

const formData = ref<Record<string, unknown>>({})
const submitting = ref(false)
const submitted = ref(false)
const error = ref('')

/** 填写草稿 key（fd_share_ 前缀 + 分享码/字段指纹）：刷新/误关后自动恢复，提交成功由 FormBuilder 清除 */
const draftKey = computed(() => (parsed.value ? `fd_share_${props.code || collectKey.value || 'design'}` : ''))

/** 有未提交内容时拦截刷新/关闭（提交成功页与空表单不拦截） */
function onBeforeUnload(e: BeforeUnloadEvent): void {
  const dirty = Object.values(formData.value).some(
    (v) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0),
  )
  if (dirty && !submitted.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

async function handleSubmit(data: Record<string, unknown>): Promise<void> {
  if (!parsed.value || submitting.value) return // in-flight 守卫：越过 3 秒兜底窗口也不重复写入
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
    <!-- 短链加载中（S. 前缀需从 store 拉设计） -->
    <div v-if="loading" class="fsv-state" role="status">{{ t('fbd.loadingList') }}</div>

    <!-- 无效标识 / 无设计 -->
    <div v-else-if="invalid" class="fsv-state" role="alert">
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
        <!-- 目标收集模式：按目标清单渲染表格 + 每行照片位上传 + 状态/导出 -->
        <template v-if="isTargetCollect">
          <h2 v-if="title || formSchema.title" class="fsv-title">{{ title || formSchema.title }}</h2>
          <p v-if="formSchema.description" class="fsv-desc">{{ formSchema.description }}</p>
          <FormTargetCollect :schema="formSchema" :targets="targets" />
        </template>
        <!-- 单页表单模式：填写 → 提交 → 收集记录 -->
        <template v-else>
          <h2 v-if="title || formSchema.title" class="fsv-title">{{ title || formSchema.title }}</h2>
          <p v-if="formSchema.description" class="fsv-desc">{{ formSchema.description }}</p>
          <p v-if="error" class="fsv-error" role="alert">{{ error }}</p>
          <FormBuilder v-model="formData" :schema="formSchema" :storage-key="draftKey" @submit="handleSubmit" />
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.fsv {
  max-width: calc(720px * var(--vcl-scale));
  margin: 0 auto;
  padding: calc(24px * var(--vcl-scale)) calc(16px * var(--vcl-scale));
}
.fsv-state {
  padding: calc(48px * var(--vcl-scale)) 0;
}
.fsv-title {
  margin: 0 0 calc(4px * var(--vcl-scale));
  font-size: var(--fs-20);
  font-weight: 700;
  color: var(--color-text, #1e293b);
}
.fsv-desc {
  margin: 0 0 calc(20px * var(--vcl-scale));
  font-size: var(--fs-13);
  line-height: 1.7;
  color: var(--color-text-secondary, #64748b);
}
.fsv-error {
  margin: 0 0 calc(12px * var(--vcl-scale));
  padding: calc(8px * var(--vcl-scale)) calc(12px * var(--vcl-scale));
  border-radius: var(--radius-sm, calc(6px * var(--vcl-scale)));
  background: var(--color-danger-light, #fef2f2);
  color: var(--color-danger-on-surface);
  font-size: var(--fs-13);
}
</style>
