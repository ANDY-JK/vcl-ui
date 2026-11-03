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
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { recordTimeNow } from '@/components/form/utils/date-utils'
import FormBuilder from './FormBuilder.vue'
import FormTargetCollect from './FormTargetCollect.vue'
import Result from '@/components/feedback/Result.vue'
import Button from '@/components/basic/Button.vue'
import { toFormSchema, collectStorageKey, genRecordId, type FormDesign, type CollectRecord } from './designer/types'
import { decodeShareCode, parseShareId, verifyShareCodeWith } from './designer/share'
import { getActiveShareSigner } from './designer/share-signer'
import { reportEvent } from '@/components/_internal/runtime-observer'
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

/** 解码请求序号：路由连续切换时，旧请求的迟到结果不得覆盖新结果 */
let resolveToken = 0

async function resolveDesign(): Promise<void> {
  const token = ++resolveToken
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
      const design = await activeStore.value.loadForm(formId)
      const list = await activeStore.value.listForms()
      if (token !== resolveToken) return // 期间又切了码：丢弃本次结果
      parsed.value = design
      // 索引项决定 collectKey；按字段指纹重算会与写入端错桶（结构相同的表单更会串台）
      storedItem.value = list.find((x) => x.id === formId) ?? null
    } catch {
      if (token === resolveToken) parsed.value = null
    } finally {
      if (token === resolveToken) loading.value = false
    }
    return
  }
  // 完整分享码。
  // 宿主配了签发者时先验签：**签名不对必须拒**（有人改了 schema 再转发）；
  // 未签名的 FD1 仍放行——保持既有链接可用，不制造破坏性变更。
  const signer = getActiveShareSigner()
  if (signer) {
    const { status, design } = await verifyShareCodeWith(code, signer)
    if (token !== resolveToken) return
    parsed.value = status === 'bad-signature' ? null : design
    if (status === 'bad-signature') {
      // 「用户说打不开」时宿主最需要知道的两件事：是签名被改还是码本身坏了
      reportEvent('form-builder/share-signature-invalid', '分享码签名校验未通过，已拒绝渲染', {
        codeLength: code.length,
        codePrefix: code.slice(0, 4),
        signer: signer.name,
      })
    }
    return
  }
  parsed.value = decodeShareCode(code)
  if (!parsed.value) {
    reportEvent('form-builder/share-invalid', '分享码无效或已损坏', {
      codeLength: code.length,
      codePrefix: code.slice(0, 4),
    })
  }
}

/**
 * 解码随 code/design 变化重跑（2026-10-17 实测修复）。
 *
 * 此前只有 `onMounted` 解码一次：路由从 `/form/<码A>` 切到 `/form/<码B>` 时，
 * vue-router **复用同一组件实例、只更新 prop**，于是页面继续显示 A 的表单——
 * 用户在同一个标签页打开第二条分享链接会看到**错误的表单**并往里填数据。
 * 改用 immediate watch：首次挂载照旧，后续换码即时重解析。
 */
watch(
  () => [props.code, props.design] as const,
  () => {
    void resolveDesign()
  },
  { immediate: true },
)

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
      time: recordTimeNow(),
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
          <!-- 本组件已渲染 fsv 标题/描述，内嵌表单隐藏其头部避免双重标题 -->
          <FormBuilder
            v-model="formData"
            :schema="formSchema"
            :storage-key="draftKey"
            hide-header
            @submit="handleSubmit"
          />
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.fsv {
  /* 与 FormBuilder 的 1080 成品上限同口径（此前 720 双重收窄，宽屏只剩中间一条） */
  max-width: calc(1080px * var(--vcl-scale));
  margin: 0 auto;
  padding: calc(24px * var(--vcl-scale)) calc(16px * var(--vcl-scale));
}
.fsv-state {
  padding: calc(48px * var(--vcl-scale)) 0;
}
.fsv-title {
  margin: 0 0 calc(4px * var(--vcl-scale));
  font-size: var(--vcl-fs-20);
  font-weight: 700;
  color: var(--vcl-color-text, #1e293b);
}
.fsv-desc {
  margin: 0 0 calc(20px * var(--vcl-scale));
  font-size: var(--vcl-fs-13);
  line-height: 1.7;
  color: var(--vcl-color-text-secondary, #64748b);
}
.fsv-error {
  margin: 0 0 calc(12px * var(--vcl-scale));
  padding: calc(8px * var(--vcl-scale)) calc(12px * var(--vcl-scale));
  border-radius: var(--vcl-radius-sm, calc(6px * var(--vcl-scale)));
  background: var(--vcl-color-danger-light, #fef2f2);
  color: var(--vcl-color-danger-on-surface);
  font-size: var(--vcl-fs-13);
}
</style>
