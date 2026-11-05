import { reportWarn } from '@/components/_internal/runtime-observer'
/**
 * 字段注册表 — 统一管理 FieldType → 组件映射 + 设计器元数据（单一事实源）
 *
 * 所有字段类型的「渲染组件 / 分类 / 原子 type / 布局标记 / 面板显示（label/icon/group）/ 创建默认值」都在此注册。
 * 设计器的 FIELD_TYPES、createField、getTypeLabel/getTypeIcon 均由本注册表派生，新增类型只需在此注册一处。
 *
 * i18n 约定：
 * - label / group 存 formBuilder 域的 i18n key，getTypeLabel / getFieldTypes 在调用时翻译（响应语言切换）
 * - defaults 支持对象或 thunk：thunk 在 createField 调用时求值，占位文案按创建时刻语言本地化
 * - 外部 registerField 可直接传原始文案（t() 对未注册 key 原样返回，行为兼容）
 *
 * 注意：
 * - 容器类型（card/grid/tabs/collapse/steps）也注册在此，isContainer=true，无真实渲染组件（component 用占位）
 * - thunk 内的 t 取自模块级 useT()，测试环境同样可用
 */

import type { Component } from 'vue'
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import Group from '@/components/form/Group.vue'
import Upload from '@/components/form/Upload.vue'
import CameraCapture from '@/components/form/CameraCapture.vue'
import CodeCapture from '@/components/form/CodeCapture.vue'
import Divider from '@/components/data/Divider.vue'
import { DISPLAY_FIELD_REGISTRATIONS } from './designer/fieldRegistryDisplay'
import { DISPLAY_FEEDBACK_REGISTRATIONS } from './designer/fieldRegistryFeedback'
import { INPUT_EXT_REGISTRATIONS } from './designer/fieldRegistryInputExt'
import { ADVANCED_FIELD_REGISTRATIONS } from './designer/fieldRegistryAdvanced'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：label/group 翻译与 defaults thunk 求值均走当前语言 */
const t = useT()

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
 * - 面板显示元数据：label / icon / group（设计器面板）—— label/group 为 i18n key
 * - 创建默认值：defaults（createField 用，支持对象或 thunk）
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
  /** 面板显示名的 i18n key（formBuilder 域，设计器面板） */
  label: string
  /** 面板图标（solar/lucide 图标名） */
  icon: string
  /** 面板分组的 i18n key（formBuilder 域） */
  group: string
  /** 创建节点时的默认属性（宽松类型；thunk 形式在创建时刻求值以本地化文案） */
  defaults?: Record<string, unknown> | (() => Record<string, unknown>)
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
  text: {
    type: 'text',
    category: 'input',
    component: Input,
    componentType: 'text',
    isLayout: false,
    label: 'fbType.text',
    icon: 'square-pen',
    group: 'fbGroup.basic',
    defaults: () => ({ placeholder: t('fb.textPlaceholder'), span: 24 }),
  },
  textarea: {
    type: 'textarea',
    category: 'input',
    component: Input,
    componentType: 'textarea',
    isLayout: false,
    label: 'fbType.textarea',
    icon: 'align-left',
    group: 'fbGroup.basic',
    defaults: () => ({ placeholder: t('fb.textPlaceholder'), rows: 3, span: 24 }),
  },
  number: {
    type: 'number',
    category: 'input',
    component: Input,
    componentType: 'number',
    isLayout: false,
    label: 'fbType.number',
    icon: 'hash',
    group: 'fbGroup.basic',
    defaults: () => ({ placeholder: t('fb.textPlaceholder'), min: 0, max: 100, step: 1, span: 12 }),
  },
  password: {
    type: 'password',
    category: 'input',
    component: Input,
    componentType: 'password',
    isLayout: false,
    label: 'fbType.password',
    icon: 'lock',
    group: 'fbGroup.basic',
    defaults: () => ({ placeholder: t('fb.pwdPlaceholder'), span: 12 }),
  },
  tel: {
    type: 'tel',
    category: 'input',
    component: Input,
    componentType: 'tel',
    isLayout: false,
    label: 'fbType.tel',
    icon: 'phone',
    group: 'fbGroup.basic',
    defaults: () => ({ placeholder: t('fb.telPlaceholder'), span: 12 }),
  },
  email: {
    type: 'email',
    category: 'input',
    component: Input,
    componentType: 'email',
    isLayout: false,
    label: 'fbType.email',
    icon: 'mail',
    group: 'fbGroup.basic',
    defaults: () => ({ placeholder: t('fb.emailPlaceholder'), span: 12 }),
  },
  url: {
    type: 'url',
    category: 'input',
    component: Input,
    componentType: 'url',
    isLayout: false,
    label: 'fbType.url',
    icon: 'link',
    group: 'fbGroup.basic',
    defaults: () => ({ placeholder: t('fb.urlPlaceholder'), span: 24 }),
  },
  search: {
    type: 'search',
    category: 'input',
    component: Input,
    componentType: 'search',
    isLayout: false,
    label: 'fbType.search',
    icon: 'search',
    group: 'fbGroup.basic',
    defaults: () => ({ placeholder: t('fb.searchPlaceholder'), span: 12 }),
  },
  color: {
    type: 'color',
    category: 'input',
    component: Input,
    componentType: 'color',
    isLayout: false,
    label: 'fbType.color',
    icon: 'palette',
    group: 'fbGroup.basic',
    defaults: () => ({ span: 12 }),
  },

  // ── Select 系列 ──
  select: {
    type: 'select',
    category: 'select',
    component: Select,
    componentType: 'select',
    isLayout: false,
    label: 'fbType.select',
    icon: 'chevron-down',
    group: 'fbGroup.select',
    defaults: () => ({ options: [t('fb.option1'), t('fb.option2')], placeholder: t('form.pleaseSelect'), span: 12 }),
  },
  combobox: {
    type: 'combobox',
    category: 'select',
    component: Select,
    componentType: 'combobox',
    isLayout: false,
    label: 'fbType.combobox',
    icon: 'chevrons-down-up',
    group: 'fbGroup.select',
    defaults: () => ({ options: [t('fb.option1'), t('fb.option2')], placeholder: t('fb.selectOrInput'), span: 12 }),
  },
  cascader: {
    type: 'cascader',
    category: 'select',
    component: Select,
    componentType: 'cascader',
    isLayout: false,
    label: 'fbType.cascader',
    icon: 'chevrons-down-up',
    group: 'fbGroup.select',
    defaults: () => ({
      placeholder: t('form.pleaseSelect'),
      span: 24,
      cascaderOptions: JSON.stringify([
        { label: t('fb.level1'), value: '1', children: [{ label: t('fb.level2'), value: '1-1' }] },
      ]),
    }),
  },
  'tree-select': {
    type: 'tree-select',
    category: 'select',
    component: Select,
    componentType: 'tree-select',
    isLayout: false,
    label: 'fbType.treeSelect',
    icon: 'chevron-down',
    group: 'fbGroup.select',
    defaults: () => ({ placeholder: t('form.pleaseSelect'), span: 12 }),
  },
  date: {
    type: 'date',
    category: 'select',
    component: Select,
    componentType: 'date',
    isLayout: false,
    label: 'fbType.date',
    icon: 'calendar',
    group: 'fbGroup.advanced',
    defaults: () => ({ placeholder: t('form.selectDate'), span: 12 }),
  },
  'date-range': {
    type: 'date-range',
    category: 'select',
    component: Select,
    componentType: 'date-range',
    isLayout: false,
    label: 'fbType.dateRange',
    icon: 'calendar',
    group: 'fbGroup.advanced',
    defaults: () => ({ placeholder: t('fb.selectDateRange'), span: 24 }),
  },
  time: {
    type: 'time',
    category: 'select',
    component: Select,
    componentType: 'time',
    isLayout: false,
    label: 'fbType.time',
    icon: 'clock',
    group: 'fbGroup.advanced',
    defaults: () => ({ placeholder: t('form.selectTime'), span: 12 }),
  },

  // ── Group 系列 ──
  radio: {
    type: 'radio',
    category: 'group',
    component: Group,
    componentType: 'radio',
    isLayout: false,
    label: 'fbType.radio',
    icon: 'circle-check',
    group: 'fbGroup.select',
    defaults: () => ({ options: [t('fb.optionA'), t('fb.optionB')], span: 12 }),
  },
  checkbox: {
    type: 'checkbox',
    category: 'group',
    component: Group,
    componentType: 'checkbox',
    isLayout: false,
    label: 'fbType.checkbox',
    icon: 'check-square',
    group: 'fbGroup.select',
    defaults: () => ({ options: [t('fb.optionA'), t('fb.optionB')], span: 12 }),
  },
  switch: {
    type: 'switch',
    category: 'group',
    component: Group,
    componentType: 'switch',
    isLayout: false,
    label: 'fbType.switch',
    icon: 'toggle-left',
    group: 'fbGroup.advanced',
    defaults: () => ({ span: 12 }),
  },
  rate: {
    type: 'rate',
    category: 'group',
    component: Group,
    componentType: 'rate',
    isLayout: false,
    label: 'fbType.rate',
    icon: 'star',
    group: 'fbGroup.advanced',
    defaults: () => ({ rateMax: 5, span: 12 }),
  },
  slider: {
    type: 'slider',
    category: 'group',
    component: Group,
    componentType: 'slider',
    isLayout: false,
    label: 'fbType.slider',
    icon: 'sliders-horizontal',
    group: 'fbGroup.advanced',
    defaults: () => ({ min: 0, max: 100, step: 1, span: 24 }),
  },

  // ── Upload / Camera ──
  upload: {
    type: 'upload',
    category: 'upload',
    component: Upload,
    componentType: 'upload',
    isLayout: false,
    label: 'fbType.upload',
    icon: 'upload',
    group: 'fbGroup.advanced',
    defaults: () => ({ span: 24, accept: 'image/*', multiple: true, maxSize: 10 }),
  },
  'image-upload': {
    type: 'image-upload',
    category: 'upload',
    component: Upload,
    componentType: 'image-upload',
    isLayout: false,
    label: 'fbType.imageUpload',
    icon: 'upload',
    group: 'fbGroup.advanced',
    defaults: () => ({ span: 24, accept: 'image/*', multiple: true, maxSize: 10 }),
  },
  camera: {
    type: 'camera',
    category: 'camera',
    component: CameraCapture,
    componentType: 'camera',
    isLayout: false,
    label: 'fbType.camera',
    icon: 'camera',
    group: 'fbGroup.advanced',
    defaults: () => ({ span: 24 }),
  },
  'scan-code': {
    type: 'scan-code',
    category: 'camera',
    component: CodeCapture,
    componentType: 'scan-code',
    isLayout: false,
    label: 'fbType.scanCode',
    icon: 'scan',
    group: 'fbGroup.advanced',
    // scanFormats/scanPrefix/scanLength 进 defaults：PropsPanel 按「key 在 defaults」决定是否显示编辑行
    defaults: () => ({ span: 24, scanFormats: 'all', scanPrefix: '', scanLength: undefined }),
  },

  // ── 纯布局 ──
  divider: {
    type: 'divider',
    category: 'layout',
    component: Divider,
    componentType: 'divider',
    isLayout: true,
    label: 'fbType.divider',
    icon: 'minus',
    group: 'fbGroup.layout',
    defaults: () => ({ span: 24 }),
  },
  title: {
    type: 'title',
    category: 'layout',
    component: Divider,
    componentType: 'title',
    isLayout: true,
    label: 'fbType.title',
    icon: 'type',
    group: 'fbGroup.layout',
    defaults: () => ({ span: 24 }),
  },
  paragraph: {
    type: 'paragraph',
    category: 'layout',
    component: Divider,
    componentType: 'paragraph',
    isLayout: true,
    label: 'fbType.paragraph',
    icon: 'text',
    group: 'fbGroup.layout',
    defaults: () => ({ span: 24 }),
  },

  // ── 展示类（2026-10-18）：见 designer/fieldRegistryDisplay.ts ──
  // 拆出去是因为本文件已贴近 800 行止涨线，而展示能力后续还会继续加（表格/图表/地图…）。
  ...DISPLAY_FIELD_REGISTRATIONS,
  // ── 告知型展示（2026-10-19）：result / loading，见 designer/fieldRegistryFeedback.ts ──
  ...DISPLAY_FEEDBACK_REGISTRATIONS,

  // ── v3 高级字段（复用 Input 组件做 fallback，实际由 FormRenderer 的 advanced 分支渲染） ──
  // ── v3 高级字段：见 designer/fieldRegistryAdvanced.ts ──
  ...ADVANCED_FIELD_REGISTRATIONS,

  // ── 输入型扩展（map-picker / toggle-list）：见 designer/fieldRegistryInputExt.ts ──
  ...INPUT_EXT_REGISTRATIONS,

  // ── 布局容器 (v3) ──
  card: {
    type: 'card',
    category: 'layout',
    component: Divider,
    componentType: 'card',
    isLayout: false,
    isContainer: true,
    label: 'fbType.card',
    icon: 'layout-template',
    group: 'fbGroup.layoutContainer',
    defaults: () => ({ isContainer: true, containerConfig: {} }),
  },
  grid: {
    type: 'grid',
    category: 'layout',
    component: Divider,
    componentType: 'grid',
    isLayout: false,
    isContainer: true,
    label: 'fbType.grid',
    icon: 'grid-2x2',
    group: 'fbGroup.layoutContainer',
    defaults: () => ({ isContainer: true, containerConfig: { columns: 2 } }),
  },
  flex: {
    type: 'flex',
    category: 'layout',
    component: Divider,
    componentType: 'flex',
    isLayout: false,
    isContainer: true,
    label: 'fbType.flex',
    icon: 'move-horizontal',
    group: 'fbGroup.layoutContainer',
    defaults: () => ({ isContainer: true, containerConfig: { gap: 12, wrap: true, justify: 'start' } }),
  },
  tabs: {
    type: 'tabs',
    category: 'layout',
    component: Divider,
    componentType: 'tabs',
    isLayout: false,
    isContainer: true,
    label: 'fbType.tabs',
    icon: 'panel-top',
    group: 'fbGroup.layoutContainer',
    defaults: () => ({
      isContainer: true,
      containerConfig: { tabs: [{ label: t('fb.tabN', { n: 1 }), name: 'tab1' }], activeTab: 'tab1' },
    }),
  },
  collapse: {
    type: 'collapse',
    category: 'layout',
    component: Divider,
    componentType: 'collapse',
    isLayout: false,
    isContainer: true,
    label: 'fbType.collapse',
    icon: 'chevron-down',
    group: 'fbGroup.layoutContainer',
    defaults: () => ({
      isContainer: true,
      containerConfig: {
        collapseItems: [{ title: t('fb.collapseItemN', { n: 1 }), expanded: true }],
        activeCollapse: 0,
      },
    }),
  },
  steps: {
    type: 'steps',
    category: 'layout',
    component: Divider,
    componentType: 'steps',
    isLayout: false,
    isContainer: true,
    label: 'fbType.steps',
    icon: 'clock',
    group: 'fbGroup.layoutContainer',
    defaults: () => ({
      isContainer: true,
      containerConfig: {
        steps: [{ title: t('fb.stepN', { n: 1 }) }, { title: t('fb.stepN', { n: 2 }) }],
        activeStep: 0,
      },
    }),
  },
}

// ════════════════════════════════════════
// 查询 API
// ════════════════════════════════════════

/** 求值 defaults（对象原样返回；thunk 调用取当前语言文案） */
function resolveDefaults(reg?: FieldRegistration): Record<string, unknown> {
  const d = reg?.defaults
  if (!d) return {}
  return typeof d === 'function' ? d() : d
}

/** 获取字段类型的注册信息（未注册回退 text） */
export function getFieldRegistration(type: string): FieldRegistration {
  return REGISTRY[type] ?? REGISTRY.text
}

/**
 * 按类型查注册信息，未注册返回 undefined（不回退成 text）。
 * 给「未注册就不该冒充某个具体类型」的调用方用，如 createField：
 * 未注册类型的节点名应当是类型名本身，而不是「单行输入」。
 */
export function findFieldRegistration(type: string): FieldRegistration | undefined {
  return REGISTRY[type]
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

/** 获取面板显示名（调用时翻译；自定义注册传原始文案时 t() 原样返回） */
export function getTypeLabel(type: string): string {
  return t(getFieldRegistration(type).label)
}

/** 获取面板图标（设计器面板/大纲树用） */
export function getTypeIcon(type: string): string {
  return REGISTRY[type]?.icon ?? 'circle'
}

/** 获取创建节点默认属性（thunk 在此求值 → 文案按创建时刻语言） */
export function getFieldDefaults(type: string): Record<string, unknown> {
  return resolveDefaults(getFieldRegistration(type))
}

/** 获取所有已注册的字段类型列表 */
export function getRegisteredTypes(): string[] {
  return Object.keys(REGISTRY)
}

/** 获取全部注册记录（含容器），供设计器派生 FIELD_TYPES（label/group 为 i18n key，由消费方翻译） */
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
 *   label: '自定义富文本',   // 原始文案或 i18n key 均可
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
    reportWarn(`[fieldRegistry] 不能注销内置类型: ${type}`)
    return
  }
  delete REGISTRY[type]
}

/** 内置类型集合（不允许注销） */
const BUILTIN_TYPES = new Set<string>([
  'text',
  'textarea',
  'number',
  'password',
  'tel',
  'email',
  'url',
  'search',
  'color',
  'select',
  'combobox',
  'cascader',
  'tree-select',
  'date',
  'date-range',
  'time',
  'radio',
  'checkbox',
  'switch',
  'rate',
  'slider',
  'upload',
  'image-upload',
  'camera',
  'scan-code',
  'divider',
  'title',
  'paragraph',
  // v3 高级字段
  'subform',
  'relate',
  'richtext',
  'signature',
  'address',
  'idcard',
  'matrix',
  'serial',
  // 布局容器：同样内置，不允许注销（此前漏登记，unregisterField('card') 会把容器从注册表摘掉）
  'card',
  'grid',
  'flex',
  'tabs',
  'collapse',
  'steps',
])

/** 判断字段类型是否已注册 */
export function isFieldRegistered(type: string): boolean {
  return type in REGISTRY
}
