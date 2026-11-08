/**
 * NotificationCenter 的数据契约。
 *
 * 单独成文件（不放 shared/types.ts）：这条结构只服务通知中心一处，
 * 塞进全局类型表会让「全局类型」越长越随意。
 */

export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface NotificationItem {
  /** 稳定 id：已读回执、列表 key 都靠它 */
  id: string | number
  /** 标题（单行截断，全值走 title 属性） */
  title: string
  /** 副文案（单行截断） */
  desc?: string
  /** 时间：时间戳 / Date / 预格式化字符串。不传则不渲染时间列 */
  time?: string | number | Date
  /** 语义类型：决定左侧图标与配色 */
  type?: NotificationType
  /** 是否已读（不传视为未读） */
  read?: boolean
  /** 覆盖类型图标的图标名（如 'user-plus'） */
  icon?: string
}
