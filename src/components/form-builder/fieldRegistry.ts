/**
 * 字段注册表 — 统一管理 FieldType → 组件映射
 *
 * 替代 FormRenderer 中三个硬编码 computed（inputType/selectType/groupType）
 * 新增字段类型只需在此注册，无需改动 FormRenderer
 */

import type { Component } from 'vue'
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import Group from '@/components/form/Group.vue'
import Upload from '@/components/form/Upload.vue'
import CameraCapture from '@/components/form/CameraCapture.vue'
import Divider from '@/components/data/Divider.vue'
import type { FieldType } from './types'

// ════════════════════════════════════════
// 类型定义
// ════════════════════════════════════════

/** 组件分类，决定渲染器走哪条分支 */
export type ComponentCategory = 'input' | 'select' | 'group' | 'upload' | 'camera' | 'layout' | 'advanced'

/**
 * 字段注册信息
 *
 * 每种 FieldType 对应一条注册记录，包含：
 * - 渲染用组件
 * - 组件分类（决定 FormRenderer 走哪条分支）
 * - 原子组件 type prop 值（透传给 Input/Select/Group 的 type prop）
 * - 是否纯布局元素（无数据值）
 */
export interface FieldRegistration {
  /** 字段类型 */
  type: FieldType
  /** 组件分类 */
  category: ComponentCategory
  /** 渲染组件 */
  component: Component
  /** 透传给原子组件的 type prop（Input→type, Select→type, Group→type） */
  componentType: string
  /** 是否纯布局元素（divider/title） */
  isLayout: boolean
}

// ════════════════════════════════════════
// 注册表
// ════════════════════════════════════════

/**
 * 使用 Record<string, FieldRegistration> 而非 Record<FieldType, ...>
 * 以支持外部通过 registerField() 注册自定义字段类型
 */
const REGISTRY: Record<string, FieldRegistration> = {
  // ── Input 系列 ──
  text:      { type: 'text',      category: 'input',   component: Input,    componentType: 'text',     isLayout: false },
  textarea:  { type: 'textarea',  category: 'input',   component: Input,    componentType: 'textarea', isLayout: false },
  number:    { type: 'number',    category: 'input',   component: Input,    componentType: 'number',   isLayout: false },
  password:  { type: 'password',  category: 'input',   component: Input,    componentType: 'password', isLayout: false },
  tel:       { type: 'tel',       category: 'input',   component: Input,    componentType: 'tel',      isLayout: false },
  email:     { type: 'email',     category: 'input',   component: Input,    componentType: 'email',    isLayout: false },
  url:       { type: 'url',       category: 'input',   component: Input,    componentType: 'url',      isLayout: false },
  search:    { type: 'search',    category: 'input',   component: Input,    componentType: 'search',   isLayout: false },

  // ── Select 系列 ──
  select:       { type: 'select',       category: 'select', component: Select, componentType: 'select',       isLayout: false },
  combobox:     { type: 'combobox',     category: 'select', component: Select, componentType: 'combobox',     isLayout: false },
  cascader:     { type: 'cascader',     category: 'select', component: Select, componentType: 'cascader',     isLayout: false },
  'tree-select': { type: 'tree-select', category: 'select', component: Select, componentType: 'tree-select', isLayout: false },
  date:         { type: 'date',         category: 'select', component: Select, componentType: 'date',         isLayout: false },
  'date-range':  { type: 'date-range',  category: 'select', component: Select, componentType: 'date-range',   isLayout: false },
  time:         { type: 'time',         category: 'select', component: Select, componentType: 'time',         isLayout: false },

  // ── Group 系列 ──
  radio:    { type: 'radio',    category: 'group', component: Group, componentType: 'radio',    isLayout: false },
  checkbox: { type: 'checkbox', category: 'group', component: Group, componentType: 'checkbox', isLayout: false },
  switch:   { type: 'switch',   category: 'group', component: Group, componentType: 'switch',   isLayout: false },
  rate:     { type: 'rate',     category: 'group', component: Group, componentType: 'rate',     isLayout: false },
  slider:   { type: 'slider',   category: 'group', component: Group, componentType: 'slider',   isLayout: false },

  // ── Upload / Camera ──
  upload:       { type: 'upload',       category: 'upload', component: Upload,       componentType: 'upload',       isLayout: false },
  'image-upload': { type: 'image-upload', category: 'upload', component: Upload,       componentType: 'image-upload', isLayout: false },
  camera:        { type: 'camera',       category: 'camera', component: CameraCapture, componentType: 'camera',       isLayout: false },

  // ── 纯布局 ──
  divider: { type: 'divider', category: 'layout', component: Divider, componentType: 'divider', isLayout: true },
  title:   { type: 'title',   category: 'layout', component: Divider, componentType: 'title',   isLayout: true },

  // ── v3 高级字段（复用 Input 组件做 fallback，实际由 FormRenderer 的 advanced 分支渲染） ──
  subform:    { type: 'subform',    category: 'advanced', component: Input, componentType: 'subform',    isLayout: false },
  relate:     { type: 'relate',     category: 'advanced', component: Input, componentType: 'relate',     isLayout: false },
  richtext:   { type: 'richtext',   category: 'advanced', component: Input, componentType: 'richtext',   isLayout: false },
  signature:  { type: 'signature',  category: 'advanced', component: Input, componentType: 'signature',  isLayout: false },
  address:    { type: 'address',    category: 'advanced', component: Input, componentType: 'address',    isLayout: false },
  idcard:     { type: 'idcard',     category: 'advanced', component: Input, componentType: 'idcard',     isLayout: false },
  matrix:     { type: 'matrix',     category: 'advanced', component: Input, componentType: 'matrix',     isLayout: false },
  serial:     { type: 'serial',     category: 'advanced', component: Input, componentType: 'serial',     isLayout: false },
}

// ════════════════════════════════════════
// 查询 API
// ════════════════════════════════════════

/** 获取字段类型的注册信息 */
export function getFieldRegistration(type: FieldType): FieldRegistration {
  return REGISTRY[type] ?? REGISTRY.text
}

/** 获取字段类型对应的组件分类 */
export function getComponentCategory(type: FieldType): ComponentCategory {
  return REGISTRY[type]?.category ?? 'input'
}

/** 判断字段是否为纯布局元素（divider/title）。入参放宽为 string，兼容设计器节点类型（DesignerNodeType） */
export function isLayoutField(type: string): boolean {
  return REGISTRY[type]?.isLayout ?? false
}

/** 获取透传给原子组件的 type prop 值 */
export function getComponentType(type: FieldType): string {
  return REGISTRY[type]?.componentType ?? 'text'
}

/** 获取渲染组件 */
export function getFieldComponent(type: FieldType): Component {
  return REGISTRY[type]?.component ?? Input
}

/** 获取所有已注册的字段类型列表 */
export function getRegisteredTypes(): FieldType[] {
  return Object.keys(REGISTRY) as FieldType[]
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
