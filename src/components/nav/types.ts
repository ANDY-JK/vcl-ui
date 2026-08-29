/**
 * nav 模块共享类型 — 供 Menu/Steps/Tabs/Breadcrumb 与消费方复用
 */
export interface MenuItem {
  key: string | number
  label: string
  icon?: string
  children?: MenuItem[]
  disabled?: boolean
  divided?: boolean
  action?: () => void
}

export interface Step {
  label: string
  desc?: string
}

export interface TabItem {
  label: string
  value?: string | number
  icon?: string
}

export interface Crumb {
  label: string
  /** 路由路径（RouterLink）或原生 href */
  path?: string
  /** 兼容别名：非路由格式的外部 URL 时作为 href */
  to?: string
}
