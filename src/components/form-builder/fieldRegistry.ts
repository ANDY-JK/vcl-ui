/**
 * 字段注册表 — 统一管理 FieldType → 组件映射 + 设计器元数据（单一事实源）
 *
 * 所有字段类型的「渲染组件 / 分类 / 原子 type / 布局标记 / 面板显示（label/icon/group）/ 创建默认值」都在此注册。
 * 设计器的 FIELD_TYPES、createField、getTypeLabel/getTypeIcon 均由本注册表派生，新增类型只需在此注册一处。
 *
 * 注意：
 * - 容器类型（card/grid/tabs/collapse/steps）也注册在此，isContainer=true，无真实渲染组件（component 用占位）
 * - defaults 用宽松类型，避免对 designer/types 的依赖（设计器侧派生时再断言为具体节点类型）
 */

import type { Component } from 'vue'
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import Group from '@/components/form/Group.vue'
import Upload from '@/components/form/Upload.vue'
import CameraCapture from '@/components/form/CameraCapture.vue'
import Divider from '@/components/data/Divider.vue'

// ════════════════════════════════════════
// 类型定义
// ════════════════════════════════════════

/** 组件分类，决定渲染器走哪条分支 */
export type ComponentCategory = 'input' | 'select' | 'group' | 'upload' | 'camera' | 'layout' | 'advanced'

/**
 * 字段注册信息（单一事实源）
 *
 * 每种类型对应一条注册记录，包含：
 * - 渲染用组件 + 组件分类 + 原子组件 type prop（渲染链路）
 * - 是否纯布局元素 / 是否容器节点（布局语义）
 * - 面板显示元数据：label / icon / group（设计器面板）
 * - 创建默认值：defaults（createField 用）
 */
export interface FieldRegistration {
  /** 字段类型（内置为字符串字面量，外部可注册自定义类型） */
  type: string
  /** 组件分类 */
  category: ComponentCategory
  /** 渲染组件（容器类型为占位，实际由设计器渲染容器结构） */
  component: Component
  /** 透传给原子组件的 type prop（Input→type, Select→type, Group→type） */
  componentType: string
  /** 是否纯布局元素（divider/title，无数据值） */
  isLayout: boolean
  /** 面板显示名（设计器左侧面板） */
  label: string
  /** 面板图标（solar/lucide 图标名） */
  icon: string
  /** 面板分组（基础/选择/高级/高级字段/布局容器/布局） */
  group: string
  /** 创建节点时的默认属性（宽松类型，设计器侧断言为具体节点类型） */
  defaults?: Record<string, unknown>
  /** 是否容器节点（card/grid/tabs/collapse/steps） */
  isContainer?: boolean
}

// ════════════════════════════════════════
// 注册表（单一事实源）
// ════════════════════════════════════════

/**
 * 使用 Record<string, FieldRegistration> 而非 Record<FieldType, ...>
 * 以支持外部通过 registerField() 注册自定义字段类型
 */
const REGISTRY: Record<string, FieldRegistration> = {
  // ── Input 系列 ──
  text:      { type: 'text',      category: 'input',   component: Input,    componentType: 'text',     isLayout: false, label: '单行输入', icon: 'square-pen', group: '基础', defaults: { placeholder: '请输入', span: 24 } },
  textarea:  { type: 'textarea',  category: 'input',   component: Input,    componentType: 'textarea', isLayout: false, label: '多行文本', icon: 'align-left', group: '基础', defaults: { placeholder: '请输入', rows: 3, span: 24 } },
  number:    { type: 'number',    category: 'input',   component: Input,    componentType: 'number',   isLayout: false, label: '数字输入', icon: 'hash', group: '基础', defaults: { min: 0, max: 100, step: 1, span: 12 } },
  password:  { type: 'password',  category: 'input',   component: Input,    componentType: 'password', isLayout: false, label: '密码输入', icon: 'lock', group: '基础', defaults: { placeholder: '请输入密码', span: 12 } },
  tel:       { type: 'tel',       category: 'input',   component: Input,    componentType: 'tel',      isLayout: false, label: '电话号码', icon: 'phone', group: '基础', defaults: { placeholder: '请输入电话', span: 12 } },
  email:     { type: 'email',     category: 'input',   component: Input,    componentType: 'email',    isLayout: false, label: '邮箱输入', icon: 'mail', group: '基础', defaults: { placeholder: '请输入邮箱', span: 12 } },
  url:       { type: 'url',       category: 'input',   component: Input,    componentType: 'url',      isLayout: false, label: '链接输入', icon: 'link', group: '基础', defaults: { placeholder: '请输入链接', span: 24 } },
  search:    { type: 'search',    category: 'input',   component: Input,    componentType: 'search',   isLayout: false, label: '搜索输入', icon: 'search', group: '基础', defaults: { placeholder: '请输入搜索词', span: 12 } },

  // ── Select 系列 ──
  select:       { type: 'select',       category: 'select', component: Select, componentType: 'select',       isLayout: false, label: '下拉选择', icon: 'chevron-down', group: '选择', defaults: { options: ['选项1', '选项2'], placeholder: '请选择', span: 12 } },
  combobox:     { type: 'combobox',     category: 'select', component: Select, componentType: 'combobox',     isLayout: false, label: '可输入选择', icon: 'chevrons-down-up', group: '选择', defaults: { options: ['选项1', '选项2'], placeholder: '请选择或输入', span: 12 } },
  cascader:     { type: 'cascader',     category: 'select', component: Select, componentType: 'cascader',     isLayout: false, label: '级联选择', icon: 'chevrons-down-up', group: '选择', defaults: { placeholder: '请选择', span: 24, cascaderOptions: '[{"label":"一级","value":"1","children":[{"label":"二级","value":"1-1"}]}]' } },
  'tree-select': { type: 'tree-select', category: 'select', component: Select, componentType: 'tree-select', isLayout: false, label: '树选择', icon: 'chevron-down', group: '选择', defaults: { placeholder: '请选择', span: 12 } },
  date:         { type: 'date',         category: 'select', component: Select, componentType: 'date',         isLayout: false, label: '日期选择', icon: 'calendar', group: '高级', defaults: { placeholder: '请选择日期', span: 12 } },
  'date-range': { type: 'date-range',  category: 'select', component: Select, componentType: 'date-range',  isLayout: false, label: '日期范围', icon: 'calendar', group: '高级', defaults: { placeholder: '请选择日期范围', span: 24 } },
  time:         { type: 'time',         category: 'select', component: Select, componentType: 'time',         isLayout: false, label: '时间选择', icon: 'clock', group: '高级', defaults: { placeholder: '请选择时间', span: 12 } },

  // ── Group 系列 ──
  radio:    { type: 'radio',    category: 'group', component: Group, componentType: 'radio',    isLayout: false, label: '单选按钮', icon: 'circle-check', group: '选择', defaults: { options: ['选项A', '选项B'], span: 12 } },
  checkbox: { type: 'checkbox', category: 'group', component: Group, componentType: 'checkbox', isLayout: false, label: '复选按钮', icon: 'check-square', group: '选择', defaults: { options: ['选项A', '选项B'], span: 12 } },
  switch:   { type: 'switch',   category: 'group', component: Group, componentType: 'switch',   isLayout: false, label: '开关', icon: 'toggle-left', group: '高级', defaults: { span: 12 } },
  rate:     { type: 'rate',     category: 'group', component: Group, componentType: 'rate',     isLayout: false, label: '评分', icon: 'star', group: '高级', defaults: { rateMax: 5, span: 12 } },
  slider:   { type: 'slider',   category: 'group', component: Group, componentType: 'slider',   isLayout: false, label: '滑块', icon: 'sliders-horizontal', group: '高级', defaults: { min: 0, max: 100, step: 1, span: 24 } },

  // ── Upload / Camera ──
  upload:        { type: 'upload',        category: 'upload', component: Upload,       componentType: 'upload',        isLayout: false, label: '文件上传', icon: 'upload', group: '高级', defaults: { span: 24, accept: 'image/*', multiple: true, maxSize: 10 } },
  'image-upload': { type: 'image-upload', category: 'upload', component: Upload,       componentType: 'image-upload', isLayout: false, label: '图片上传', icon: 'upload', group: '高级', defaults: { span: 24, accept: 'image/*', multiple: true, maxSize: 10 } },
  camera:        { type: 'camera',        category: 'camera', component: CameraCapture, componentType: 'camera',        isLayout: false, label: '拍照', icon: 'camera', group: '高级', defaults: { span: 24 } },

  // ── 纯布局 ──
  divider: { type: 'divider', category: 'layout', component: Divider, componentType: 'divider', isLayout: true, label: '分割线', icon: 'minus', group: '布局', defaults: { span: 24 } },
  title:   { type: 'title',   category: 'layout', component: Divider, componentType: 'title',   isLayout: true, label: '标题文字', icon: 'type', group: '布局', defaults: { span: 24 } },

  // ── v3 高级字段（复用 Input 组件做 fallback，实际由 FormRenderer 的 advanced 分支渲染） ──
  subform:   { type: 'subform',   category: 'advanced', component: Input, componentType: 'subform',   isLayout: false, label: '子表单', icon: 'table', group: '高级字段', defaults: { span: 24, placeholder: '可添加多行', subformColumns: '姓名|name|text\n电话|phone|number' } },
  relate:    { type: 'relate',    category: 'advanced', component: Input, componentType: 'relate',    isLayout: false, label: '关联选择', icon: 'link', group: '高级字段', defaults: { span: 24, placeholder: '点击选择关联数据', relateEntityType: 'user' } },
  richtext:  { type: 'richtext',  category: 'advanced', component: Input, componentType: 'richtext',  isLayout: false, label: '富文本', icon: 'type', group: '高级字段', defaults: { span: 24, richtextToolbar: 'simple' } },
  signature: { type: 'signature', category: 'advanced', component: Input, componentType: 'signature', isLayout: false, label: '电子签名', icon: 'pen-tool', group: '高级字段', defaults: { span: 24 } },
  address:   { type: 'address',   category: 'advanced', component: Input, componentType: 'address',   isLayout: false, label: '地址选择', icon: 'map-pin', group: '高级字段', defaults: { span: 24, addressDetail: true } },
  idcard:    { type: 'idcard',    category: 'advanced', component: Input, componentType: 'idcard',    isLayout: false, label: '证件号码', icon: 'credit-card', group: '高级字段', defaults: { span: 24, idcardTypes: '身份证\n护照\n军官证' } },
  matrix:    { type: 'matrix',    category: 'advanced', component: Input, componentType: 'matrix',    isLayout: false, label: '评分矩阵', icon: 'grid-3x3', group: '高级字段', defaults: { span: 24, matrixRows: '服务态度\n专业能力\n响应速度', matrixCols: '满意\n一般\n不满意' } },
  serial:    { type: 'serial',    category: 'advanced', component: Input, componentType: 'serial',    isLayout: false, label: '流水号', icon: 'bar-chart', group: '高级字段', defaults: { span: 12, serialPrefix: 'NO', serialDateFormat: 'YYYYMMDD' } },

  // ── 布局容器 (v3) ──
  card:     { type: 'card',     category: 'layout', component: Divider, componentType: 'card',     isLayout: false, isContainer: true, label: '分组卡片', icon: 'layout-template', group: '布局容器', defaults: { isContainer: true, containerConfig: {} } },
  grid:     { type: 'grid',     category: 'layout', component: Divider, componentType: 'grid',     isLayout: false, isContainer: true, label: '栅格行', icon: 'grid-2x2', group: '布局容器', defaults: { isContainer: true, containerConfig: { columns: 2 } } },
  tabs:     { type: 'tabs',     category: 'layout', component: Divider, componentType: 'tabs',     isLayout: false, isContainer: true, label: '标签页', icon: 'panel-top', group: '布局容器', defaults: { isContainer: true, containerConfig: { tabs: [{ label: '标签页 1', name: 'tab1' }], activeTab: 'tab1' } } },
  collapse: { type: 'collapse', category: 'layout', component: Divider, componentType: 'collapse', isLayout: false, isContainer: true, label: '折叠面板', icon: 'chevron-down', group: '布局容器', defaults: { isContainer: true, containerConfig: { collapseItems: [{ title: '折叠项 1', expanded: true }], activeCollapse: 0 } } },
  steps:    { type: 'steps',    category: 'layout', component: Divider, componentType: 'steps',    isLayout: false, isContainer: true, label: '步骤条', icon: 'clock', group: '布局容器', defaults: { isContainer: true, containerConfig: { steps: [{ title: '步骤 1' }, { title: '步骤 2' }], activeStep: 0 } } },
}

// ════════════════════════════════════════
// 查询 API
// ════════════════════════════════════════

/** 获取字段类型的注册信息（未注册回退 text） */
export function getFieldRegistration(type: string): FieldRegistration {
  return REGISTRY[type] ?? REGISTRY.text
}

/** 获取字段类型对应的组件分类 */
export function getComponentCategory(type: string): ComponentCategory {
  return REGISTRY[type]?.category ?? 'input'
}

/** 判断字段是否为纯布局元素（divider/title） */
export function isLayoutField(type: string): boolean {
  return REGISTRY[type]?.isLayout ?? false
}

/** 判断类型是否为容器节点（card/grid/tabs/collapse/steps） */
export function isContainerField(type: string): boolean {
  return REGISTRY[type]?.isContainer ?? false
}

/** 获取透传给原子组件的 type prop 值 */
export function getComponentType(type: string): string {
  return REGISTRY[type]?.componentType ?? 'text'
}

/** 获取渲染组件 */
export function getFieldComponent(type: string): Component {
  return REGISTRY[type]?.component ?? Input
}

/** 获取面板显示名（设计器面板/大纲树用） */
export function getTypeLabel(type: string): string {
  return REGISTRY[type]?.label ?? type
}

/** 获取面板图标（设计器面板/大纲树用） */
export function getTypeIcon(type: string): string {
  return REGISTRY[type]?.icon ?? 'circle'
}

/** 获取创建节点默认属性 */
export function getFieldDefaults(type: string): Record<string, unknown> {
  return REGISTRY[type]?.defaults ?? {}
}

/** 获取所有已注册的字段类型列表 */
export function getRegisteredTypes(): string[] {
  return Object.keys(REGISTRY)
}

/** 获取全部注册记录（含容器），供设计器派生 FIELD_TYPES */
export function getFieldMeta(): FieldRegistration[] {
  return Object.values(REGISTRY)
}

// ════════════════════════════════════════
// 自定义注册 API — 供外部扩展
// ════════════════════════════════════════

/**
 * 注册自定义字段类型
 *
 * 使用示例：
 * ```ts
 * import { registerField } from '@/components/form-builder'
 * import MyRichText from './MyRichText.vue'
 *
 * registerField({
 *   type: 'rich-text',
 *   category: 'input',       // 复用 Input 分支（需有 v-model + label + props）
 *   component: MyRichText,
 *   componentType: 'rich-text',
 *   isLayout: false,
 *   label: '自定义富文本',
 *   icon: 'type',
 *   group: '高级字段',
 * })
 * ```
 *
 * 注册后可在 FormSchema 中使用 `type: 'rich-text'` 字段
 */
export function registerField(reg: Omit<FieldRegistration, 'isLayout'> & { isLayout?: boolean }): void {
  REGISTRY[reg.type] = {
    ...reg,
    isLayout: reg.isLayout ?? false,
  }
}

/**
 * 注销自定义字段类型
 * @param type 要注销的字段类型
 */
export function unregisterField(type: string): void {
  // 不允许注销内置类型
  if (BUILTIN_TYPES.has(type)) {
    console.warn(`[fieldRegistry] 不能注销内置类型: ${type}`)
    return
  }
  delete REGISTRY[type]
}

/** 内置类型集合（不允许注销） */
const BUILTIN_TYPES = new Set<string>([
  'text', 'textarea', 'number', 'password', 'tel', 'email', 'url', 'search',
  'select', 'combobox', 'cascader', 'tree-select', 'date', 'date-range', 'time',
  'radio', 'checkbox', 'switch', 'rate', 'slider',
  'upload', 'image-upload', 'camera',
  'divider', 'title',
  // v3 高级字段
  'subform', 'relate', 'richtext', 'signature', 'address', 'idcard', 'matrix', 'serial',
])

/** 判断字段类型是否已注册 */
export function isFieldRegistered(type: string): boolean {
  return type in REGISTRY
}
