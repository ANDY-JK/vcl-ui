// ⛔ 保护 — 导航数据，禁止：NavNode 接口结构调整，navTree 数据删除
//    需我确认：新增导航条目、icon 字段扩展
/** 导航节点：可无限嵌套 */
export interface NavNode {
  label: string
  icon?: string
  route?: string
  /** 所需权限标识（如 module:dashboard），有则按权限过滤 */
  requiredPermission?: string
  /** 子级节点（有则渲染为可折叠分组） */
  children?: NavNode[]
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

export const navTree: NavNode[] = [
  // ════════════════════════════════════════
  // 一、数据展示 — 表格/列表/树/图片等数据呈现
  // ════════════════════════════════════════
  {
    label: '数据展示',
    icon: 'database',
    children: [
      { label: 'DataTable 数据表格', icon: 'database', route: '/data-table' },
      { label: 'Card 卡片', icon: 'grid3x3', route: '/card' },
      { label: 'ToggleList 开关列表', icon: 'menu', route: '/toggle-list' },
      { label: 'Collapse 折叠面板', icon: 'panel-left', route: '/collapse' },
      { label: 'Tree 树形', icon: 'list', route: '/tree' },
      { label: 'Image 图片（含头像+预览）', icon: 'image', route: '/image' },
    ],
  },

  // ════════════════════════════════════════
  // 二、表单输入 — 输入/选择/上传/扫码/图标
  // ════════════════════════════════════════
  {
    label: '表单输入',
    icon: 'square-pen',
    children: [
      { label: 'Input 输入（text/number/textarea/search）', icon: 'square-pen', route: '/input' },
      { label: 'Select 选择器（select/combobox/date/time/cascader/tree/menu）', icon: 'circle-check', route: '/select' },
      { label: 'Group 选择组（radio/checkbox/switch/rate/slider）', icon: 'check-square', route: '/group' },
      { label: 'Icon 图标（渲染+选择器）', icon: 'star', route: '/icon' },
      { label: 'Upload 上传', icon: 'upload', route: '/upload' },
      { label: 'BarcodeScanner 扫码', icon: 'scan', route: '/barcode-scanner' },
      { label: 'CameraCapture 拍照', icon: 'camera', route: '/camera-capture' },
    ],
  },

  // ════════════════════════════════════════
  // 三、图表可视化 — ECharts 封装
  // ════════════════════════════════════════
  {
    label: '图表可视化',
    icon: 'chart-bar',
    children: [
      { label: 'Chart 图表', icon: 'chart-bar', route: '/chart' },
      { label: 'ChartTable 图表+表格', icon: 'layout-dashboard', route: '/chart-table' },
    ],
  },

  // ════════════════════════════════════════
  // 四、反馈与弹窗 — 通知/加载/弹窗/结果/错误边界
  // ════════════════════════════════════════
  {
    label: '反馈与弹窗',
    icon: 'bell',
    children: [
      { label: 'Toast 通知', icon: 'bell', route: '/toast' },
      { label: 'Loading 加载（含骨架屏）', icon: 'loader-circle', route: '/loading' },
      { label: 'Result 结果页（含空状态）', icon: 'circle-alert', route: '/result' },
      { label: 'Modal 弹窗（含确认弹窗）', icon: 'package', route: '/modal' },
      { label: 'Drawer 抽屉', icon: 'panel-left', route: '/drawer' },
      { label: 'Popover 气泡', icon: 'package', route: '/popover' },
      { label: 'ErrorBoundary 错误边界+状态', icon: 'shield', route: '/error-boundary' },
      { label: 'BeepVoice 蜂鸣/语音/通知', icon: 'volume-high', route: '/beep-voice' },
    ],
  },

  // ════════════════════════════════════════
  // 五、基础元素 — 按钮/标签/进度条/分割线
  // ════════════════════════════════════════
  {
    label: '基础元素',
    icon: 'square',
    children: [
      { label: 'Button 按钮', icon: 'square', route: '/button' },
      { label: 'Tag 标签+徽标', icon: 'tag', route: '/tag' },
      { label: 'ProgressBar 进度条', icon: 'loader-circle', route: '/progress' },
      { label: 'Divider 分割线', icon: 'minus', route: '/divider' },
    ],
  },

  // ════════════════════════════════════════
  // 六、导航与布局 — 标签页/步骤条/分页/弹性布局
  // ════════════════════════════════════════
  {
    label: '导航与布局',
    icon: 'grid3x3',
    children: [
      { label: 'Tabs 标签页', icon: 'grid3x3', route: '/tabs' },
      { label: 'Steps 步骤条', icon: 'menu', route: '/steps' },
      { label: 'Pagination 分页', icon: 'grid3x3', route: '/pagination' },
      { label: 'Breadcrumb 面包屑', icon: 'file', route: '/breadcrumb' },
      { label: 'Menu 导航菜单', icon: 'menu', route: '/menu' },
      { label: 'Flex 弹性布局', icon: 'columns-2', route: '/flex' },
    ],
  },

  // ════════════════════════════════════════
  // 七、页面模板 — 完整应用/页面级模板
  // ════════════════════════════════════════
  {
    label: '页面模板',
    icon: 'layout-dashboard',
    children: [
      { label: 'Login 登录系列', icon: 'user', route: '/login' },
      { label: 'Mini 小程序模板', icon: 'compass', route: '/mini/home' },
    ],
  },

  // ════════════════════════════════════════
  // 八、业务专项 — 地图/路线/存储等业务模块
  // ════════════════════════════════════════
  {
    label: '业务专项',
    icon: 'route',
    children: [
      { label: 'Storage 组合存储', icon: 'database', route: '/storage' },
      { label: 'Amap 高德地图', icon: 'map-pin', route: '/amap' },
      { label: 'RoutePlanner 路线规划', icon: 'route', route: '/route-planner' },
      { label: 'ContractCollection 合同收集', icon: 'file-text', route: '/contract-collection' },
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

/** 根据路由获取当前组件名 */
export function getCurrentLabel(currentRoute: string, nodes?: NavNode[]): string {
  const flat = nodes ? getFlat(nodes) : _flat
  const item = flat.find(item => item.route === currentRoute)
  return item?.label || ''
}

/** 根据当前路由获取上一个/下一个组件 */
export function getPrevNext(currentRoute: string, nodes?: NavNode[]) {
  const flat = nodes ? getFlat(nodes) : _flat
  const idx = flat.findIndex(item => item.route === currentRoute)
  return {
    current: idx >= 0 ? flat[idx] : null,
    prev: idx > 0 ? flat[idx - 1] : null,
    next: idx < flat.length - 1 ? flat[idx + 1] : null,
  }
}

/** 根据路由获取当前组件所在分类名 */
export function getCategory(currentRoute: string, nodes?: NavNode[]): string {
  const tree = nodes || navTree
  for (const group of tree) {
    if (group.children?.some(c => c.route === currentRoute)) return group.label
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
        if (c.route === route) return n.label
        const deep = findCategoryLabel(c.children ?? [], route)
        if (deep) return deep || n.label
      }
    }
  }
  return ''
}
