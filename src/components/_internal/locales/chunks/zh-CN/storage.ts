/**
 * zh-CN locale 分块 — storage 域
 * 语言包已按模块分块维护；新增 key 请同时更新 zh-CN 与 en-US 对应分块。
 */
export default {
  storage: {
    supabaseUrlRequired: '请填写 Supabase 项目 URL',
    supabaseUrlFormat: 'Supabase URL 需以 http(s):// 开头',
    supabaseKeyRequired: '请填写 anon public key',
    supabaseBucketRequired: '请填写 Storage bucket 名称',
    cloudTimeout: '云端请求超时（{s}s），请检查网络后重试',
    cloudNetworkError: '云端网络异常，请检查网络连接',
    bucketMissing: 'bucket「{bucket}」不存在或无权访问，请在 Supabase 控制台创建 public bucket',
    cloudPermissionDenied: '云端权限不足，请检查 storage.objects 的 RLS 策略（见 notes/supabase-storage-setup.md）',
    cloudHttpError: '云端返回 HTTP {status}',
    idbUnavailable: 'IndexedDB 不可用',
    idbUpgradeBlocked: '[IndexedDB] 数据库升级被阻塞，请关闭其他标签页后刷新',
    idbStoreBlocked: '[IndexedDB] 创建 store "{store}" 被阻塞，请关闭其他标签页后刷新',
    sourceImageUnavailable: '源图片不可用（HTTP {status}），已跳过上传',
    clearPartialFail: '云端有 {n} 个对象删除失败，请重试',
  },
}
