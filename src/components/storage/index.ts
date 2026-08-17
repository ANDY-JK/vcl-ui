/** 存储与持久化按需导入入口 */
export { storageSet, storageGet, storageDelete, storageHas } from './indexedDB'
export { dbPut, dbGet, dbDelete, dbHas, dbGetAll, dbKeys, dbCount, dbClear, dbBatch } from './indexedDB'
export { createBackend, validateStorageConfig } from './contract-storage'
export type { StorageConfig, StorageBackend, StoreFile, StoreUploadState, SupabaseConfig } from './contract-storage'
