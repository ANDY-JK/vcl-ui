import { reportWarn } from '@/components/_internal/runtime-observer'
/**
 * 表单联动引擎 composable
 *
 * 职责：
 * 1. 解析字段的 linkage 配置，注册 watcher
 * 2. followValue:  公式求值，自动更新目标字段值
 * 3. showHide:      条件表达式求值，控制目标字段显隐
 * 4. followOptions: 根据依赖字段值过滤选项
 * 5. dataSource:    根据联动条件字段值变化，远程加载选项
 * 6. optionsFrom+optionsMap: 级联选项映射（承接旧版 DynamicForm 模式：
 *    依赖字段值在映射表中查出本字段选项，无匹配键 → 空选项）
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
import { evaluateFormula, extractFields } from './expression-evaluator'

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
export function useFormLinkage(fields: ComputedRef<FormField[]> | Ref<FormField[]>, formData: Ref<FormData>) {
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

  /** 有 optionsFrom+optionsMap 级联映射的字段列表 */
  const cascadeFields = ref<FormField[]>([])

  /**
   * 初始化：扫描字段，找出联动和数据源字段
   */
  function init(): void {
    const allFields = fields.value
    linkageFields.value = allFields.filter((f) => f.linkage && f.linkage.type !== 'none' && f.linkage.formula)
    dataSourceFields.value = allFields.filter((f) => f.dataSource && f.dataSource.type !== 'none')
    cascadeFields.value = allFields.filter((f) => f.optionsFrom && f.optionsMap)

    // 选项来源互斥检测：optionsMap 级联 / followOptions 联动 / dataSource.api 都写
    // dynamicOptions，同字段多来源时结果取决于执行顺序（后写覆盖）。设计上互斥，
    // 同时出现视为配置冲突，dev 下提示修正
    if (import.meta.env.DEV) {
      for (const f of allFields) {
        const sources: string[] = []
        if (f.optionsFrom && f.optionsMap) sources.push('optionsMap')
        if (f.linkage?.type === 'followOptions' && f.linkage.formula) sources.push('followOptions')
        if (f.dataSource?.type === 'api' && f.dataSource.apiUrl) sources.push('dataSource.api')
        if (sources.length > 1) {
          reportWarn(
            `[FormLinkage] 字段 "${f.key}" 同时配置了多个选项来源（${sources.join(' + ')}），` +
              '仅一个会生效（按求值顺序覆盖），请只保留一个。',
          )
        }
      }
    }
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
  // 级联选项映射（optionsFrom + optionsMap）
  // ════════════════════════════════════════

  /**
   * 求值所有级联映射字段：依赖字段当前值 → 映射表查选项 → 写 dynamicOptions
   *
   * 与旧版 DynamicForm 语义一致：依赖无值或映射表无此键 → 选项清空（不是回退全量，
   * 否则用户能看到与已选省份无关的城市）；映射值支持 string[]（同值同标签）与 Option[]。
   */
  function processCascadeOptions(): void {
    for (const field of cascadeFields.value) {
      const depKey = field.optionsFrom!
      const map = field.optionsMap!
      const depVal = formData.value[depKey]
      const key = depVal === null || depVal === undefined ? '' : String(depVal)
      const mapped = key !== '' ? map[key] : undefined
      if (!mapped?.length) {
        dynamicOptions.value.set(field.key, [])
        continue
      }
      dynamicOptions.value.set(
        field.key,
        mapped.map((o) => (typeof o === 'string' ? ({ value: o, label: o } as Option) : (o as Option))),
      )
      // 已选值不在新选项中 → 清空，防止提交脏值（与旧版行为一致）
      const current = formData.value[field.key]
      if (current !== undefined && current !== null && current !== '') {
        const hit = mapped.some((o) =>
          typeof o === 'string' ? o === String(current) : String(o.value) === String(current),
        )
        if (!hit) formData.value[field.key] = ''
      }
    }
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

    // 级联选项映射先求值（写入 dynamicOptions，供渲染层即时取用）
    processCascadeOptions()

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
              (opt) => String(opt.value) === String(filterValue) || String(opt.label) === String(filterValue),
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
      const rawList: Record<string, unknown>[] = (
        Array.isArray(json)
          ? json
          : Array.isArray(json?.data)
            ? json.data
            : Array.isArray(json?.list)
              ? json.list
              : Array.isArray(json?.options)
                ? json.options
                : []
      ) as Record<string, unknown>[]

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

    // 字段配置签名 watcher：schema 动态更新（宿主运行时改 fields）时重扫
    // 联动/数据源/级联字段列表。用配置签名而非数组引用做依赖——
    // effectiveFields 每次 formData 变化都会产出新数组，按引用监听会误触发。
    watch(
      () =>
        fields.value
          .map(
            (f) =>
              `${f.key}:${f.linkage?.type ?? ''}:${f.linkage?.formula ?? ''}:${f.optionsFrom ?? ''}:${f.dataSource?.type ?? ''}:${f.dataSource?.apiUrl ?? ''}`,
          )
          .join('|'),
      () => {
        init()
        processLinkages()
      },
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
