// 设计令牌必须先于本域组件样式（Q3 域级 CSS 自包含；与主入口 index.ts 同口径）
import '../tokens.css'
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
export { default as FormTargetCollect } from './FormTargetCollect.vue'
export type { TargetItem } from './FormTargetCollect.vue'

// ── 表单发布填写端（#/form/:code 路由指向此组件） ──
export { default as FormShareView } from './FormShareView.vue'

// ── 低代码导航外壳（宿主只挂这一个；其余导航项由用户配 nav 配置） ──
export { default as LowCodeNav } from './lowcode/LowCodeNav.vue'
export { createFormPageResolver, designToSchema, isRenderableSchema } from './lowcode/page-resolver'
export type { FormPageOutcome, FormPageResolver } from './lowcode/page-resolver'

// ── composable ──
export { useFormSchema, isFieldVisible, createInitialData, normalizeSchema, SCHEMA_VERSION } from './useFormSchema'
export { useFormValidator, validateField, validateAll, validators } from './useFormValidator'
export { useFormStorage } from './useFormStorage'

// ── 字段注册表 ──
export {
  getFieldRegistration,
  getComponentCategory,
  isLayoutField,
  getComponentType,
  getFieldComponent,
  getRegisteredTypes,
  registerField,
  isFieldRegistered,
} from './fieldRegistry'
export type { FieldRegistration } from './fieldRegistry'

// ── DynamicForm 兼容适配（旧版配置 → schema） ──
export { toDynamicFormSchema } from './dynamic-form-adapter'
export type { DynamicFieldConfig, DynamicUploadConfig, DynamicFormConfig } from './dynamic-form-adapter'

// ── 预置 Schema 模板 ──
export { contractCollectionSchema, containerDemoNodes, containerDemoMeta, storeReportSchema } from './presets'

// ── 设计器类型与工具 ──
export {
  getFieldTypes,
  createField,
  genFieldId,
  genRecordId,
  collectStorageKey,
  toFormSchema,
  parseCascaderOptions,
  getTypeLabel,
  // v3 新增树操作工具
  flattenNodes,
  findNode,
  findParent,
  updateNodeInTree,
  removeNodeFromTree,
  insertNode,
  insertChildNode,
  moveNodeInTree,
  isContainerNode,
  isFieldNode,
  migrateFieldsToNodes,
  CONTAINER_TYPES,
  FIELD_NODE_TYPES,
} from './designer/types'
export {
  createLocalFormStore,
  createCloudFormStore,
  createFormStore,
  getActiveFormStore,
  setActiveFormStore,
  loadStoreMode,
  saveStoreMode,
  loadCloudConfig,
  saveCloudConfig,
  envCloudConfig,
} from './designer/store'
// 用普通 REST 后端当表单仓储（「对接自己的数据库」的参考实现）：
//   setActiveFormStore(createRestFormStore({ baseUrl: '/api/lowcode' }))
export { createRestFormStore } from './designer/rest-form-store'
export type { RestFormStoreOptions } from './designer/rest-form-store'
// 动态导航：把用户自建的表单直接变成导航项（宿主只搭外壳 + 一个低代码入口）
export { useFormNav, buildFormNavItems } from './useFormNav'
export type { FormNavItem, FormNavOptions, UseFormNavOptions, UseFormNavResult } from './useFormNav'
// 展示类字段的数据源（三种模式：静态 / 绑定字段 / 接口；接口走同一套同源守卫）
export { useDisplayData, extractByPath, toRows } from './display-data-source'
export type { DisplayDataSource, DisplayDataKind, DisplayDataState, UseDisplayDataOptions } from './display-data-source'
// 低代码导航外壳：用户自建的导航**配置**（数据，不是源码 → 不可信输入，先校验再渲染）
export {
  parseNavSchema,
  flattenNavNodes,
  findNavNode,
  firstSelectableNode,
  isSafeNavUrl,
  isExternalNavUrl,
} from './lowcode/nav-schema'
export type {
  NavNode,
  NavNodeKind,
  NavNodeBase,
  NavGroupNode,
  NavFormNode,
  NavDataNode,
  NavLinkNode,
  NavCustomNode,
  NavSchemaIssue,
  NavSchemaIssueCode,
  ParsedNavSchema,
  ParseNavSchemaOptions,
} from './lowcode/nav-schema'
export { useLowCodeNav } from './lowcode/useLowCodeNav'
export type { NavSource, UseLowCodeNavOptions, UseLowCodeNavResult } from './lowcode/useLowCodeNav'
export type { FormStore, FormMetaItem, FormStoreMode, FormCloudConfig } from './designer/store'
export { useFormManager } from './designer/useFormManager'
export type { FormManager } from './designer/useFormManager'
// 分享码：编码/解码（FD1，兼容旧码） + 可选 HMAC 签名（FD2）
// 签名用途：宿主能拒绝「不是自己签发」的分享码（如有人改了 schema 里的 apiUrl 再转发）。
export {
  encodeShareCode,
  decodeShareCode,
  parseShareCode,
  signShareCode,
  decodeShareCodeVerified,
  signPayload,
  signShareCodeWith,
  verifyShareCodeWith,
  shareFullLink,
  shareShortLink,
  encodeShareId,
  parseShareId,
  SHARE_CODE_PREFIX,
  SHARE_CODE_SIGNED_PREFIX,
  SHARE_ID_PREFIX,
} from './designer/share'
export type { ParsedShareCode } from './designer/share'
// 分享码签发者：默认不启用（产出未签名 FD1）；宿主显式设置后产出 FD2。
//   setActiveShareSigner(createHmacSigner(key))                  —— 本地 HMAC（无需后端）
//   setActiveShareSigner(createHttpSigner({ signUrl }))          —— 服务端签发（接缝，含契约）
export {
  createHmacSigner,
  createHttpSigner,
  setActiveShareSigner,
  getActiveShareSigner,
  timingSafeEqualStr,
} from './designer/share-signer'
export type { ShareSigner, HttpSignerOptions } from './designer/share-signer'
// 设计器草稿的持久化：默认本地 IndexedDB；宿主可换成云端实现跨设备续填。
//   setActiveDraftStorage(createHttpDraftStorage({ loadUrl, saveUrl, clearUrl }))
export {
  createIndexedDbDraftStorage,
  createHttpDraftStorage,
  setActiveDraftStorage,
  getActiveDraftStorage,
  DRAFT_STORE,
  DRAFT_KEY,
} from './designer/draft-storage'
export type { DraftStorage, HttpDraftStorageOptions } from './designer/draft-storage'
// 多租户隔离：给平台所有本地/云端存储键加工作区作用域（默认空 = 键不变，老数据不受影响）
export { setStorageScope, getStorageScope, scopedKey } from './designer/storage-scope'
// 提交幂等键：客户端生成并走 Idempotency-Key 头；服务端据此去重（本项目暂不上服务器）
export { createIdempotencyKey, makeIdempotencyKey, setIdempotencyKeyFactory, IDEMPOTENCY_HEADER } from './idempotency'
// 外发 URL 安全策略：宿主若要调跨域接口，用 apiAllowOrigins（FormBuilder prop）或本策略类型
export { checkApiUrl, isApiUrlAllowed, policyFromOrigins } from './api-url-guard'
export type { ApiUrlPolicy, ApiUrlVerdict } from './api-url-guard'

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
export type { ComponentCategory } from './fieldRegistry'

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
