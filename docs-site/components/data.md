# 数据展示（data）

> 本页由 `npm run gen:docs` 从源码自动生成，请勿手改；改源码后重新生成（`check:docs` 闸口会卡漂移）。

## 组件一览

| 组件 | Props 数 | Events 数 | Slots 数 |
| --- | --- | --- | --- |
| `DataTable` | 56 | 17 | 4 |
| `ToggleList` | 13 | 3 | 0 |
| `Card` | 11 | 1 | 3 |
| `Avatar` | 4 | 0 | 0 |
| `Collapse` | 5 | 2 | 1 |
| `Divider` | 3 | 0 | 0 |
| `Image` | 12 | 3 | 0 |
| `ImagePreview` | 3 | 2 | 1 |
| `ProgressBar` | 15 | 2 | 0 |
| `Skeleton` | 7 | 0 | 1 |
| `Tree` | 8 | 4 | 0 |
| `Empty` | 3 | 0 | 1 |

## 组合式函数 / 工具导出

| 导出 | 说明 |
| --- | --- |
| `createLocalStorage` | 创建 localStorage 适配器（工厂函数，生产级：try-catch 保护 + 前缀隔离） |

---

## `DataTable`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/data-table`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `columns` | `Column[]` | — | 是 | — |
| `data` | `T[]` | — | 是 | — |
| `rowKey` | `string` | `'seq'` | 否 | — |
| `striped` | `boolean` | `true` | 否 | — |
| `bordered` | `boolean` | `true` | 否 | — |
| `hoverable` | `boolean` | `true` | 否 | — |
| `isLoading` | `boolean` | `false` | 否 | — |
| `emptyText` | `string` | `''` | 否 | — |
| `blankText` | `string` | `'-'` | 否 | 单元格空白占位：null/undefined/空串/纯空白串 → 该文本（默认 '-'）；传空串关闭。仅展示层，不影响导出 |
| `sortKey` | `string` | — | 否 | — |
| `sortOrder` | `'asc' \| 'desc'` | — | 否 | — |
| `pinyinSearch` | `boolean` | `true` | 否 | — |
| `truncateThreshold` | `number` | `0` | 否 | — |
| `selectable` | `boolean` | `false` | 否 | — |
| `selectedKeys` | `string[]` | `() => []` | 否 | — |
| `exportable` | `boolean` | `false` | 否 | — |
| `exportFileName` | `string` | `'export'` | 否 | — |
| `excelExportable` | `boolean` | `false` | 否 | — |
| `exportScope` | `'all' \| 'page'` | — | 否 | 导出范围：'all' 筛选后全量（默认），'page' 仅当前页 |
| `pageSize` | `number` | `0` | 否 | — |
| `currentPage` | `number` | `1` | 否 | — |
| `total` | `number` | — | 否 | — |
| `cardBreakpoint` | `number` | `BP_MD` | 否 | — |
| `maxHeight` | `string` | `''` | 否 | — |
| `autoHeight` | `boolean` | `true` | 否 | 自适应高度：填充父容器剩余空间（需父容器有明确高度） |
| `virtualScroll` | `boolean` | `true` | 否 | — |
| `pageVirtualMin` | `number` | `0` | 否 | 页面滚动虚拟化的**额外**行数下限（默认 0 = 不设人工下限）。 实际判据是实测的：总行数 > 可视行数 + 上下 overscan（那些行无论如何都要渲染）， 所以面板高矮、dense、缩放都自适应，不靠猜常量。设 >0 只用于强制提前/推迟启用。 |
| `autoFit` | `boolean` | `true` | 否 | — |
| `truncateMode` | `'ellipsis' \| 'wrap' \| 'none'` | `'ellipsis'` | 否 | — |
| `dense` | `boolean` | `false` | 否 | — |
| `colSettings` | `boolean` | `true` | 否 | 列设置按钮（默认显示，false 可隐藏） |
| `cellSelection` | `boolean` | `true` | 否 | 单元格矩形选区：长按/拖拽框选 + 拖选自动滚动（默认开启） |
| `keyboardNav` | `boolean` | `true` | 否 | 键盘导航：方向键移动/Shift 扩展/Enter 编辑/Delete 清空/Ctrl+Home/End（默认开启） |
| `cellContextMenu` | `boolean` | `true` | 否 | 单元格右键菜单：复制/粘贴/清空（默认开启） |
| `summary` | `((rows: T[]) => Record<string, string \| number>) \| Record<string, string \| number>` | — | 否 | 汇总行：函数形式用 props.data 计算（仅客户端模式可用）；服务端分页请传对象（后端算好汇总值） |
| `storage` | `TableStorage` | — | 否 | 存储适配器，默认 localStorage；SaaS 场景可传入按账号隔离的实现 |
| `namespace` | `string` | — | 否 | 存储命名空间，同页面多实例时用于隔离持久化数据 |
| `persistence` | `'auto' \| 'none'` | `'auto' as 'auto' \| 'none'` | 否 | 持久化模式：'auto' 自动判断（sortKey 受控/searchMode='server'/filterMode='server' → 禁用），'none' 强制禁用内部 IndexedDB |
| `editable` | `boolean` | `false` | 否 | 单元格编辑模式：双击进入编辑，Enter 确认，Escape 取消 |
| `dateInputOrder` | `DateOrder` | `'MDY' as DateOrder` | 否 | 日期列（Column.type='date'/'datetime'）两段数字输入的月日顺序： 'MDY'（默认，9/12 → 9月12日）\| 'DMY'（9/12 → 12月9日）。 ⚠️ 当月日都 ≤12 时无法自动消歧，必须由使用方声明。 |
| `noteMode` | `boolean` | `false` | 否 | 备注提示模式：hover 显示备注，点击填写 |
| `notes` | `Record<string, Record<string, string>>` | `() => ({})` | 否 | 外部传入的备注数据 |
| `rowActions` | `RowAction[]` | — | 否 | 行操作按钮：添加后在每行末尾渲染操作列 |
| `rowContextActions` | `RowContextAction[]` | — | 否 | 行右键菜单项：右键点击数据行时显示的自定义操作 |
| `originalTooltip` | `boolean` | `false` | 否 | @patch 2026-07-15 原始值气泡：hover 已编辑单元格时弹出原始值供对比（需 editable 开启） |
| `modifiedMark` | `boolean` | `false` | 否 | @patch 2026-07-15 已编辑标记：被修改过的单元格右上角显示三角角标 |
| `imageDomains` | `string[]` | `() => []` | 否 | 图片域名白名单，isImageUrl 判图用。默认覆盖常见 CDN |
| `searchMode` | `'client' \| 'server'` | `'client'` | 否 | 搜索模式：'client' 客户端本地过滤，'server' 抛 search 事件由后端处理 |
| `filterMode` | `'client' \| 'server'` | `'client'` | 否 | 筛选模式：'client' 客户端本地过滤，'server' 只抛 filter 事件由后端处理 |
| `filters` | `Record<string, string[]>` | — | 否 | 外部筛选状态（v-model:filters）：服务端模式下父组件可程序化控制筛选，变化时自动同步到内部 filterState |
| `rowClass` | `(row: T, index: number) => string` | — | 否 | — |
| `rowStyle` | `(row: T, index: number) => Record<string, string>` | — | 否 | — |
| `cellClass` | `(colKey: string, row: T, index: number) => string` | — | 否 | — |
| `cellStyle` | `(colKey: string, row: T, index: number) => Record<string, string>` | — | 否 | — |
| `shotMode` | `'preview' \| 'download' \| 'copy'` | `'preview' as 'preview' \| 'download' \| 'copy'` | 否 | 截图行为模式：'preview' 弹窗预览 \| 'download' 直接下载 \| 'copy' 直接复制到剪贴板 |
| `screenshotMaxRows` | `number` | `400` | 否 | 截图最大行数（超过提醒用户先筛选，避免生成超大 canvas 卡死） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `sort` | `key: string, order: 'asc' \| 'desc'` | — |
| `filter` | `filters: Record<string, string[]>` | — |
| `'update:filters'` | `filters: Record<string, string[]>` | — |
| `'row-click'` | `row: Record<string, any>, index: number` | — |
| `'update:selectedKeys'` | `keys: string[]` | — |
| `'update:currentPage'` | `page: number` | — |
| `'page-change'` | `page: number, pageSize: number` | — |
| `'selection-change'` | `keys: string[], rows: Record<string, any>[]` | — |
| `'cell-change'` | `rowKey: string, colKey: string, newValue: string` | — |
| `'cell-note'` | `rowKey: string, colKey: string, note: string` | — |
| `'batch-change'` | `colKey: string, newValue: string, rowKeys: string[]` | — |
| `'row-action'` | `actionKey: string, row: Record<string, any>, index: number` | — |
| `'row-context-action'` | `actionKey: string, row: Record<string, any>, index: number` | — |
| `search` | `term: string` | — |
| `'fullscreen-change'` | `isFullscreen: boolean` | — |
| `export` | `无` | v2（Q5）：onExport 回调 prop 收敛为事件——有监听=服务端导出（宿主自处理），无监听=内置 CSV/Excel 导出 |
| `'toggle-sidebar'` | `无` | v2（Q5）：onToggleSidebar 回调 prop 收敛为事件——有监听=通知宿主收/还侧边栏，无监听=降级 inject('toggleCollapse') |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `cell` | `column, row, value` | &#123;&#123; cellShow(row, col) &#125;&#125; &#123;&#123; cellShow(row |
| `empty` | `filtered` | — |
| `header-cell` | `column` | &#123;&#123; colTitle(col) &#125;&#125; |
| `toolbar-actions` | — | — |

## `ToggleList`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/toggle-list`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `items` | `Record<string, any>[]` | — | 是 | — |
| `idKey` | `string` | `'id'` | 否 | — |
| `titleField` | `string` | `'display_name'` | 否 | — |
| `descriptionField` | `string` | `'description'` | 否 | — |
| `iconField` | `string` | `'icon'` | 否 | — |
| `toggleField` | `string` | `'is_enabled'` | 否 | — |
| `extraColumns` | `ExtraColumn[]` | `() => []` | 否 | — |
| `disabled` | `boolean` | `false` | 否 | — |
| `isLoading` | `boolean` | `false` | 否 | — |
| `emptyText` | `string` | `''` | 否 | — |
| `variant` | `'switch' \| 'button'` | `'switch'` | 否 | 'switch' = 开关列表, 'button' = 操作按钮（发快递等场景） |
| `buttonLabel` | `string` | `''` | 否 | variant='button' 时按钮文字 |
| `phoneField` | `string` | `'phone'` | 否 | variant='button' 时手机号字段 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `toggle` | `item: Record<string, any>, newValue: boolean` | — |
| `'item-click'` | `item: Record<string, any>` | — |
| `'button-click'` | `payload: { name: string; phone: string; address: string; item: Record<string, any> }` | variant='button' 时点击按钮，payload: { name, phone, address, item } |

## `Card`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/card`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | `'grid' \| 'stat'` | `'grid'` | 否 | — |
| `title` | `string` | — | 否 | — |
| `titleAs` | `'h1' \| 'h2' \| 'h3' \| 'h4' \| 'h5' \| 'h6' \| 'div'` | `'h3'` | 否 | title 的标题标签级。默认 h3：卡片通常是「页标题(h1) → 区块(h2) → 卡片」的第三级。 硬编码某一级会在宿主层级不同时跳级（axe heading-order），故把选择权交给调用方； 传 'div' 表示纯展示标题（卡片不承担文档结构职责时用）。 |
| `highlight` | `boolean` | — | 否 | — |
| `summary` | `boolean` | — | 否 | — |
| `overflowVisible` | `boolean` | — | 否 | 允许内容溢出卡片边界（用于包含下拉/弹出组件的场景） |
| `value` | `string \| number` | — | 否 | — |
| `label` | `string` | — | 否 | — |
| `icon` | `string` | `'circle-alert'` | 否 | — |
| `color` | `string` | — | 否 | — |
| `trend` | `number \| string` | — | 否 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `click` | `无` | — |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `default` | — | — |
| `footer` | — | — |
| `header` | — | — |

## `Avatar`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/avatar`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `src` | `string` | — | 否 | — |
| `name` | `string` | — | 否 | — |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | 否 | — |
| `shape` | `'circle' \| 'rounded'` | `'circle'` | 否 | — |

## `Collapse`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/collapse`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | `string` | — | 是 | — |
| `open` | `boolean` | `false` | 否 | — |
| `disabled` | `boolean` | `false` | 否 | — |
| `id` | `string` | `''` | 否 | 面板唯一标识，用于 aria-controls / aria-labelledby 关联 |
| `accordion` | `boolean` | `false` | 否 | 手风琴模式标记：配合外部 CollapseGroup 使用，展开时自动关闭同组其他面板 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:open'` | `v: boolean` | — |
| `'accordion-expand'` | `无` | 手风琴模式：展开时触发，外部 CollapseGroup 监听后关闭同组其他面板 |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `default` | — | — |

## `Divider`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/divider`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | — | 否 | — |
| `direction` | `'horizontal' \| 'vertical'` | `'horizontal'` | 否 | — |
| `dashed` | `boolean` | `false` | 否 | — |

## `Image`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/image`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `src` | `string` | — | 否 | — |
| `alt` | `string` | `''` | 否 | — |
| `width` | `number` | — | 否 | 图片宽度 |
| `height` | `number` | — | 否 | 图片高度 |
| `size` | `number` | `80` | 否 | 默认尺寸（宽高未设时） |
| `fit` | `'cover' \| 'contain' \| 'fill' \| 'none' \| 'scale-down'` | `'cover'` | 否 | object-fit |
| `radius` | `number` | — | 否 | 圆角 |
| `round` | `boolean` | — | 否 | 圆形 |
| `lazy` | `boolean` | `true` | 否 | 是否懒加载 |
| `preview` | `boolean` | `true` | 否 | 点击放大预览 |
| `loadingText` | `string` | `''` | 否 | 加载中文本 |
| `errorText` | `string` | `''` | 否 | 加载失败文本 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `load` | `src: string` | — |
| `error` | `src: string` | — |
| `click` | `src: string` | — |

## `ImagePreview`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `src` | `ImageSrc` | — | 否 | 图片源：字符串/对象 = 单图，数组 = 多图 |
| `initialIndex` | `number` | `0` | 否 | — |
| `title` | `string` | — | 否 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `close` | `无` | — |
| `change` | `index: number` | — |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `actions` | — | — |

## `ProgressBar`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/progress`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `percent` | `number` | `0` | 否 | — |
| `variant` | `'primary' \| 'success' \| 'warning' \| 'danger'` | `'primary'` | 否 | — |
| `showText` | `boolean` | `true` | 否 | — |
| `height` | `number` | `6` | 否 | — |
| `striped` | `boolean` | `false` | 否 | — |
| `animated` | `boolean` | `false` | 否 | — |
| `interactive` | `boolean` | `false` | 否 | — |
| `modelValue` | `number` | `0` | 否 | — |
| `min` | `number` | `0` | 否 | — |
| `max` | `number` | `100` | 否 | — |
| `step` | `number` | `1` | 否 | — |
| `disabled` | `boolean` | `false` | 否 | — |
| `showInput` | `boolean` | `false` | 否 | — |
| `showStops` | `boolean` | `false` | 否 | — |
| `label` | `string` | — | 否 | 无障碍名称：interactive 模式的 slider/数字输入需要可访问名，未传时回退通用文案 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: number` | — |
| `change` | `v: number` | — |

## `Skeleton`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/skeleton`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `loading` | `boolean` | `true` | 否 | 加载中显示骨架；false 时渲染默认插槽的真实内容 |
| `rows` | `number` | `3` | 否 | 文本行数（title 之外） |
| `animated` | `boolean` | `true` | 否 | 流光动画（prefers-reduced-motion 下自动禁用） |
| `avatar` | `AvatarSize` | `false` | 否 | 头像：false 无 \| true 默认 40px \| number 像素 \| 'sm'\|'md'\|'lg' 或任意 CSS 尺寸 |
| `title` | `boolean` | `true` | 否 | 首行加宽标题 |
| `width` | `string` | — | 否 | 自定义骨架块宽度 |
| `height` | `string` | — | 否 | 自定义骨架块高度 |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `default` | — | — |

## `Tree`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/tree`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `data` | `TreeNode[]` | — | 是 | — |
| `level` | `number` | `0` | 否 | — |
| `checkable` | `boolean` | `false` | 否 | — |
| `defaultExpandedKeys` | `(string \| number)[]` | `() => []` | 否 | — |
| `expandAll` | `boolean` | `false` | 否 | — |
| `selectable` | `boolean` | `false` | 否 | — |
| `selectedKey` | `string \| number \| null` | `null` | 否 | — |
| `lazy` | `boolean` | `false` | 否 | 懒加载：展开节点时若无 children 且 isLeaf 非 true，触发 load 事件 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'node-click'` | `node: TreeNode` | — |
| `'check-change'` | `checkedKeys: (string \| number)[], node: TreeNode` | — |
| `'update:selectedKey'` | `key: string \| number \| null` | — |
| `load` | `node: TreeNode` | 懒加载：节点展开时触发，父组件加载子节点后回填到 data |

## `Empty`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `icon` | `string` | `'file'` | 否 | 图标类型，默认 'file' |
| `title` | `string` | `''` | 否 | 标题 |
| `description` | `string` | `''` | 否 | 描述文本 |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `default` | — | — |

