/**
 * 表单联动引擎 composable
 *
 * 职责：
 * 1. 解析字段的 linkage 配置，注册 watcher
 * 2. followValue:  公式求值，自动更新目标字段值
 * 3. showHide:      条件表达式求值，控制目标字段显隐
 * 4. followOptions: 根据依赖字段值过滤选项
 * 5. dataSource:    根据联动条件字段值变化，远程加载选项
 *
 * 公式语法：
 * - `{{fieldName}}` 替换为对应字段当前值
 * - 算术：`{{price}} * {{quantity}}` → 数值计算
 * - 字符串拼接：`{{firstName}}{{lastName}}` → 字符串拼接
 * - 条件表达式：`{{status}} == 'active'` → 布尔求值
 */

import { ref, watch, type Ref, type ComputedRef } from 'vue'
import type { FormField, FormData } from './types'
import type { Option } from '@/components/shared/types'
import { isFieldVisible } from './useFormSchema'

// ════════════════════════════════════════
// 公式求值引擎
// ════════════════════════════════════════

/**
 * 从公式中提取依赖字段 key
 * `{{price}} * {{quantity}}` → ['price', 'quantity']
 */
function extractFields(formula: string): string[] {
  const regex = /\{\{(\w+)\}\}/g
  const fields: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(formula)) !== null) {
    if (!fields.includes(match[1])) fields.push(match[1])
  }
  return fields
}

/**
 * 安全求值公式
 *
 * 策略：
 * 1. 替换所有 `{{fieldName}}` 为实际值
 * 2. 尝试算术求值（如果全是数字）
 * 3. 尝试布尔条件求值（含 == != > < >= <=）
 * 4. 否则返回替换后的字符串
 */
function evaluateFormula(formula: string, data: FormData): unknown {
  let expr = formula

  // 替换 {{fieldName}} 为实际值
  const fields = extractFields(formula)
  for (const f of fields) {
    const val = data[f]
    let replacement: string
    if (val === null || val === undefined) {
      replacement = '""'
    } else if (typeof val === 'string') {
      // 如果是纯数字字符串，直接替换为数字（用于算术）
      // 否则用引号包裹（用于字符串拼接和条件比较）
      if (val !== '' && !isNaN(Number(val))) {
        replacement = val
      } else {
        replacement = `"${val.replace(/"/g, '\\"')}"`
      }
    } else if (typeof val === 'boolean') {
      replacement = String(val)
    } else if (typeof val === 'number') {
      replacement = String(val)
    } else {
      replacement = `"${String(val).replace(/"/g, '\\"')}"`
    }
    // 替换所有 {{fieldName}} 出现
    expr = expr.replace(new RegExp(`\\{\\{${f}\\}\\}`, 'g'), replacement)
  }

  // 尝试条件表达式求值（含比较运算符）
  if (/==|!=|>=|<=|>|<|\band\b|\bor\b/i.test(expr)) {
    try {
      // 安全的布尔求值：使用 Function 构造器
      // eslint-disable-next-line no-new-func
      const result = new Function(`return (${expr})`)()
      if (typeof result === 'boolean') return result
      // 非布尔结果，尝试 truthy 判断
      return !!result
    } catch {
      // 求值失败，继续尝试其他方式
    }
  }

  // 尝试算术求值
  if (/^[\d\s+\-*/().]+$/.test(expr)) {
    try {
      // eslint-disable-next-line no-new-func
      const result = new Function(`return (${expr})`)()
      if (typeof result === 'number' && !isNaN(result)) return result
    } catch {
      // 算术求值失败
    }
  }

  // 字符串拼接：移除引号包裹的空字符串
  // 例如 `"张""三"` → `张三`
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`return (${expr})`)()
    if (typeof result === 'string') return result
    if (typeof result === 'number' && !isNaN(result)) return result
  } catch {
    // 最终 fallback：直接返回替换后的原始表达式（去掉 {{}}）
    return expr.replace(/"/g, '')
  }

  return expr.replace(/"/g, '')
}

// ════════════════════════════════════════
// 联动 composable
// ════════════════════════════════════════

/**
 * 表单联动引擎
 *
 * @param fields   归一化后的字段列表（响应式）
 * @param formData 表单数据（响应式 ref，联动会直接修改此对象）
 * @param externalOptions 外部注入的选项缓存（可选）
 */
export function useFormLinkage(
  fields: ComputedRef<FormField[]> | Ref<FormField[]>,
  formData: Ref<FormData>,
) {
  /** 被联动隐藏的字段 key 集合 */
  const hiddenByLinkage = ref<Set<string>>(new Set())

  /** 动态选项缓存：fieldKey → Option[] */
  const dynamicOptions = ref<Map<string, Option[]>>(new Map())

  /** API 请求缓存：url → Option[]（避免重复请求） */
  const apiCache = new Map<string, Option[]>()

  /** 联动字段列表（有 linkage 配置且 type !== 'none' 的字段） */
  const linkageFields = ref<FormField[]>([])

  /** 有 dataSource 配置的字段列表 */
  const dataSourceFields = ref<FormField[]>([])

  /**
   * 初始化：扫描字段，找出联动和数据源字段
   */
  function init(): void {
    const allFields = fields.value
    linkageFields.value = allFields.filter(
      f => f.linkage && f.linkage.type !== 'none' && f.linkage.formula,
    )
    dataSourceFields.value = allFields.filter(
      f => f.dataSource && f.dataSource.type !== 'none',
    )
  }

  /**
   * 判断字段是否被联动隐藏
   */
  function isHiddenByLinkage(key: string): boolean {
    return hiddenByLinkage.value.has(key)
  }

  /**
   * 获取字段的实际选项（动态优先）
   */
  function getFieldOptions(field: FormField): Option[] | undefined {
    const dynamic = dynamicOptions.value.get(field.key)
    if (dynamic) return dynamic
    return field.options
  }

  // ════════════════════════════════════════
  // 联动处理
  // ════════════════════════════════════════

  /**
   * 处理所有联动规则
   *
   * 在 formData 变化时调用，遍历所有联动字段，
   * 按类型执行对应逻辑。
   */
  function processLinkages(): void {
    const newHidden = new Set<string>()

    for (const field of linkageFields.value) {
      const linkage = field.linkage!
      const { type, formula, targetField } = linkage

      switch (type) {
        // ── 值跟随：根据公式计算目标字段值 ──
        case 'followValue': {
          const result = evaluateFormula(formula, formData.value)
          // 目标字段：有 targetField 用它，否则是自身
          const targetKey = targetField || field.key
          if (targetKey && formData.value[targetKey] !== result) {
            formData.value[targetKey] = result
          }
          break
        }

        // ── 显隐联动：根据条件控制目标字段 ──
        case 'showHide': {
          if (!targetField) break
          const result = evaluateFormula(formula, formData.value)
          if (!result) {
            newHidden.add(targetField)
          }
          break
        }

        // ── 选项跟随：根据依赖字段值过滤选项 ──
        case 'followOptions': {
          const dependsOn = linkage.dependsOn ?? extractFields(formula)
          if (dependsOn.length === 0) break

          // 获取依赖字段的值作为过滤条件
          const filterValue = formData.value[dependsOn[0]]
          if (filterValue === null || filterValue === undefined || filterValue === '') {
            // 依赖字段无值，清空选项
            dynamicOptions.value.set(field.key, [])
          } else {
            // 从原始选项中过滤
            const original = field.options ?? []
            const filtered = original.filter(
              opt => String(opt.value) === String(filterValue) || String(opt.label) === String(filterValue),
            )
            dynamicOptions.value.set(field.key, filtered.length > 0 ? filtered : original)
          }
          break
        }
      }
    }

    // 更新隐藏集合
    hiddenByLinkage.value = newHidden

    // 清理被隐藏字段的值（可选：防止提交隐藏字段数据）
    // 此处不清理，交给 FormBuilder 的 visibleFields 处理
  }

  // ════════════════════════════════════════
  // 数据源加载
  // ════════════════════════════════════════

  /**
   * 加载远程选项数据
   */
  async function loadRemoteOptions(field: FormField, linkageValue?: unknown): Promise<void> {
    const ds = field.dataSource
    if (!ds || ds.type !== 'api' || !ds.apiUrl) return

    // 构建请求 URL
    let url = ds.apiUrl
    if (ds.linkageField && linkageValue !== undefined && linkageValue !== null && linkageValue !== '') {
      const sep = url.includes('?') ? '&' : '?'
      url += `${sep}${ds.linkageField}=${encodeURIComponent(String(linkageValue))}`
    }

    // 检查缓存
    if (ds.cacheData && apiCache.has(url)) {
      dynamicOptions.value.set(field.key, apiCache.get(url)!)
      return
    }

    try {
      const resp = await fetch(url)
      if (!resp.ok) return
      const json = await resp.json()
      // 期望返回数组，或 { data: [...] } 或 { list: [...] }
      const rawList: Record<string, unknown>[] = (Array.isArray(json)
        ? json
        : Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.list)
            ? json.list
            : Array.isArray(json?.options)
              ? json.options
              : []) as Record<string, unknown>[]

      const labelField = ds.labelField || 'label'
      const valueField = ds.valueField || 'value'
      const options: Option[] = rawList.map((item: Record<string, unknown>) => ({
        label: String(item[labelField] ?? ''),
        value: (item[valueField] ?? item[labelField] ?? '') as Option['value'],
      }))

      dynamicOptions.value.set(field.key, options)
      if (ds.cacheData) {
        apiCache.set(url, options)
      }
    } catch {
      // 请求失败，保持静态选项
    }
  }

  /**
   * 初始化所有无联动条件的 API 数据源
   */
  async function initDataSources(): Promise<void> {
    const tasks: Promise<void>[] = []
    for (const field of dataSourceFields.value) {
      const ds = field.dataSource!
      // 有联动条件的字段不在初始化时加载，等待联动触发
      if (!ds.linkageField) {
        tasks.push(loadRemoteOptions(field))
      }
    }
    await Promise.all(tasks)
  }

  // ════════════════════════════════════════
  // Watcher 注册
  // ════════════════════════════════════════

  /**
   * 注册联动 watcher
   *
   * 监听 formData 变化，触发联动处理。
   * 在 FormBuilder 的 onMounted 中调用。
   */
  function setupWatchers(): void {
    // 初始化扫描
    init()

    // 联动主 watcher：formData 变化时处理所有联动
    watch(
      formData,
      () => {
        processLinkages()
      },
      { deep: true, immediate: true },
    )

    // 数据源联动 watcher：监听联动条件字段值变化
    for (const field of dataSourceFields.value) {
      const ds = field.dataSource!
      if (!ds.linkageField) continue

      watch(
        () => formData.value[ds.linkageField!],
        (newVal) => {
          if (newVal !== undefined && newVal !== null && newVal !== '') {
            loadRemoteOptions(field, newVal)
          } else {
            // 联动字段被清空，清除动态选项
            dynamicOptions.value.delete(field.key)
          }
        },
        { immediate: false },
      )
    }
  }

  /**
   * 综合可见性判断：原 visibleWhen + 联动隐藏
   */
  function isFieldVisibleWithLinkage(field: FormField, data: FormData): boolean {
    // 先检查联动隐藏
    if (isHiddenByLinkage(field.key)) return false
    // 再检查原 visibleWhen
    return isFieldVisible(field, data)
  }

  return {
    hiddenByLinkage,
    dynamicOptions,
    isHiddenByLinkage,
    getFieldOptions,
    processLinkages,
    loadRemoteOptions,
    initDataSources,
    setupWatchers,
    isFieldVisibleWithLinkage,
    init,
  }
}
