/**
 * 设计器类型系统 — 低代码表单设计器数据模型 (v3)
 *
 * 核心变化（v3）：
 * - 引入树形节点结构：DesignerNode 统一字段和容器
 * - 新增布局容器类型：card / grid / tabs / collapse / steps
 * - 新增高级字段类型：subform / relate / richtext / signature / address / idcard / matrix / serial
 * - 容器可嵌套子节点，支持无限层级
 *
 * 数据流：
 * DesignerNode[] (树) → toFormSchema() → FormSchema (扁平) → FormBuilder 渲染
 */

import { uuid } from '@/components/_internal/utils'
import { useT } from '@/components/_internal/i18n'
import { extractFields } from '../../expression-evaluator'
import { getFieldMeta, getFieldDefaults, findFieldRegistration } from '../../fieldRegistry'
import type { DesignerDisplayProps } from './designer-display-props'

/** 模块级 t：FIELD_TYPES 派生与节点默认标签按当前语言 */
const t = useT()

/**
 * 从联动公式中提取依赖字段 key（extractFields 的语义别名，兼容旧命名）
 * 公式语法：`{{fieldName}}` → 提取 fieldName
 */
export { extractFields as extractFormulaFields }

// ════════════════════════════════════════
// 节点类型
// ════════════════════════════════════════

/**
 * 设计器节点类型枚举
 *
 * 分两大类：
 * 1. 字段节点（field）：对应表单数据字段，有 key、有值
 * 2. 容器节点（container）：布局容器，可嵌套子节点
 */
export type DesignerNodeType = DesignerFieldType | DesignerContainerType

/** 字段节点类型（原有 + v3 新增高级字段 + 扩展输入/选择变体） */
export type DesignerFieldType =
  // ── 基础 ──
  | 'text'
  | 'textarea'
  | 'number'
  | 'password'
  | 'tel'
  | 'email'
  | 'url'
  | 'search'
  | 'color'
  | 'select'
  | 'combobox'
  | 'tree-select'
  | 'radio'
  | 'checkbox'
  | 'cascader'
  | 'switch'
  | 'date'
  | 'date-range'
  | 'time'
  | 'rate'
  | 'slider'
  | 'upload'
  | 'image-upload'
  | 'camera'
  | 'scan-code' // 扫码识别（自带兜底链）
  | 'divider'
  | 'title'
  | 'paragraph'
  // ── v3 高级字段 ──
  | 'subform' // 子表单（可添加多行）
  | 'relate' // 关联选择（关联用户/部门等）
  | 'richtext' // 富文本
  | 'signature' // 电子签名
  | 'address' // 地址选择（省市区联动）
  | 'idcard' // 证件号码（类型+号码）
  | 'matrix' // 评分矩阵
  | 'serial' // 流水号（自动生成）
  | 'map-picker' // 地图选点（输入型，产出 {lng,lat}）
  | 'toggle-list' // 开关列表（输入型，值 = 被打开行的 id 数组）
  // ── 展示类（2026-10-18）：纯展示、不进提交数据（isLayout=true） ──
  | 'image' // 图片
  | 'avatar' // 头像
  | 'progress' // 进度条
  | 'tag' // 标签
  | 'data-table' // 明细表（数据源：静态 / 绑定字段 / 接口）
  | 'chart' // 图表（同一套数据源；数据是完整 option 则原样用）
  | 'chart-table' // 图表+表格上下组合（同一份数据喂两处）
  | 'amap' // 地图标记展示（同一套数据源；行→标记点）
  | 'empty' // 空状态
  | 'skeleton' // 骨架屏
  | 'result' // 结果态（success/error/info/warning/404/empty，纯静态）
  | 'loading' // 加载态（spinner/skeleton，纯静态；不透传全屏与遮罩）

/** 容器节点类型 */
export type DesignerContainerType =
  | 'card' // 分组卡片
  | 'grid' // 栅格行（多列布局）
  | 'flex' // 横排行（字段并排，按 span 定占比）
  | 'tabs' // 标签页容器
  | 'collapse' // 折叠面板容器
  | 'steps' // 步骤条容器

// ════════════════════════════════════════
// 树形节点定义
// ════════════════════════════════════════

/**
 * 设计器节点 — 统一的字段和容器节点
 *
 * 字段节点（isContainer=false）：有 key、有数据值
 * 容器节点（isContainer=true）：无 key、无数据值，但有 children 子节点
 */
export interface DesignerNode extends DesignerDisplayProps {
  /** 实例唯一 id（设计器内部用） */
  id: string
  /** 节点类型（字段类型或容器类型） */
  type: DesignerNodeType
  /** 显示标签 */
  label: string

  // ── 字段节点属性（容器节点不使用） ──
  /** 字段 key（表单数据绑定的 key） */
  key?: string
  /** 是否必填 */
  required?: boolean
  /** 占位文本 */
  placeholder?: string
  /** 前缀图标（lucide 图标名，输入类字段显示在输入框左侧） */
  icon?: string
  /** 后缀文字（输入框内右侧固定显示，如单位 "元" / "kg"） */
  suffixText?: string
  /** 默认值 */
  defaultValue?: unknown
  /** 是否禁用 */
  disabled?: boolean
  /** 是否只读 */
  readonly?: boolean
  /** 选项列表（select/radio/checkbox 用） */
  options?: string[]
  /** 级联选项（cascader 用，JSON 文本） */
  cascaderOptions?: string
  /** 数字相关：min/max/step */
  min?: number
  max?: number
  step?: number
  /** text/textarea 最大长度 */
  maxLength?: number
  /** textarea 行数 */
  rows?: number
  /** rate 星星数 */
  rateMax?: number
  /** rate 是否允许半星 */
  rateAllowHalf?: boolean
  /** scan-code：识别格式 all/qr/barcode、前缀过滤、长度过滤（空/0 = 不过滤） */
  scanFormats?: 'all' | 'qr' | 'barcode'
  scanPrefix?: string
  scanLength?: number
  /** 栅格宽度：24 整行 / 12 半行 / 8 三分之一，默认 24 */
  span?: number
  /** 提示文字 */
  hint?: string
  /** upload 类型：accept */
  accept?: string
  /** upload 类型：是否多选 */
  multiple?: boolean
  /** upload 类型：最大文件大小 MB */
  maxSize?: number
  /** 条件显示：当指定字段值匹配时显示此字段 */
  visibleWhenField?: string
  /** 条件显示：匹配值 */
  visibleWhenValue?: string
  /** 条件显示：是否反向匹配（不等于时显示） */
  visibleWhenNot?: boolean
  /** 条件必填：当指定字段值匹配时本字段必填 */
  requiredWhenField?: string
  /** 条件必填：匹配值 */
  requiredWhenValue?: string
  /** 条件必填：是否反向匹配 */
  requiredWhenNot?: boolean
  /** 条件禁用：当指定字段值匹配时本字段禁用 */
  disabledWhenField?: string
  /** 条件禁用：匹配值 */
  disabledWhenValue?: string
  /** 条件禁用：是否反向匹配 */
  disabledWhenNot?: boolean
  /** 级联选项：依赖字段 key（本字段选项由依赖值在 optionsMap 查出） */
  optionsFrom?: string
  /** 级联选项映射（每行一条：依赖值=选项1,选项2,选项3） */
  optionsMap?: string
  /** 分组 key（兼容旧版平铺模式，相同 group 的字段渲染在一个卡片内） */
  group?: string

  // ── v3 高级字段专属属性 ──
  /** subform 子表单：列定义（每行一个，格式：标签|key|类型） */
  subformColumns?: string
  /** matrix 评分矩阵：行标题（每行一个） */
  matrixRows?: string
  /** matrix 评分矩阵：列标题（每行一个） */
  matrixCols?: string
  /** address 地址：是否显示详细地址输入框 */
  addressDetail?: boolean
  /** idcard 证件：证件类型列表（每行一个，格式：类型名） */
  idcardTypes?: string
  /** serial 流水号：前缀 */
  serialPrefix?: string
  /** serial 流水号：日期格式 */
  serialDateFormat?: string
  /** richtext 富文本：工具栏模式 */
  richtextToolbar?: 'simple' | 'full'

  // ── v3 新增：校验规则配置 ──
  /** 校验规则配置 */
  validation?: DesignerValidation
  /** 样式配置 */
  styleConfig?: DesignerStyleConfig
  /** 事件配置 */
  eventConfig?: DesignerEventConfig
  /** 数据源配置 */
  dataConfig?: DesignerDataConfig

  // ── v3 高级字段默认值 ──
  /** relate 关联选择：关联实体类型 */
  relateEntityType?: 'user' | 'dept' | 'role' | 'custom'
  /** 字段在其父容器内的槽位下标（tabs/collapse/steps 容器用，对应容器定义数组下标） */
  containerSlot?: number

  // ── 容器节点属性（字段节点不使用） ──
  /** 是否容器节点 */
  isContainer?: boolean
  /** 子节点列表（容器节点用） */
  children?: DesignerNode[]
  /** 容器配置（容器节点用） */
  containerConfig?: DesignerContainerConfig
}

// ════════════════════════════════════════
// v3 新增配置类型
// ════════════════════════════════════════

/** 校验规则配置 */
export interface DesignerValidation {
  /** 必填提示语 */
  requiredMessage?: string
  /** 最小长度 */
  minLength?: number
  /** 最大长度 */
  maxLength?: number
  /** 正则表达式 */
  pattern?: string
  /** 正则校验提示语 */
  patternMessage?: string
  /** 内置校验类型（手机号/邮箱/身份证/URL） */
  builtinType?: 'phone' | 'email' | 'idcard' | 'url' | 'none'
  /** 去除空格 */
  trim?: boolean
  /** 唯一校验 */
  unique?: boolean
  /** 实时校验 */
  realtime?: boolean
  // ── P1-7 高级字段专项校验 ──
  /** richtext 最小字数（去标签后） */
  richtextMinChars?: number
  /** matrix 必填行数（已评分行数下限） */
  matrixMinRows?: number
  /** signature 必签（未签名视为空） */
  signatureRequired?: boolean
}

/** 样式配置（字段级）——仅保留 FormRenderer 实际消费的键；labelWidth/customCss 曾是无消费者的死设置已删 */
export interface DesignerStyleConfig {
  /** 标签位置 */
  labelPosition?: 'left' | 'top' | 'hidden'
  /** 控件宽度 */
  controlWidth?: '100%' | '50%' | 'auto'
  /** 控件尺寸 */
  size?: 'small' | 'default' | 'large'
  /** 圆角风格 */
  radius?: 'default' | '0px' | '12px' | '20px'
  /** 自定义类名 */
  customClass?: string
  /** 边框颜色（十六进制） */
  borderColor?: string
  /** 聚焦边框色（十六进制） */
  focusBorderColor?: string
}

/** 事件配置 */
export interface DesignerEventConfig {
  /** 值变化事件 */
  onChange?: {
    enabled: boolean
    action?: string
    targetField?: string
    /** callApi 动作的接口地址 */
    apiUrl?: string
    /** toggleVisible 方向反转（TD-41）：true = 有内容时隐藏目标 */
    invert?: boolean
  }
  /** 获得焦点事件（2026-10-31 运行时接通，支持与 onChange 相同的动作集） */
  onFocus?: {
    enabled: boolean
    action?: string
    targetField?: string
    /** callApi 动作的接口地址 */
    apiUrl?: string
  }
  /** 失去焦点事件 */
  onBlur?: {
    enabled: boolean
    action?: string
  }
  /** 字段联动类型 */
  linkageType?: 'none' | 'followValue' | 'followOptions' | 'showHide'
  /** 联动公式 */
  linkageFormula?: string
}

/** 数据源配置 */
export interface DesignerDataConfig {
  /** 默认值类型 */
  defaultType?: 'none' | 'fixed' | 'formula' | 'api' | 'currentUser' | 'currentTime'
  /** 默认值公式 */
  defaultFormula?: string
  /** 默认值接口地址（defaultType=api 时有效） */
  defaultApiUrl?: string
  /** 默认值响应取值路径，如 data.value（留空取整个响应体） */
  defaultApiDataPath?: string
  /** 数据源类型 */
  sourceType?: 'none' | 'api' | 'database' | 'userList' | 'deptList'
  /** 接口地址 */
  apiUrl?: string
  /** label 字段名 */
  labelField?: string
  /** value 字段名 */
  valueField?: string
  /** 联动数据源 */
  linkageSource?: 'none' | 'userList' | 'deptList' | 'roleList'
  /** 联动条件字段 */
  linkageField?: string
  /** 是否缓存数据 */
  cacheData?: boolean
  /** 提交后清空 */
  clearAfterSubmit?: boolean
}

/** 容器配置 */
export interface DesignerContainerConfig {
  // ── grid 栅格行 ──
  /** 栅格列数（grid 用） */
  columns?: number

  // ── flex 横排行 ──
  /** 子字段间距 px（flex 用，默认 12） */
  gap?: number
  /** 是否允许换行（flex 用，默认 true） */
  wrap?: boolean
  /** 主轴对齐（flex 用，默认 start） */
  justify?: 'start' | 'center' | 'space-between'

  // ── tabs 标签页 ──
  /** 标签页定义（tabs 用） */
  tabs?: { label: string; name: string }[]
  /**
   * @deprecated **未实现**：全库无人读取。激活页状态由 FormBuilder 的运行时 ref（tabStates）持有，
   * 不进 schema（toSchema 也只导出 tabs 列表）。写它不会有效果。
   */
  activeTab?: string

  // ── collapse 折叠面板 ──
  /** 折叠项定义（collapse 用） */
  collapseItems?: { title: string; expanded: boolean }[]
  /**
   * @deprecated **未实现**：全库无人读取（同 activeTab，展开态在运行时 collapseStates 里）。
   */
  activeCollapse?: number

  // ── steps 步骤条 ──
  /** 步骤定义（steps 用） */
  steps?: { title: string }[]
  /**
   * @deprecated **未实现**：全库无人读取（同 activeTab，当前步在运行时 stepStates 里）。
   */
  activeStep?: number
}

// ════════════════════════════════════════
// 兼容旧版：DesignerField = DesignerNode (字段节点)
// ════════════════════════════════════════

/** @deprecated 使用 DesignerNode 代替 */
export type DesignerField = DesignerNode

// ════════════════════════════════════════
// 表单元信息
// ════════════════════════════════════════

/** 表单元信息 — 扩展版，支持设计器产出完整布局配置 */
export interface FormMeta {
  title?: string
  description?: string
  submitText?: string
  /** 布局模式（默认 single） */
  layout?: 'single' | 'grid' | 'steps'
  /** 栅格列数（grid 模式，默认 2） */
  columns?: number
  /** 重置按钮文本 */
  resetText?: string
  /** 是否隐藏底部按钮 */
  hideActions?: boolean
  /** 是否实时校验 */
  validateOnChange?: boolean
  /** 步骤定义（steps 模式） */
  steps?: { title: string; fields: string[] }[]
  // ── v3 新增 ──
  /** 标签位置 */
  labelPosition?: 'left' | 'top' | 'hidden'
  /** 标签宽度 */
  labelWidth?: 'default' | '80px' | '120px' | 'auto'
  /** 提交模式 */
  submitMode?: 'once' | 'multiple' | 'unique'
  /** 提交后清空 */
  clearAfterSubmit?: boolean
  // ── 目标收集模式（FormTargetCollect） ──
  /** 收集类型：single=单页表单（默认）；target=目标收集（按门店清单聚合上传） */
  collectType?: 'single' | 'target'
  /** 目标清单（collectType=target 时有效）：发布端渲染目标收集表格 */
  targets?: Array<{ id: number; name: string; license?: string; address?: string; [key: string]: unknown }>
}

/** 设计器数据格式版本（FormDesign.schemaVersion）。导入时兼容性检测依赖此值，改版本号需同步迁移逻辑 */
export const FORM_DESIGN_VERSION = 3

/** 完整表单设计：元信息 + 节点树 */
export interface FormDesign {
  /** Schema 版本号（用于导入时兼容性检测） */
  schemaVersion?: number
  meta: FormMeta
  /** v3: 节点树（支持嵌套容器） */
  nodes: DesignerNode[]
  /** @deprecated v2 兼容字段，导入时自动转换为 nodes */
  fields?: DesignerNode[]
}

/** 收集记录：一次提交的数据快照 */
export interface CollectRecord {
  id: string
  time: string
  data: Record<string, unknown>
}

// ════════════════════════════════════════
// 节点类型注册表
// ════════════════════════════════════════

export interface FieldTypeMeta {
  type: DesignerNodeType
  label: string
  icon: string
  /**
   * **翻译后的分组标题**（如 zh-CN 的「基础」「展示」、en-US 的 "Basic" / "Display"）。
   *
   * 为什么是 `string` 而不是中文字面量联合（#502）：注册表里 `group` 存的是 **i18n key**
   * （`fbGroup.basic` / `fbGroup.display` …），`getFieldTypes()` 会按当前语言翻成标题。
   * 旧声明写的是 `'基础' | '选择' | …` 六个中文字面量，两个问题：
   *   1. 运行时值是**翻译结果**，en-US 下是 "Advanced fields"，跟这六个值都不相等；
   *   2. 联合**少了 `fbGroup.display`（「展示」）这一组** —— 注册表里其实有 7 个 group key。
   * 它靠 `as` 断言按进类型系统，于是 `meta.group === '展示'` 会**报类型错**、
   * 可在 zh-CN 运行时本来是成立的 —— "类型错 + 运行时对"是最坑的一种。
   * 需要按分组判断时，请拿它与**同一个 group key 翻出来的标题**相比（`DesignerPanel` 就是这么做的），
   */
  group: string
  /** 是否容器节点 */
  isContainer?: boolean
  defaults: Partial<DesignerNode>
}

/** 节点类型注册表：设计器左侧面板数据源 */
/**
 * 节点类型注册表 — 从 fieldRegistry 派生（单一事实源）
 * 新增/修改字段类型只需改 fieldRegistry，此处自动同步。
 * label/group 在调用时翻译（fieldRegistry 存 i18n key），函数形式保证响应语言切换。
 */
export function getFieldTypes(): FieldTypeMeta[] {
  return getFieldMeta().map((r) => ({
    type: r.type as DesignerNodeType,
    label: t(r.label),
    icon: r.icon,
    group: t(r.group),
    isContainer: r.isContainer,
    defaults: (typeof r.defaults === 'function' ? r.defaults() : r.defaults) as Partial<DesignerNode>,
  }))
}

// ════════════════════════════════════════
// 工具函数
// ════════════════════════════════════════

let _fid = 0
/** 生成节点实例 id */
export function genFieldId(): string {
  return 'n' + ++_fid + '_' + Date.now().toString(36)
}

/** 生成收集记录 id */
export function genRecordId(): string {
  return uuid('r')
}

/** 收集记录存储 key：基于字段结构指纹。
 *  仅用于无表单 id 的场景（FormCollect 独立嵌入、完整分享码），
 *  已保存表单一律用 formCollectStorageKey(id)——指纹相同会让不同表单共用一个数据桶。 */
export function collectStorageKey(fields: { key?: string; type: string }[]): string {
  const seed = fields.map((f) => `${f.key ?? ''}:${f.type}`).join('|')
  let h = 0
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0
  return 'fd_collect_' + Math.abs(h).toString(36)
}

/** 已保存表单的收集记录存储 key：以表单 id 为唯一锚，结构相同的表单不再共用数据桶 */
export function formCollectStorageKey(formId: string): string {
  return 'fd_collect_' + formId
}

/** 按注册表 defaults 创建新节点实例（defaults 来自 fieldRegistry 单一事实源） */
export function createField(type: DesignerNodeType, index: number): DesignerNode {
  const defaults = getFieldDefaults(type)
  // 只查这一条、只翻译这一个名字。过去先 getFieldTypes() 把整张表 40 项 × 80 次 t() 全翻译一遍
  // 再 find（同机实测整表翻译的单次成本约是直查的 50 倍），Excel 导入/程序化建表要按字段数线性放大。
  const reg = findFieldRegistration(type)
  const node: DesignerNode = {
    id: genFieldId(),
    type,
    label: reg ? t(reg.label) : type,
    ...(defaults as Partial<DesignerNode>),
  }
  // 字段节点自动生成 key
  if (!reg?.isContainer) {
    node.key = `field${index}`
  }
  // 容器节点初始化 children
  if (reg?.isContainer) {
    node.children = []
  }
  return node
}

/** 判断节点是否为容器节点 */
export function isContainerNode(node: DesignerNode): boolean {
  return !!node.isContainer || ['card', 'grid', 'flex', 'tabs', 'collapse', 'steps'].includes(node.type)
}

/** 判断节点是否为字段节点（非容器） */
export function isFieldNode(node: DesignerNode): boolean {
  return !isContainerNode(node)
}

/** 获取所有容器类型 */
export const CONTAINER_TYPES: DesignerContainerType[] = ['card', 'grid', 'flex', 'tabs', 'collapse', 'steps']

/** 获取所有字段类型（非容器）——清单已外移到 field-node-types.ts，此处 re-export 保持既有导入路径 */
export { FIELD_NODE_TYPES } from './field-node-types'
