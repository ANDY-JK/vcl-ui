// 设计令牌必须先于本域组件样式（Q3 域级 CSS 自包含；与主入口 index.ts 同口径）
import '../tokens.css'
/** 存储与持久化按需导入入口 */
export { storageSet, storageGet, storageDelete, storageHas } from './indexedDB'
export { dbPut, dbGet, dbDelete, dbHas, dbGetAll, dbKeys, dbCount, dbClear, dbBatch } from './indexedDB'
export { validateStorageConfig, normalizeForBackend, sanitizeObjectKeyPart } from './contract-storage'
export { createBackend, CompositeBackend } from './compositeBackend'
export type { CloudBackend } from './compositeBackend'
export type { StorageConfig, StorageBackend, StoreFile, StoreUploadState, SupabaseConfig } from './contract-storage'
// #438（TD-57 收口）：跨域共享符号从域入口导出（form-builder 的收集页与设计器在用）
export { getSlotFile, setSlotFile, allSlotsFilled, defaultStorageConfigFromEnv } from './contract-storage'
export { validateSupabaseConfig } from './supabase-transport'
// 统一存储门面 —— 声明意图、自动路由后端（详见 unified.ts）
export { storage, setCloudAdapter } from './unified'
export type { StorageWriteOptions, CloudKVAdapter } from './unified'
// Supabase 云端家族（共用传输层 supabase-transport.ts）：
//   createBackend           → 合同收集文件后端（本地 + 云端对账）
//   createSupabaseKVAdapter → 通用 KV 适配器（CloudKVAdapter 官方实现），注入 setCloudAdapter 即用
export { createSupabaseKVAdapter, SupabaseKVAdapter, SupabaseTransport, REQUEST_TIMEOUT_MS } from './supabase-transport'
export type { CloudObjectMeta } from './supabase-transport'
