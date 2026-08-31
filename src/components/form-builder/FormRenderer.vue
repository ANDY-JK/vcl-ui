<script setup lang="ts">
/**
 * 字段渲染器 — 按 FieldType 映射到现有原子组件
 *
 * 不直接管理数据，所有 v-model 由 FormBuilder 通过 v-model 透传。
 * 职责：接收 field 定义 + 当前值，渲染正确的组件。
 *
 * 重构说明（v2）：
 * - 类型映射逻辑从三个硬编码 computed 提取到 fieldRegistry.ts 注册表
 * - 新增字段类型只需在 fieldRegistry.ts 注册，无需改动 FormRenderer
 *
 * v3 新增：
 * - advanced 分支：渲染 subform/relate/richtext/signature/address/idcard/matrix/serial
 *
 * v3.1 拆分（审计 §20，DataTable 拆分模式）：
 * - 7 个高级字段组件化外移到 renderer/（RendererRichtext/Signature/Subform/Matrix/Address/Idcard/Serial），
 *   逻辑与 scoped CSS 随块迁移，对外 props/emit 契约不变；本文件只保留分发、透传 props 与 styleConfig 落地
 */

import { computed } from 'vue'
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import Group from '@/components/form/Group.vue'
import Upload from '@/components/form/Upload.vue'
import CameraCapture from '@/components/form/CameraCapture.vue'
import Divider from '@/components/data/Divider.vue'
import FieldError from './FieldError.vue'
import RendererRichtext from './renderer/RendererRichtext.vue'
import RendererSignature from './renderer/RendererSignature.vue'
import RendererSubform from './renderer/RendererSubform.vue'
import RendererMatrix from './renderer/RendererMatrix.vue'
import RendererAddress from './renderer/RendererAddress.vue'
import RendererIdcard from './renderer/RendererIdcard.vue'
import RendererSerial from './renderer/RendererSerial.vue'
import { getComponentCategory, isLayoutField, getComponentType } from './fieldRegistry'
import { useT } from '@/components/_internal/i18n'
import type { FormField } from './types'
import type { Option } from '@/components/shared/types'
import type { UploadFile } from '@/components/form/Upload.vue'

const t = useT()

const props = defineProps<{
  /** 字段定义 */
  field: FormField
  /** 当前值 */
  modelValue: unknown
  /** 错误信息 */
  error?: string
  /** 动态选项（联动 / 远程加载的选项，优先于 field.options） */
  dynamicOptions?: Option[]
}>()

const emit = defineEmits<{
  'update:modelValue': [v: unknown]
  /** 值变化（透传原子组件 change，供 FormBuilder 执行事件动作） */
  change: []
}>()

// ════════════════════════════════════════
// 组件分类与类型查询（从注册表读取）
// ════════════════════════════════════════

const category = computed(() => getComponentCategory(props.field.type))
const isLayout = computed(() => isLayoutField(props.field.type))
const resolvedComponentType = computed(() => getComponentType(props.field.type))

// ════════════════════════════════════════
// 值绑定
// ════════════════════════════════════════

/** 输入值（Input/Select/Group 用 string | number | null） */
const inputValue = computed({
  get: () => props.modelValue as string | number | null,
  set: (v) => emit('update:modelValue', v),
})

/** Group 值（支持数组/布尔/数字） */
const groupValue = computed({
  get: () => props.modelValue as string | number | boolean | (string | number | boolean)[] | [number, number],
  set: (v) => emit('update:modelValue', v),
})

/** Upload 值（UploadFile[]） */
const uploadValue = computed({
  get: () => (props.modelValue as UploadFile[]) ?? [],
  set: (v) => emit('update:modelValue', v),
})

// ════════════════════════════════════════
// 透传 props
// ════════════════════════════════════════

/** 字段的 props 透传（field.props 中的属性直接展开到组件上） */
const extraProps = computed(() => props.field.props ?? {})

/** Input 组件 props */
const inputProps = computed(() => ({
  type: resolvedComponentType.value as
    'text' | 'textarea' | 'number' | 'password' | 'tel' | 'email' | 'url' | 'search' | 'color',
  label: props.field.label,
  placeholder: props.field.placeholder,
  hint: props.field.hint,
  disabled: props.field.disabled,
  readonly: props.field.readonly,
  rules: (props.field.rules ?? []) as ((v: string) => string | undefined)[],
  required: props.field.required,
  size: styleSize.value,
  ...extraProps.value,
}))

/** 字段实际选项（动态优先，回退到 field.options） */
const resolvedOptions = computed<Option[]>(() => {
  return props.dynamicOptions ?? props.field.options ?? []
})

/** Select 组件 props */
const selectProps = computed(() => ({
  type: resolvedComponentType.value as
    'select' | 'combobox' | 'cascader' | 'tree-select' | 'date' | 'date-range' | 'time',
  label: props.field.label,
  placeholder: props.field.placeholder,
  options: resolvedOptions.value,
  cascaderOptions: props.field.cascaderOptions ?? [],
  disabled: props.field.disabled,
  rules: (props.field.rules ?? []) as ((v: string) => string | undefined)[],
  ...extraProps.value,
}))

/** Group 组件 props */
const groupProps = computed(() => ({
  type: resolvedComponentType.value as 'radio' | 'checkbox' | 'switch' | 'rate' | 'slider',
  label: props.field.label,
  options: resolvedOptions.value,
  disabled: props.field.disabled,
  size: styleSize.value === 'lg' ? 'md' : styleSize.value,
  ...extraProps.value,
}))

/** relate 关联选择 props（复用 Select 组件，type 固定为 select） */
const relateProps = computed(() => ({
  type: 'select' as const,
  label: props.field.label,
  placeholder: props.field.placeholder ?? t('formBuilder.clickSelect'),
  options: resolvedOptions.value,
  disabled: props.field.disabled,
  ...extraProps.value,
}))

/** Upload 组件 props */
const uploadProps = computed(() => ({
  accept: props.field.type === 'image-upload' ? 'image/*' : undefined,
  label: props.field.label,
  disabled: props.field.disabled,
  ...extraProps.value,
}))

// ════════════════════════════════════════
// 样式配置（styleConfig）落地
// ════════════════════════════════════════

interface StyleConfig {
  labelWidth?: string
  labelPosition?: 'left' | 'top' | 'hidden'
  controlWidth?: string
  size?: 'small' | 'default' | 'large'
  radius?: 'default' | '0px' | '12px' | '20px'
  customClass?: string
  borderColor?: string
  focusBorderColor?: string
  customCss?: string
}

/** 字段样式配置（来自 field.props.styleConfig） */
const styleConfig = computed<StyleConfig>(() => {
  return (props.field.props?.styleConfig as StyleConfig) ?? {}
})

/** 原子组件尺寸映射：small→sm / default→md / large→lg */
const styleSize = computed<'sm' | 'md' | 'lg' | undefined>(() => {
  switch (styleConfig.value.size) {
    case 'small':
      return 'sm'
    case 'large':
      return 'lg'
    default:
      return 'md'
  }
})

/** 根容器 class（customClass） */
const styleClass = computed(() => styleConfig.value.customClass ?? '')

/** 根容器 style：圆角/边框色/控件宽度以 CSS 变量下发（变量经 CSS 继承穿透到 renderer/ 子组件） */
const styleVars = computed<Record<string, string>>(() => {
  const vars: Record<string, string> = {}
  const sc = styleConfig.value
  const radiusMap: Record<string, string> = { default: '6px', '0px': '0px', '12px': '12px', '20px': '20px' }
  if (sc.radius) vars['--fb-radius'] = radiusMap[sc.radius] ?? sc.radius
  if (sc.borderColor) vars['--fb-field-border'] = sc.borderColor
  if (sc.focusBorderColor) vars['--fb-field-focus-border'] = sc.focusBorderColor
  if (sc.controlWidth && sc.controlWidth !== '100%') vars['--fb-control-width'] = sc.controlWidth
  // 富文本空态占位文案（CSS content 无法直接接 t()，经 CSS 变量下发）
  vars['--fb-rt-placeholder'] = JSON.stringify(t('formBuilder.inputContent'))
  return vars
})

/** 标签位置（供高级字段 label 布局） */
const styleLabelPosition = computed(() => styleConfig.value.labelPosition ?? 'left')
</script>

<template>
  <div
    class="fb-renderer"
    :class="[styleClass, { 'fb-label-hidden': styleLabelPosition === 'hidden' }]"
    :style="styleVars"
  >
    <!-- ═══ 纯布局元素 ═══ -->
    <template v-if="isLayout">
      <Divider v-if="field.type === 'divider'" />
      <h4 v-else-if="field.type === 'title'" class="fb-title">
        {{ field.label }}
      </h4>
      <p v-else-if="field.type === 'paragraph'" class="fb-paragraph">{{ field.label }}</p>
    </template>

    <!-- ═══ Input 系列 ═══ -->
    <template v-else-if="category === 'input'">
      <Input v-model="inputValue" v-bind="inputProps" @change="emit('change')" />
      <FieldError :message="error ?? ''" />
    </template>

    <!-- ═══ Select 系列 ═══ -->
    <template v-else-if="category === 'select'">
      <Select v-model="inputValue" v-bind="selectProps" @change="emit('change')" />
      <FieldError :message="error ?? ''" />
    </template>

    <!-- ═══ Group 系列 ═══ -->
    <template v-else-if="category === 'group'">
      <div class="fb-group-field">
        <label v-if="field.label" class="fb-group-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <Group v-model="groupValue" v-bind="groupProps" @change="emit('change')" />
        <FieldError :message="error ?? ''" />
      </div>
    </template>

    <!-- ═══ Upload 系列 ═══ -->
    <template v-else-if="category === 'upload'">
      <div class="fb-upload-field">
        <label v-if="field.label" class="fb-upload-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <Upload v-model="uploadValue" v-bind="uploadProps" />
        <FieldError :message="error ?? ''" />
        <p v-if="field.hint" class="fb-hint">{{ field.hint }}</p>
      </div>
    </template>

    <!-- ═══ CameraCapture ═══ -->
    <template v-else-if="category === 'camera'">
      <div class="fb-camera-field">
        <label v-if="field.label" class="fb-camera-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <CameraCapture v-bind="extraProps" />
        <FieldError :message="error ?? ''" />
      </div>
    </template>

    <!-- ═══ v3 高级字段（7 件组件化于 renderer/，本层只做标签/错误位装配） ═══ -->
    <template v-else-if="category === 'advanced'">
      <!-- 子表单 -->
      <div v-if="field.type === 'subform'" class="fb-advanced-field">
        <label v-if="field.label" class="fb-adv-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <RendererSubform
          :field="field"
          :model-value="modelValue"
          @update:model-value="emit('update:modelValue', $event)"
        />
        <FieldError :message="error ?? ''" />
      </div>

      <!-- 关联选择 -->
      <div v-else-if="field.type === 'relate'" class="fb-advanced-field">
        <Select v-model="inputValue" v-bind="relateProps" />
        <FieldError :message="error ?? ''" />
      </div>

      <!-- 富文本 -->
      <div v-else-if="field.type === 'richtext'" class="fb-advanced-field">
        <label v-if="field.label" class="fb-adv-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <RendererRichtext
          :field="field"
          :model-value="modelValue"
          @update:model-value="emit('update:modelValue', $event)"
        />
        <FieldError :message="error ?? ''" />
      </div>

      <!-- 电子签名 -->
      <div v-else-if="field.type === 'signature'" class="fb-advanced-field">
        <label v-if="field.label" class="fb-adv-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <RendererSignature
          :field="field"
          :model-value="modelValue"
          @update:model-value="emit('update:modelValue', $event)"
        />
        <FieldError :message="error ?? ''" />
      </div>

      <!-- 地址选择 -->
      <div v-else-if="field.type === 'address'" class="fb-advanced-field">
        <label v-if="field.label" class="fb-adv-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <RendererAddress
          :field="field"
          :model-value="modelValue"
          @update:model-value="emit('update:modelValue', $event)"
        />
        <FieldError :message="error ?? ''" />
      </div>

      <!-- 证件号码 -->
      <div v-else-if="field.type === 'idcard'" class="fb-advanced-field">
        <label v-if="field.label" class="fb-adv-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <RendererIdcard
          :field="field"
          :model-value="modelValue"
          @update:model-value="emit('update:modelValue', $event)"
        />
        <FieldError :message="error ?? ''" />
      </div>

      <!-- 评分矩阵 -->
      <div v-else-if="field.type === 'matrix'" class="fb-advanced-field">
        <label v-if="field.label" class="fb-adv-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <RendererMatrix
          :field="field"
          :model-value="modelValue"
          @update:model-value="emit('update:modelValue', $event)"
        />
        <FieldError :message="error ?? ''" />
      </div>

      <!-- 流水号 -->
      <div v-else-if="field.type === 'serial'" class="fb-advanced-field">
        <label v-if="field.label" class="fb-adv-label">
          {{ field.label }}
        </label>
        <RendererSerial
          :field="field"
          :model-value="modelValue"
          @update:model-value="emit('update:modelValue', $event)"
        />
        <FieldError :message="error ?? ''" />
      </div>

      <!-- 未知高级字段 fallback -->
      <div v-else class="fb-advanced-field">
        <label v-if="field.label" class="fb-adv-label">{{ field.label }}</label>
        <Input v-model="inputValue" v-bind="inputProps" />
        <FieldError :message="error ?? ''" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.fb-renderer {
  width: 100%;
}

/* ── styleConfig 落地：CSS 变量定义（消费在原子组件与 renderer/ 子组件内，变量经 CSS 继承穿透） ── */
.fb-renderer {
  --fb-radius: 6px;
  --fb-field-border: var(--color-border, #e2e8f0);
  --fb-field-focus-border: var(--color-primary, #3b82f6);
  --fb-control-width: 100%;
}
/* 控件宽度（controlWidth）：作用于高级字段装配块 */
.fb-renderer .fb-advanced-field {
  width: var(--fb-control-width);
}
/* 标签隐藏（labelPosition=hidden） */
.fb-label-hidden :deep(label) {
  display: none;
}

/* 标题字段 */
.fb-title {
  margin: 0 0 12px;
  padding-bottom: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

/* 说明文字字段 */
.fb-paragraph {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-secondary, #64748b);
  white-space: pre-wrap;
  word-break: break-word;
}

/* Group 字段 */
.fb-group-field,
.fb-upload-field,
.fb-camera-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fb-group-label,
.fb-upload-label,
.fb-camera-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #64748b);
}
.fb-required {
  color: var(--color-danger, #ef4444);
  margin-left: 2px;
}

/* 提示文本 */
.fb-hint {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  line-height: 1.4;
}

/* ═══ v3 高级字段装配（控件样式随块迁移至 renderer/ 各组件） ═══ */
.fb-advanced-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fb-adv-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #64748b);
}

/* 关联选择 */
.fb-relate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--color-text-muted, #94a3b8);
  background: var(--color-bg, #fff);
  cursor: pointer;
  transition: border-color 0.15s;
}
.fb-relate:hover {
  border-color: var(--color-primary, #3b82f6);
}
.fb-relate-placeholder {
  color: var(--color-text-muted, #94a3b8);
}
.fb-relate-icon {
  width: 14px;
  height: 14px;
  color: var(--color-primary, #3b82f6);
  flex-shrink: 0;
}
</style>
