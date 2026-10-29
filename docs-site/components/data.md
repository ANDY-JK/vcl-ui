# 数据展示（data）

> 本页由 `npm run gen:docs` 从源码自动生成，请勿手改；改源码后重新生成（`check:docs` 闸口会卡漂移）。

## 组件一览

| 组件 | Props 数 | Events 数 | Slots 数 |
| --- | --- | --- | --- |
| `DataTable` | 59 | 17 | 4 |
| `ToggleList` | 13 | 3 | 0 |
| `Card` | 16 | 1 | 3 |
| `Avatar` | 4 | 0 | 0 |
| `Collapse` | 5 | 2 | 1 |
| `Divider` | 3 | 0 | 0 |
| `Image` | 12 | 3 | 0 |
| `ImagePreview` | 3 | 2 | 1 |
| `ProgressBar` | 15 | 2 | 0 |
| `Skeleton` | 7 | 0 | 1 |
| `Tree` | 9 | 4 | 0 |
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
| `columns` | `Column[]` | — | 是 | 列定义数组：key/label/type/width/sortable/filterable/cell 等（见 Column 类型） |
| `data` | `T[]` | — | 是 | 行数据数组（泛型 T，行对象需含 rowKey 指定的键字段） |
| `rowKey` | `string` | `'seq'` | 否 | 行唯一键字段名（默认 'seq'）：选中/编辑/备注/持久化都以此键定位行 |
| `striped` | `boolean` | `true` | 否 | 斑马纹（默认开） |
| `bordered` | `boolean` | `true` | 否 | 单元格边框（默认开） |
| `hoverable` | `boolean` | `true` | 否 | 行悬停高亮（默认开） |
| `isLoading` | `boolean` | `false` | 否 | 加载态：表格蒙层，期间禁用交互 |
| `emptyText` | `string` | `''` | 否 | 空数据提示文案；空串（默认）用内置 i18n 文案 |
| `blankText` | `string` | `'-'` | 否 | 单元格空白占位：null/undefined/空串/纯空白串 → 该文本（默认 '-'）；传空串关闭。仅展示层，不影响导出 |
| `sortKey` | `string` | — | 否 | 初始/受控排序字段：传入后外部驱动排序状态（变化经 @sort 抛出）；不传则组件内部自由排序 |
| `sortOrder` | `'asc' \| 'desc'` | — | 否 | 受控排序方向，'asc' \| 'desc'（默认 'asc'），与 sortKey 成对使用 |
| `pinyinSearch` | `boolean` | `true` | 否 | 全局搜索是否启用拼音匹配（默认开） |
| `truncateThreshold` | `number` | `0` | 否 | 单元格截断判定的字符数下限：0（默认）全部单元格按 truncateMode 处理；>0 时仅文本超过该长度的单元格截断 |
| `selectable` | `boolean` | `false` | 否 | 行首选择列（复选框）开关 |
| `selectedKeys` | `string[]` | `() => []` | 否 | 受控选中行键集合（v-model:selectedKeys） |
| `exportable` | `boolean` | `false` | 否 | CSV 导出按钮；有 @export 监听时抛事件由宿主自理，无监听时内置导出 |
| `exportFileName` | `string` | `'export'` | 否 | 导出文件名（不含扩展名，默认 'export'） |
| `excelExportable` | `boolean` | `false` | 否 | Excel(.xlsx) 导出按钮（导出范围同 exportScope） |
| `exportScope` | `'all' \| 'page'` | — | 否 | 导出范围：'all' 筛选后全量（默认），'page' 仅当前页 |
| `pageSize` | `number` | `0` | 否 | 每页行数；0（默认）不分页 |
| `currentPage` | `number` | `1` | 否 | 受控当前页（v-model:currentPage）。越界（>总页数 / <1）时自动夹到 [1,totalPages] 并 emit 纠正值——宿主把页码存 URL 后恢复、或筛选后总数变小都靠它兜住 |
| `total` | `number` | — | 否 | 总行数：传入即按服务端分页处理（分页器用它算页数，数据由父组件按页提供；不传=客户端分页） |
| `cardBreakpoint` | `number` | `BP_MD` | 否 | 卡片视图断点（px）：容器实测宽度低于该值时自动切卡片视图（视图模式 auto 下生效） |
| `maxHeight` | `string` | `''` | 否 | 表格区最大高度（CSS 高度值，如 '400px'）；空串不限高 |
| `autoHeight` | `boolean` | `true` | 否 | 自适应高度：填充父容器剩余空间（需父容器有明确高度） |
| `virtualScroll` | `boolean` | `true` | 否 | 虚拟滚动（默认开）：行数超过可视范围时只渲染窗口内行，容器滚动/页面滚动都会自动接管 |
| `pageVirtualMin` | `number` | `0` | 否 | 页面滚动虚拟化的**额外**行数下限（默认 0 = 不设人工下限）。 实际判据是实测的：总行数 > 可视行数 + 上下 overscan（那些行无论如何都要渲染）， 所以面板高矮、dense、缩放都自适应，不靠猜常量。设 >0 只用于强制提前/推迟启用。 |
| `autoFit` | `boolean` | `true` | 否 | 列宽自适应（默认开）：忽略列的 width 声明，列宽由内部按容器宽度动态分配（防抖 + 冷却） |
| `truncateMode` | `'ellipsis' \| 'wrap' \| 'none'` | `'ellipsis'` | 否 | 单元格文本截断：'ellipsis' 省略号（默认）\| 'wrap' 换行 \| 'none' 不截断 |
| `dense` | `boolean` | `false` | 否 | 紧凑密度（更小的行高与内边距） |
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
| `rowClass` | `(row: T, index: number) => string` | — | 否 | 行类名回调：(row, index) => class 串，每行渲染时调用 |
| `rowStyle` | `(row: T, index: number) => Record<string, string>` | — | 否 | 行内联样式回调：(row, index) => 样式对象 |
| `cellClass` | `(colKey: string, row: T, index: number) => string` | — | 否 | 单元格类名回调：(colKey, row, index) => class 串 |
| `cellStyle` | `(colKey: string, row: T, index: number) => Record<string, string>` | — | 否 | 单元格内联样式回调：(colKey, row, index) => 样式对象 |
| `rowLine` | `(row: T, index: number) => RowLineColor \| undefined` | — | 否 | 行级左边线回调：(row, index) => 语义色名，该行最左缘画对应颜色竖线；返回 undefined 不显示。 与 rowLineKey 并存时本回调优先（设置了即接管整行判定，返回 undefined 也不会回落到字段映射） |
| `rowLineKey` | `string` | `''` | 否 | 行线字段名：取行数据该字段值查 lineColors 映射，命中语义色名才画线（rowLine 未设置时生效） |
| `lineColors` | `Record<string, RowLineColor>` | `() => ({})` | 否 | 行线字段值 → 语义色名映射（配合 rowLineKey） |
| `shotMode` | `'preview' \| 'download' \| 'copy'` | `'preview' as 'preview' \| 'download' \| 'copy'` | 否 | 截图行为模式：'preview' 弹窗预览 \| 'download' 直接下载 \| 'copy' 直接复制到剪贴板 |
| `screenshotMaxRows` | `number` | `400` | 否 | 截图最大行数（超过提醒用户先筛选，避免生成超大 canvas 卡死） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `sort` | `key: string, order: 'asc' \| 'desc'` | 排序变化：表头点击排序后抛出（受控排序经 sortKey/sortOrder 驱动时同样触发） |
| `filter` | `filters: Record<string, string[]>` | 筛选变化：列头筛选提交后抛出当前全量筛选状态（filterMode='server' 时接此事件由后端处理） |
| `'update:filters'` | `filters: Record<string, string[]>` | v-model:filters——外部程序化控制筛选状态（服务端筛选场景） |
| `'row-click'` | `row: Record<string, any>, index: number` | 行点击 |
| `'update:selectedKeys'` | `keys: string[]` | v-model:selectedKeys——选中行键集合 |
| `'update:currentPage'` | `page: number` | v-model:currentPage——当前页码 |
| `'page-change'` | `page: number, pageSize: number` | 翻页：[页码, 每页行数]（服务端分页接此事件换数据） |
| `'selection-change'` | `keys: string[], rows: Record<string, any>[]` | 选中集合变化：[行键数组, 行对象数组] |
| `'cell-change'` | `rowKey: string, colKey: string, newValue: string` | 单元格编辑提交：[行键, 列键, 新值]——新值已经过 Column.type 归一化 |
| `'cell-note'` | `rowKey: string, colKey: string, note: string` | 备注保存：[行键, 列键, 备注文本] |
| `'batch-change'` | `colKey: string, newValue: string, rowKeys: string[]` | 批量修改/填充柄提交：一次动作为一条记录，[列键, 新值, 受影响行键集合] |
| `'row-action'` | `actionKey: string, row: Record<string, any>, index: number` | 行操作按钮点击：[actionKey, 行对象, 行号] |
| `'row-context-action'` | `actionKey: string, row: Record<string, any>, index: number` | 行右键菜单项点击：[actionKey, 行对象, 行号] |
| `search` | `term: string` | 全局搜索词变化（searchMode='server' 时接此事件由后端过滤） |
| `'fullscreen-change'` | `isFullscreen: boolean` | 进入/退出全屏 |
| `export` | `无` | v2（Q5）：onExport 回调 prop 收敛为事件——有监听=服务端导出（宿主自处理），无监听=内置 CSV/Excel 导出 |
| `'toggle-sidebar'` | `无` | v2（Q5）：onToggleSidebar 回调 prop 收敛为事件——有监听=通知宿主收/还侧边栏，无监听=降级 inject('toggleCollapse') |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `cell` | `column, row, value` | 单元格内容自定义渲染（作用域：column、row、value） | &#123;&#123; cellShow(row, col) &#125;&#125; &#123;&#123; cellShow(row |
| `empty` | `filtered` | 空状态自定义内容（作用域：filtered 当前是否处于筛选态）；不传则回退内置插图 + Result 组合 | — |
| `header-cell` | `column` | 表头单元格自定义渲染（作用域：column） | &#123;&#123; colTitle(col) &#125;&#125; |
| `toolbar-actions` | — | 工具栏右侧自定义操作区（使用方扩展：刷新/导入等） | — |

## `ToggleList`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/toggle-list`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `items` | `Record<string, any>[]` | — | 是 | 列表数据（行对象按各 *Field prop 取列） |
| `idKey` | `string` | `'id'` | 否 | 行唯一键字段名（默认 'id'） |
| `titleField` | `string` | `'display_name'` | 否 | 标题字段名（默认 'display_name'） |
| `descriptionField` | `string` | `'description'` | 否 | 描述字段名（默认 'description'） |
| `iconField` | `string` | `'icon'` | 否 | 图标字段名（默认 'icon'） |
| `toggleField` | `string` | `'is_enabled'` | 否 | 开关绑定字段名（默认 'is_enabled'） |
| `extraColumns` | `ExtraColumn[]` | `() => []` | 否 | 追加列（状态标签等，ExtraColumn：取值字段/格式化/标签色） |
| `disabled` | `boolean` | `false` | 否 | 整列禁用（开关与按钮不可操作） |
| `isLoading` | `boolean` | `false` | 否 | 加载态（显示骨架行） |
| `emptyText` | `string` | `''` | 否 | 空数据文案（空串用内置 i18n） |
| `variant` | `'switch' \| 'button'` | `'switch'` | 否 | 'switch' = 开关列表, 'button' = 操作按钮（发快递等场景） |
| `buttonLabel` | `string` | `''` | 否 | variant='button' 时按钮文字（空串用内置 i18n） |
| `phoneField` | `string` | `'phone'` | 否 | variant='button' 时手机号字段 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `toggle` | `item: Record<string, any>, newValue: boolean` | 开关切换：[行对象, 切换后的新值]（内部同步回写行数据，extraColumns 状态标签立即更新） |
| `'item-click'` | `item: Record<string, any>` | 行点击 |
| `'button-click'` | `payload: { name: string; phone: string; address: string; item: Record<string, any> }` | variant='button' 时点击按钮，payload: { name, phone, address, item } |

## `Card`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/card`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | `'grid' \| 'stat'` | `'grid'` | 否 | 模式：grid 内容卡片（默认）\| stat 统计卡片 |
| `title` | `string` | — | 否 | 卡片标题（grid 模式） |
| `titleAs` | `'h1' \| 'h2' \| 'h3' \| 'h4' \| 'h5' \| 'h6' \| 'div'` | `'h3'` | 否 | title 的标题标签级。默认 h3：卡片通常是「页标题(h1) → 区块(h2) → 卡片」的第三级。 硬编码某一级会在宿主层级不同时跳级（axe heading-order），故把选择权交给调用方； 传 'div' 表示纯展示标题（卡片不承担文档结构职责时用）。 |
| `highlight` | `boolean` | — | 否 | 高亮描边（强调当前选中/活动卡片） |
| `summary` | `boolean` | — | 否 | 摘要形态：压缩内边距的紧凑布局 |
| `overflowVisible` | `boolean` | — | 否 | 允许内容溢出卡片边界（用于包含下拉/弹出组件的场景） |
| `accent` | `'primary' \| 'success' \| 'warning' \| 'danger' \| 'info'` | — | 否 | 卡片头部标题左侧的状态竖条颜色（accent bar）。不传 = 无竖条。 常用于列表/看板里按状态给卡片分类着色（2026-10-04 用户需求）。 |
| `corner` | `string` | — | 否 | 角标文案（如「NEW」「热」「异常」）。传入即渲染；dot 形态下文字视觉隐藏、读屏仍读。 折角形态属装饰性几何三角；语义三角（排序/涨跌/警告）请用 IconSvg。 依赖卡片 overflow:hidden 裁切——与 overflowVisible 同用时丝带两端会露出卡外。 |
| `cornerColor` | `'primary' \| 'success' \| 'warning' \| 'danger' \| 'info'` | `'primary'` | 否 | 角标底色（语义色，默认 primary） |
| `cornerVariant` | `'ribbon' \| 'pill' \| 'dot'` | `'ribbon'` | 否 | 角标形态：ribbon 45° 折角丝带（实心底，装饰三角）\| pill 透明浅底胶囊（-bg 底 + -text 字， 悬浮不遮挡内容）\| dot 状态圆点（-solid 饱和点 + pulse 扩散环，文字读屏可读）。默认 ribbon。 |
| `cornerPosition` | `'top-right' \| 'top-left' \| 'bottom-right' \| 'bottom-left'` | `'top-right'` | 否 | 角标位置（默认 top-right）。悬浮定位不占布局空间。 |
| `value` | `string \| number` | — | 否 | 统计数值 |
| `label` | `string` | — | 否 | 数值下方的标签文案 |
| `icon` | `string` | `'circle-alert'` | 否 | 统计图标（IconSvg 图标名） |
| `color` | `string` | — | 否 | 数值/图标语义色（CSS 颜色值或令牌名） |
| `trend` | `number \| string` | — | 否 | 趋势：数字或 '12%' 类字符串；正=上涨箭头、负=下跌箭头、0/非法值=持平 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `click` | `无` | 卡片点击 |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `default` | — | 卡片主体内容 | — |
| `footer` | — | 卡片底部区域（仅传入时渲染） | — |
| `header` | — | 卡片头部区域（自定义标题，与 title 属性并存） | — |

## `Avatar`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/avatar`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `src` | `string` | — | 否 | 图片地址；未传时按 name 首字生成文字头像 |
| `name` | `string` | — | 否 | 显示名（取首字渲染；文字头像的数据来源） |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | 否 | 尺寸档位（默认 'md'） |
| `shape` | `'circle' \| 'rounded'` | `'circle'` | 否 | 形状：圆形（默认）\| 圆角方 |

## `Collapse`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/collapse`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | `string` | — | 是 | 面板标题 |
| `open` | `boolean` | `false` | 否 | 受控展开态（v-model:open）；不传时组件自主管理 |
| `disabled` | `boolean` | `false` | 否 | 禁用（标题栏不可点击展开） |
| `id` | `string` | `''` | 否 | 面板唯一标识，用于 aria-controls / aria-labelledby 关联 |
| `accordion` | `boolean` | `false` | 否 | 手风琴模式标记：配合外部 CollapseGroup 使用，展开时自动关闭同组其他面板 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:open'` | `v: boolean` | v-model:open——展开/收起 |
| `'accordion-expand'` | `无` | 手风琴模式：展开时触发，外部 CollapseGroup 监听后关闭同组其他面板 |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `default` | — | 面板主体内容（展开时展示） | — |

## `Divider`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/divider`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | — | 否 | 分隔线文案（居中显示在线上） |
| `direction` | `'horizontal' \| 'vertical'` | `'horizontal'` | 否 | 方向：水平线（默认）\| 垂直线 |
| `dashed` | `boolean` | `false` | 否 | 虚线样式 |

## `Image`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/image`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `src` | `string` | — | 否 | 图片地址 |
| `alt` | `string` | `''` | 否 | 原生 alt |
| `width` | `number` | — | 否 | 图片宽度 |
| `height` | `number` | — | 否 | 图片高度 |
| `size` | `number` | `80` | 否 | 默认尺寸（宽高未设时，默认 80） |
| `fit` | `'cover' \| 'contain' \| 'fill' \| 'none' \| 'scale-down'` | `'cover'` | 否 | object-fit（默认 'cover'） |
| `radius` | `number` | — | 否 | 圆角 |
| `round` | `boolean` | — | 否 | 圆形 |
| `lazy` | `boolean` | `true` | 否 | 懒加载（默认开） |
| `preview` | `boolean` | `true` | 否 | 点击放大预览（默认开） |
| `loadingText` | `string` | `''` | 否 | 加载中文本（空串用内置 i18n） |
| `errorText` | `string` | `''` | 否 | 加载失败文本（空串用内置 i18n） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `load` | `src: string` | 图片加载成功 |
| `error` | `src: string` | 图片加载失败 |
| `click` | `src: string` | 图片点击 |

## `ImagePreview`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `src` | `ImageSrc` | — | 否 | 图片源：字符串/对象 = 单图，数组 = 多图 |
| `initialIndex` | `number` | `0` | 否 | 初始打开定位到第几张（越界自动收敛） |
| `title` | `string` | — | 否 | 预览标题（优先显示；未传时多图显示当前张 label 或「第 n 张」） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `close` | `无` | 关闭预览 |
| `change` | `index: number` | 切换图片：[当前索引] |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `actions` | — | 预览顶部工具栏右端追加的操作按钮 | — |

## `ProgressBar`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/progress`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `percent` | `number` | `0` | 否 | 进度百分比 0-100（非交互模式） |
| `variant` | `'primary' \| 'success' \| 'warning' \| 'danger'` | `'primary'` | 否 | 语义色 |
| `showText` | `boolean` | `true` | 否 | 显示百分比文字 |
| `height` | `number` | `6` | 否 | 轨道高度（px，默认 6） |
| `striped` | `boolean` | `false` | 否 | 条纹轨道 |
| `animated` | `boolean` | `false` | 否 | 流光动画 |
| `interactive` | `boolean` | `false` | 否 | 交互模式：进度条变滑块（拖拽/键盘/数字输入） |
| `modelValue` | `number` | `0` | 否 | 交互模式的受控值（v-model:modelValue） |
| `min` | `number` | `0` | 否 | 交互模式最小值（默认 0） |
| `max` | `number` | `100` | 否 | 交互模式最大值（默认 100） |
| `step` | `number` | `1` | 否 | 交互模式步进（默认 1） |
| `disabled` | `boolean` | `false` | 否 | 交互模式禁用 |
| `showInput` | `boolean` | `false` | 否 | 交互模式显示数字输入框 |
| `showStops` | `boolean` | `false` | 否 | 显示刻度断点 |
| `label` | `string` | — | 否 | 无障碍名称：interactive 模式的 slider/数字输入需要可访问名，未传时回退通用文案 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: number` | 交互模式拖拽/输入中的实时值（v-model:modelValue） |
| `change` | `v: number` | 交互模式值提交（松手/失焦/回车） |

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

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `default` | — | 非骨架态的自定义加载内容（即待展示内容本身） | — |

## `Tree`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/tree`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `data` | `TreeNode[]` | — | 是 | 树数据：TreeNode[]，children 嵌套构成层级 |
| `level` | `number` | `0` | 否 | ⛔ 内部递归层级（子树实例由组件自建），消费方勿传 |
| `checkable` | `boolean` | `false` | 否 | 节点勾选框：父子级联 + 半选态 |
| `defaultExpandedKeys` | `(string \| number)[]` | `() => []` | 否 | 初始展开的节点键集合（此后展开状态由组件内部管理） |
| `expandAll` | `boolean` | `false` | 否 | 初始全部展开 |
| `selectable` | `boolean` | `false` | 否 | 节点单选（配合 v-model:selectedKey） |
| `selectedKey` | `string \| number \| null` | `null` | 否 | 受控选中节点键（v-model:selectedKey） |
| `lazy` | `boolean` | `false` | 否 | 懒加载：展开节点时若无 children 且 isLeaf 非 true 的节点不会触发 load |
| `sharedState` | `TreeState \| null` | — | 否 | ⛔ 内部 plumbing：递归子树经此 prop 接收根实例的共享 state。 不能只靠 provide/inject——嵌套 Tree 渲染在 Transition 的插槽里， 该边界上 inject 实测取不到（每层自建 state：深层没有勾选框、勾选级联 不同步、深层节点的事件发不出去、expandAll 只生效一层）。消费方勿传。 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'node-click'` | `node: TreeNode` | 节点点击（selectable 模式下同时更新选中） |
| `'check-change'` | `checkedKeys: (string \| number)[], node: TreeNode` | 勾选变化：[勾选后的全量键集合, 本次变更的节点] |
| `'update:selectedKey'` | `key: string \| number \| null` | v-model:selectedKey——受控选中节点键 |
| `load` | `node: TreeNode` | 懒加载：节点展开时触发，父组件加载子节点后回填到 data |

## `Empty`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `icon` | `string` | `'file'` | 否 | 图标类型，默认 'file' |
| `title` | `string` | `''` | 否 | 标题 |
| `description` | `string` | `''` | 否 | 描述文本 |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `default` | — | 空状态底部操作区（如「刷新/重试」按钮） | — |

