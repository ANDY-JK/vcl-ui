// 设计令牌必须先于本域组件样式（Q3 域级 CSS 自包含；与主入口 index.ts 同口径）
import '../tokens.css'
/** 表单组件按需导入入口 */
export { default as Input } from './Input.vue'
export { default as Select } from './Select.vue'
export { default as Group } from './Group.vue'
export { default as SegmentedControl } from './SegmentedControl.vue'
export { default as IconPicker } from './IconPicker.vue'
export { default as Upload } from './Upload.vue'
export { default as CameraCapture } from './CameraCapture.vue'
export { default as CodeCapture } from './CodeCapture.vue'
export { default as CaptureFallbackPanel } from './CaptureFallbackPanel.vue'
export { default as CaptureFallbackSheet } from './CaptureFallbackSheet.vue'
export { useBarcodeScanner, DEFAULT_CAPTURE_REGION } from './utils/useBarcodeScanner'
export type { BarcodeScannerOptions, CaptureRegion, BarcodeDetection } from './utils/useBarcodeScanner'
export {
  detectCaptureCapability,
  classifyCaptureError,
  captureChainFrom,
  nextCaptureLevel,
  resolveEntryLevel,
  openSystemCapture,
  cancelPendingSystemCapture,
  CAPTURE_CHAIN,
} from './utils/capture-fallback'
export type {
  CaptureLevel,
  CaptureCapability,
  CaptureFailReason,
  ChainOptions,
  SystemCaptureOptions,
} from './utils/capture-fallback'
export type { DropZoneConfig, DropZoneFile } from './utils/types'
// #438（TD-57 收口）：跨域共享的**核心**符号从域入口导出（UploadFile 是类型，零运行时体积）。
// `utils/date-utils`、`utils/pagination` 这类内部工具**故意不收**：收进来会让每个按需引入的宿主
// 为没用到的函数付 bundle 体积（实测 form/index.js 162KB/预算 150KB，被 verify:pkg 拦下）。
export type { UploadFile } from './Upload.vue'
