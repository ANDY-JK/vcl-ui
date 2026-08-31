/**
 * Schema 解析与归一化 composable
 *
 * 职责：
 * 1. 合并用户 Schema 与默认值（layout/columns/submitText 等填充默认值）
 * 2. 从 fields 提取字段默认值，生成初始 form data
 * 3. 计算 visibleWhen 条件（单字段条件显示）
 * 4. 暴露 fieldRegistry 的查询函数（getComponentCategory/isLayoutField）
 *
 * 注意：类型 → 组件映射已迁移到 fieldRegistry.ts（单一数据源）
 */

import { computed, type Ref } from 'vue'
import type { FormSchema, FormField, FormData } from './types'
import { useT } from '@/components/_internal/i18n'
import { evaluateFormula } from './expression-evaluator'
// 从注册表重导出，保持向后兼容
export { getComponentCategory, isLayoutField } from './fieldRegistry'
export type { ComponentCategory } from './fieldRegistry'
import { isLayoutField, getComponentCategory } from './fieldRegistry'

/** 模块级 t：纯 .ts 文件，各函数直接用 */
const t = useT()

// ════════════════════════════════════════
// Schema 归一化
// ════════════════════════════════════════

/** Schema 版本常量 */
export const SCHEMA_VERSION = 2

/** 默认 Schema 配置（工厂形式：文案在调用时刻按当前语言翻译，避免模块求值早于 setLocale） */
function defaultSchema(): Partial<FormSchema> {
  return {
    schemaVersion: SCHEMA_VERSION,
    layout: 'single',
    columns: 2,
    submitText: t('common.submit'),
    resetText: t('common.reset'),
    hideActions: false,
    validateOnChange: false,
  }
}

/** 字段默认宽度（按布局模式） */
const DEFAULT_SPAN_SINGLE = 24
const DEFAULT_SPAN_GRID = 12 // 2 列 grid → 每列 12

/**
 * 归一化 Schema：合并默认值，填充缺失字段
 */
export function normalizeSchema(
  schema: FormSchema,
): Required<
  Pick<FormSchema, 'fields' | 'layout' | 'columns' | 'submitText' | 'resetText' | 'hideActions' | 'validateOnChange'>
> &
  Pick<
    FormSchema,
    | 'title'
    | 'description'
    | 'steps'
    | 'submitMode'
    | 'clearAfterSubmit'
    | 'labelPosition'
    | 'labelWidth'
    | 'submitConfig'
  > {
  const merged = { ...defaultSchema(), ...schema }
  // fields 确保非空数组
  if (!merged.fields || merged.fields.length === 0) {
    merged.fields = []
  }
  // steps 归一化：确保是数组、每项有 title 和 fields（字符串数组）
  if (merged.steps !== undefined) {
    if (!Array.isArray(merged.steps)) {
      merged.steps = []
    } else {
      merged.steps = merged.steps
        .filter((s) => s && typeof s === 'object')
        .map((s) => ({
          title: String(s.title ?? t('fbd.untitledStep')),
          fields: Array.isArray(s.fields) ? s.fields.map(String) : [],
        }))
      // 空步骤数组视为未设置
      if (merged.steps.length === 0) delete merged.steps
    }
  }
  return merged as Required<
    Pick<FormSchema, 'fields' | 'layout' | 'columns' | 'submitText' | 'resetText' | 'hideActions' | 'validateOnChange'>
  > &
    Pick<
      FormSchema,
      | 'title'
      | 'description'
      | 'steps'
      | 'submitMode'
      | 'clearAfterSubmit'
      | 'labelPosition'
      | 'labelWidth'
      | 'submitConfig'
    >
}

// ════════════════════════════════════════
// 默认值生成
// ════════════════════════════════════════

/** 按字段类型生成默认空值 */
function getEmptyValue(field: FormField): unknown {
  const { type } = field
  switch (type) {
    case 'checkbox':
      return []
    case 'upload':
    case 'image-upload':
      return []
    case 'switch':
      return false
    case 'rate':
      return 0
    case 'slider':
      return field.props?.min ?? 0
    case 'date-range':
      return ['', '']
    case 'radio':
      // Group 组件期望 String|Number|Boolean|Array，不能用 null
      return ''
    default:
      return null
  }
}

/**
 * 当前用户上下文（动态默认值 currentUser 用；宿主可注入真实用户信息）
 */
export interface UserContext {
  name?: string
  [key: string]: unknown
}

/**
 * 从 Schema 的 fields 提取默认值，生成初始 form data
 *
 * - 有 field.default（静态）用 default
 * - defaultMeta.currentTime → 当前时间字符串
 * - defaultMeta.currentUser → userContext.name（未注入时占位 'currentUser'）
 * - defaultMeta.formula → evaluateFormula（{{field}} 引用同表单字段）
 * - 无则用类型对应空值
 * - 纯布局字段（divider/title）不参与数据
 */
export function createInitialData(fields: FormField[], opts: { userContext?: UserContext } = {}): FormData {
  const data: FormData = {}
  const user = opts.userContext ?? {}

  for (const field of fields) {
    if (isLayoutField(field.type)) continue

    // 动态默认值优先（设计器 dataConfig.defaultType 映射而来）
    const dm = field.defaultMeta
    if (dm && field.default === undefined) {
      if (dm.type === 'currentTime') {
        data[field.key] = formatCurrentTime()
        continue
      }
      if (dm.type === 'currentUser') {
        data[field.key] = user.name ?? 'currentUser'
        continue
      }
      if (dm.type === 'formula' && dm.formula) {
        data[field.key] = evaluateFormula(dm.formula, data)
        continue
      }
    }

    data[field.key] = field.default !== undefined ? field.default : getEmptyValue(field)
  }
  return data
}

/** 当前时间（YYYY-MM-DD HH:mm，本地时区） */
function formatCurrentTime(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// ════════════════════════════════════════
// 条件可见性
// ════════════════════════════════════════

/**
 * 判断字段在当前数据下是否可见
 *
 * P1：单字段条件（visibleWhen.field + visibleWhen.equals）
 * not=true 时取反
 */
export function isFieldVisible(field: FormField, data: FormData): boolean {
  if (!field.visibleWhen) return true
  const { field: refKey, equals, not } = field.visibleWhen
  const actual = data[refKey]
  const match = actual === equals
  return not ? !match : match
}

// ════════════════════════════════════════
// composable
// ════════════════════════════════════════

/**
 * Schema 解析 composable
 *
 * 提供响应式的归一化 Schema、初始数据、字段分组、步骤分组
 */
export function useFormSchema(schemaRef: Ref<FormSchema>, userContext?: Ref<UserContext>) {
  /** 归一化后的 Schema */
  const normalized = computed(() => normalizeSchema(schemaRef.value))

  /** 所有字段（key 索引，方便查找） */
  const fieldMap = computed(() => {
    const map = new Map<string, FormField>()
    for (const f of normalized.value.fields) {
      map.set(f.key, f)
    }
    return map
  })

  /** 按 group 分组的字段列表（无 group 的归到 '' 空组） */
  const groupedFields = computed(() => {
    const groups = new Map<string, FormField[]>()
    for (const f of normalized.value.fields) {
      const g = f.group ?? ''
      if (!groups.has(g)) groups.set(g, [])
      groups.get(g)!.push(f)
    }
    return groups
  })

  /** 初始数据（Schema 不变时缓存；动态默认值用 userContext） */
  const initialData = computed(() => createInitialData(normalized.value.fields, { userContext: userContext?.value }))

  /** 栅格 span 默认值（按布局模式） */
  const defaultSpan = computed(() => {
    return normalized.value.layout === 'grid' ? DEFAULT_SPAN_GRID : DEFAULT_SPAN_SINGLE
  })

  return {
    normalized,
    fieldMap,
    groupedFields,
    initialData,
    defaultSpan,
    // 暴露工具函数供模板使用
    getComponentCategory,
    isLayoutField,
    isFieldVisible,
  }
}
