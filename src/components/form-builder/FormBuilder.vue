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
import { shallowEqual } from '@/components/_internal/utils'
import { useFormSchema, isLayoutField, isFieldVisible, collectVisibleData } from './useFormSchema'
import { useFormValidator } from './useFormValidator'
import { useFormStorage } from './useFormStorage'
import { useFormLinkage } from './useFormLinkage'
import { useFormSteps } from './useFormSteps'
import { useFormEvents } from './useFormEvents'
import { useFormRemote } from './useFormRemote'
import FormRenderer from './FormRenderer.vue'
import FieldList from './FieldList.vue'
import Button from '@/components/basic/Button.vue'
import Steps from '@/components/nav/Steps.vue'
import Tabs from '@/components/nav/Tabs.vue'
import Collapse from '@/components/data/Collapse.vue'
import Card from '@/components/data/Card.vue'
import Toast from '@/components/feedback/Toast.vue'
import type { FormSchema, FormData, FormField, RenderSection, FieldContainer } from './types'

/** 草稿自动保存防抖：连续输入只在停下来 1s 后存一次 */
const _DRAFT_SAVE_DEBOUNCE_MS = 1000
/** 提交兜底解锁：宿主没接住 submit 时，按钮最迟这么久恢复可点 */
const _SUBMIT_STUCK_RESET_MS = 3000

const t = useT()

// ══ Props ══

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
  /** 当前用户上下文（动态默认值 currentUser 用；宿主注入真实用户信息） */
  userContext?: Record<string, unknown>
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => ({}),
  storageKey: '',
  readonly: false,
  disabled: false,
  userContext: () => ({}),
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
  /** 远程数据加载完成（submitConfig.apiUrl GET 回填后，返回原始响应数据） */
  loaded: [raw: Record<string, unknown>]
}>()

// ══ Schema 解析 ══

const schemaRef = computed(() => props.schema)
const userContextRef = computed(() => props.userContext)
const { normalized, initialData, defaultSpan } = useFormSchema(schemaRef, userContextRef)

/** 表单级 API 提交配置（submitConfig） */
const submitConfig = computed(() => normalized.value.submitConfig)

/** 只读状态：props.readonly 或 submitConfig.mode='view'（全字段只读展示） */
const effectiveReadonly = computed(() => props.readonly || submitConfig.value?.mode === 'view')

// ══ 表单数据（必须在联动引擎之前声明，避免 TDZ） ══

/**
 * 内部数据：以 modelValue 为源，缺失字段用 initialData 填充
 * 变更时 emit update:modelValue + change
 *
 * 初始化用空对象，在 watchEffect 中同步首帧数据
 * 避免直接引用 computed.value 导致的首帧数据丢失
 */
const formData = ref<FormData>({})

// ══ 联动引擎 ══

/**
 * 运行时字段：在归一化结果上合成条件必填（requiredWhen）与条件禁用（disabledWhen）。
 * 条件匹配语义复用 isFieldVisible（条件成立 = 生效），仅判定条件表达式本身。
 * 渲染、校验、提交收集统一消费本列表——合成进 field.required / field.disabled 后下游零改动。
 */
const effectiveFields = computed<FormField[]>(() =>
  normalized.value.fields.map((f) => {
    if (!f.requiredWhen && !f.disabledWhen) return f
    const condDisable = f.disabledWhen ? isFieldVisible({ ...f, visibleWhen: f.disabledWhen }, formData.value) : false
    const condRequire = f.requiredWhen ? isFieldVisible({ ...f, visibleWhen: f.requiredWhen }, formData.value) : false
    if (!condDisable && !condRequire) return f
    return {
      ...f,
      ...(condDisable ? { disabled: true } : {}),
      ...(condRequire ? { required: true } : {}),
    }
  }),
)

/** 合成后的 schema（校验引擎消费：validateOne 按 key 从 fields 取字段） */
const effectiveSchema = computed<FormSchema>(() => ({ ...normalized.value, fields: effectiveFields.value }))

/** 字段列表（供联动引擎使用） */
const normalizedFields = computed(() => effectiveFields.value)

const { getFieldOptions, initDataSources, setupWatchers, isFieldVisibleWithLinkage } = useFormLinkage(
  normalizedFields,
  formData,
)

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

// ══ 校验 ══

const { errors, validate, validateOne, clearErrors } = useFormValidator(effectiveSchema, formData, {
  // 校验可见性使用联动感知版本：被 showHide/事件隐藏的字段跳过校验，
  // 避免“隐藏的必填字段卡死提交”且错误定位失效
  isFieldVisible: isFieldVisibleWithLinkage,
})

// 数据变化时处理：emit + 实时校验 + 草稿保存（合并 watcher 减少深度遍历）
watch(
  formData,
  (val) => {
    emit('update:modelValue', val)
    emit('change', val)

    // 实时校验模式
    if (normalized.value.validateOnChange) {
      // 只校验已填或已出错的字段（避免刚打开全红）
      for (const field of effectiveFields.value) {
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
      }, _DRAFT_SAVE_DEBOUNCE_MS)
    }

    // 审核模式自动保存（submitConfig.mode='review' + saveUrl，防抖 reviewAutoSave ms）
    scheduleAutoSave()
  },
  { deep: true },
)

// ══ 存储持久化（P2 — 接入 useFormStorage） ══

const { loadDraft, saveDraft, clearDraft } = useFormStorage()

// 传入 storageKey 时自动加载草稿 + 自动保存
// 同时初始化联动引擎
onMounted(async () => {
  // 启动联动 watcher
  setupWatchers()

  // 初始化无联动条件的 API 数据源
  await initDataSources()

  applyApiDefaults(
    () => normalized.value.fields,
    () => initialData.value,
  ) // api 默认值异步回填（不阻塞）

  // submitConfig：GET 加载数据（apiUrl）→ 回填字段值（edit 模式由 loadRemoteData 内部跳过）
  await loadRemoteData()

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

// ══ 提交与重置 ══

const toastRef = ref<InstanceType<typeof Toast>>()
const submitting = ref(false)
/** 组件根节点（模板 ref，滚动定位限定在当前实例内） */
const rootEl = ref<HTMLElement | null>(null)

function handleSubmit(): void {
  if (submitting.value) return // 提交进行中：入口守卫（父组件可用 setSubmitting 延长锁定）
  // 全量校验
  const isValid = validate()
  emit('validate', isValid)

  if (!isValid) {
    toastRef.value?.show(t('formBuilder.requiredAll'), 'error', 2000)
    // steps 布局：错误字段可能在其它步骤——先跳到首个错误所在步骤再滚动定位
    const firstErrField = effectiveFields.value.find((f) => errors.value[f.key])
    if (firstErrField) jumpToFieldStep(firstErrField.key)
    // 滚动到第一个错误字段（限定在当前组件实例内，避免多表单同页串扰）
    nextTick(() => {
      const firstErrEl = rootEl.value?.querySelector('.fb-field-error')
      if (firstErrEl) {
        const fieldEl = firstErrEl.closest('.fb-field')
        fieldEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })
    return
  }

  // 收集可见字段的数据（隐藏字段不提交）
  const submitData = collectVisibleData(
    effectiveFields.value,
    formData.value,
    (f) => isFieldVisibleWithLinkage(f, formData.value) && !isHiddenByEvent(f.key),
  )

  // 提交模式：unique 模式下若已提交过则拦截（防止重复提交）
  if (normalized.value.submitMode === 'unique' && hasSubmitted.value) {
    toastRef.value?.show(t('formBuilder.submitOnce'), 'warning', 2000)
    return
  }

  submitting.value = true

  // 提交链路：配置了 saveUrl → 先 POST 提交（useFormRemote），成功后 emit submit 并提示
  const rc = submitConfig.value
  if (rc?.saveUrl) {
    submitRemote(submitData)
      .then(() => {
        // view 模式只读不提示（页面级查看场景）；edit/review 提示成功
        if (submitConfig.value?.mode !== 'view') {
          toastRef.value?.show(t('formBuilder.submitSuccess'), 'success', 2000)
        }
        emit('submit', submitData)
        finishSubmit()
      })
      .catch((e) => {
        toastRef.value?.show(t('formBuilder.submitFail', { err: String(e?.message ?? e) }), 'error', 2500)
        stopSubmit()
      })
    return
  }

  // 无 saveUrl：直接 emit submit，由外部处理（原有行为）
  emit('submit', submitData)
  finishSubmit()
}

/** 提交成功后的收尾（禁用再次提交 / 清空 / 清除草稿 / 自动复位 loading） */
function finishSubmit(): void {
  // 提交模式：once/unique 模式下提交后禁用再次提交（multiple 允许多次）
  if (normalized.value.submitMode !== 'multiple') {
    hasSubmitted.value = true
  }

  // 提交后清空
  if (normalized.value.clearAfterSubmit) {
    formData.value = { ...initialData.value }
    clearErrors()
  }

  // 提交成功后清除草稿
  if (props.storageKey) {
    clearDraft(props.storageKey).catch(() => {})
  }

  // 3 秒后自动重置 submitting，防止父组件未处理时永远 loading
  // 父组件可通过调用 expose 的 stopSubmit() 立即停止
  if (submitTimer) clearTimeout(submitTimer)
  submitTimer = setTimeout(() => {
    submitting.value = false
  }, _SUBMIT_STUCK_RESET_MS)
}

let submitTimer: ReturnType<typeof setTimeout> | null = null
/** 是否已提交过（submitMode=unique 用） */
const hasSubmitted = ref(false)

/** 停止提交 loading 状态 — 供父组件通过 ref 调用 */
function stopSubmit(): void {
  if (submitTimer) {
    clearTimeout(submitTimer)
    submitTimer = null
  }
  submitting.value = false
}

/** 设置提交 loading 状态 — 供父组件通过 ref 调用 */
function setSubmitting(v: boolean): void {
  if (submitTimer) {
    clearTimeout(submitTimer)
    submitTimer = null
  }
  submitting.value = v
}

onUnmounted(() => {
  if (submitTimer) clearTimeout(submitTimer)
  disposeRemote()
  if (saveTimer) clearTimeout(saveTimer)
})

/**
 * 获取表单数据（仅可见字段，排除布局元素）
 * @returns 包含可见字段数据的对象
 */
function getFormData(): FormData {
  const result: FormData = {}
  for (const field of effectiveFields.value) {
    if (isLayoutField(field.type)) continue
    if (!isFieldVisibleWithLinkage(field, formData.value)) continue
    result[field.key] = formData.value[field.key]
  }
  return result
}

// ⛔ 契约（Q18，v2 已收敛）：暴露面的校验动词只有 `validate()`（布尔）一个——
//   `validateForm` / `validateAndGet` 两个近义入口已删，要数据用 `getFormData()`、
//   要错误明细用 `errors`，各自独立调用即可拼出原先 `validateAndGet` 的组合。
//   不要再加第二个校验变体。全表以 README「defineExpose 公开契约」一节为对账单。
defineExpose({ stopSubmit, setSubmitting, submitting, getFormData, validate, errors })

function handleReset(): void {
  formData.value = { ...initialData.value }
  clearErrors()
  currentStep.value = 0
  hasSubmitted.value = false
  hiddenByEvent.value = new Set()
  // 重置时清除草稿，避免下次加载又恢复旧数据
  if (props.storageKey) {
    clearDraft(props.storageKey).catch(() => {})
  }
  emit('reset')
  toastRef.value?.show(t('formBuilder.resetDone'), 'info', 1500)
}

// ══ 计算属性 ══

// 字段事件动作（setValue/toggleVisible/showTip/callApi/autoValidate/format/submit）
// — 逻辑在 useFormEvents；onFieldUpdate 保留（FieldList 回写）
const { hiddenByEvent, isHiddenByEvent, handleFieldChange } = useFormEvents(
  formData,
  (msg, type, ms) => toastRef.value?.show(msg, type, ms),
  (key) => validateOne(key),
  () => handleSubmit(),
)

// 远程数据链路（GET 回填 + review 防抖自动保存 + api 型动态默认值 + 提交 POST）— 逻辑在 useFormRemote
const {
  loadRemoteData,
  scheduleAutoSave,
  applyApiDefaults,
  submitRemote,
  dispose: disposeRemote,
} = useFormRemote(
  submitConfig,
  formData,
  () => effectiveFields.value,
  (source) => emit('loaded', source),
  (msg, type, ms) => toastRef.value?.show(msg, type, ms),
  (err) => t('formBuilder.loadFail', { err }),
)

/** FieldList 回写字段值 */
function onFieldUpdate(key: string, value: unknown): void {
  formData.value = { ...formData.value, [key]: value }
}

/** 可见字段列表（过滤 visibleWhen + 联动隐藏 + 事件隐藏） */
const visibleFields = computed(() => {
  return effectiveFields.value.filter((f) => {
    if (isHiddenByEvent(f.key)) return false
    return isFieldVisibleWithLinkage(f, formData.value)
  })
})

// 步骤模式（steps）— 逻辑在 useFormSteps，校验回调走 validateOne + toast
const { currentStep, totalSteps, stepFields, nextStep, prevStep, jumpToFieldStep, isLastStep, stepCompletion } =
  useFormSteps(normalized, effectiveFields, formData, isFieldVisibleWithLinkage, (keys) => {
    let stepValid = true
    for (const key of keys) {
      if (!validateOne(key)) stepValid = false
    }
    if (!stepValid) {
      toastRef.value?.show(t('formBuilder.requiredStep'), 'warning', 2000)
    }
    return stepValid
  })

/** 当前应渲染的字段列表（steps 模式只渲染当前步骤） */
const renderFields = computed<FormField[]>(() => {
  if (normalized.value.layout === 'steps' && normalized.value.steps) {
    return stepFields.value.filter((f) => isFieldVisibleWithLinkage(f, formData.value))
  }
  return visibleFields.value
})

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
      // flex 容器：span 直接折算宽度占比（spanOf 需 24 全域，避免被列数钳制）
      if (c.type === 'flex') {
        columns = 24
        spanDefault = 24
      }
    } else {
      title = f.group ?? null
      isGrid = normalized.value.layout === 'grid'
      columns = normalized.value.columns ?? 2
      spanDefault = defaultSpan.value
    }
    const key = c ? `c:${c.id ?? ''}` : `g:${f.group ?? ''}`
    if (!cur || key !== curKey) {
      cur = {
        id: 's' + sections.length,
        title,
        isGrid,
        columns,
        defaultSpan: spanDefault,
        container: c ?? undefined,
        fields: [],
      }
      sections.push(cur)
      curKey = key
    }
    cur.fields.push(f)
  }
  return sections
})

// ══ 容器交互渲染辅助（tabs/collapse/steps） ══

/** tabs 容器：当前激活 tab 名 */
const tabStates = ref<Record<string, string>>({})
/** collapse 容器：展开状态（collapseIndex → bool） */
const collapseStates = ref<Record<string, boolean>>({})
/** steps 容器：当前步骤下标 */
const stepStates = ref<Record<string, number>>({})

/** flex 容器：容器配置 → CSS 变量（换行/对齐/间距） */
function flexStyle(c: FieldContainer): Record<string, string> {
  const s: Record<string, string> = {
    '--fb-flex-wrap': c.wrap === false ? 'nowrap' : 'wrap',
    '--fb-flex-justify':
      c.justify === 'center' ? 'center' : c.justify === 'space-between' ? 'space-between' : 'flex-start',
  }
  if (c.gap !== undefined) s['--fb-flex-gap'] = `${Math.max(0, Number(c.gap) || 0)}px`
  return s
}

/** tabs 容器：当前激活 tab 名（缺省第一个） */ function activeTabOf(section: RenderSection): string {
  const id = section.container?.id ?? ''
  const tabs = section.container?.tabs ?? []
  if (tabStates.value[id] !== undefined) return tabStates.value[id]
  return tabs[0]?.name ?? ''
}

/** 取 collapse 容器某折叠项展开状态 */
function collapseOpen(section: RenderSection, index: number): boolean {
  const id = section.container?.id ?? ''
  const items = section.container?.collapseItems ?? []
  if (collapseStates.value[`${id}:${index}`] !== undefined) return collapseStates.value[`${id}:${index}`]
  return items[index]?.expanded ?? false
}

/** 取 steps 容器当前步骤 */
function stepIndexOf(section: RenderSection): number {
  const id = section.container?.id ?? ''
  return stepStates.value[id] ?? 0
}

/** tabs 容器：按槽位过滤出当前 tab 的字段 */
function fieldsInTab(section: RenderSection, tabName: string): FormField[] {
  const tabs = section.container?.tabs ?? []
  const idx = tabs.findIndex((t) => t.name === tabName)
  return section.fields.filter((f) => {
    const slot = f.container?.slot ?? 0
    return slot === idx
  })
}

/** collapse 容器：按槽位过滤某折叠项的字段 */
function fieldsInCollapse(section: RenderSection, index: number): FormField[] {
  return section.fields.filter((f) => (f.container?.slot ?? 0) === index)
}

/** steps 容器：按槽位过滤某步骤的字段 */
function fieldsInStep(section: RenderSection, index: number): FormField[] {
  return section.fields.filter((f) => (f.container?.slot ?? 0) === index)
}

/** 是否显示步骤导航 */
const showSteps = computed(() => normalized.value.layout === 'steps' && totalSteps.value > 0)

/** 是否显示底部操作按钮（view 模式只读展示，隐藏提交/重置） */
const showActions = computed(() => !normalized.value.hideActions && submitConfig.value?.mode !== 'view')
</script>

<template>
  <div ref="rootEl" class="fb-builder">
    <!-- 标题与描述 -->
    <Transition name="fb-header-fade">
      <div v-if="normalized.title || normalized.description" class="fb-header">
        <h3 v-if="normalized.title" class="fb-title">{{ normalized.title }}</h3>
        <p v-if="normalized.description" class="fb-desc">{{ normalized.description }}</p>
      </div>
    </Transition>

    <!-- 步骤导航 -->
    <Steps v-if="showSteps" :steps="normalized.steps?.map((s) => ({ label: s.title })) ?? []" :current="currentStep" />

    <!-- 表单主体 -->
    <form class="fb-form" @submit.prevent="handleSubmit">
      <!-- single / grid 模式：按容器/分组切分渲染 -->
      <template v-if="normalized.layout !== 'steps'">
        <template v-for="section in renderSections" :key="section.id">
          <!-- tabs 容器：真实切页 -->
          <Card
            v-if="section.container?.type === 'tabs'"
            class="fb-group-card"
            :title="section.title || undefined"
            :no-body-padding="false"
          >
            <Tabs
              :model-value="activeTabOf(section)"
              :items="(section.container.tabs ?? []).map((t) => ({ label: t.label, value: t.name }))"
              @update:model-value="tabStates[section.container!.id ?? ''] = String($event)"
            />
            <div class="fb-fields">
              <FieldList
                :fields="fieldsInTab(section, activeTabOf(section))"
                :section="section"
                :form-data="formData"
                :errors="errors"
                :disabled="disabled || effectiveReadonly"
                :get-options="getFieldOptions"
                @update:field="onFieldUpdate"
                @change="(f: FormField) => handleFieldChange(f, 'change')"
              />
            </div>
          </Card>

          <!-- collapse 容器：真实折叠 -->
          <Card
            v-else-if="section.container?.type === 'collapse'"
            class="fb-group-card"
            :title="section.title || undefined"
            :no-body-padding="false"
          >
            <Collapse
              v-for="(item, ci) in section.container.collapseItems ?? []"
              :key="ci"
              :title="item.title"
              :open="collapseOpen(section, ci)"
              @update:open="collapseStates[`${section.container!.id ?? ''}:${ci}`] = $event"
            >
              <FieldList
                :fields="fieldsInCollapse(section, ci)"
                :section="section"
                :form-data="formData"
                :errors="errors"
                :disabled="disabled || effectiveReadonly"
                :get-options="getFieldOptions"
                @update:field="onFieldUpdate"
                @change="(f: FormField) => handleFieldChange(f, 'change')"
              />
            </Collapse>
          </Card>

          <!-- steps 容器：步骤导航 -->
          <Card
            v-else-if="section.container?.type === 'steps'"
            class="fb-group-card"
            :title="section.title || undefined"
            :no-body-padding="false"
          >
            <Steps
              :steps="(section.container.steps ?? []).map((s) => ({ label: s.title }))"
              :current="stepIndexOf(section)"
              clickable
              @step-click="(i: number) => (stepStates[section.container!.id ?? ''] = i)"
            />
            <div class="fb-fields">
              <FieldList
                :fields="fieldsInStep(section, stepIndexOf(section))"
                :section="section"
                :form-data="formData"
                :errors="errors"
                :disabled="disabled || effectiveReadonly"
                :get-options="getFieldOptions"
                @update:field="onFieldUpdate"
                @change="(f: FormField) => handleFieldChange(f, 'change')"
              />
            </div>
          </Card>

          <!-- card / grid / flex / 普通分组：原卡片 + 网格/横排渲染 -->
          <Card v-else class="fb-group-card" :title="section.title || undefined" :no-body-padding="false">
            <div
              class="fb-fields"
              :class="{ 'fb-grid': section.isGrid, 'fb-flex': section.container?.type === 'flex' }"
              :style="
                section.isGrid
                  ? { '--fb-cols': Math.max(1, section.columns) }
                  : section.container?.type === 'flex'
                    ? flexStyle(section.container)
                    : {}
              "
            >
              <FieldList
                :fields="section.fields"
                :section="section"
                :form-data="formData"
                :errors="errors"
                :disabled="disabled || effectiveReadonly"
                :get-options="getFieldOptions"
                @update:field="onFieldUpdate"
                @change="(f: FormField) => handleFieldChange(f, 'change')"
              />
            </div>
          </Card>
        </template>
      </template>

      <!-- steps 模式：渲染当前步骤字段 -->
      <template v-else>
        <div class="fb-fields fb-fields-step">
          <div v-for="field in renderFields" :key="field.key" class="fb-field">
            <FormRenderer
              v-model="formData[field.key]"
              :field="field"
              :error="errors[field.key]"
              :disabled="disabled || field.disabled || readonly"
              :dynamic-options="getFieldOptions(field)"
              @change="handleFieldChange(field, 'change')"
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
              <div class="fb-step-progress-bar" :style="{ width: ((currentStep + 1) / totalSteps) * 100 + '%' }" />
            </div>
            <span class="fb-step-text">
              <span class="fb-step-current">{{ currentStep + 1 }}</span>
              <span class="fb-step-sep">/</span>
              <span class="fb-step-total">{{ totalSteps }}</span>
              <span v-if="normalized.steps?.[currentStep]?.title" class="fb-step-title">{{
                normalized.steps[currentStep].title
              }}</span>
              <span v-if="stepCompletion[currentStep]" class="fb-step-completion">
                ({{ stepCompletion[currentStep].filled }}/{{ stepCompletion[currentStep].total }})
              </span>
            </span>
          </div>
          <Button v-if="currentStep > 0" variant="outline" @click="prevStep">
            {{ t('formBuilder.prevStep') }}
          </Button>
          <Button v-if="!isLastStep" variant="primary" @click="nextStep">
            {{ t('formBuilder.nextStep') }}
          </Button>
          <Button v-if="isLastStep" variant="primary" :loading="submitting" :disabled="disabled" type="submit">
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

<style scoped src="./FormBuilder.css"></style>
