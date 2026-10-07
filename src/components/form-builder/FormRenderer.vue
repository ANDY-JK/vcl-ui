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

import { computed, ref } from 'vue'
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import Group from '@/components/form/Group.vue'
import Upload from '@/components/form/Upload.vue'
import CameraCapture from '@/components/form/CameraCapture.vue'
import CodeCapture from '@/components/form/CodeCapture.vue'
import Button from '@/components/basic/Button.vue'
import IconSvg from '@/components/basic/IconSvg.vue'
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
  /** 表单级禁用（查看模式/只读表单：FormBuilder effectiveReadonly 传入，与字段级 field.disabled 合并） */
  disabled?: boolean
}>()

const emit = defineEmits<{
  /** v-model——受控值（渲染字段的当前数据） */
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

/** 输入值（Input/Select 用 string | number | null）
 *  modelValue 未赋值时必须落成 null：Input 的 modelValue 是非可选 prop，
 *  透传 undefined 会触发 Vue 的 Invalid prop 运行时告警（Select 已可选，不受影响） */
const inputValue = computed({
  get: () => (props.modelValue as string | number | null) ?? null,
  set: (v) => emit('update:modelValue', v),
})

/** Group 值（支持数组/布尔/数字）
 *  同 inputValue：Group 的 modelValue 非可选且不接受 null，空态落成 ''（各 type 内部均按 falsy 处理） */
const groupValue = computed({
  get: () => (props.modelValue ?? '') as string | number | boolean | (string | number | boolean)[] | [number, number],
  set: (v) => emit('update:modelValue', v),
})

/** Upload 值（UploadFile[]） */
const uploadValue = computed({
  get: () => (props.modelValue as UploadFile[]) ?? [],
  set: (v) => emit('update:modelValue', v),
})

/** CameraCapture 弹层开关（此前未接线，相机永远打不开） */
const cameraOpen = ref(false)
/** CodeCapture 弹层开关 + 已扫/已输码值（scan-code 字段） */
const scanOpen = ref(false)
const scanValue = computed(() => {
  const v = props.modelValue
  return v === null || v === undefined ? '' : String(v)
})
/** 扫码交付 → 写入 formData（字符串值，与 text 字段同构，校验/提交/回显一致） */
function onScanCode(code: string) {
  emit('update:modelValue', code)
  emit('change')
}

/** 清除扫码值：与扫码交付同发 change（事件联动/校验依赖 change，清除也应触发） */
function onScanClear() {
  emit('update:modelValue', '')
  emit('change')
}
/** Upload 文件增删 → 写值 + 发 change（Upload 组件无 change 事件，事件联动/校验依赖 change，在此补齐；
 *  camera 分支的 Upload 与 finish 路径共用本函数） */
function onUploadChange(files: UploadFile[]) {
  emit('update:modelValue', files)
  emit('change')
}

/** 拍照交付 → 转 UploadFile[] 写入 formData（与 Upload 字段同构，校验/提交/回显一致） */
function onCameraFinish(files: File[]) {
  const uploaded: UploadFile[] = files.map((f, i) => ({
    id: Date.now() + i,
    name: f.name || `photo-${i + 1}.jpg`,
    size: f.size,
    progress: 100,
    status: 'done',
    raw: f,
  }))
  const current = (props.modelValue as UploadFile[]) ?? []
  emit('update:modelValue', props.field.props?.multiple ? [...current, ...uploaded] : uploaded)
  emit('change')
}

/** 地址字段完整区划数据注入（field.props.addressData；内置仅演示子集） */
const addressDataProp = computed(
  () => props.field.props?.addressData as { provinces: string[]; cities: Record<string, string[]> } | undefined,
)

// ════════════════════════════════════════
// 透传 props
// ════════════════════════════════════════

/** 表单级禁用（查看模式只读等）与字段级 field.disabled 合并 */
const effectiveDisabled = computed(() => props.disabled || props.field.disabled)

/** 查看模式高级字段的值格式化（数组/对象/布尔统一转可读文本） */
function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return t('common.empty')
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'boolean') return v ? t('common.yes') : t('common.no')
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

/** 字段的 props 透传（field.props 中的属性直接展开到组件上） */
const extraProps = computed(() => props.field.props ?? {})

/** Input 组件 props */
const inputProps = computed(() => ({
  type: resolvedComponentType.value as
    'text' | 'textarea' | 'number' | 'password' | 'tel' | 'email' | 'url' | 'search' | 'color',
  label: props.field.label,
  placeholder: props.field.placeholder,
  hint: props.field.hint,
  disabled: effectiveDisabled.value,
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
  disabled: effectiveDisabled.value,
  rules: (props.field.rules ?? []) as ((v: string) => string | undefined)[],
  ...extraProps.value,
}))

/** Group 组件 props */
const groupProps = computed(() => ({
  type: resolvedComponentType.value as 'radio' | 'checkbox' | 'switch' | 'rate' | 'slider',
  label: props.field.label,
  options: resolvedOptions.value,
  disabled: effectiveDisabled.value,
  size: styleSize.value === 'lg' ? 'md' : styleSize.value,
  ...extraProps.value,
}))

/** relate 关联选择 props（复用 Select 组件，type 固定为 select） */
const relateProps = computed(() => ({
  type: 'select' as const,
  label: props.field.label,
  placeholder: props.field.placeholder ?? t('formBuilder.clickSelect'),
  options: resolvedOptions.value,
  disabled: effectiveDisabled.value,
  ...extraProps.value,
}))

/** Upload 组件 props */
const uploadProps = computed(() => ({
  accept: props.field.type === 'image-upload' ? 'image/*' : undefined,
  label: props.field.label,
  disabled: effectiveDisabled.value,
  ...extraProps.value,
}))

// ════════════════════════════════════════
// 样式配置（styleConfig）落地
// ════════════════════════════════════════

interface StyleConfig {
  labelPosition?: 'left' | 'top' | 'hidden'
  controlWidth?: string
  size?: 'small' | 'default' | 'large'
  radius?: 'default' | '0px' | '12px' | '20px'
  customClass?: string
  borderColor?: string
  focusBorderColor?: string
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
        <!-- switch 不渲染本层标题：Group 内部自带 switch-label 可见标签 + aria-label，
             叠加会双显同一文案（其余 radio/checkbox/rate 由 Group 内部 aria-label 供读屏） -->
        <label v-if="field.label && field.type !== 'switch'" class="fb-group-label">
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
        <Upload :model-value="uploadValue" v-bind="uploadProps" @update:model-value="onUploadChange" />
        <FieldError :message="error ?? ''" />
        <p v-if="field.hint" class="fb-hint">{{ field.hint }}</p>
      </div>
    </template>

    <!-- ═══ 扫码识别（自带兜底链：页面内 → 系统相机 → 上传识别 / 手工输入） ═══ -->
    <template v-else-if="field.type === 'scan-code'">
      <div class="fb-scancode-field">
        <label v-if="field.label" class="fb-scancode-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <!-- 有值：显示已扫/已输的码值 + 清除；无值：一个「扫码」按钮直接进自动链 -->
        <div v-if="scanValue" class="fb-scancode-value">
          <span class="fb-scancode-code">{{ scanValue }}</span>
          <button
            v-if="!effectiveDisabled"
            type="button"
            class="fb-scancode-clear"
            :aria-label="t('form.scanClear')"
            @click="onScanClear"
          >
            <IconSvg type="x" size="sm" />
          </button>
        </div>
        <Button
          v-else
          type="button"
          :text="t('form.scanCode')"
          icon="scan"
          :disabled="effectiveDisabled"
          class="fb-scancode-trigger"
          @click="scanOpen = true"
        />
        <CodeCapture
          v-model="scanOpen"
          :formats="(field.props?.scanFormats as 'all' | 'qr' | 'barcode') || 'all'"
          :prefix="field.props?.scanPrefix as string"
          :length="field.props?.scanLength as number"
          @scan="onScanCode"
        />
        <FieldError :message="error ?? ''" />
      </div>
    </template>

    <!-- ═══ CameraCapture ═══ -->
    <template v-else-if="category === 'camera'">
      <div class="fb-camera-field">
        <label v-if="field.label" class="fb-camera-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <Upload
          :model-value="uploadValue"
          variant="card"
          accept="image/*"
          :disabled="effectiveDisabled"
          @update:model-value="onUploadChange"
        />
        <Button
          type="button"
          :text="t('form.takePhoto')"
          icon="camera"
          :disabled="effectiveDisabled"
          class="fb-camera-trigger"
          @click="cameraOpen = true"
        />
        <CameraCapture
          v-model="cameraOpen"
          v-bind="extraProps"
          :multiple="Boolean(field.props?.multiple)"
          @finish="onCameraFinish"
        />
        <FieldError :message="error ?? ''" />
      </div>
    </template>

    <!-- ═══ v3 高级字段（7 件组件化于 renderer/，本层只做标签/错误位装配） ═══ -->
    <template v-else-if="category === 'advanced'">
      <!-- 查看模式（disabled）：高级字段显示只读值，不渲染可编辑控件 -->
      <div v-if="effectiveDisabled" class="fb-adv-readonly">
        <label v-if="field.label" class="fb-adv-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <span class="fb-adv-readonly-val">{{ formatValue(props.modelValue) }}</span>
      </div>

      <!-- 子表单 -->
      <div v-else-if="field.type === 'subform'" class="fb-advanced-field">
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

      <!-- 关联选择（透传 change：事件联动/实时校验依赖，此前漏挂致配在 relate 上的动作不执行） -->
      <div v-else-if="field.type === 'relate'" class="fb-advanced-field">
        <Select v-model="inputValue" v-bind="relateProps" @change="emit('change')" />
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
          :address-data="addressDataProp"
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

<style src="./form-renderer-scoped.css" scoped></style>
