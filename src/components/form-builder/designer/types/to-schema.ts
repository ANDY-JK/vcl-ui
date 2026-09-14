import type { FormSchema, FormField, FieldContainer, FieldContainerType, FieldType } from '../../types'
import type { Option } from '@/components/shared/types'
import type { DesignerNode, DesignerNodeType, FormMeta } from './domain'
import { isContainerNode, FORM_DESIGN_VERSION } from './domain'
import type { CascaderOption } from '@/components/shared/types'
import { getTypeLabel as fbGetTypeLabel, getTypeIcon as fbGetTypeIcon } from '../../fieldRegistry'
import { useT } from '@/components/_internal/i18n'
import { isValidPhone, isValidEmail, isValidIdCard, isValidUrl } from '@/components/_internal/utils'
import { extractFields } from '../../expression-evaluator'

const t = useT()
// ════════════════════════════════════════
// Schema 转换
// ════════════════════════════════════════

/**
 * 深度优先遍历节点树，为每个字段节点携带其「最近的容器祖先」上下文。
 * 容器不再被丢弃：card/grid/tabs/collapse/steps 会以 FieldContainer 信息
 * 挂到其子孙字段上，由 FormBuilder 据此渲染容器包装。
 */
function flattenWithContainer(
  nodes: DesignerNode[],
  container: FieldContainer | null,
  out: Array<{ node: DesignerNode; container: FieldContainer | null }>,
): void {
  for (const node of nodes) {
    if (isContainerNode(node)) {
      const cfg = node.containerConfig
      const ctx: FieldContainer = { type: node.type as FieldContainerType, label: node.label, id: node.id }
      if (node.type === 'grid' && cfg?.columns) ctx.columns = cfg.columns
      if (node.type === 'flex') {
        if (cfg?.gap !== undefined) ctx.gap = cfg.gap
        if (cfg?.wrap !== undefined) ctx.wrap = cfg.wrap
        if (cfg?.justify !== undefined) ctx.justify = cfg.justify
      }
      if (node.type === 'tabs' && cfg?.tabs?.length) ctx.tabs = cfg.tabs
      if (node.type === 'collapse' && cfg?.collapseItems?.length) ctx.collapseItems = cfg.collapseItems
      if (node.type === 'steps' && cfg?.steps?.length) ctx.steps = cfg.steps
      flattenWithContainer(node.children ?? [], ctx, out)
    } else {
      // 字段携带其 containerSlot（父容器 tabs/collapse/steps 槽位）
      const c = container && node.containerSlot !== undefined ? { ...container, slot: node.containerSlot } : container
      out.push({ node, container: c })
    }
  }
}

/**
 * 设计数据 → FormSchema（FormBuilder 可渲染格式）
 *
 * v3 变化：
 * - 支持 nodes 树形结构（优先）
 * - 兼容旧版 fields 平铺结构
 * - 容器节点转换为字段的 container 归属信息（不再丢弃）
 */
export function toFormSchema(nodes: DesignerNode[], meta?: FormMeta): FormSchema {
  // v3：递归遍历节点树，为每个字段携带最近的容器祖先上下文（容器不再被丢弃）
  const pairs: Array<{ node: DesignerNode; container: FieldContainer | null }> = []
  flattenWithContainer(nodes, null, pairs)
  const formFields: FormField[] = []

  for (const { node: f, container } of pairs) {
    // 跳过无 key 的字段（divider/title/paragraph 纯布局元素除外）
    if (!f.key && f.type !== 'divider' && f.type !== 'title' && f.type !== 'paragraph') continue

    const base: FormField = {
      key: f.key ?? f.id,
      label: f.label,
      type: f.type as FieldType,
      required: f.required,
      placeholder: f.placeholder,
      disabled: f.disabled,
      readonly: f.readonly,
      hint: f.hint,
      span: f.span,
      group: f.group,
    }

    // 默认值：静态 defaultValue 直接映射；动态 defaultMeta 由 dataConfig.defaultType 映射
    if (f.defaultValue !== undefined) {
      base.default = f.defaultValue
    }
    const dt = f.dataConfig?.defaultType
    if (dt === 'currentTime' || dt === 'currentUser') {
      base.defaultMeta = { type: dt }
    } else if (dt === 'formula' && f.dataConfig?.defaultFormula) {
      base.defaultMeta = { type: 'formula', formula: f.dataConfig.defaultFormula }
    } else if (dt === 'api' && f.dataConfig?.defaultApiUrl) {
      // api 型动态默认值：未填 apiUrl 不映射（避免运行时空请求）
      base.defaultMeta = {
        type: 'api',
        apiUrl: f.dataConfig.defaultApiUrl,
        ...(f.dataConfig.defaultApiDataPath ? { dataPath: f.dataConfig.defaultApiDataPath } : {}),
      }
    }

    // 选项类型
    if (f.options?.length) {
      base.options = f.options.map((o) => ({ value: o, label: o }) as Option)
    }

    // 数字属性
    if (f.min !== undefined) base.props = { ...base.props, min: f.min }
    if (f.max !== undefined) base.props = { ...base.props, max: f.max }
    if (f.step !== undefined) base.props = { ...base.props, step: f.step }

    // text 属性（0 视为未设置：maxlength="0" 会让输入框完全无法输入）
    if (f.maxLength !== undefined && f.maxLength > 0) base.props = { ...base.props, maxlength: f.maxLength }

    // 前缀图标 / 后缀文字（输入类字段）
    if (f.icon) base.props = { ...base.props, icon: f.icon }
    if (f.suffixText) base.props = { ...base.props, suffix: f.suffixText }

    // textarea 行数
    if (f.rows !== undefined) base.props = { ...base.props, rows: f.rows }

    // rate 属性
    if (f.rateMax !== undefined) base.props = { ...base.props, rateMax: f.rateMax }
    if (f.rateAllowHalf !== undefined) base.props = { ...base.props, allowHalf: f.rateAllowHalf }

    // cascader 选项
    if (f.type === 'cascader') {
      const parsed = parseCascaderOptions(f.cascaderOptions)
      if (parsed) base.cascaderOptions = parsed
    }

    // upload 属性
    if (f.type === 'upload') {
      if (f.accept) base.props = { ...base.props, accept: f.accept }
      if (f.multiple !== undefined) base.props = { ...base.props, multiple: f.multiple }
      if (f.maxSize !== undefined) base.props = { ...base.props, maxSize: f.maxSize }
      // upload 类型映射到 image-upload 或 upload
      if (f.accept === 'image/*') base.type = 'image-upload'
    }

    // scan-code 属性（all/空/0 = 默认或不过滤，不下发，与渲染端 ok() 的豁免口径一致）
    if (f.type === 'scan-code') {
      if (f.scanFormats && f.scanFormats !== 'all') base.props = { ...base.props, scanFormats: f.scanFormats }
      if (f.scanPrefix) base.props = { ...base.props, scanPrefix: f.scanPrefix }
      if (f.scanLength !== undefined && f.scanLength > 0) base.props = { ...base.props, scanLength: f.scanLength }
    }

    // 条件显示映射
    if (f.visibleWhenField) {
      let matchValue: unknown = f.visibleWhenValue ?? ''
      const raw = f.visibleWhenValue?.trim()
      if (raw === 'true') matchValue = true
      else if (raw === 'false') matchValue = false
      else if (raw !== '' && raw !== undefined && !isNaN(Number(raw))) matchValue = Number(raw)

      base.visibleWhen = {
        field: f.visibleWhenField,
        equals: matchValue,
        ...(f.visibleWhenNot ? { not: true } : {}),
      }
    }

    // 条件必填 / 条件禁用（匹配语义与条件显示一致）
    for (const [condField, condValue, condNot, target] of [
      [f.requiredWhenField, f.requiredWhenValue, f.requiredWhenNot, 'requiredWhen'],
      [f.disabledWhenField, f.disabledWhenValue, f.disabledWhenNot, 'disabledWhen'],
    ] as const) {
      if (!condField) continue
      let matchValue: unknown = condValue ?? ''
      const raw = condValue?.trim()
      if (raw === 'true') matchValue = true
      else if (raw === 'false') matchValue = false
      else if (raw !== '' && raw !== undefined && !isNaN(Number(raw))) matchValue = Number(raw)
      base[target] = {
        field: condField,
        equals: matchValue,
        ...(condNot ? { not: true } : {}),
      }
    }

    // 级联选项映射（每行：依赖值=选项1,选项2,…；选项先按逗号拆再按需转数字语义——
    // 映射值统一按字符串，与依赖值 String() 比对，与旧版 optionsMap 行为一致）
    if (f.optionsFrom && f.optionsMap?.trim()) {
      const map: Record<string, (string | Option)[]> = {}
      for (const line of f.optionsMap.split('\n')) {
        const eq = line.indexOf('=')
        if (eq <= 0) continue
        const key = line.slice(0, eq).trim()
        const items = line
          .slice(eq + 1)
          .split(/[,，;；]/)
          .map((s) => s.trim())
          .filter(Boolean)
        if (key && items.length) map[key] = items
      }
      if (Object.keys(map).length) {
        base.optionsFrom = f.optionsFrom
        base.optionsMap = map
      }
    }

    // 联动配置映射（从 eventConfig 导出）
    const evt = f.eventConfig
    if (evt?.linkageType && evt.linkageType !== 'none' && evt.linkageFormula) {
      // 从公式中提取依赖字段 {{fieldName}} → fieldName
      const dependsOn = extractFields(evt.linkageFormula)
      base.linkage = {
        type: evt.linkageType,
        formula: evt.linkageFormula,
        // followValue 无 targetField 时目标是自身；showHide 需要 onChange.targetField
        ...(evt.onChange?.targetField ? { targetField: evt.onChange.targetField } : {}),
        ...(dependsOn.length ? { dependsOn } : {}),
      }
    }

    // 事件动作映射（从 eventConfig 导出，运行时由 FormBuilder 消费）
    if (evt?.onChange?.enabled && evt.onChange.action) {
      base.events = {
        ...base.events,
        onChange: {
          action: evt.onChange.action,
          targetField: evt.onChange.targetField,
          apiUrl: evt.onChange.apiUrl,
        },
      }
    }
    if (evt?.onBlur?.enabled && evt.onBlur.action) {
      base.events = { ...base.events, onBlur: { action: evt.onBlur.action } }
    }
    if (evt?.onFocus?.enabled && evt.onFocus.action) {
      base.events = { ...base.events, onFocus: { action: evt.onFocus.action } }
    }

    // 数据源配置映射（从 dataConfig 导出）
    const dat = f.dataConfig
    if (dat?.sourceType === 'api' && dat.apiUrl) {
      base.dataSource = {
        type: 'api',
        apiUrl: dat.apiUrl,
        ...(dat.labelField ? { labelField: dat.labelField } : {}),
        ...(dat.valueField ? { valueField: dat.valueField } : {}),
        ...(dat.linkageField ? { linkageField: dat.linkageField } : {}),
        ...(dat.cacheData !== undefined ? { cacheData: dat.cacheData } : {}),
      }
    } else if (dat?.sourceType === 'userList' || dat?.sourceType === 'deptList' || dat?.sourceType === 'database') {
      // 实体类数据源（用户/部门/数据库）：库内不内置具体数据，映射为 static，
      // 实际选项由字段自身 options 提供（设计器或调用方注入）。记录进 schema 避免静默丢失。
      base.dataSource = { type: 'static' }
    }

    // v3 高级字段专属属性映射到 props
    if (f.subformColumns) base.props = { ...base.props, subformColumns: f.subformColumns }
    if (f.matrixRows) base.props = { ...base.props, matrixRows: f.matrixRows }
    if (f.matrixCols) base.props = { ...base.props, matrixCols: f.matrixCols }
    if (f.addressDetail !== undefined) base.props = { ...base.props, addressDetail: f.addressDetail }
    if (f.idcardTypes) base.props = { ...base.props, idcardTypes: f.idcardTypes }
    if (f.serialPrefix) base.props = { ...base.props, serialPrefix: f.serialPrefix }
    if (f.serialDateFormat) base.props = { ...base.props, serialDateFormat: f.serialDateFormat }
    if (f.richtextToolbar) base.props = { ...base.props, richtextToolbar: f.richtextToolbar }
    if (f.relateEntityType) base.props = { ...base.props, relateEntityType: f.relateEntityType }

    // 样式配置透传（FormRenderer 消费 size/radius/borderColor/focusBorderColor/customClass 等）
    if (f.styleConfig) base.props = { ...base.props, styleConfig: f.styleConfig }

    // 校验规则映射（从 validation 导出）
    const val = f.validation
    if (val) {
      const rules: ((v: string) => string | undefined)[] = []
      if (val.minLength !== undefined && val.minLength > 0) {
        rules.push((v: string) =>
          v.length < val.minLength! ? t('formBuilder.lenMinMsg', { len: val.minLength }) : undefined,
        )
      }
      if (val.maxLength !== undefined && val.maxLength > 0) {
        rules.push((v: string) =>
          v.length > val.maxLength! ? t('formBuilder.lenMaxMsg', { len: val.maxLength }) : undefined,
        )
      }
      if (val.pattern) {
        try {
          const re = new RegExp(val.pattern)
          rules.push((v: string) => (!re.test(v) ? val.patternMessage || t('formBuilder.patternInvalid') : undefined))
        } catch {
          /* 无效正则跳过 */
        }
      }
      if (val.builtinType) {
        const builtinValidators: Record<string, { check: (v: string) => boolean; msg: string }> = {
          phone: { check: isValidPhone, msg: t('formBuilder.phoneInvalid') },
          email: { check: isValidEmail, msg: t('formBuilder.emailInvalidShort') },
          idcard: { check: isValidIdCard, msg: t('formBuilder.idCardInvalid') },
          url: { check: isValidUrl, msg: t('formBuilder.urlInvalidShort') },
        }
        const p = builtinValidators[val.builtinType]
        if (p) rules.push((v: string) => (!p.check(v) ? p.msg : undefined))
      }
      if (val.trim) {
        // trim 规则在 FormBuilder 层处理，这里不需要加 rule
      }
      if (rules.length) base.rules = rules

      // P1-7 高级字段专项校验配置（引擎侧由 validateAdvanced 读取 props）
      if (val.richtextMinChars !== undefined && val.richtextMinChars > 0) {
        base.props = { ...base.props, richtextMinChars: val.richtextMinChars }
      }
      if (val.matrixMinRows !== undefined && val.matrixMinRows > 0) {
        base.props = { ...base.props, matrixMinRows: val.matrixMinRows }
      }
      if (val.signatureRequired) {
        base.props = { ...base.props, signatureRequired: true }
      }
    }

    if (container) base.container = container
    formFields.push(base)
  }

  return {
    schemaVersion: FORM_DESIGN_VERSION,
    title: meta?.title,
    description: meta?.description,
    fields: formFields,
    submitText: meta?.submitText,
    resetText: meta?.resetText,
    layout: meta?.layout ?? 'single',
    columns: meta?.columns,
    steps: meta?.steps,
    hideActions: meta?.hideActions,
    validateOnChange: meta?.validateOnChange,
    submitMode: meta?.submitMode,
    clearAfterSubmit: meta?.clearAfterSubmit,
    labelPosition: meta?.labelPosition,
    labelWidth: meta?.labelWidth,
  }
}

/** 节点类型 → 中文标签（委托 fieldRegistry，单一事实源） */
export function getTypeLabel(type: DesignerNodeType): string {
  return fbGetTypeLabel(type)
}

/** 节点类型 → 图标（委托 fieldRegistry，单一事实源）。禁止各处重复维护 icon map */
export function getTypeIcon(type: DesignerNodeType): string {
  return fbGetTypeIcon(type)
}

/**
 * v2 → v3 兼容：将旧版 DesignerField[] 转为 DesignerNode[]
 */
export function migrateFieldsToNodes(fields: DesignerNode[]): DesignerNode[] {
  // 如果已经是节点树格式（含 isContainer 或 children），直接返回
  if (fields.some((f) => f.isContainer || f.children?.length)) {
    return fields
  }
  // 旧版平铺字段直接作为根级节点
  return fields.map((f) => ({ ...f }))
}

/** 解析 cascader JSON 文本；失败返回 null（原在 domain.ts，随 schema 转换职责迁入本文件） */
export function parseCascaderOptions(text?: string): CascaderOption[] | null {
  if (!text) return null
  try {
    const v = JSON.parse(text)
    return Array.isArray(v) ? v : null
  } catch {
    return null
  }
}
