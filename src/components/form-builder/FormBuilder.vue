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
import FieldList from './FieldList.vue'
import Button from '@/components/basic/Button.vue'
import Steps from '@/components/nav/Steps.vue'
import Tabs from '@/components/nav/Tabs.vue'
import Collapse from '@/components/data/Collapse.vue'
import Card from '@/components/data/Card.vue'
import Toast from '@/components/feedback/Toast.vue'
import type { FormSchema, FormData, FormField, FormErrors, RenderSection } from './types'

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

// ════════════════════════════════════════
// 校验
// ════════════════════════════════════════

const { errors, validate, validateOne, clearErrors } = useFormValidator(schemaRef, formData, {
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
/** 组件根节点（模板 ref，滚动定位限定在当前实例内） */
const rootEl = ref<HTMLElement | null>(null)

function handleSubmit(): void {
  // 全量校验
  const isValid = validate()
  emit('validate', isValid)

  if (!isValid) {
    toastRef.value?.show(t('formBuilder.requiredAll'), 'error', 2000)
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
  const submitData: FormData = {}
  for (const field of normalized.value.fields) {
    if (isLayoutField(field.type)) continue
    if (!isFieldVisibleWithLinkage(field, formData.value)) continue
    if (isHiddenByEvent(field.key)) continue
    submitData[field.key] = formData.value[field.key]
  }

  // 提交模式：unique 模式下若已提交过则拦截（防止重复提交）
  if (normalized.value.submitMode === 'unique' && hasSubmitted.value) {
    toastRef.value?.show(t('formBuilder.submitOnce'), 'warning', 2000)
    return
  }

  submitting.value = true
  emit('submit', submitData)

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
  }, 3000)
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
  hasSubmitted.value = false
  hiddenByEvent.value = new Set()
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

/** 事件动作隐藏的字段 key 集合（toggleVisible 用） */
const hiddenByEvent = ref<Set<string>>(new Set())

/** 字段是否被事件动作隐藏 */
function isHiddenByEvent(key: string): boolean {
  return hiddenByEvent.value.has(key)
}

/** FieldList 回写字段值 */
function onFieldUpdate(key: string, value: unknown): void {
  formData.value = { ...formData.value, [key]: value }
}

/**
 * 执行字段的事件动作（由 FormRenderer @change 触发）
 * 支持：setValue / toggleVisible / showTip / callApi / linkField（onChange）
 *       autoValidate / format / submit（onBlur）
 */
function handleFieldChange(field: FormField, trigger: 'change' | 'blur'): void {
  const evt = field.events?.[trigger === 'change' ? 'onChange' : 'onBlur']
  if (!evt?.action) return
  const target = evt.targetField

  switch (evt.action) {
    case 'setValue': {
      if (target) {
        // 把当前字段值同步给目标字段
        formData.value = { ...formData.value, [target]: formData.value[field.key] }
      }
      break
    }
    case 'toggleVisible': {
      if (target) {
        const next = new Set(hiddenByEvent.value)
        if (next.has(target)) next.delete(target)
        else next.add(target)
        hiddenByEvent.value = next
      }
      break
    }
    case 'showTip': {
      toastRef.value?.show(t('formBuilder.eventTip', { field: field.label }), 'info', 1500)
      break
    }
    case 'callApi': {
      const url = evt.apiUrl
      if (!url) {
        toastRef.value?.show(t('formBuilder.eventNoApi'), 'warning', 2000)
        break
      }
      // 后台调用接口，不阻塞交互；结果作为提示反馈
      const value = formData.value[field.key]
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: field.key, value }),
      })
        .then((resp) => {
          if (!resp.ok) throw new Error('HTTP ' + resp.status)
          return resp.json().catch(() => ({}))
        })
        .then(() => toastRef.value?.show(t('formBuilder.eventApiDone', { field: field.label }), 'success', 1500))
        .catch((err) =>
          toastRef.value?.show(
            t('formBuilder.eventApiFail', { field: field.label, err: String(err?.message ?? err) }),
            'error',
            2500,
          ),
        )
      break
    }
    case 'linkField': {
      // 联动字段：linkage 引擎已处理 followValue/showHide，这里无需额外动作
      break
    }
    case 'autoValidate': {
      validateOne(field.key)
      break
    }
    case 'format': {
      const v = formData.value[field.key]
      if (typeof v === 'string' && v !== v.trim()) {
        formData.value = { ...formData.value, [field.key]: v.trim() }
      }
      break
    }
    case 'submit': {
      handleSubmit()
      break
    }
  }
}

/** 可见字段列表（过滤 visibleWhen + 联动隐藏 + 事件隐藏） */
const visibleFields = computed(() => {
  return normalized.value.fields.filter((f) => {
    if (isHiddenByEvent(f.key)) return false
    return isFieldVisibleWithLinkage(f, formData.value)
  })
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

// ════════════════════════════════════════
// 容器交互渲染辅助（tabs/collapse/steps）
// ════════════════════════════════════════

/** tabs 容器：当前激活 tab 名 */
const tabStates = ref<Record<string, string>>({})
/** collapse 容器：展开状态（collapseIndex → bool） */
const collapseStates = ref<Record<string, boolean>>({})
/** steps 容器：当前步骤下标 */
const stepStates = ref<Record<string, number>>({})

/** 取 tabs 容器当前激活 tab 名（缺省第一个） */
function activeTabOf(section: RenderSection): string {
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

/** 是否显示底部操作按钮 */
const showActions = computed(() => !normalized.value.hideActions)

/** 是否是最后一步 */
const isLastStep = computed(() => currentStep.value === totalSteps.value - 1)

/** 每步的字段完成度（已填/总数） */
const stepCompletion = computed(() => {
  if (normalized.value.layout !== 'steps' || !normalized.value.steps) return []
  return normalized.value.steps.map((step) => {
    const fields = normalized.value.fields.filter(
      (f) => step.fields.includes(f.key) && isFieldVisibleWithLinkage(f, formData.value),
    )
    const filled = fields.filter((f) => {
      const v = formData.value[f.key]
      return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
    }).length
    return { filled, total: fields.length }
  })
})
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
                :disabled="disabled || readonly"
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
                :disabled="disabled || readonly"
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
                :disabled="disabled || readonly"
                :get-options="getFieldOptions"
                @update:field="onFieldUpdate"
                @change="(f: FormField) => handleFieldChange(f, 'change')"
              />
            </div>
          </Card>

          <!-- card / grid / 普通分组：原卡片 + 网格渲染 -->
          <Card v-else class="fb-group-card" :title="section.title || undefined" :no-body-padding="false">
            <div
              class="fb-fields"
              :class="{ 'fb-grid': section.isGrid }"
              :style="section.isGrid ? { '--fb-cols': Math.max(1, section.columns) } : {}"
            >
              <FieldList
                :fields="section.fields"
                :section="section"
                :form-data="formData"
                :errors="errors"
                :disabled="disabled || readonly"
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
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}
.fb-header-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
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
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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
