// ⛔ 保护 — 导航数据，禁止：NavNode 接口结构调整，navTree 数据删除
//    需我确认：新增导航条目、icon 字段扩展
import type { Router } from 'vue-router'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：纯 .ts 模块直接用（模式 3） */
const t = useT()

/** 导航节点：可无限嵌套 */
export interface NavNode {
  /** 显示文案。navTree 内置节点存 i18n key（'navData.*'）；外部自定义 items 传原始文案，原样渲染 */
  label: string
  icon?: string
  route?: string
  /** 所需权限标识（如 module:dashboard），有则按权限过滤 */
  requiredPermission?: string
  /** 子级节点（有则渲染为可折叠分组） */
  children?: NavNode[]
}

/**
 * 导航 label 翻译：内置 navTree 的 label 存的是 i18n key（navData.* 域），
 * 渲染/返回前经此翻译；外部传入的自定义 label（非 key）原样返回，不破坏消费方 API。
 */
export function navLabel(label: string): string {
  return label.startsWith('navData.') ? t(label) : label
}

/** 扁平化所有叶子节点（用于路由匹配和上下导航） */
export function flattenNodes(nodes: NavNode[]): NavNode[] {
  const result: NavNode[] = []
  for (const n of nodes) {
    if (n.children && n.children.length > 0) {
      result.push(...flattenNodes(n.children))
    } else if (n.route) {
      result.push(n)
    }
  }
  return result
}

/** 节点（或其子树）是否匹配当前路由 — AccordionNav / NavItem 共用，匹配规则改动只改这里 */
export function isNodeActive(node: NavNode, currentPath: string, router: Router): boolean {
  if (node.route) {
    return currentPath === router.resolve(node.route).path
  }
  if (node.children) return node.children.some((c) => isNodeActive(c, currentPath, router))
  return false
}

/** demo 站默认导航树：13 域全组件的分类菜单（消费方应传自己的 navItems 覆盖） */
export const navTree: NavNode[] = [
  // ════════════════════════════════════════
  // 一、数据展示 — 表格/列表/树/图片等数据呈现
  // ════════════════════════════════════════
  {
    label: 'navData.dataDisplay',
    icon: 'database',
    children: [
      { label: 'navData.dataTable', icon: 'database', route: '/data-table' },
      { label: 'navData.card', icon: 'grid3x3', route: '/card' },
      { label: 'navData.toggleList', icon: 'menu', route: '/toggle-list' },
      { label: 'navData.collapse', icon: 'panel-left', route: '/collapse' },
      { label: 'navData.tree', icon: 'list', route: '/tree' },
      { label: 'navData.image', icon: 'image', route: '/image' },
      { label: 'navData.skeleton', icon: 'loader-circle', route: '/skeleton' },
      { label: 'navData.avatar', icon: 'user', route: '/avatar' },
    ],
  },

  // ════════════════════════════════════════
  // 二、表单输入 — 输入/选择/上传/扫码/图标
  // ════════════════════════════════════════
  {
    label: 'navData.formInput',
    icon: 'square-pen',
    children: [
      { label: 'navData.input', icon: 'square-pen', route: '/input' },
      {
        label: 'navData.select',
        icon: 'circle-check',
        route: '/select',
      },
      { label: 'navData.group', icon: 'check-square', route: '/group' },
      { label: 'navData.icon', icon: 'star', route: '/icon' },
      { label: 'navData.upload', icon: 'upload', route: '/upload' },
      { label: 'navData.capture', icon: 'scan', route: '/capture' },
    ],
  },

  // ════════════════════════════════════════
  // 三、图表可视化 — ECharts 封装
  // ════════════════════════════════════════
  {
    label: 'navData.charts',
    icon: 'chart-bar',
    children: [
      { label: 'navData.chart', icon: 'chart-bar', route: '/chart' },
      { label: 'navData.chartTable', icon: 'layout-dashboard', route: '/chart-table' },
    ],
  },

  // ════════════════════════════════════════
  // 四、反馈与弹窗 — 通知/加载/弹窗/结果/错误边界
  // ════════════════════════════════════════
  {
    label: 'navData.feedback',
    icon: 'bell',
    children: [
      { label: 'navData.toast', icon: 'bell', route: '/toast' },
      { label: 'navData.loading', icon: 'loader-circle', route: '/loading' },
      { label: 'navData.result', icon: 'circle-alert', route: '/result' },
      { label: 'navData.modal', icon: 'package', route: '/modal' },
      { label: 'navData.drawer', icon: 'panel-left', route: '/drawer' },
      { label: 'navData.popover', icon: 'package', route: '/popover' },
      { label: 'navData.errorBoundary', icon: 'shield', route: '/error-boundary' },
      { label: 'navData.beepVoice', icon: 'volume-2', route: '/beep-voice' },
      { label: 'navData.confirmModal', icon: 'message-circle', route: '/confirm-modal' },
      { label: 'navData.state', icon: 'wifi-off', route: '/state' },
    ],
  },

  // ════════════════════════════════════════
  // 五、基础元素 — 按钮/标签/进度条/分割线
  // ════════════════════════════════════════
  {
    label: 'navData.basics',
    icon: 'square',
    children: [
      { label: 'navData.button', icon: 'square', route: '/button' },
      { label: 'navData.tag', icon: 'tag', route: '/tag' },
      { label: 'navData.progressBar', icon: 'loader-circle', route: '/progress' },
      { label: 'navData.divider', icon: 'minus', route: '/divider' },
    ],
  },

  // ════════════════════════════════════════
  // 六、导航与布局 — 标签页/步骤条/分页/弹性布局
  // ════════════════════════════════════════
  {
    label: 'navData.navLayout',
    icon: 'grid3x3',
    children: [
      { label: 'navData.tabs', icon: 'grid3x3', route: '/tabs' },
      { label: 'navData.steps', icon: 'menu', route: '/steps' },
      { label: 'navData.pagination', icon: 'grid3x3', route: '/pagination' },
      { label: 'navData.breadcrumb', icon: 'file', route: '/breadcrumb' },
      { label: 'navData.menu', icon: 'menu', route: '/menu' },
      { label: 'navData.flex', icon: 'columns-2', route: '/flex' },
    ],
  },

  // ════════════════════════════════════════
  // 七、页面模板 — 完整应用/页面级模板
  // ════════════════════════════════════════
  {
    label: 'navData.pageTemplates',
    icon: 'layout-dashboard',
    children: [{ label: 'navData.login', icon: 'user', route: '/login' }],
  },

  // ════════════════════════════════════════
  // 八、业务专项 — 地图/路线/存储等业务模块
  // ════════════════════════════════════════
  {
    label: 'navData.business',
    icon: 'route',
    children: [
      { label: 'navData.storage', icon: 'database', route: '/storage' },
      { label: 'navData.amap', icon: 'map-pin', route: '/amap' },
      { label: 'navData.amapWidget', icon: 'target', route: '/amap-widget' },
      { label: 'navData.routePlanner', icon: 'route', route: '/route-planner' },
      { label: 'navData.contractCollection', icon: 'file-text', route: '/contract-collection' },
      { label: 'navData.formDesigner', icon: 'layout-template', route: '/form-builder' },
      { label: 'navData.formRenderer', icon: 'file-text', route: '/form-renderer' },
    ],
  },
]

/** 缓存默认数据扁平化结果 */
const _flat = flattenNodes(navTree)

/** 扁平化缓存（按引用键，避免重复计算） */
const _flatCache = new WeakMap<NavNode[], NavNode[]>()

function getFlat(nodes: NavNode[]): NavNode[] {
  if (nodes === navTree) return _flat
  let cached = _flatCache.get(nodes)
  if (!cached) {
    cached = flattenNodes(nodes)
    _flatCache.set(nodes, cached)
  }
  return cached
}

/** 根据路由获取当前组件名（返回经 i18n 翻译的显示文案） */
export function getCurrentLabel(currentRoute: string, nodes?: NavNode[]): string {
  const flat = nodes ? getFlat(nodes) : _flat
  const item = flat.find((item) => item.route === currentRoute)
  return item ? navLabel(item.label) : ''
}

/** 根据当前路由获取上一个/下一个组件 */
export function getPrevNext(currentRoute: string, nodes?: NavNode[]) {
  const flat = nodes ? getFlat(nodes) : _flat
  const idx = flat.findIndex((item) => item.route === currentRoute)
  return {
    current: idx >= 0 ? flat[idx] : null,
    prev: idx > 0 ? flat[idx - 1] : null,
    next: idx < flat.length - 1 ? flat[idx + 1] : null,
  }
}

/** 根据路由获取当前组件所在分类名（返回经 i18n 翻译的显示文案） */
export function getCategory(currentRoute: string, nodes?: NavNode[]): string {
  const tree = nodes || navTree
  for (const group of tree) {
    if (group.children?.some((c) => c.route === currentRoute)) return navLabel(group.label)
    const deep = findCategoryLabel(group.children ?? [], currentRoute)
    if (deep) return deep
  }
  return ''
}

function findCategoryLabel(nodes: NavNode[], route: string): string {
  for (const n of nodes) {
    if (n.route === route) return ''
    if (n.children) {
      for (const c of n.children) {
        if (c.route === route) return navLabel(n.label)
        const deep = findCategoryLabel(c.children ?? [], route)
        if (deep) return deep || navLabel(n.label)
      }
    }
  }
  return ''
}
