/**
 * FormBuilder 类型定义
 *
 * Schema 驱动的动态表单引擎类型系统：
 * - FormSchema:  表单整体结构（标题、字段列表、布局、步骤）
 * - FormField:    单个字段定义（key、类型、校验、联动条件）
 * - FieldType:    字段类型枚举，映射到现有原子组件
 */

import type { Option } from '@/components/shared/types'
import type { UploadFile } from '@/components/form/Upload.vue'

// ════════════════════════════════════════
// 字段类型 — 映射到现有组件
// ════════════════════════════════════════

/**
 * 字段类型枚举：
 *
 * Input 组件（type 透传）：text | textarea | number | password | tel | email | url | search
 * Select 组件（type 透传）：select | combobox | cascader | tree-select | date | date-range | time
 * Group 组件（type 透传）：radio | checkbox | switch | rate | slider
 * Upload 组件：upload | image-upload
 * CameraCapture 组件：camera
 * 纯布局元素：divider | title
 */
export type FieldType =
  // → Input
  | 'text'
  | 'textarea'
  | 'number'
  | 'password'
  | 'tel'
  | 'email'
  | 'url'
  | 'search'
  // → Select
  | 'select'
  | 'combobox'
  | 'cascader'
  | 'tree-select'
  | 'date'
  | 'date-range'
  | 'time'
  // → Group
  | 'radio'
  | 'checkbox'
  | 'switch'
  | 'rate'
  | 'slider'
  // → Upload / Camera
  | 'upload'
  | 'image-upload'
  | 'camera'
  // → 纯布局元素
  | 'divider'
  | 'title'
  /** 扩展类型 — 外部可通过 fieldRegistry.registerField() 注册自定义类型 */
  | (string & {})

// ════════════════════════════════════════
// 条件显示
// ════════════════════════════════════════

/**
 * 字段条件显示规则
 *
 * 支持单字段条件和多字段组合条件。
 */
export interface VisibleWhen {
  /** 引用其他字段的 key */
  field: string
  /** 匹配值：字段值等于此值时显示 */
  equals: unknown
  /** 反向匹配：不等于此值时显示（默认 false） */
  not?: boolean
}

// ════════════════════════════════════════
// 字段联动配置
// ════════════════════════════════════════

/**
 * 联动类型枚举
 *
 * - followValue:  值跟随 — 当依赖字段变化时，按公式自动计算本字段值
 * - followOptions: 选项跟随 — 当依赖字段变化时，动态过滤/加载本字段选项
 * - showHide:     显隐联动 — 根据公式条件控制目标字段显示/隐藏
 */
export type LinkageType = 'none' | 'followValue' | 'followOptions' | 'showHide'

/**
 * 字段联动配置
 *
 * 描述当前字段如何响应其他字段值的变化。
 *
 * 公式语法：
 * - `{{fieldName}}` 会被替换为对应字段的当前值
 * - 支持简单算术：`{{price}} * {{quantity}}`
 * - 支持字符串拼接：`{{firstName}}{{lastName}}`
 * - showHide 模式下，公式为条件表达式：`{{type}} == 'A'`
 */
export interface FieldLinkage {
  /** 联动类型 */
  type: LinkageType
  /**
   * 联动公式
   *
   * - followValue:  值计算公式，如 `{{price}} * {{quantity}}`
   * - followOptions: 选项过滤条件，如 `{{category}}`（按此字段值过滤选项）
   * - showHide:     条件表达式，如 `{{status}} == 'active'`，为 true 时显示
   */
  formula: string
  /**
   * 目标字段 key
   *
   * - followValue:  可选，留空时联动目标是自身（自己根据依赖字段计算值）
   * - showHide:     必填，要控制显隐的目标字段 key
   * - followOptions: 可选，留空时联动目标是自身选项
   */
  targetField?: string
  /**
   * 依赖字段 key 列表
   *
   * 自动从公式中提取 `{{fieldName}}` 也可手动指定。
   * 用于注册 watcher。
   */
  dependsOn?: string[]
}

/**
 * 字段数据源配置
 *
 * 用于 select/radio/checkbox 等选项类型，
 * 支持从远程 API 动态加载选项。
 */
export interface FieldDataSource {
  /** 数据源类型 */
  type: 'none' | 'api' | 'static'
  /** API 地址（type=api 时有效） */
  apiUrl?: string
  /** 显示字段名（默认 label） */
  labelField?: string
  /** 值字段名（默认 value） */
  valueField?: string
  /**
   * 联动条件字段
   *
   * 当此字段值变化时，重新加载选项。
   * API 请求会附带 `?{linkageField}={value}` 参数。
   */
  linkageField?: string
  /** 是否缓存数据（避免重复请求） */
  cacheData?: boolean
}

// ════════════════════════════════════════
// 表单字段定义
// ════════════════════════════════════════

/**
 * 字段事件动作（运行时消费）
 *
 * 由设计器事件页配置，toFormSchema 映射，FormBuilder 执行：
 * - onChange: 值变化时触发（setValue / toggleVisible / showTip / callApi / linkField）
 * - onBlur:   值变化后触发（autoValidate 字段级校验 / format 去空格 / submit 提交）
 */
export interface FieldEventAction {
  /** 动作类型 */
  action?: string
  /** 目标字段 key（setValue / toggleVisible 用） */
  targetField?: string
  /** callApi 动作的接口地址 */
  apiUrl?: string
}

/** 字段运行时事件配置 */
export interface FieldEvents {
  onChange?: FieldEventAction
  onFocus?: FieldEventAction
  onBlur?: FieldEventAction
}

/**
 * 表单字段定义
 *
 * type 决定渲染哪个原子组件，其余属性透传给对应组件。
 * 类型不安全但灵活：props 字段可携带任意组件特有属性。
 */
export interface FormField {
  /** 字段 key，唯一标识（数据对象的属性名） */
  key: string
  /** 字段标签 */
  label: string
  /** 字段类型 */
  type: FieldType
  /** 字段提示（显示在输入框下方） */
  hint?: string
  /** 占位文本 */
  placeholder?: string
  /** 默认值 */
  default?: unknown
  /** 是否必填 */
  required?: boolean
  /** 是否禁用 */
  disabled?: boolean
  /** 是否只读 */
  readonly?: boolean
/**
* 校验规则
*
* 支持两种签名：
* 1. 简单签名（与 Input 组件兼容）：(v: string) => string | undefined
* 2. 上下文签名（可跨字段校验）：(v: unknown, data: FormData) => string | undefined
*
* 返回字符串 = 错误信息；返回 undefined = 通过
*/
rules?: ValidationRule[]
/** 选项列表（select/radio/checkbox/cascader/tree-select 用） */
options?: Option[]
  /** 级联选项（cascader 模式专用） */
  cascaderOptions?: import('@/components/shared/types').CascaderOption[]
  /** 布局宽度（1-24 栅格，默认 24 = 整行） */
  span?: number
  /** 分组标题（相同 group 的字段渲染在一个卡片内） */
  group?: string
  /** 条件显示 */
  visibleWhen?: VisibleWhen
  /** 字段所属容器（设计器容器嵌套时由 toFormSchema 填充） */
  container?: FieldContainer
  /**
   * 字段联动配置
   *
   * 配置当前字段如何响应其他字段值的变化。
   * - followValue:  自身值根据公式自动计算
   * - showHide:     控制目标字段显隐
   * - followOptions: 自身选项根据依赖字段过滤
   */
  linkage?: FieldLinkage
  /** 字段事件动作（onChange/onBlur/onFocus，由设计器事件页配置） */
  events?: FieldEvents
  /**
   * 远程数据源配置
   *
   * 用于 select/radio/checkbox 等选项类型，
   * 支持从远程 API 动态加载选项。
   */
  dataSource?: FieldDataSource
  /**
   * 类型特有属性透传
   *
   * 例：
   * - number 类型：{ stepper: true, min: 0, max: 100, precision: 2 }
   * - date 类型：{ format: 'YYYY-MM-DD', dateMin: '2024-01-01' }
   * - upload 类型：{ accept: 'image/*', maxSize: 10, variant: 'card', multiple: false }
   * - slider 类型：{ min: 0, sliderMax: 100, step: 10, showValue: true }
   * - radio 类型：{ direction: 'horizontal' }
   */
  props?: Record<string, unknown>
}

// ════════════════════════════════════════
// 表单 Schema
// ════════════════════════════════════════

/** 布局模式 */
export type FormLayout = 'single' | 'grid' | 'steps'

/** 设计器容器类型（card/grid/tabs/collapse/steps） */
export type FieldContainerType = 'card' | 'grid' | 'tabs' | 'collapse' | 'steps'

/**
 * 字段的容器归属（toFormSchema 从设计器树填充）
 *
 * 设计器里字段可被拖入容器；toFormSchema 不再丢弃容器，而是把
 * 「最近的容器祖先」信息挂到每个字段上，FormBuilder 据此把字段
 * 渲染进对应的容器包装（card=卡片、grid=栅格、tabs/collapse/steps=带标题分组）。
 */
export interface FieldContainer {
  /** 容器类型 */
  type: FieldContainerType
  /** 容器显示标题（card/grid/tabs/collapse/steps 通用） */
  label?: string
  /** 容器唯一 id（设计器节点 id，用于区分同名的多个容器） */
  id?: string
  /** grid 栅格列数 */
  columns?: number
  /** tabs 标签页定义（type=tabs） */
  tabs?: { label: string; name: string }[]
  /** collapse 折叠项定义（type=collapse） */
  collapseItems?: { title: string; expanded: boolean }[]
  /** steps 步骤定义（type=steps） */
  steps?: { title: string }[]
  /** 字段在该容器内的槽位下标（tabs/collapse/steps 用，对应 tabs[]/collapseItems[]/steps[] 下标） */
  slot?: number
}

/** 一个渲染区块：按容器归属把字段切分成连续段（FormBuilder 产出，FieldList 消费） */
export interface RenderSection {
  id: string
  /** 区块标题（容器 label 或 group 名） */
  title: string | null
  /** 是否多列网格布局（grid 容器 或 表单 layout=grid） */
  isGrid: boolean
  /** 网格列数 */
  columns: number
  /** 字段默认跨列数（未显式 span 时） */
  defaultSpan: number
  /** 区块对应的容器定义（tabs/collapse/steps 走交互渲染，其余走卡片/网格） */
  container?: FieldContainer
  fields: FormField[]
}

/** 步骤定义（steps 模式） */
export interface FormStep {
  /** 步骤标题 */
  title: string
  /** 该步骤包含的字段 key 列表（对应 FormField.key） */
  fields: string[]
}

/**
 * 表单 Schema — 完整的表单结构描述
 *
 * @example
 * ```ts
 * const schema: FormSchema = {
 *   title: '门店合同收集',
 *   layout: 'single',
 *   fields: [
 *     { key: 'appleId', label: 'Apple ID', type: 'number', required: true, props: { stepper: false } },
 *     { key: 'license', label: '营业执照名称', type: 'text', required: true },
 *     { key: 'contract', label: '柜机协议', type: 'image-upload', props: { variant: 'card', accept: 'image/*' } },
 *   ],
 *   submitText: '提交',
 * }
 * ```
 */
export interface FormSchema {
  /** Schema 版本号（用于导入兼容性检查，当前版本 2） */
  schemaVersion?: number
  /** 表单标题 */
  title?: string
  /** 表单描述 */
  description?: string
  /** 字段列表（有序渲染） */
  fields: FormField[]
  /** 提交按钮文本（默认"提交"） */
  submitText?: string
  /** 重置按钮文本（默认"重置"） */
  resetText?: string
  /** 布局模式（默认 single） */
  layout?: FormLayout
  /** 栅格列数（grid 模式，默认 2 列） */
  columns?: number
  /** 步骤定义（steps 模式） */
  steps?: FormStep[]
  /** 是否隐藏底部按钮（外部自行控制提交时用） */
  hideActions?: boolean
  /** 是否在字段变更时实时校验（默认 false，仅提交时校验） */
  validateOnChange?: boolean
  /** 提交模式（默认 once） */
  submitMode?: 'once' | 'multiple' | 'unique'
  /** 提交成功后清空表单（默认 false） */
  clearAfterSubmit?: boolean
  /** 标签位置 */
  labelPosition?: 'left' | 'top' | 'hidden'
  /** 标签宽度 */
  labelWidth?: 'default' | '80px' | '120px' | 'auto'
}

// ════════════════════════════════════════
// 数据与校验类型
// ════════════════════════════════════════

/** 表单数据对象 */
export type FormData = Record<string, unknown>

/** 字段错误信息：key → 错误文本（空字符串 = 无错误） */
export type FormErrors = Record<string, string>

/**
 * 校验规则函数类型
 *
 * 支持两种签名：
 * - 简单签名：(v: string) => string | undefined（与 Input 组件兼容）
 * - 上下文签名：(v: unknown, data: FormData) => string | undefined（可跨字段校验）
 *
 * 校验引擎会自动适配：如果函数.length >= 2 则传入 FormData 上下文
 */
export type ValidationRule =
  | ((v: string) => string | undefined)
  | ((v: unknown, data: FormData) => string | undefined)

/** 表单值类型联合（供外部类型推导） */
export type FieldValue =
  | string
  | number
  | boolean
  | (string | number | boolean)[]
  | [string, string]
  | [number, number]
  | UploadFile[]
  | null
  | undefined
