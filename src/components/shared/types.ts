// ⛔ 保护 — 共享类型，禁止：Option/MenuItem 接口字段删除
//    需我确认：新增全局类型、字段扩展
/** 通用选项结构 */
export interface Option {
  value: string | number | boolean
  label: string
  disabled?: boolean
  icon?: string
  desc?: string
  _search?: string // 隐藏搜索文本，label 简洁时通过此字段匹配
}

/** 菜单项结构 */
export interface MenuItem {
  label: string
  icon?: string
  danger?: boolean
  divided?: boolean
  action?: () => void
}

/** 反馈类型 */
export type FeedbackType = 'info' | 'success' | 'warning' | 'error'

/** 反馈图标映射 */
export const feedbackIconMap: Record<string, string> = {
  info: 'circle-alert',
  success: 'circle-check',
  warning: 'circle-alert',
  error: 'x',
}

/** 反馈颜色映射 */
export const feedbackColorMap: Record<string, string> = {
  info: 'var(--color-info)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-danger)',
}

/** Tab 项 */
export interface TabItem {
  label: string
  value: string | number
}

/** 级联选择器节点 */
export interface CascaderOption {
  value: string | number
  label: string
  children?: CascaderOption[]
  disabled?: boolean
}

/** 树选择器节点 */
export interface TreeNode extends CascaderOption {
  checked?: boolean
}
