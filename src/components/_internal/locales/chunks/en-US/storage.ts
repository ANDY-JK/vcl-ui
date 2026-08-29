/**
 * en-US locale 分块 — storage 域
 * 语言包已按模块分块维护；新增 key 请同时更新 zh-CN 与 en-US 对应分块。
 */
export default {
  storage: {
    supabaseUrlRequired: 'Please fill in the Supabase project URL',
    supabaseUrlFormat: 'Supabase URL must start with http(s)://',
    supabaseKeyRequired: 'Please fill in the anon public key',
    supabaseBucketRequired: 'Please fill in the Storage bucket name',
    cloudTimeout: 'Cloud request timed out ({s}s), please check the network and retry',
    cloudNetworkError: 'Cloud network error, please check the connection',
    bucketMissing:
      'Bucket "{bucket}" does not exist or is inaccessible; create a public bucket in the Supabase console',
    cloudPermissionDenied:
      'Insufficient cloud permission, check the storage.objects RLS policy (see notes/supabase-storage-setup.md)',
    cloudHttpError: 'Cloud returned HTTP {status}',
    idbUnavailable: 'IndexedDB is unavailable',
    idbUpgradeBlocked: '[IndexedDB] Database upgrade blocked, close other tabs and refresh',
    idbStoreBlocked: '[IndexedDB] Creating store "{store}" blocked, close other tabs and refresh',
    sourceImageUnavailable: 'Source image unavailable (HTTP {status}); upload skipped',
    clearPartialFail: '{n} objects failed to delete in the cloud, please retry',
  },
}
