/**
 * 表单校验引擎 composable
 *
 * 职责：
 * 1. 按 Schema 的 required + rules 校验全部字段
 * 2. 单字段实时校验（validateOnChange 模式）
 * 3. 提交时全量校验，返回首个错误字段
 *
 * 校验规则签名与 Input 组件一致：(v: string) => string | undefined
 * 返回非空字符串 = 错误信息；返回 undefined = 通过
 */

import { ref, type Ref } from 'vue'
import type { FormSchema, FormField, FormData, FormErrors } from './types'
import { isLayoutField, isFieldVisible } from './useFormSchema'
import { useT } from '@/components/_internal/i18n'
import { isValidPhone, isValidEmail, isValidIdCard, isValidUrl } from '@/components/_internal/utils'

const t = useT()

// ════════════════════════════════════════
// 值提取与空值判断
// ════════════════════════════════════════

/** 将字段值转为 string 供规则校验（规则签名是 (v: string) => ...） */
function valueToString(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.length > 0 ? String(v) : ''
  // 对象（不应出现在表单字段中）
  try {
    return JSON.stringify(v)
  } catch {
    return ''
  }
}

/** 判断字段值是否为空（required 校验用） */
function isEmptyValue(_field: FormField, v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  if (typeof v === 'number') return false // 0 是合法值
  if (typeof v === 'boolean') return false // false 是合法值
  if (Array.isArray(v)) return v.length === 0
  // 对象（matrix 评分映射等）：空对象视为空值（required 语义 = 至少选中一项）
  if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length === 0
  return false
}

/** 去除 HTML 标签与实体，得到纯文本（richtext 字符数校验用） */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/**
 * 高级字段专项校验（P1-7）
 *
 * 通过 field.props 承载配置，与通用 rules 并行：
 * - richtext:  props.richtextMinChars → 去标签后字符数下限
 * - matrix:    props.matrixMinRows → 已评分行数下限
 * - signature: props.signatureRequired → 必须已签名（dataURL 非空）
 * - serial:    只读流水号，挂载时自动生成，不参与必填校验
 */
function validateAdvanced(field: FormField, value: unknown): string {
  switch (field.type) {
    case 'richtext': {
      const min = Number(field.props?.richtextMinChars ?? 0)
      if (min > 0) {
        const text = htmlToPlainText(typeof value === 'string' ? value : '')
        if (text.trim().length < min) return t('formBuilder.richtextMinChars', { len: min })
      }
      break
    }
    case 'matrix': {
      const min = Number(field.props?.matrixMinRows ?? 0)
      if (min > 0) {
        const rows = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
        if (Object.keys(rows).length < min) return t('formBuilder.matrixMinRows', { n: min })
      }
      break
    }
    case 'signature': {
      if (field.props?.signatureRequired && isEmptyValue(field, value)) {
        return t('formBuilder.signatureRequired')
      }
      break
    }
    default:
      break
  }
  return ''
}

// ════════════════════════════════════════
// 单字段校验
// ════════════════════════════════════════

/** 可见性判定签名：默认仅按 visibleWhen；FormBuilder 会传入联动感知版本（showHide/事件隐藏） */
export type FieldVisibleFn = (field: FormField, data: FormData) => boolean

/**
 * 校验单个字段
 *
 * 优先级：required 空值检查 → rules 规则数组
 * 不可见字段跳过校验（hidden = valid）
 *
 * @param requiredOnly 仅校验必填（跳过 rules），用于步骤间快速校验
 * @param isVisible 可见性判定（默认 isFieldVisible；联动场景传 isFieldVisibleWithLinkage）
 * @returns 错误信息（空字符串 = 通过）
 */
export function validateField(
  field: FormField,
  value: unknown,
  data: FormData,
  requiredOnly = false,
  isVisible: FieldVisibleFn = isFieldVisible,
): string {
  // 纯布局字段不参与校验
  if (isLayoutField(field.type)) return ''

  // 不可见字段跳过
  if (!isVisible(field, data)) return ''

  // serial 流水号只读自动生成：挂载时回写，不参与必填校验（required 标记不拦截提交）
  if (field.type === 'serial') return ''

  // required 空值检查
  if (field.required && isEmptyValue(field, value)) {
    return t('formBuilder.fieldRequired', { label: field.label })
  }

  // richtext required：仅含标签无文本（如 <p><br></p>）视为空值
  if (field.required && field.type === 'richtext') {
    const text = htmlToPlainText(typeof value === 'string' ? value : '')
    if (text.trim() === '') return t('formBuilder.fieldRequired', { label: field.label })
  }

  // requiredOnly 模式跳过 rules 与专项校验
  if (requiredOnly) return ''

  // 高级字段专项校验（richtext 最小字数 / matrix 必填行数 / signature 必签）
  const advErr = validateAdvanced(field, value)
  if (advErr) return advErr

  // rules 规则数组（支持简单签名和上下文签名两种）
  if (field.rules && field.rules.length > 0) {
    const rawVal = value // 原始值（供上下文签名用）
    const strVal = valueToString(value) // 字符串值（供简单签名用）
    for (const rule of field.rules) {
      // 上下文签名：(v: unknown, data: FormData) => string | undefined
      // 简单签名：(v: string) => string | undefined
      // 用函数.length 判断：>=2 的传入上下文
      const err =
        rule.length >= 2
          ? (rule as (v: unknown, data: FormData) => string | undefined)(rawVal, data)
          : (rule as (v: string) => string | undefined)(strVal)
      if (err) return err
    }
  }

  return ''
}

// ════════════════════════════════════════
// 全量校验
// ════════════════════════════════════════

/**
 * 校验全部字段
 *
 * @param requiredOnly 仅校验必填（跳过 rules），用于步骤间快速校验
 * @returns { errors, isValid, firstErrorKey }
 */
export function validateAll(
  fields: FormField[],
  data: FormData,
  requiredOnly = false,
  isVisible: FieldVisibleFn = isFieldVisible,
): { errors: FormErrors; isValid: boolean; firstErrorKey: string | null } {
  const errors: FormErrors = {}
  let firstErrorKey: string | null = null

  for (const field of fields) {
    if (isLayoutField(field.type)) continue
    const err = validateField(field, data[field.key], data, requiredOnly, isVisible)
    if (err) {
      errors[field.key] = err
      if (firstErrorKey === null) firstErrorKey = field.key
    }
  }

  return { errors, isValid: Object.keys(errors).length === 0, firstErrorKey }
}

// ════════════════════════════════════════
// 预置校验规则工厂
// ════════════════════════════════════════

/**
 * 预置校验规则工厂函数
 *
 * 与 Input 组件的 rules 签名兼容：(v: string) => string | undefined
 */
export const validators = {
  /** 最小长度 */
  minLen(len: number, label = t('formBuilder.thisField')) {
    return (v: string) => (v.length < len ? t('formBuilder.minLen', { label, len }) : undefined)
  },
  /** 最大长度 */
  maxLen(len: number, label = t('formBuilder.thisField')) {
    return (v: string) => (v.length > len ? t('formBuilder.maxLen', { label, len }) : undefined)
  },
  /** 手机号格式 */
  phone() {
    return (v: string) => (v && !isValidPhone(v) ? t('formBuilder.phoneInvalid') : undefined)
  },
  /** 邮箱格式 */
  email() {
    return (v: string) => (v && !isValidEmail(v) ? t('formBuilder.emailInvalid') : undefined)
  },
  /** 身份证号 */
  idCard() {
    return (v: string) => (v && !isValidIdCard(v) ? t('formBuilder.idCardInvalid') : undefined)
  },
  /** URL 格式 */
  url() {
    return (v: string) => (v && !isValidUrl(v) ? t('formBuilder.urlInvalid') : undefined)
  },
  /** 正则匹配 */
  pattern(regex: RegExp, msg: string) {
    return (v: string) => (v && !regex.test(v) ? msg : undefined)
  },
  /** 自定义条件 */
  custom(fn: (v: string) => boolean, msg: string) {
    return (v: string) => (fn(v) ? undefined : msg)
  },
  /** 最小值（数字字段） */
  minVal(min: number, label = t('formBuilder.thisField')) {
    return (v: string) => {
      const n = Number(v)
      return v && !isNaN(n) && n < min ? t('formBuilder.minVal', { label, min }) : undefined
    }
  },
  /** 最大值（数字字段） */
  maxVal(max: number, label = t('formBuilder.thisField')) {
    return (v: string) => {
      const n = Number(v)
      return v && !isNaN(n) && n > max ? t('formBuilder.maxVal', { label, max }) : undefined
    }
  },
  /** 数值范围 */
  range(min: number, max: number, label = t('formBuilder.thisField')) {
    return (v: string) => {
      const n = Number(v)
      return v && !isNaN(n) && (n < min || n > max) ? t('formBuilder.rangeVal', { label, min, max }) : undefined
    }
  },
  /** 必选项（用于 checkbox/select 多选至少选 N 项） */
  minSelect(n: number, label = t('formBuilder.thisField')) {
    return (v: unknown) => {
      const count = Array.isArray(v) ? v.length : 0
      return count < n ? t('formBuilder.minSelect', { label, n }) : undefined
    }
  },
}

// ════════════════════════════════════════
// composable
// ════════════════════════════════════════

/**
 * 表单校验 composable
 *
 * 提供 errors 响应式状态 + validate / validateOne / clearErrors 方法
 */
export function useFormValidator(
  schemaRef: Ref<FormSchema>,
  dataRef: Ref<FormData>,
  options?: { isFieldVisible?: FieldVisibleFn },
) {
  const isVisible = options?.isFieldVisible ?? isFieldVisible
  const errors = ref<FormErrors>({})

  /** 校验单个字段并写入 errors */
  function validateOne(key: string): boolean {
    const schema = schemaRef.value
    const field = schema.fields.find((f) => f.key === key)
    if (!field) return true
    const err = validateField(field, dataRef.value[key], dataRef.value, false, isVisible)
    if (err) {
      errors.value[key] = err
    } else {
      delete errors.value[key]
      // 触发响应式更新
      errors.value = { ...errors.value }
    }
    return !err
  }

  /** 校验全部字段 */
  function validate(): boolean {
    const result = validateAll(schemaRef.value.fields, dataRef.value, false, isVisible)
    errors.value = result.errors
    return result.isValid
  }

  /** 清除全部错误 */
  function clearErrors(): void {
    errors.value = {}
  }

  /** 清除单个字段错误 */
  function clearError(key: string): void {
    if (errors.value[key]) {
      delete errors.value[key]
      errors.value = { ...errors.value }
    }
  }

  return {
    errors,
    validate,
    validateOne,
    clearErrors,
    clearError,
  }
}
