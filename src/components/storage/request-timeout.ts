/**
 * 云端存储单次请求的超时上限 —— Supabase 与 S3 两个传输层共用。
 * 各写一份时，改了数值而报错文案里「N 秒超时」按的是另一份，用户看到的等待与提示对不上。
 */
export const REQUEST_TIMEOUT_MS = 60_000
