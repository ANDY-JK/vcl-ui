// ⛔ 保护 — 组件库总入口，禁止删除/重命名导出，下游项目依赖此文件
//    需我确认：新增组件导出、export 路径调整
// 基础
export { default as Button } from './basic/Button.vue'
export { default as IconSvg } from './basic/IconSvg.vue'
export { default as Tag } from './basic/Tag.vue'

// 数据展示
export { default as DataTable } from './data/DataTable.vue'
export { default as ToggleList } from './data/ToggleList.vue'
export { default as Card } from './data/Card.vue'
export { default as Avatar } from './data/Avatar.vue'
export { default as Collapse } from './data/Collapse.vue'
export { default as Divider } from './data/Divider.vue'
export { default as Image } from './data/Image.vue'
export { default as ImagePreview } from './data/ImagePreview.vue'
export { default as ProgressBar } from './data/ProgressBar.vue'
export { default as Skeleton } from './data/Skeleton.vue'
export { default as Tree } from './data/Tree.vue'
export { default as Empty } from './data/Empty.vue'

// 表单 — 四大统一组件
export { default as Input } from './form/Input.vue'
export { default as Select } from './form/Select.vue'
export { default as Group } from './form/Group.vue'
export { default as IconPicker } from './form/IconPicker.vue'
export { default as Upload } from './form/Upload.vue'
export { default as CameraCapture } from './form/CameraCapture.vue'
// 独立工具：无内置组件使用，供业务项目按需接入
export { useBarcodeScanner, DEFAULT_CAPTURE_REGION } from './form/utils/useBarcodeScanner'
// 高德地图统一模块
export { default as AmapWidget } from './amap/AmapWidget.vue'
export { setAmapKey, setAmapKeys, getAmapJsKey, getAmapRestKey, getAmapSecurityCode } from './amap/amap-key'
export {
  isValidLatLon,
  normalizeChinaLatLon,
  calcDistance,
  keywordSearch,
  searchNearby,
  fetchPoiDetail,
  batchFetchPoiPhotos,
  getDrivingRoute,
  geocodeCalc,
  detectPlatform,
  buildNavLink,
} from './amap/amap-service'
export type { LatLng, PoiPhoto, PoiItem, DrivingRouteResult, NavLink, NavPoint } from './amap/amap-service'
export type { MarkerItem } from './amap/types'
export type { BarcodeScannerOptions, CaptureRegion } from './form/utils/useBarcodeScanner'
export type { DropZoneConfig, DropZoneFile } from './form/utils/types'

// 反馈
export { default as Toast } from './feedback/Toast.vue'
export { default as Loading } from './feedback/Loading.vue'
export { default as Popover } from './feedback/Popover.vue'
export { default as Result } from './feedback/Result.vue'
export { default as Drawer } from './feedback/Drawer.vue'
export { default as OfflineIndicator } from './feedback/OfflineIndicator.vue'
export { default as ReadOnlyOverlay } from './feedback/ReadOnlyOverlay.vue'
export { default as ErrorBoundary } from './feedback/ErrorBoundary.vue'
// 独立工具：无内置组件使用，供业务项目按需接入
export { beepSuccess, beepError, beepNotify, beepWarning, unlockAudio } from './feedback/composables/useBeep'
export { speak, stopSpeak, unlockVoice } from './feedback/composables/useVoice'
export type { VoiceLang } from './feedback/composables/useVoice'
export { notify, getNotifyStatus } from './feedback/composables/useNotify'
export type { NotifyOptions } from './feedback/composables/useNotify'
export { useToast, TOAST_KEY } from './feedback/composables/toast-context'
export type { ToastItem, ToastAPI } from './feedback/composables/toast-context'
export { default as ConfirmModal } from './feedback/ConfirmModal.vue'

// 导航
export { default as Tabs } from './nav/Tabs.vue'
export { default as Steps } from './nav/Steps.vue'
export { default as Pagination } from './nav/Pagination.vue'
export { default as Breadcrumb } from './nav/Breadcrumb.vue'
export { default as Menu } from './nav/Menu.vue'

// 布局
export { default as AppLayout } from './layout/AppLayout.vue'
export { default as MiniLayout } from './layout/MiniLayout.vue'
export { default as AccordionNav } from './layout/AccordionNav.vue'
export { default as ModalBox } from './layout/ModalBox.vue'
/** @deprecated 已合并到 Flex，Space 保留为语法糖（direction='horizontal'/'vertical' → Flex row/column） */
export { default as Space } from './layout/Space.vue'
export { default as Flex } from './layout/Flex.vue'

// 图表
export { default as Chart } from './chart/Chart.vue'
export { default as BaseChart } from './chart/BaseChart.vue'
export { default as ChartTable } from './chart/ChartTable.vue'
export { default as ChartLegend } from './chart/ChartLegend.vue'

// 登录
export { default as LoginPage } from './login/login.vue'
export { default as RegisterPage } from './login/register.vue'
export { default as ForgotPasswordPage } from './login/forgot-password.vue'
export { default as PortalLogin } from './login/portal_login.vue'

// 导航数据（外部可引用 NavNode 类型 + 示例数据）
export { navTree, flattenNodes, getPrevNext, getCategory, getCurrentLabel } from './layout/utils/navData'
export type { NavNode } from './layout/utils/navData'

// DataTable 类型 & 工具
export { createLocalStorage } from './data/composables/types'
export type {
  Column,
  ColumnOption,
  RowAction,
  RowContextAction,
  ColumnFilterState,
  FilterOption,
  RowMeta,
  OptionSort,
  TableStorage,
  Emits,
} from './data/composables/types'

// 类型
export type { ChartType, ChartData, ChartSeriesItem, ChartProps } from './chart/utils/types'
export type { ImageItem, ImageSrc } from './data/ImagePreview.vue'
export type { Option, MenuItem, FeedbackType, TabItem } from './shared/types'
export type { RegisterPayload } from './login/register.vue'
export type { ResetPasswordPayload } from './login/forgot-password.vue'

// 路由规划
export { default as RouteMap } from './route-planner/RouteMap.vue'
export { default as RouteResult } from './route-planner/RouteResult.vue'
export { default as StorePanel } from './route-planner/StorePanel.vue'
export { default as StoreFormModal } from './route-planner/StoreFormModal.vue'
export { default as ImportProgress } from './route-planner/ImportProgress.vue'

// 低代码表单平台 — 设计器 + 渲染引擎 + 数据收集
export { default as FormDesigner } from './form-builder/FormDesigner.vue'
export { default as FormBuilder } from './form-builder/FormBuilder.vue'
export { default as FormCollect } from './form-builder/FormCollect.vue'
export { default as FormRenderer } from './form-builder/FormRenderer.vue'
export { default as FieldError } from './form-builder/FieldError.vue'
export { useFormSchema, isFieldVisible, createInitialData, SCHEMA_VERSION } from './form-builder/useFormSchema'
export { useFormValidator, validateField, validateAll, validators } from './form-builder/useFormValidator'
export { useFormStorage } from './form-builder/useFormStorage'
export {
  getFieldRegistration,
  getComponentCategory,
  isLayoutField,
  getComponentType,
  getFieldComponent,
  getRegisteredTypes,
  registerField,
  isFieldRegistered,
} from './form-builder/fieldRegistry'
export type { FieldRegistration } from './form-builder/fieldRegistry'
export { contractCollectionSchema, inspectionSchema, registrationSchema } from './form-builder/presets'
export {
  getFieldTypes,
  createField,
  toFormSchema,
  parseCascaderOptions,
  getTypeLabel,
  collectStorageKey,
  genFieldId,
  genRecordId,
} from './form-builder/designer/types'
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
} from './form-builder/designer/store'
export type { FormStore, FormMetaItem, FormStoreMode, FormCloudConfig } from './form-builder/designer/store'
export { encodeShareCode, decodeShareCode, SHARE_CODE_PREFIX } from './form-builder/designer/share'
export { useFormManager } from './form-builder/designer/useFormManager'
export type { FormManager } from './form-builder/designer/useFormManager'
export type {
  FieldType,
  FormField,
  FormSchema,
  FormLayout,
  FormStep,
  FormData,
  FormErrors,
  ValidationRule,
  VisibleWhen,
} from './form-builder/types'
export type {
  DesignerFieldType,
  DesignerField,
  FormMeta,
  FormDesign,
  CollectRecord,
  FieldTypeMeta,
} from './form-builder/designer/types'

// 存储与持久化
// 轻量 API（localStorage）— 同步，带 TTL
export { storageSet, storageGet, storageDelete, storageHas } from './storage/indexedDB'
// 重量 API（IndexedDB）— 异步，支持 TTL、动态 store、批量事务
export { dbPut, dbGet, dbDelete, dbHas, dbGetAll, dbKeys, dbCount, dbClear, dbBatch } from './storage/indexedDB'
// 合同收集存储适配层 — 本地 IndexedDB + 云端 Supabase 双后端
export { createBackend, validateStorageConfig } from './storage/contract-storage'
export type {
  StorageConfig,
  StorageBackend,
  StoreFile,
  StoreUploadState,
  SupabaseConfig,
} from './storage/contract-storage'
// 统一存储门面 — 声明意图、自动路由 localStorage / IndexedDB / 云端
export { storage, setCloudAdapter } from './storage/unified'
export type { StorageWriteOptions, CloudKVAdapter } from './storage/unified'
// Supabase 云端家族（共用传输层）— KV 适配器（CloudKVAdapter 官方实现）注入 setCloudAdapter 即用
export { createSupabaseKVAdapter, SupabaseTransport, REQUEST_TIMEOUT_MS } from './storage/supabase-transport'
export type { CloudObjectMeta } from './storage/supabase-transport'
// 类型
export type { CascaderOption } from './shared/types'

// 主题
export { useTheme } from './_internal/useTheme'
export type { ThemeMode } from './_internal/useTheme'

// 国际化
export { i18n, setLocale, getLocale, useT, useTm, useI18n, registerMessages } from './_internal/i18n'
export type { Locale } from './_internal/i18n'

// 通用工具函数 — 校验 / 行政区划 / 下载 / 深拷贝 / 数字金额 / 字符串 / 随机ID / 文件转换
export {
  isValidPhone,
  isValidEmail,
  isValidIdCard,
  isValidUrl,
  parseRegion,
  parseAddress,
  formatRegion,
  splitRegionDetail,
  downloadBlob,
  deepClone,
  formatNumber,
  formatMoney,
  formatSize,
  toChineseAmount,
  truncate,
  safeParseJSON,
  parseQueryString,
  buildQueryString,
  randomInt,
  randomString,
  uuid,
  fileToBase64,
  blobToBase64,
  dataURLtoBlob,
  uniqueBy,
  chunk,
  isEqual,
  maskName,
  maskPhone,
  maskIdCard,
  formatRelativeTime,
  isPlainObject,
  isNumeric,
  isEmpty,
  escapeHtml,
  unescapeHtml,
  hexToRgb,
  rgbToHex,
  isHexColor,
} from './_internal/utils'
export type { Region } from './_internal/utils'
export { formatDateZh, formatDateTimeZh } from './form/utils/date-utils'
