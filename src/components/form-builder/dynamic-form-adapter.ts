/**
 * DynamicForm 兼容适配 — 旧版 FieldConfig/DropZoneConfig 配置 → 新版 FormSchema
 *
 * 旧版 DynamicForm（vue通用组件/src/components/form/DynamicForm.vue）的驱动方式：
 * 传两个配置数组就渲染出整个动态表单，无任何页面代码——
 *   - fields: FieldConfig[]     → 输入框/选择/日期等控件
 *   - dropZones: DropZoneConfig[] → 上传区（按 folder 分组卡片）
 *
 * 本适配层让新版低代码沿用同一套「写配置就出表单」的简单模式：
 *   const schema = toDynamicFormSchema({ fields, uploads, title })
 *   <FormBuilder :schema="schema" />
 *
 * 映射：
 *   FieldConfig.key → key        name → label        type → type（新版类型兼容透传）
 *   defaultValue → default       options(string[]) → Option[]    viewOnly → readonly
 *   visibleWhen{field,value} → {field,equals}        group → group（分组卡片）
 *   DropZoneConfig → image-upload 字段，folder → group（上传分组卡片）
 */

import type { FormSchema, FormField, VisibleWhen, FieldType } from './types'
import type { Option } from '@/components/shared/types'

/** 旧版 FieldConfig 兼容子集（输入控件配置） */
export interface DynamicFieldConfig {
  key: string
  /** 字段标签（旧版 name） */
  label: string
  /** 控件类型（text/select/textarea/number/date/radio/switch/checkbox/rate/slider/cascader/tree-select/time/color…） */
  type: string
  required?: boolean
  /** 默认值（旧版 defaultValue） */
  default?: unknown
  /** 选项（string[] 或 Option[]，select/radio/checkbox 用） */
  options?: (string | Option)[]
  placeholder?: string
  /** 条件显隐（旧版 {field, value}） */
  visibleWhen?: { field: string; value: unknown }
  /** 只读（旧版 viewOnly） */
  readonly?: boolean
  /** 分组标题（同 group 渲染在一个卡片内） */
  group?: string
  /** 布局宽度（1-24，默认 24） */
  span?: number
  /** 字段提示 */
  hint?: string
  /** 类型特有属性透传 */
  props?: Record<string, unknown>
}

/** 旧版 DropZoneConfig 兼容子集（上传区配置） */
export interface DynamicUploadConfig {
  key: string
  label: string
  /** 分组（旧版 folder，同 folder 的上传区分组卡片） */
  group?: string
  /** 接受的文件类型，默认 image/* */
  accept?: string
  /** 是否允许多文件 */
  multiple?: boolean
  /** 最多文件数 */
  maxFiles?: number
}

/** 把旧版 FieldConfig → 新版 FormField */
function toFormField(f: DynamicFieldConfig): FormField {
  const field: FormField = {
    key: f.key,
    label: f.label,
    type: f.type as FieldType,
    required: f.required,
    default: f.default,
    placeholder: f.placeholder,
    readonly: f.readonly,
    group: f.group,
    // 默认 span 12（grid 布局下占半行，字段多列紧凑排布，对标旧版 auto-fill 栅格）；
    // 长内容字段整行
    span: f.span ?? (f.type === 'textarea' ? 24 : 12),
    hint: f.hint,
    props: f.props,
  }
  // options: string[] → Option[]（旧版字符串数组）
  if (Array.isArray(f.options)) {
    field.options = f.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
  }
  // visibleWhen: {field, value} → {field, equals}
  if (f.visibleWhen) {
    const vw: VisibleWhen = { field: f.visibleWhen.field, equals: f.visibleWhen.value }
    field.visibleWhen = vw
  }
  return field
}

/** 把旧版 DropZoneConfig → 新版 image-upload 字段 */
function toUploadField(u: DynamicUploadConfig): FormField {
  return {
    key: u.key,
    label: u.label,
    type: 'image-upload',
    group: u.group,
    span: 8,
    props: {
      variant: 'card',
      accept: u.accept ?? 'image/*',
      multiple: u.multiple ?? true,
      maxSize: 10,
      ...(u.maxFiles !== undefined ? { maxFiles: u.maxFiles } : {}),
      mobileMenu: true,
      compress: true,
    },
  }
}

export interface DynamicFormConfig {
  /** 表单标题 */
  title?: string
  /** 表单描述 */
  description?: string
  /** 输入控件配置（旧版 fields） */
  fields: DynamicFieldConfig[]
  /** 上传区配置（旧版 dropZones） */
  uploads?: DynamicUploadConfig[]
  /** 提交按钮文案 */
  submitText?: string
}

/**
 * 旧版 DynamicForm 配置 → 新版 FormSchema
 *
 * 用法：
 * ```ts
 * const schema = toDynamicFormSchema({
 *   title: '门店提报',
 *   fields: [{ key: 'name', label: '门店名称', type: 'text', required: true }, ...],
 *   uploads: [{ key: 'door', label: '门头照', group: '照片' }, ...],
 * })
 * // <FormBuilder :schema="schema" />
 * ```
 */
export function toDynamicFormSchema(cfg: DynamicFormConfig): FormSchema {
  const fields: FormField[] = cfg.fields.map(toFormField)
  for (const u of cfg.uploads ?? []) fields.push(toUploadField(u))
  return {
    title: cfg.title,
    description: cfg.description,
    submitText: cfg.submitText,
    // grid 布局：字段按 span 多列排布（对标旧版 auto-fill 栅格，不是一条一条单列）
    layout: 'grid',
    columns: 2,
    validateOnChange: true,
    fields,
  }
}
