/**
 * FormBuilder 模块导出入口 (v3)
 *
 * 三大核心组件：
 * - FormDesigner:  低代码拖拽设计器（v3：容器嵌套 + 大纲树 + 设备切换 + 撤销重做）
 * - FormBuilder:    Schema 驱动表单渲染引擎
 * - FormCollect:    数据收集（表单 + 记录管理 + Excel 导出）
 */

// ── 设计器 ──
export { default as FormDesigner } from './FormDesigner.vue'

// ── 表单引擎 ──
export { default as FormBuilder } from './FormBuilder.vue'
export { default as FormRenderer } from './FormRenderer.vue'
export { default as FieldError } from './FieldError.vue'

// ── 数据收集 ──
export { default as FormCollect } from './FormCollect.vue'

// ── composable ──
export { useFormSchema, isFieldVisible, createInitialData, normalizeSchema, SCHEMA_VERSION } from './useFormSchema'
export { useFormValidator, validateField, validateAll, validators } from './useFormValidator'
export { useFormStorage } from './useFormStorage'

// ── 字段注册表 ──
export { getFieldRegistration, getComponentCategory, isLayoutField, getComponentType, getFieldComponent, getRegisteredTypes, registerField, unregisterField, isFieldRegistered } from './fieldRegistry'
export type { FieldRegistration } from './fieldRegistry'

// ── 预置 Schema 模板 ──
export { contractCollectionSchema } from './presets/contract-collection'
export { inspectionSchema } from './presets/inspection'
export { registrationSchema } from './presets/registration'

// ── 设计器类型与工具 ──
export {
  FIELD_TYPES, createField, genFieldId, genRecordId, collectStorageKey,
  toFormSchema, parseCascaderOptions, getTypeLabel,
  // v3 新增树操作工具
  flattenNodes, findNode, findParent, updateNodeInTree,
  removeNodeFromTree, insertNode, insertChildNode, moveNodeInTree,
  isContainerNode, isFieldNode, migrateFieldsToNodes,
  CONTAINER_TYPES, FIELD_NODE_TYPES,
} from './designer/types'
export { createLocalFormStore } from './designer/store'
export type { FormStore, FormMetaItem } from './designer/store'

// ── 类型 ──
export type {
  FieldType,
  FormField,
  FormSchema,
  FormLayout,
  FormStep,
  FormData,
  FormErrors,
  FieldValue,
  ValidationRule,
  VisibleWhen,
} from './types'
export type { ComponentCategory } from './useFormSchema'

// ── 设计器类型 (v3) ──
export type {
  // 节点类型
  DesignerNodeType,
  DesignerFieldType,
  DesignerContainerType,
  DesignerNode,
  // v3 新增配置类型
  DesignerValidation,
  DesignerStyleConfig,
  DesignerEventConfig,
  DesignerDataConfig,
  DesignerContainerConfig,
  // 元信息
  FormMeta,
  FormDesign,
  CollectRecord,
  FieldTypeMeta,
  // @deprecated 别名（向后兼容）
  DesignerField,
} from './designer/types'
