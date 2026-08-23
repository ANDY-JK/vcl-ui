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
 */

import { computed, ref } from 'vue'
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import Group from '@/components/form/Group.vue'
import Upload from '@/components/form/Upload.vue'
import CameraCapture from '@/components/form/CameraCapture.vue'
import Divider from '@/components/data/Divider.vue'
import FieldError from './FieldError.vue'
import { getComponentCategory, isLayoutField, getComponentType } from './fieldRegistry'
import type { FormField } from './types'
import type { Option } from '@/components/shared/types'
import type { UploadFile } from '@/components/form/Upload.vue'

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
// v3 高级字段渲染辅助
// ════════════════════════════════════════

/** 子表单解析列定义 */
const subformCols = computed(() => {
  const raw = (props.field.props?.subformColumns as string) ?? ''
  return raw.split('\n').filter(Boolean).map(line => {
    const [label, key, type] = line.split('|')
    return { label: label?.trim() || '列', key: key?.trim() || 'col', type: type?.trim() || 'text' }
  })
})

/** 子表单行数据 */
const subformRows = computed(() => {
  const val = props.modelValue
  if (Array.isArray(val)) return val as Record<string, unknown>[]
  return []
})

/** 矩阵行标题 */
const matrixRows = computed(() => {
  const raw = (props.field.props?.matrixRows as string) ?? ''
  return raw.split('\n').filter(Boolean)
})

/** 矩阵列标题 */
const matrixCols = computed(() => {
  const raw = (props.field.props?.matrixCols as string) ?? ''
  return raw.split('\n').filter(Boolean)
})

/** 证件类型列表 */
const idcardTypes = computed(() => {
  const raw = (props.field.props?.idcardTypes as string) ?? '身份证'
  return raw.split('\n').filter(Boolean)
})

/** 证件当前类型索引 */
const idcardTypeIndex = ref(0)

/** 地址省市数据 */
const addressProvinces = ['北京市', '上海市', '广东省', '浙江省', '江苏省', '山东省', '四川省', '湖北省', '湖南省', '福建省']
const addressCities: Record<string, string[]> = {
  '北京市': ['东城区', '西城区', '朝阳区', '海淀区'],
  '上海市': ['黄浦区', '徐汇区', '长宁区', '浦东新区'],
  '广东省': ['广州市', '深圳市', '东莞市', '佛山市'],
  '浙江省': ['杭州市', '宁波市', '温州市', '绍兴市'],
}
const addressCitiesForProvince = computed(() => addressCities[addressProvince.value] ?? [])
const addressProvince = ref('')
const addressCity = ref('')
const addressDistrict = ref('')
const addressDetailText = ref('')

/** 签名 canvas ref */
const signatureCanvasRef = ref<HTMLCanvasElement>()
let signatureDrawing = false

function startSignature(e: PointerEvent): void {
  signatureDrawing = true
  const canvas = signatureCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.strokeStyle = '#1e293b'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  const rect = canvas.getBoundingClientRect()
  ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
}

function drawSignature(e: PointerEvent): void {
  if (!signatureDrawing) return
  const canvas = signatureCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const rect = canvas.getBoundingClientRect()
  ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
  ctx.stroke()
}

function endSignature(): void {
  signatureDrawing = false
}

function clearSignature(): void {
  const canvas = signatureCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

/** 富文本编辑器 ref */
const richtextContent = computed({
  get: () => (props.modelValue as string) ?? '',
  set: (v: string) => emit('update:modelValue', v),
})
const richtextExec = ref(false)

function execRichtext(cmd: string, val?: string): void {
  document.execCommand(cmd, false, val)
  richtextExec.value = !richtextExec.value
  // 手动 emit
  const el = document.querySelector('[data-richtext-editor]') as HTMLElement
  if (el) emit('update:modelValue', el.innerHTML)
}

/** 流水号显示值 */
const serialValue = computed(() => {
  const prefix = (props.field.props?.serialPrefix as string) ?? ''
  const fmt = (props.field.props?.serialDateFormat as string) ?? 'YYYYMMDD'
  const now = new Date()
  const dateStr = fmt
    .replace('YYYY', String(now.getFullYear()))
    .replace('MM', String(now.getMonth() + 1).padStart(2, '0'))
    .replace('DD', String(now.getDate()).padStart(2, '0'))
  const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return `${prefix}${dateStr}${seq}`
})

/** 更新子表单单元格值 */
function updateSubformCell(rowIndex: number, colKey: string, value: unknown): void {
  const rows = [...subformRows.value]
  if (!rows[rowIndex]) rows[rowIndex] = {}
  rows[rowIndex] = { ...rows[rowIndex], [colKey]: value }
  emit('update:modelValue', rows)
}

/** 关联选择显示值 */
const relateDisplayText = computed(() => {
  const v = props.modelValue
  if (!v) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v !== null) return (v as Record<string, unknown>).name as string ?? ''
  return String(v)
})

// ════════════════════════════════════════
// 透传 props
// ════════════════════════════════════════

/** 字段的 props 透传（field.props 中的属性直接展开到组件上） */
const extraProps = computed(() => props.field.props ?? {})

/** Input 组件 props */
const inputProps = computed(() => ({
  type: resolvedComponentType.value as 'text' | 'textarea' | 'number' | 'password' | 'tel' | 'email' | 'url' | 'search',
  label: props.field.label,
  placeholder: props.field.placeholder,
  hint: props.field.hint,
  disabled: props.field.disabled,
  readonly: props.field.readonly,
  rules: (props.field.rules ?? []) as ((v: string) => string | undefined)[],
  required: props.field.required,
  ...extraProps.value,
}))

/** 字段实际选项（动态优先，回退到 field.options） */
const resolvedOptions = computed<Option[]>(() => {
  return props.dynamicOptions ?? props.field.options ?? []
})

/** Select 组件 props */
const selectProps = computed(() => ({
  type: resolvedComponentType.value as 'select' | 'combobox' | 'cascader' | 'tree-select' | 'date' | 'date-range' | 'time',
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
  ...extraProps.value,
}))

/** Upload 组件 props */
const uploadProps = computed(() => ({
  accept: props.field.type === 'image-upload' ? 'image/*' : undefined,
  label: props.field.label,
  disabled: props.field.disabled,
  ...extraProps.value,
}))
</script>

<template>
  <div class="fb-renderer">
    <!-- ═══ 纯布局元素 ═══ -->
    <template v-if="isLayout">
      <Divider v-if="field.type === 'divider'" />
      <h4 v-else-if="field.type === 'title'" class="fb-title">
        {{ field.label }}
      </h4>
    </template>

    <!-- ═══ Input 系列 ═══ -->
    <template v-else-if="category === 'input'">
      <Input
        v-model="inputValue"
        v-bind="inputProps"
      />
      <FieldError :message="error ?? ''" />
    </template>

    <!-- ═══ Select 系列 ═══ -->
    <template v-else-if="category === 'select'">
      <Select
        v-model="inputValue"
        v-bind="selectProps"
      />
      <FieldError :message="error ?? ''" />
    </template>

    <!-- ═══ Group 系列 ═══ -->
    <template v-else-if="category === 'group'">
      <div class="fb-group-field">
        <label v-if="field.label" class="fb-group-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <Group
          v-model="groupValue"
          v-bind="groupProps"
        />
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
        <Upload
          v-model="uploadValue"
          v-bind="uploadProps"
        />
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

    <!-- ═══ v3 高级字段 ═══ -->
    <template v-else-if="category === 'advanced'">
      <!-- 子表单 -->
      <div v-if="field.type === 'subform'" class="fb-advanced-field">
        <label v-if="field.label" class="fb-adv-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <div class="fb-subform">
          <div class="fb-subform-head">
            <span class="fb-subform-title">{{ subformCols.length }} 列 · {{ subformRows.length }} 行</span>
            <button class="fb-subform-add" type="button" @click="emit('update:modelValue', [...subformRows, {}])">
              + 添加行
            </button>
          </div>
          <div v-if="subformRows.length" class="fb-subform-rows">
            <div v-for="(row, ri) in subformRows" :key="ri" class="fb-subform-row">
              <div v-for="col in subformCols" :key="col.key" class="fb-subform-cell">
                <input
                  class="fb-subform-input"
                  :value="row[col.key] ?? ''"
                  :placeholder="col.label"
                  @input="updateSubformCell(ri, col.key, ($event.target as HTMLInputElement).value)"
                >
              </div>
              <button class="fb-subform-del" type="button" @click="emit('update:modelValue', subformRows.filter((_, i) => i !== ri))">
                ×
              </button>
            </div>
          </div>
          <div v-else class="fb-subform-empty">暂无数据，点击「添加行」</div>
        </div>
        <FieldError :message="error ?? ''" />
      </div>

      <!-- 关联选择 -->
      <div v-else-if="field.type === 'relate'" class="fb-advanced-field">
        <label v-if="field.label" class="fb-adv-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <div class="fb-relate" @click="emit('update:modelValue', { id: 1, name: '示例数据' })">
          <span :class="{ 'fb-relate-placeholder': !relateDisplayText }">
            {{ relateDisplayText || field.placeholder || '点击选择关联数据' }}
          </span>
          <svg class="fb-relate-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </div>
        <FieldError :message="error ?? ''" />
      </div>

      <!-- 富文本 -->
      <div v-else-if="field.type === 'richtext'" class="fb-advanced-field">
        <label v-if="field.label" class="fb-adv-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <div class="fb-richtext">
          <div class="fb-richtext-toolbar">
            <button type="button" @click="execRichtext('bold')"><b>B</b></button>
            <button type="button" @click="execRichtext('italic')"><i>I</i></button>
            <button type="button" @click="execRichtext('underline')"><u>U</u></button>
            <span class="fb-rt-sep" />
            <button type="button" @click="execRichtext('insertUnorderedList')">•</button>
            <button type="button" @click="execRichtext('insertOrderedList')">1.</button>
            <span class="fb-rt-sep" />
            <button type="button" @click="execRichtext('formatBlock', '<h4>')">H</button>
            <button type="button" @click="execRichtext('formatBlock', '<p>')">P</button>
          </div>
          <div
            class="fb-richtext-body"
            data-richtext-editor
            contenteditable="true"
            v-html="richtextContent"
            @input="emit('update:modelValue', ($event.target as HTMLElement).innerHTML)"
          />
        </div>
        <FieldError :message="error ?? ''" />
      </div>

      <!-- 电子签名 -->
      <div v-else-if="field.type === 'signature'" class="fb-advanced-field">
        <label v-if="field.label" class="fb-adv-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <div class="fb-signature-wrap">
          <canvas
            ref="signatureCanvasRef"
            class="fb-signature-canvas"
            width="400"
            height="120"
            @pointerdown="startSignature"
            @pointermove="drawSignature"
            @pointerup="endSignature"
            @pointerleave="endSignature"
          />
          <button class="fb-signature-clear" type="button" @click="clearSignature">清除</button>
        </div>
        <FieldError :message="error ?? ''" />
      </div>

      <!-- 地址选择 -->
      <div v-else-if="field.type === 'address'" class="fb-advanced-field">
        <label v-if="field.label" class="fb-adv-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <div class="fb-address">
          <select v-model="addressProvince" class="fb-address-select" @change="emit('update:modelValue', addressProvince + addressCity + addressDistrict + addressDetailText)">
            <option value="">选择省/直辖市</option>
            <option v-for="p in addressProvinces" :key="p" :value="p">{{ p }}</option>
          </select>
          <select v-model="addressCity" class="fb-address-select" @change="emit('update:modelValue', addressProvince + addressCity + addressDistrict + addressDetailText)">
            <option value="">选择市</option>
            <option v-for="c in addressCitiesForProvince" :key="c" :value="c">{{ c }}</option>
          </select>
          <input
            v-model="addressDistrict"
            class="fb-address-input"
            placeholder="区/县"
            @input="emit('update:modelValue', addressProvince + addressCity + addressDistrict + addressDetailText)"
          >
          <input
            v-if="field.props?.addressDetail"
            v-model="addressDetailText"
            class="fb-address-input fb-address-detail"
            placeholder="详细地址"
            @input="emit('update:modelValue', addressProvince + addressCity + addressDistrict + addressDetailText)"
          >
        </div>
        <FieldError :message="error ?? ''" />
      </div>

      <!-- 证件号码 -->
      <div v-else-if="field.type === 'idcard'" class="fb-advanced-field">
        <label v-if="field.label" class="fb-adv-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <div class="fb-idcard">
          <select
            v-model="idcardTypeIndex"
            class="fb-idcard-type"
          >
            <option v-for="(t, i) in idcardTypes" :key="i" :value="i">{{ t }}</option>
          </select>
          <input
            class="fb-idcard-input"
            :value="modelValue as string ?? ''"
            :placeholder="idcardTypes[idcardTypeIndex] || '证件号码'"
            @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
          >
        </div>
        <FieldError :message="error ?? ''" />
      </div>

      <!-- 评分矩阵 -->
      <div v-else-if="field.type === 'matrix'" class="fb-advanced-field">
        <label v-if="field.label" class="fb-adv-label">
          {{ field.label }}
          <span v-if="field.required" class="fb-required">*</span>
        </label>
        <div v-if="matrixRows.length && matrixCols.length" class="fb-matrix">
          <div class="fb-matrix-head">
            <div class="fb-matrix-cell fb-matrix-first">·</div>
            <div v-for="col in matrixCols" :key="col" class="fb-matrix-cell">{{ col }}</div>
          </div>
          <div v-for="(row, ri) in matrixRows" :key="ri" class="fb-matrix-row">
            <div class="fb-matrix-cell fb-matrix-first">{{ row }}</div>
            <div v-for="col in matrixCols" :key="col" class="fb-matrix-cell">
              <input
                type="radio"
                :name="`matrix-${field.key}-${ri}`"
                :value="col"
                @change="emit('update:modelValue', { ...((modelValue as Record<string, string>) ?? {}), [row]: col })"
              >
            </div>
          </div>
        </div>
        <div v-else class="fb-matrix-empty">请配置行/列标题</div>
        <FieldError :message="error ?? ''" />
      </div>

      <!-- 流水号 -->
      <div v-else-if="field.type === 'serial'" class="fb-advanced-field">
        <label v-if="field.label" class="fb-adv-label">
          {{ field.label }}
        </label>
        <div class="fb-serial">
          <span class="fb-serial-value">{{ serialValue }}</span>
          <span class="fb-serial-hint">自动生成</span>
        </div>
        <FieldError :message="error ?? ''" />
      </div>

      <!-- 未知高级字段 fallback -->
      <div v-else class="fb-advanced-field">
        <label v-if="field.label" class="fb-adv-label">{{ field.label }}</label>
        <Input
          v-model="inputValue"
          v-bind="inputProps"
        />
        <FieldError :message="error ?? ''" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.fb-renderer {
  width: 100%;
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

/* ═══ v3 高级字段样式 ═══ */
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

/* 子表单 */
.fb-subform {
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  overflow: hidden;
}
.fb-subform-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--color-bg-alt, #f8fafc);
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
}
.fb-subform-add {
  font-size: 11px;
  color: var(--color-primary, #3b82f6);
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-bg, #fff);
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.fb-subform-add:hover {
  background: #eef1ff;
  border-color: var(--color-primary, #3b82f6);
}
.fb-subform-rows {
  display: flex;
  flex-direction: column;
}
.fb-subform-row {
  display: flex;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
  align-items: center;
}
.fb-subform-row:last-child {
  border-bottom: none;
}
.fb-subform-cell {
  flex: 1;
  min-width: 0;
}
.fb-subform-input {
  width: 100%;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 4px;
  padding: 5px 8px;
  font-size: 12px;
  background: var(--color-bg, #fff);
  color: var(--color-text, #1e293b);
  outline: none;
}
.fb-subform-input:focus {
  border-color: var(--color-primary, #3b82f6);
}
.fb-subform-del {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-muted, #94a3b8);
  cursor: pointer;
  font-size: 14px;
}
.fb-subform-del:hover {
  background: #fef2f2;
  color: var(--color-danger, #ef4444);
}
.fb-subform-empty {
  padding: 16px 10px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
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

/* 富文本 */
.fb-richtext {
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  overflow: hidden;
}
.fb-richtext-toolbar {
  display: flex;
  gap: 2px;
  padding: 4px 6px;
  background: var(--color-bg-alt, #f8fafc);
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
  flex-wrap: wrap;
}
.fb-richtext-toolbar button {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--color-text-muted, #64748b);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}
.fb-richtext-toolbar button:hover {
  background: var(--color-bg-soft, #f1f5f9);
  color: var(--color-text, #1e293b);
}
.fb-rt-sep {
  width: 1px;
  height: 16px;
  background: var(--color-border, #e2e8f0);
  margin: 0 2px;
}
.fb-richtext-body {
  padding: 8px 12px;
  min-height: 50px;
  font-size: 13px;
  color: var(--color-text, #1e293b);
  outline: none;
}
.fb-richtext-body:empty::before {
  content: '输入内容...';
  color: var(--color-text-muted, #94a3b8);
}

/* 电子签名 */
.fb-signature-wrap {
  position: relative;
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: 6px;
  min-height: 80px;
  background: var(--color-bg-alt, #f8fafc);
}
.fb-signature-canvas {
  display: block;
  width: 100%;
  height: 120px;
  cursor: crosshair;
}
.fb-signature-clear {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 2px 10px;
  border: none;
  border-radius: 4px;
  background: var(--color-bg, #fff);
  color: var(--color-text-muted, #64748b);
  font-size: 11px;
  cursor: pointer;
}
.fb-signature-clear:hover {
  color: var(--color-danger, #ef4444);
}

/* 地址选择 */
.fb-address {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fb-address-select,
.fb-address-input {
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 13px;
  background: var(--color-bg, #fff);
  color: var(--color-text, #1e293b);
  outline: none;
}
.fb-address-select:focus,
.fb-address-input:focus {
  border-color: var(--color-primary, #3b82f6);
}

/* 证件号码 */
.fb-idcard {
  display: flex;
  gap: 6px;
}
.fb-idcard-type {
  width: 110px;
  flex-shrink: 0;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 13px;
  background: var(--color-bg, #fff);
  color: var(--color-text, #1e293b);
  outline: none;
}
.fb-idcard-input {
  flex: 1;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 13px;
  background: var(--color-bg, #fff);
  color: var(--color-text, #1e293b);
  outline: none;
}
.fb-idcard-input:focus {
  border-color: var(--color-primary, #3b82f6);
}

/* 评分矩阵 */
.fb-matrix {
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  overflow: hidden;
}
.fb-matrix-head,
.fb-matrix-row {
  display: flex;
}
.fb-matrix-head {
  background: var(--color-bg-alt, #f8fafc);
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
}
.fb-matrix-row:not(:last-child) {
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
}
.fb-matrix-cell {
  flex: 1;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted, #64748b);
}
.fb-matrix-first {
  flex: 1.5;
  justify-content: flex-start;
  color: var(--color-text, #1e293b);
}
.fb-matrix-cell input[type="radio"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
.fb-matrix-empty {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: 6px;
}

/* 流水号 */
.fb-serial {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  background: var(--color-bg-alt, #f8fafc);
}
.fb-serial-value {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-primary, #3b82f6);
  font-family: 'Cascadia Code', 'Fira Code', monospace;
}
.fb-serial-hint {
  font-size: 11px;
  color: var(--color-text-muted, #94a3b8);
}
</style>
