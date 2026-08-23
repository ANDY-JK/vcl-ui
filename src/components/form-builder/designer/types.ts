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

import type { FormSchema, FormField, FieldType, FieldContainer, FieldContainerType } from '../types'
import type { Option, CascaderOption } from '@/components/shared/types'

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

/** 字段节点类型（原有 + v3 新增高级字段） */
export type DesignerFieldType =
  // ── 基础 ──
  | 'text' | 'textarea' | 'number'
  | 'select' | 'radio' | 'checkbox' | 'cascader'
  | 'switch' | 'date' | 'time' | 'rate' | 'slider'
  | 'upload' | 'divider' | 'title'
  // ── v3 高级字段 ──
  | 'subform'      // 子表单（可添加多行）
  | 'relate'       // 关联选择（关联用户/部门等）
  | 'richtext'     // 富文本
  | 'signature'    // 电子签名
  | 'address'      // 地址选择（省市区联动）
  | 'idcard'       // 证件号码（类型+号码）
  | 'matrix'       // 评分矩阵
  | 'serial'       // 流水号（自动生成）

/** 容器节点类型 */
export type DesignerContainerType =
  | 'card'      // 分组卡片
  | 'grid'      // 栅格行（多列布局）
  | 'tabs'      // 标签页容器
  | 'collapse'  // 折叠面板容器
  | 'steps'     // 步骤条容器

// ════════════════════════════════════════
// 树形节点定义
// ════════════════════════════════════════

/**
 * 设计器节点 — 统一的字段和容器节点
 *
 * 字段节点（isContainer=false）：有 key、有数据值
 * 容器节点（isContainer=true）：无 key、无数据值，但有 children 子节点
 */
export interface DesignerNode {
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
}

/** 样式配置 */
export interface DesignerStyleConfig {
  /** 标签宽度 */
  labelWidth?: 'default' | '80px' | '120px' | 'auto'
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
  /** 自定义 CSS 代码 */
  customCss?: string
}

/** 事件配置 */
export interface DesignerEventConfig {
  /** 值变化事件 */
  onChange?: {
    enabled: boolean
    action?: string
    targetField?: string
  }
  /** 获得焦点事件 */
  onFocus?: {
    enabled: boolean
    action?: string
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

  // ── tabs 标签页 ──
  /** 标签页定义（tabs 用） */
  tabs?: { label: string; name: string }[]
  /** 当前激活标签页 */
  activeTab?: string

  // ── collapse 折叠面板 ──
  /** 折叠项定义（collapse 用） */
  collapseItems?: { title: string; expanded: boolean }[]
  /** 当前展开的折叠项 index */
  activeCollapse?: number

  // ── steps 步骤条 ──
  /** 步骤定义（steps 用） */
  steps?: { title: string }[]
  /** 当前步骤 index */
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
}

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
  group: '基础' | '选择' | '高级' | '高级字段' | '布局容器' | '布局'
  /** 是否容器节点 */
  isContainer?: boolean
  defaults: Partial<DesignerNode>
}

/** 节点类型注册表：设计器左侧面板数据源 */
export const FIELD_TYPES: FieldTypeMeta[] = [
  // ── 基础 ──
  { type: 'text', label: '单行输入', icon: 'square-pen', group: '基础',
    defaults: { placeholder: '请输入', span: 24 } },
  { type: 'textarea', label: '多行文本', icon: 'align-left', group: '基础',
    defaults: { placeholder: '请输入', rows: 3, span: 24 } },
  { type: 'number', label: '数字输入', icon: 'hash', group: '基础',
    defaults: { min: 0, max: 100, step: 1, span: 12 } },
  // ── 选择 ──
  { type: 'select', label: '下拉选择', icon: 'chevron-down', group: '选择',
    defaults: { options: ['选项1', '选项2'], placeholder: '请选择', span: 12 } },
  { type: 'radio', label: '单选按钮', icon: 'circle-check', group: '选择',
    defaults: { options: ['选项A', '选项B'], span: 12 } },
  { type: 'checkbox', label: '复选按钮', icon: 'check-square', group: '选择',
    defaults: { options: ['选项A', '选项B'], span: 12 } },
  { type: 'cascader', label: '级联选择', icon: 'chevrons-down-up', group: '选择',
    defaults: { placeholder: '请选择', span: 24,
      cascaderOptions: '[{"label":"一级","value":"1","children":[{"label":"二级","value":"1-1"}]}]' } },
  // ── 高级 ──
  { type: 'switch', label: '开关', icon: 'toggle-left', group: '高级',
    defaults: { span: 12 } },
  { type: 'date', label: '日期选择', icon: 'calendar', group: '高级',
    defaults: { placeholder: '请选择日期', span: 12 } },
  { type: 'time', label: '时间选择', icon: 'clock', group: '高级',
    defaults: { placeholder: '请选择时间', span: 12 } },
  { type: 'rate', label: '评分', icon: 'star', group: '高级',
    defaults: { rateMax: 5, span: 12 } },
  { type: 'slider', label: '滑块', icon: 'sliders-horizontal', group: '高级',
    defaults: { min: 0, max: 100, step: 1, span: 24 } },
  { type: 'upload', label: '文件上传', icon: 'upload', group: '高级',
    defaults: { span: 24, accept: 'image/*', multiple: true, maxSize: 10 } },
  // ── 高级字段 (v3) ──
  { type: 'subform', label: '子表单', icon: 'table', group: '高级字段',
    defaults: { span: 24, placeholder: '可添加多行', subformColumns: '姓名|name|text\n电话|phone|number' } },
  { type: 'relate', label: '关联选择', icon: 'link', group: '高级字段',
    defaults: { span: 24, placeholder: '点击选择关联数据', relateEntityType: 'user' } },
  { type: 'richtext', label: '富文本', icon: 'type', group: '高级字段',
    defaults: { span: 24, richtextToolbar: 'simple' } },
  { type: 'signature', label: '电子签名', icon: 'pen-tool', group: '高级字段',
    defaults: { span: 24 } },
  { type: 'address', label: '地址选择', icon: 'map-pin', group: '高级字段',
    defaults: { span: 24, addressDetail: true } },
  { type: 'idcard', label: '证件号码', icon: 'credit-card', group: '高级字段',
    defaults: { span: 24, idcardTypes: '身份证\n护照\n军官证' } },
  { type: 'matrix', label: '评分矩阵', icon: 'grid-3x3', group: '高级字段',
    defaults: { span: 24, matrixRows: '服务态度\n专业能力\n响应速度', matrixCols: '满意\n一般\n不满意' } },
  { type: 'serial', label: '流水号', icon: 'bar-chart', group: '高级字段',
    defaults: { span: 12, serialPrefix: 'NO', serialDateFormat: 'YYYYMMDD' } },
  // ── 布局容器 (v3) ──
  { type: 'card', label: '分组卡片', icon: 'layout-template', group: '布局容器', isContainer: true,
    defaults: { isContainer: true, containerConfig: { } } },
  { type: 'grid', label: '栅格行', icon: 'grid-2x2', group: '布局容器', isContainer: true,
    defaults: { isContainer: true, containerConfig: { columns: 2 } } },
  { type: 'tabs', label: '标签页', icon: 'panel-top', group: '布局容器', isContainer: true,
    defaults: { isContainer: true, containerConfig: { tabs: [{ label: '标签页 1', name: 'tab1' }], activeTab: 'tab1' } } },
  { type: 'collapse', label: '折叠面板', icon: 'chevron-down', group: '布局容器', isContainer: true,
    defaults: { isContainer: true, containerConfig: { collapseItems: [{ title: '折叠项 1', expanded: true }], activeCollapse: 0 } } },
  { type: 'steps', label: '步骤条', icon: 'clock', group: '布局容器', isContainer: true,
    defaults: { isContainer: true, containerConfig: { steps: [{ title: '步骤 1' }, { title: '步骤 2' }], activeStep: 0 } } },
  // ── 布局元素 ──
  { type: 'divider', label: '分割线', icon: 'minus', group: '布局',
    defaults: { span: 24 } },
  { type: 'title', label: '标题文字', icon: 'type', group: '布局',
    defaults: { span: 24 } },
]

// ════════════════════════════════════════
// 工具函数
// ════════════════════════════════════════

/**
 * 从联动公式中提取依赖字段 key
 *
 * 公式语法：`{{fieldName}}` → 提取 fieldName
 * 例如 `{{price}} * {{quantity}}` → ['price', 'quantity']
 */
export function extractFormulaFields(formula: string): string[] {
  const regex = /\{\{(\w+)\}\}/g
  const fields: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(formula)) !== null) {
    if (!fields.includes(match[1])) fields.push(match[1])
  }
  return fields
}

let _fid = 0
/** 生成节点实例 id */
export function genFieldId(): string {
  return 'n' + (++_fid) + '_' + Date.now().toString(36)
}

/** 生成收集记录 id */
export function genRecordId(): string {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

/** 收集记录存储 key：基于字段结构指纹 */
export function collectStorageKey(fields: { key?: string; type: string }[]): string {
  const seed = fields.map(f => `${f.key ?? ''}:${f.type}`).join('|')
  let h = 0
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0
  return 'fd_collect_' + Math.abs(h).toString(36)
}

/** 按注册表 defaults 创建新节点实例 */
export function createField(type: DesignerNodeType, index: number): DesignerNode {
  const meta = FIELD_TYPES.find(t => t.type === type)!
  const node: DesignerNode = {
    id: genFieldId(),
    type,
    label: meta.label,
    ...meta.defaults,
  }
  // 字段节点自动生成 key
  if (!meta.isContainer) {
    node.key = `field${index}`
  }
  // 容器节点初始化 children
  if (meta.isContainer) {
    node.children = []
  }
  return node
}

/** 判断节点是否为容器节点 */
export function isContainerNode(node: DesignerNode): boolean {
  return !!node.isContainer || ['card', 'grid', 'tabs', 'collapse', 'steps'].includes(node.type)
}

/** 判断节点是否为字段节点（非容器） */
export function isFieldNode(node: DesignerNode): boolean {
  return !isContainerNode(node)
}

/** 获取所有容器类型 */
export const CONTAINER_TYPES: DesignerContainerType[] = ['card', 'grid', 'tabs', 'collapse', 'steps']

/** 获取所有字段类型（非容器） */
export const FIELD_NODE_TYPES: DesignerFieldType[] = [
  'text', 'textarea', 'number', 'select', 'radio', 'checkbox', 'cascader',
  'switch', 'date', 'time', 'rate', 'slider', 'upload', 'divider', 'title',
  'subform', 'relate', 'richtext', 'signature', 'address', 'idcard', 'matrix', 'serial',
]

/** 解析 cascader JSON 文本；失败返回 null */
export function parseCascaderOptions(text?: string): CascaderOption[] | null {
  if (!text) return null
  try {
    const v = JSON.parse(text)
    return Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

// ════════════════════════════════════════
// 树操作工具函数
// ════════════════════════════════════════

/**
 * 深度优先遍历节点树，返回所有节点（扁平化）
 */
export function flattenNodes(nodes: DesignerNode[]): DesignerNode[] {
  const result: DesignerNode[] = []
  function walk(list: DesignerNode[]): void {
    for (const node of list) {
      result.push(node)
      if (node.children?.length) walk(node.children)
    }
  }
  walk(nodes)
  return result
}

/**
 * 查找节点（深度优先）
 */
export function findNode(nodes: DesignerNode[], id: string): DesignerNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children?.length) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

/**
 * 查找节点的父节点和索引
 */
export function findParent(nodes: DesignerNode[], id: string): { parent: DesignerNode[]; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return { parent: nodes, index: i }
    if (nodes[i].children?.length) {
      const found = findParent(nodes[i].children!, id)
      if (found) return found
    }
  }
  return null
}

/**
 * 获取节点的路径链（从根到目标节点），用于面包屑导航
 * @returns 路径上的所有节点，从根容器到目标节点；找不到返回空数组
 */
export function getNodePath(nodes: DesignerNode[], id: string): DesignerNode[] {
  const path: DesignerNode[] = []
  function walk(list: DesignerNode[]): boolean {
    for (const node of list) {
      path.push(node)
      if (node.id === id) return true
      if (node.children?.length && walk(node.children)) return true
      path.pop()
    }
    return false
  }
  walk(nodes)
  return path
}

/**
 * 不可变更新：将源节点移动到目标节点的 before/after/inside 位置
 * 支持跨容器移动
 */
export function moveNodeRelative(
  nodes: DesignerNode[],
  sourceId: string,
  targetId: string,
  position: 'before' | 'after' | 'inside',
): DesignerNode[] {
  // 1. 找到源节点并从树中移除
  const sourceNode = findNode(nodes, sourceId)
  if (!sourceNode) return nodes
  let result = removeNodeFromTree(nodes, sourceId)

  // 2. 根据位置插入
  if (position === 'inside') {
    // 插入到目标容器内（末尾）
    result = insertChildNode(result, targetId, sourceNode, -1)
  } else {
    // before/after：找到目标节点的父级和索引
    const targetParent = findParent(result, targetId)
    if (!targetParent) {
      // 目标找不到，追加到根级末尾
      result = insertNode(result, sourceNode, -1)
    } else {
      const insertIdx = position === 'before' ? targetParent.index : targetParent.index + 1
      // 如果目标是根级
      if (targetParent.parent === result) {
        result = insertNode(result, sourceNode, insertIdx)
      } else {
        // 目标在某个容器内 — 需要重建路径
        // 使用 moveNodeInTree 的逻辑
        result = moveNodeRelativeInTree(result, sourceNode, targetId, insertIdx)
      }
    }
  }

  return result
}

/** 辅助：在树中找到目标容器并按索引插入子节点（递归） */
function moveNodeRelativeInTree(
  nodes: DesignerNode[],
  sourceNode: DesignerNode,
  targetId: string,
  insertIdx: number,
): DesignerNode[] {
  // 找到目标所在父级，插入到指定索引
  const targetParent = findParent(nodes, targetId)
  if (!targetParent) return insertNode(nodes, sourceNode, -1)

  // 如果父级就是根 nodes
  if (targetParent.parent === nodes) {
    return insertNode(nodes, sourceNode, insertIdx)
  }

  // 递归：找到包含 targetParent.parent 的容器并替换
  return nodes.map(node => {
    if (node.children === targetParent.parent) {
      return { ...node, children: insertNode(targetParent.parent, sourceNode, insertIdx) }
    }
    if (node.children?.length) {
      return { ...node, children: moveNodeRelativeInTree(node.children, sourceNode, targetId, insertIdx) }
    }
    return node
  })
}

/**
 * 不可变更新：替换节点树中指定 id 的节点
 */
export function updateNodeInTree(nodes: DesignerNode[], id: string, patch: Partial<DesignerNode>): DesignerNode[] {
  return nodes.map(node => {
    if (node.id === id) {
      return { ...node, ...patch }
    }
    if (node.children?.length) {
      return { ...node, children: updateNodeInTree(node.children, id, patch) }
    }
    return node
  })
}

/**
 * 不可变更新：删除节点树中指定 id 的节点
 */
export function removeNodeFromTree(nodes: DesignerNode[], id: string): DesignerNode[] {
  return nodes
    .filter(node => node.id !== id)
    .map(node => {
      if (node.children?.length) {
        return { ...node, children: removeNodeFromTree(node.children, id) }
      }
      return node
    })
}

/**
 * 不可变更新：在指定位置插入节点
 * @param nodes 节点列表
 * @param node 要插入的节点
 * @param index 插入位置（-1 或超出长度则追加到末尾）
 */
export function insertNode(nodes: DesignerNode[], node: DesignerNode, index: number): DesignerNode[] {
  const list = [...nodes]
  if (index < 0 || index >= list.length) {
    list.push(node)
  } else {
    list.splice(index, 0, node)
  }
  return list
}

/**
 * 不可变更新：在容器节点的 children 中插入子节点
 */
export function insertChildNode(nodes: DesignerNode[], containerId: string, child: DesignerNode, index: number = -1): DesignerNode[] {
  return nodes.map(node => {
    if (node.id === containerId && node.children !== undefined) {
      return { ...node, children: insertNode(node.children, child, index) }
    }
    if (node.children?.length) {
      return { ...node, children: insertChildNode(node.children, containerId, child, index) }
    }
    return node
  })
}

/**
 * 不可变更新：移动节点（从原位置移到新位置）
 */
export function moveNodeInTree(nodes: DesignerNode[], fromId: string, toParentId: string | null, toIndex: number): DesignerNode[] {
  // 1. 找到并移除原节点
  const movingNode = findNode(nodes, fromId)
  if (!movingNode) return nodes

  let result = removeNodeFromTree(nodes, fromId)

  // 2. 插入到目标位置
  if (toParentId === null) {
    // 插入到根级
    result = insertNode(result, movingNode, toIndex)
  } else {
    // 插入到目标容器
    result = insertChildNode(result, toParentId, movingNode, toIndex)
  }

  return result
}

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
      if (node.type === 'tabs' && cfg?.tabs?.length) ctx.tabs = cfg.tabs
      if (node.type === 'collapse' && cfg?.collapseItems?.length) ctx.collapseItems = cfg.collapseItems
      if (node.type === 'steps' && cfg?.steps?.length) ctx.steps = cfg.steps
      flattenWithContainer(node.children ?? [], ctx, out)
    } else {
      // 字段携带其 containerSlot（父容器 tabs/collapse/steps 槽位）
      const c = container && node.containerSlot !== undefined
        ? { ...container, slot: node.containerSlot }
        : container
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
    // 跳过无 key 的字段（divider/title 除外）
    if (!f.key && f.type !== 'divider' && f.type !== 'title') continue

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

    // 默认值
    if (f.defaultValue !== undefined) {
      base.default = f.defaultValue
    }

    // 选项类型
    if (f.options?.length) {
      base.options = f.options.map(o => ({ value: o, label: o }) as Option)
    }

    // 数字属性
    if (f.min !== undefined) base.props = { ...base.props, min: f.min }
    if (f.max !== undefined) base.props = { ...base.props, max: f.max }
    if (f.step !== undefined) base.props = { ...base.props, step: f.step }

    // text 属性
    if (f.maxLength !== undefined) base.props = { ...base.props, maxlength: f.maxLength }

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

    // 联动配置映射（从 eventConfig 导出）
    const evt = f.eventConfig
    if (evt?.linkageType && evt.linkageType !== 'none' && evt.linkageFormula) {
      // 从公式中提取依赖字段 {{fieldName}} → fieldName
      const dependsOn = extractFormulaFields(evt.linkageFormula)
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
        onChange: { action: evt.onChange.action, targetField: evt.onChange.targetField },
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
        rules.push((v: string) => v.length < val.minLength! ? `至少 ${val.minLength} 个字符` : undefined)
      }
      if (val.maxLength !== undefined && val.maxLength > 0) {
        rules.push((v: string) => v.length > val.maxLength! ? `最多 ${val.maxLength} 个字符` : undefined)
      }
      if (val.pattern) {
        try {
          const re = new RegExp(val.pattern)
          rules.push((v: string) => !re.test(v) ? (val.patternMessage || '格式不正确') : undefined)
        } catch { /* 无效正则跳过 */ }
      }
      if (val.builtinType) {
        const builtinPatterns: Record<string, { re: RegExp; msg: string }> = {
          phone: { re: /^1[3-9]\d{9}$/, msg: '请输入正确的手机号' },
          email: { re: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, msg: '请输入正确的邮箱' },
          idcard: { re: /^\d{17}[\dXx]$/, msg: '请输入正确的身份证号' },
          url: { re: /^https?:\/\/.+/, msg: '请输入正确的 URL' },
        }
        const p = builtinPatterns[val.builtinType]
        if (p) rules.push((v: string) => !p.re.test(v) ? p.msg : undefined)
      }
      if (val.trim) {
        // trim 规则在 FormBuilder 层处理，这里不需要加 rule
      }
      if (rules.length) base.rules = rules
    }

    if (container) base.container = container
    formFields.push(base)
  }

  return {
    schemaVersion: 3,
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

/** 节点类型 → 中文标签 */
export function getTypeLabel(type: DesignerNodeType): string {
  // 先从注册表查找
  const meta = FIELD_TYPES.find(t => t.type === type)
  if (meta) return meta.label
  // 扩展类型 fallback（tel/email/password/url/search 等不在 FIELD_TYPES 中）
  const extraLabels: Record<string, string> = {
    password: '密码输入',
    tel: '电话号码',
    email: '邮箱输入',
    url: '链接输入',
    search: '搜索输入',
    combobox: '可输入选择',
    'tree-select': '树选择',
    'date-range': '日期范围',
    'image-upload': '图片上传',
    camera: '拍照',
  }
  return extraLabels[type] ?? type
}

/**
 * v2 → v3 兼容：将旧版 DesignerField[] 转为 DesignerNode[]
 */
export function migrateFieldsToNodes(fields: DesignerNode[]): DesignerNode[] {
  // 如果已经是节点树格式（含 isContainer 或 children），直接返回
  if (fields.some(f => f.isContainer || f.children?.length)) {
    return fields
  }
  // 旧版平铺字段直接作为根级节点
  return fields.map(f => ({ ...f }))
}
