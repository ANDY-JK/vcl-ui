<script setup lang="ts">
/**
 * FormBuilder — Schema 驱动的动态表单引擎
 *
 * 核心设计：
 * 1. 接收 FormSchema，通过 useFormSchema 解析为归一化结构
 * 2. 通过 useFormValidator 提供校验能力
 * 3. FormRenderer 按 FieldType 渲染对应原子组件
 * 4. 支持 single / grid / steps 三种布局模式
 * 5. 支持 visibleWhen 条件显示
 * 6. 可选 storageKey 持久化草稿（P2 接入）
 *
 * 使用方式：
 * ```vue
 * <FormBuilder :schema="schema" v-model="formData" @submit="handleSubmit" />
 * ```
 */

import { ref, computed, watch, watchEffect, onMounted, onUnmounted, nextTick } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { useFormSchema, isLayoutField } from './useFormSchema'
import { useFormValidator } from './useFormValidator'
import { useFormStorage } from './useFormStorage'
import { useFormLinkage } from './useFormLinkage'
import FormRenderer from './FormRenderer.vue'
import Button from '@/components/basic/Button.vue'
import Steps from '@/components/nav/Steps.vue'
import Card from '@/components/data/Card.vue'
import Toast from '@/components/feedback/Toast.vue'
import type { FormSchema, FormData, FormField, FormErrors } from './types'

const t = useT()

// ════════════════════════════════════════
// Props
// ════════════════════════════════════════

interface Props {
  /** 表单 Schema */
  schema: FormSchema
  /** 表单数据（v-model） */
  modelValue?: FormData
  /** 存储键 — 传入则自动持久化到 IndexedDB（草稿） */
  storageKey?: string
  /** 只读模式 */
  readonly?: boolean
  /** 是否禁用全部字段 */
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => ({}),
  storageKey: '',
  readonly: false,
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [v: FormData]
  /** 提交（校验通过后触发） */
  submit: [v: FormData]
  /** 数据变化 */
  change: [v: FormData]
  /** 校验结果变化 */
  validate: [isValid: boolean]
  /** 重置 */
  reset: []
}>()

// ════════════════════════════════════════
// Schema 解析
// ════════════════════════════════════════

const schemaRef = computed(() => props.schema)
const { normalized, initialData, defaultSpan } = useFormSchema(schemaRef)

// ════════════════════════════════════════
// 表单数据（必须在联动引擎之前声明，避免 TDZ）
// ════════════════════════════════════════

/**
 * 内部数据：以 modelValue 为源，缺失字段用 initialData 填充
 * 变更时 emit update:modelValue + change
 *
 * 初始化用空对象，在 watchEffect 中同步首帧数据
 * 避免直接引用 computed.value 导致的首帧数据丢失
 */
const formData = ref<FormData>({})

// ════════════════════════════════════════
// 联动引擎
// ════════════════════════════════════════

/** 字段列表（从 normalized 中提取 fields，供联动引擎使用） */
const normalizedFields = computed(() => normalized.value.fields)

const {
  getFieldOptions,
  initDataSources,
  setupWatchers,
  isFieldVisibleWithLinkage,
} = useFormLinkage(normalizedFields, formData)

/** 是否已完成首帧同步 */
let initialized = false

/** 合并 initialData + modelValue → formData */
function syncFormData(): void {
  const merged = { ...initialData.value, ...props.modelValue }
  if (!initialized || !shallowEqual(merged, formData.value)) {
    formData.value = merged
    initialized = true
  }
}

// 首帧同步 + initialData 变化时重新生成
watchEffect(() => {
  syncFormData()
})

// 外部 modelValue 变化时同步（如父组件重置数据）
watch(
  () => props.modelValue,
  (val) => {
    const merged = { ...initialData.value, ...val }
    if (!shallowEqual(merged, formData.value)) {
      formData.value = merged
    }
  },
  { deep: true },
)

// ════════════════════════════════════════
// 校验
// ════════════════════════════════════════

const { errors, validate, validateOne, clearErrors } = useFormValidator(schemaRef, formData)

// 数据变化时处理：emit + 实时校验 + 草稿保存（合并 watcher 减少深度遍历）
watch(
  formData,
  (val) => {
    emit('update:modelValue', val)
    emit('change', val)

    // 实时校验模式
    if (normalized.value.validateOnChange) {
      // 只校验已填或已出错的字段（避免刚打开全红）
      for (const field of normalized.value.fields) {
        if (isLayoutField(field.type)) continue
        const v = val[field.key]
        const hasValue = v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
        if (hasValue || errors.value[field.key]) {
          validateOne(field.key)
        }
      }
      emit('validate', Object.keys(errors.value).length === 0)
    }

    // 草稿自动保存（防抖 1s）— 与数据变化 watcher 合并，避免双重深度遍历
    if (props.storageKey) {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        saveDraft(props.storageKey, formData.value).catch(() => {})
      }, 1000)
    }
  },
  { deep: true },
)

/** 浅比较两个 FormData 对象（避免 JSON.stringify 性能损耗） */
function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false
  }
  return true
}

// ════════════════════════════════════════
// 存储持久化（P2 — 接入 useFormStorage）
// ════════════════════════════════════════

const { loadDraft, saveDraft, clearDraft } = useFormStorage()

// 传入 storageKey 时自动加载草稿 + 自动保存
// 同时初始化联动引擎
onMounted(async () => {
  // 启动联动 watcher
  setupWatchers()

  // 初始化无联动条件的 API 数据源
  await initDataSources()

  if (props.storageKey) {
    const draft = await loadDraft(props.storageKey)
    if (draft) {
      formData.value = { ...formData.value, ...draft }
      toastRef.value?.show(t('formBuilder.draftRestored'), 'info', 1500)
    }
  }
})

// 草稿保存 timer（在上方 formData watcher 中使用）
let saveTimer: ReturnType<typeof setTimeout> | null = null

// ════════════════════════════════════════
// 步骤模式（steps）
// ════════════════════════════════════════

const currentStep = ref(0)
const totalSteps = computed(() => normalized.value.steps?.length ?? 0)

/** 当前步骤的字段列表 */
const stepFields = computed<FormField[]>(() => {
  if (normalized.value.layout !== 'steps' || !normalized.value.steps) return []
  const step = normalized.value.steps[currentStep.value]
  if (!step) return []
  return normalized.value.fields.filter((f) => step.fields.includes(f.key))
})

function nextStep(): void {
  // 校验当前步骤的字段
  const stepFieldKeys = normalized.value.steps?.[currentStep.value]?.fields ?? []
  let stepValid = true
  for (const key of stepFieldKeys) {
    if (!validateOne(key)) stepValid = false
  }
  if (!stepValid) {
    toastRef.value?.show(t('formBuilder.requiredStep'), 'warning', 2000)
    return
  }
  if (currentStep.value < totalSteps.value - 1) {
    currentStep.value++
  }
}

function prevStep(): void {
  if (currentStep.value > 0) currentStep.value--
}

// ════════════════════════════════════════
// 提交与重置
// ════════════════════════════════════════

const toastRef = ref<InstanceType<typeof Toast>>()
const submitting = ref(false)

function handleSubmit(): void {
  // 全量校验
  const isValid = validate()
  emit('validate', isValid)

  if (!isValid) {
    toastRef.value?.show(t('formBuilder.requiredAll'), 'error', 2000)
    // 滚动到第一个错误字段
    nextTick(() => {
      const firstErrEl = document.querySelector('.fb-field-error')
      if (firstErrEl) {
        const fieldEl = firstErrEl.closest('.fb-field')
        fieldEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })
    return
  }

  // 收集可见字段的数据（隐藏字段不提交）
  const submitData: FormData = {}
  for (const field of normalized.value.fields) {
    if (isLayoutField(field.type)) continue
    if (!isFieldVisibleWithLinkage(field, formData.value)) continue
    submitData[field.key] = formData.value[field.key]
  }

  submitting.value = true
  emit('submit', submitData)

  // 提交成功后清除草稿
  if (props.storageKey) {
    clearDraft(props.storageKey).catch(() => {})
  }

  // 3 秒后自动重置 submitting，防止父组件未处理时永远 loading
  // 父组件可通过调用 expose 的 stopSubmit() 立即停止
  if (submitTimer) clearTimeout(submitTimer)
  submitTimer = setTimeout(() => { submitting.value = false }, 3000)
}

let submitTimer: ReturnType<typeof setTimeout> | null = null

/** 停止提交 loading 状态 — 供父组件通过 ref 调用 */
function stopSubmit(): void {
  if (submitTimer) { clearTimeout(submitTimer); submitTimer = null }
  submitting.value = false
}

/** 设置提交 loading 状态 — 供父组件通过 ref 调用 */
function setSubmitting(v: boolean): void {
  if (submitTimer) { clearTimeout(submitTimer); submitTimer = null }
  submitting.value = v
}

onUnmounted(() => {
  if (submitTimer) clearTimeout(submitTimer)
})

/**
 * 获取表单数据（仅可见字段，排除布局元素）
 * @returns 包含可见字段数据的对象
 */
function getFormData(): FormData {
  const result: FormData = {}
  for (const field of normalized.value.fields) {
    if (isLayoutField(field.type)) continue
    if (!isFieldVisibleWithLinkage(field, formData.value)) continue
    result[field.key] = formData.value[field.key]
  }
  return result
}

/**
 * 主动校验全表单
 * @returns true = 校验通过
 */
function validateForm(): boolean {
  return validate()
}

/**
 * 主动校验并返回数据和校验结果
 * @returns { data, isValid, errors }
 */
function validateAndGet(): { data: FormData; isValid: boolean; errors: FormErrors } {
  const isValid = validate()
  return { data: getFormData(), isValid, errors: { ...errors.value } }
}

defineExpose({ stopSubmit, setSubmitting, submitting, getFormData, validateForm, validateAndGet, validate, errors })

function handleReset(): void {
  formData.value = { ...initialData.value }
  clearErrors()
  currentStep.value = 0
  // 重置时清除草稿，避免下次加载又恢复旧数据
  if (props.storageKey) {
    clearDraft(props.storageKey).catch(() => {})
  }
  emit('reset')
  toastRef.value?.show(t('formBuilder.resetDone'), 'info', 1500)
}

// ════════════════════════════════════════
// 计算属性
// ════════════════════════════════════════

/** 可见字段列表（过滤 visibleWhen + 联动隐藏） */
const visibleFields = computed(() => {
  return normalized.value.fields.filter((f) => isFieldVisibleWithLinkage(f, formData.value))
})

/** 当前应渲染的字段列表（steps 模式只渲染当前步骤） */
const renderFields = computed<FormField[]>(() => {
  if (normalized.value.layout === 'steps' && normalized.value.steps) {
    return stepFields.value.filter((f) => isFieldVisibleWithLinkage(f, formData.value))
  }
  return visibleFields.value
})

/** 一个渲染区块：按容器归属把字段切分成连续段 */
interface RenderSection {
  id: string
  /** 区块标题（容器 label 或 group 名） */
  title: string | null
  /** 是否多列网格布局（grid 容器 或 表单 layout=grid） */
  isGrid: boolean
  /** 网格列数 */
  columns: number
  /** 字段默认跨列数（未显式 span 时） */
  defaultSpan: number
  fields: FormField[]
}

/** 把 renderFields 按「容器/group 归属」切分为连续区块，保持字段原始顺序 */
const renderSections = computed<RenderSection[]>(() => {
  const sections: RenderSection[] = []
  let cur: RenderSection | null = null
  let curKey = ''
  for (const f of renderFields.value) {
    const c = f.container
    let title: string | null
    let isGrid: boolean
    let columns: number
    let spanDefault: number
    if (c) {
      title = c.label ?? null
      isGrid = c.type === 'grid'
      columns = c.columns ?? 2
      // grid 容器内字段默认均分列宽
      spanDefault = isGrid ? Math.max(1, Math.floor(24 / columns)) : 24
    } else {
      title = f.group ?? null
      isGrid = normalized.value.layout === 'grid'
      columns = normalized.value.columns ?? 2
      spanDefault = defaultSpan.value
    }
    const key = c ? `c:${c.id ?? ''}` : `g:${f.group ?? ''}`
    if (!cur || key !== curKey) {
      cur = { id: 's' + sections.length, title, isGrid, columns, defaultSpan: spanDefault, fields: [] }
      sections.push(cur)
      curKey = key
    }
    cur.fields.push(f)
  }
  return sections
})

/** 计算字段在网格里的跨列 span（按区块列数） */
function spanOf(field: FormField, section: RenderSection): number {
  return Math.max(1, Math.min(field.span || section.defaultSpan, section.columns))
}

/** 是否显示步骤导航 */
const showSteps = computed(() => normalized.value.layout === 'steps' && totalSteps.value > 0)

/** 是否显示底部操作按钮 */
const showActions = computed(() => !normalized.value.hideActions)

/** 是否是最后一步 */
const isLastStep = computed(() => currentStep.value === totalSteps.value - 1)

/** 每步的字段完成度（已填/总数） */
const stepCompletion = computed(() => {
  if (normalized.value.layout !== 'steps' || !normalized.value.steps) return []
  return normalized.value.steps.map(step => {
    const fields = normalized.value.fields.filter(f => step.fields.includes(f.key) && isFieldVisibleWithLinkage(f, formData.value))
    const filled = fields.filter(f => {
      const v = formData.value[f.key]
      return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
    }).length
    return { filled, total: fields.length }
  })
})
</script>

<template>
  <div class="fb-builder">
    <!-- 标题与描述 -->
    <Transition name="fb-header-fade">
      <div v-if="normalized.title || normalized.description" class="fb-header">
        <h3 v-if="normalized.title" class="fb-title">{{ normalized.title }}</h3>
        <p v-if="normalized.description" class="fb-desc">{{ normalized.description }}</p>
      </div>
    </Transition>

    <!-- 步骤导航 -->
    <Steps
      v-if="showSteps"
      :steps="normalized.steps?.map((s) => ({ label: s.title })) ?? []"
      :current="currentStep"
    />

    <!-- 表单主体 -->
    <form class="fb-form" @submit.prevent="handleSubmit">
      <!-- single / grid 模式：按容器/分组切分渲染 -->
      <template v-if="normalized.layout !== 'steps'">
        <Card
          v-for="section in renderSections"
          :key="section.id"
          class="fb-group-card"
          :title="section.title || undefined"
          :no-body-padding="false"
        >
          <div
            class="fb-fields"
            :class="{ 'fb-grid': section.isGrid }"
            :style="section.isGrid ? { '--fb-cols': Math.max(1, section.columns) } : {}"
          >
            <div
              v-for="field in section.fields"
              :key="field.key"
              class="fb-field"
              :style="{ '--fb-span': spanOf(field, section) }"
            >
              <FormRenderer
                v-model="formData[field.key]"
                :field="field"
                :error="errors[field.key]"
                :disabled="disabled || field.disabled || readonly"
                :dynamic-options="getFieldOptions(field)"
              />
            </div>
          </div>
        </Card>
      </template>

      <!-- steps 模式：渲染当前步骤字段 -->
      <template v-else>
        <div class="fb-fields fb-fields-step">
          <div
            v-for="field in renderFields"
            :key="field.key"
            class="fb-field"
          >
            <FormRenderer
              v-model="formData[field.key]"
              :field="field"
              :error="errors[field.key]"
              :disabled="disabled || field.disabled || readonly"
              :dynamic-options="getFieldOptions(field)"
            />
          </div>
        </div>
      </template>

      <!-- 底部操作 -->
      <div v-if="showActions" class="fb-actions">
        <!-- steps 模式 -->
        <template v-if="showSteps">
          <div class="fb-step-indicator">
            <div class="fb-step-progress">
              <div class="fb-step-progress-bar" :style="{ width: ((currentStep + 1) / totalSteps * 100) + '%' }" />
            </div>
            <span class="fb-step-text">
              <span class="fb-step-current">{{ currentStep + 1 }}</span>
              <span class="fb-step-sep">/</span>
              <span class="fb-step-total">{{ totalSteps }}</span>
              <span v-if="normalized.steps?.[currentStep]?.title" class="fb-step-title">{{ normalized.steps[currentStep].title }}</span>
              <span v-if="stepCompletion[currentStep]" class="fb-step-completion">
                ({{ stepCompletion[currentStep].filled }}/{{ stepCompletion[currentStep].total }})
              </span>
            </span>
          </div>
          <Button
            v-if="currentStep > 0"
            variant="outline"
            @click="prevStep"
          >
            {{ t('formBuilder.prevStep') }}
          </Button>
          <Button
            v-if="!isLastStep"
            variant="primary"
            @click="nextStep"
          >
            {{ t('formBuilder.nextStep') }}
          </Button>
          <Button
            v-if="isLastStep"
            variant="primary"
            :loading="submitting"
            :disabled="disabled"
            type="submit"
          >
            {{ normalized.submitText }}
          </Button>
          <Button variant="ghost" @click="handleReset">
            {{ normalized.resetText }}
          </Button>
        </template>

        <!-- 非 steps 模式：提交/重置 -->
        <template v-else>
          <Button variant="primary" :loading="submitting" :disabled="disabled" type="submit">
            {{ normalized.submitText }}
          </Button>
          <Button variant="ghost" @click="handleReset">
            {{ normalized.resetText }}
          </Button>
        </template>
      </div>
    </form>

    <Toast ref="toastRef" variant="toast" position="top" />
  </div>
</template>

<style scoped>
.fb-builder {
  max-width: 800px;
  margin: 0 auto;
}

/* 标题 */
.fb-header {
  margin-bottom: 20px;
}
.fb-header-fade-enter-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.fb-header-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fb-header-fade-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
.fb-header-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.fb-title {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text, #1e293b);
}
.fb-desc {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
  line-height: 1.5;
}

/* 表单 */
.fb-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* group 卡片间距 */
.fb-group-card {
  margin-bottom: 0;
}

/* 字段容器 */
.fb-fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* grid 布局 */
.fb-grid {
  display: grid;
  grid-template-columns: repeat(var(--fb-cols, 2), 1fr);
  gap: 12px 16px;
}
.fb-field {
  min-width: 0;
}
/* grid 模式下按 span 跨列 */
.fb-grid .fb-field {
  grid-column: span min(var(--fb-span, 12), var(--fb-cols, 2));
}

/* 移动端响应式：单列布局 */
@media (max-width: 640px) {
  .fb-grid {
    grid-template-columns: 1fr;
  }
  .fb-grid .fb-field {
    grid-column: span 1;
  }
}

/* steps 模式字段间距 */
.fb-fields-step {
  gap: 20px;
}

/* steps 模式步骤过渡动画 */
.fb-fields-step {
  animation: fb-step-fade-in 0.3s ease;
}
@keyframes fb-step-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 步骤指示器 */
.fb-step-indicator {
  margin-right: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
}
.fb-step-progress {
  height: 4px;
  background: var(--color-border-light, #e2e8f0);
  border-radius: 2px;
  overflow: hidden;
}
.fb-step-progress-bar {
  height: 100%;
  background: var(--color-primary, #3b82f6);
  border-radius: 2px;
  transition: width 0.3s ease;
}
.fb-step-text {
  display: flex;
  align-items: baseline;
  gap: 2px;
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
}
.fb-step-current {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-primary, #3b82f6);
}
.fb-step-sep {
  color: var(--color-text-muted, #94a3b8);
}
.fb-step-total {
  font-weight: 500;
}
.fb-step-title {
  margin-left: 8px;
  font-size: 13px;
  color: var(--color-text, #1e293b);
  font-weight: 500;
}
.fb-step-completion {
  margin-left: 4px;
  font-size: 11px;
  color: var(--color-text-muted, #94a3b8);
  font-weight: 400;
}

/* 底部操作 */
.fb-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 12px;
  border-top: 1px solid var(--color-border, #e2e8f0);
}
</style>
