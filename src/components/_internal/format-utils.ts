/**
 * format-utils — 通用格式化工具函数
 *
 * 从 Upload.vue 内联的 formatSize 迁移，便于多组件复用。
 */

/** 格式化文件大小（B/KB/MB/GB） */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}
