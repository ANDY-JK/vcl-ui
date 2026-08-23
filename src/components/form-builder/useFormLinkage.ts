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

// ════════════════════════════════════════
// 受限表达式求值器（替代 new Function，杜绝代码注入）
// 只识别字面量与白名单运算符；任何标识符/属性/调用都会抛错并由调用方降级。
// ════════════════════════════════════════

type Tok =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'null' }
  | { kind: 'op'; value: string }

/** 词法分析：只产出字面量 token 与运算符 token */
function tokenize(src: string): Tok[] {
  const tokens: Tok[] = []
  let i = 0
  const n = src.length
  while (i < n) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    // 数字字面量
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < n && /[0-9.]/.test(src[j])) j++
      const num = Number(src.slice(i, j))
      if (Number.isNaN(num)) throw new Error('invalid number')
      tokens.push({ kind: 'num', value: num })
      i = j
      continue
    }
    // 字符串字面量（单/双引号，支持转义）
    if (ch === '"' || ch === "'") {
      const quote = ch
      let j = i + 1
      let val = ''
      while (j < n && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < n) {
          val += src[j + 1]
          j += 2
          continue
        }
        val += src[j]
        j++
      }
      if (j >= n) throw new Error('unterminated string')
      tokens.push({ kind: 'str', value: val })
      i = j + 1
      continue
    }
    // 布尔/null/逻辑关键字（and/or）
    if (/[a-zA-Z]/.test(ch)) {
      let j = i
      while (j < n && /[a-zA-Z_]/.test(src[j])) j++
      const word = src.slice(i, j).toLowerCase()
      if (word === 'true') tokens.push({ kind: 'bool', value: true })
      else if (word === 'false') tokens.push({ kind: 'bool', value: false })
      else if (word === 'null') tokens.push({ kind: 'null' })
      else if (word === 'and') tokens.push({ kind: 'op', value: 'and' })
      else if (word === 'or') tokens.push({ kind: 'op', value: 'or' })
      else throw new Error(`unexpected identifier: ${word}`)
      i = j
      continue
    }
    // 多字符运算符优先
    const three = src.slice(i, i + 3)
    if (three === '!==') {
      tokens.push({ kind: 'op', value: three })
      i += 3
      continue
    }
    const two = src.slice(i, i + 2)
    if (['==', '!=', '>=', '<=', '&&', '||', '==='].includes(two)) {
      tokens.push({ kind: 'op', value: two })
      i += 2
      continue
    }
    if ('+-*/%()<>!'.includes(ch)) {
      tokens.push({ kind: 'op', value: ch })
      i++
      continue
    }
    throw new Error(`unexpected char: ${ch}`)
  }
  return tokens
}

function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v)
  if (typeof v === 'string') return v !== ''
  return true
}

function looseEq(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b
  if (typeof a === 'string' || typeof b === 'string') return String(a) === String(b)
  if (typeof a === 'boolean' || typeof b === 'boolean') return truthy(a) === truthy(b)
  return a === b
}

function compareOp(op: string, a: unknown, b: unknown): boolean {
  if (op === '==') return looseEq(a, b)
  if (op === '!=') return !looseEq(a, b)
  if (op === '===') return a === b
  if (op === '!==') return a !== b
  const na = typeof a === 'number' ? a : Number(a)
  const nb = typeof b === 'number' ? b : Number(b)
  if (!Number.isNaN(na) && !Number.isNaN(nb)) {
    if (op === '>') return na > nb
    if (op === '<') return na < nb
    if (op === '>=') return na >= nb
    if (op === '<=') return na <= nb
  }
  const sa = String(a)
  const sb = String(b)
  if (op === '>') return sa > sb
  if (op === '<') return sa < sb
  if (op === '>=') return sa >= sb
  if (op === '<=') return sa <= sb
  throw new Error(`unknown operator: ${op}`)
}

class ExprParser {
  private pos = 0

  constructor(private tokens: Tok[]) {}

  parse(): unknown {
    const v = this.parseOr()
    if (this.pos < this.tokens.length) throw new Error('trailing tokens')
    return v
  }

  private peek(): Tok | undefined {
    return this.tokens[this.pos]
  }

  private isOp(...ops: string[]): boolean {
    const t = this.peek()
    return !!t && t.kind === 'op' && ops.includes(t.value)
  }

  private takeOp(): string {
    const t = this.tokens[this.pos++]
    if (t.kind === 'op') return t.value
    throw new Error('expected operator')
  }

  private parseOr(): unknown {
    let left = this.parseAnd()
    while (this.isOp('||', 'or')) {
      this.takeOp()
      left = truthy(left) || truthy(this.parseAnd())
    }
    return left
  }

  private parseAnd(): unknown {
    let left = this.parseCompare()
    while (this.isOp('&&', 'and')) {
      this.takeOp()
      left = truthy(left) && truthy(this.parseCompare())
    }
    return left
  }

  private parseCompare(): unknown {
    let left = this.parseAdd()
    while (this.isOp('==', '!=', '===', '!==', '>', '<', '>=', '<=')) {
      left = compareOp(this.takeOp(), left, this.parseAdd())
    }
    return left
  }

  private parseAdd(): unknown {
    let left = this.parseMul()
    while (this.isOp('+', '-')) {
      const op = this.takeOp()
      const right = this.parseMul()
      left = op === '+' ? add(left, right) : sub(left, right)
    }
    return left
  }

  private parseMul(): unknown {
    let left = this.parseUnary()
    while (this.isOp('*', '/', '%')) {
      left = mulDiv(this.takeOp(), left, this.parseUnary())
    }
    return left
  }

  private parseUnary(): unknown {
    if (this.isOp('!')) {
      this.takeOp()
      return !truthy(this.parseUnary())
    }
    if (this.isOp('-')) {
      this.takeOp()
      const v = this.parseUnary()
      if (typeof v === 'number') return -v
      throw new Error('negate non-number')
    }
    return this.parsePrimary()
  }

  private parsePrimary(): unknown {
    const t = this.tokens[this.pos++]
    if (!t) throw new Error('unexpected end')
    if (t.kind === 'num' || t.kind === 'str' || t.kind === 'bool') return t.value
    if (t.kind === 'null') return null
    if (t.kind === 'op' && t.value === '(') {
      const v = this.parseOr()
      const close = this.tokens[this.pos++]
      if (!close || close.kind !== 'op' || close.value !== ')') throw new Error('unbalanced paren')
      return v
    }
    throw new Error('unexpected token')
  }
}

function add(a: unknown, b: unknown): unknown {
  if (typeof a === 'number' && typeof b === 'number') return a + b
  return String(a) + String(b)
}

function sub(a: unknown, b: unknown): number {
  return (typeof a === 'number' ? a : Number(a)) - (typeof b === 'number' ? b : Number(b))
}

function mulDiv(op: string, a: unknown, b: unknown): number {
  const na = typeof a === 'number' ? a : Number(a)
  const nb = typeof b === 'number' ? b : Number(b)
  if (op === '*') return na * nb
  if (op === '/') return na / nb
  return na % nb
}

/** 受限表达式安全求值：只支持字面量与白名单运算符 */
function safeEvaluate(expr: string): unknown {
  return new ExprParser(tokenize(expr)).parse()
}

/**
 * 安全求值公式（无 eval / new Function）
 *
 * 1. 替换所有 `{{fieldName}}` 为字面量（字符串加引号包裹）
 * 2. 用受限求值器计算（算术 / 比较 / 逻辑 / 字符串拼接）
 * 3. 求值失败退化为纯字符串拼接
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

  try {
    return safeEvaluate(expr)
  } catch {
    // 求值失败：退化为纯字符串拼接（去掉引号）
    return expr.replace(/"/g, '')
  }
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
