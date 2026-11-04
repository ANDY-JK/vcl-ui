# 受保护文件索引（变更控制注释汇总）

> **本文件由 `node scripts/gen-governance-index.mjs` 生成，请勿手改。**
> 
> 这些文件的头部带 `⛔ 保护 — <组件>，禁止：… / 需我确认：…` 注释，表示修改前需要人工确认。
> 本索引只是把它们**列出来**；判定规则本身仍以各文件头部注释为准。

- 受保护文件：**83** 个（`.vue` 40 + `.ts` 43）
- 其中写明「需我确认」的：**45** 个

> **计数口径**：判定条件是「文件**头 24 行内**出现 `⛔ 保护` 标记」。全内容扫描会多出 2 个（正文里提到该约定
> 的文件），那类不算受保护文件——口径写在这里，免得两个数字打架。

## 全量清单

| 文件 | 禁止 | 需我确认 |
|---|---|---|
| `src/components/_internal/ModalShell.vue` | clamp() → px，动画时序修改，z-index 层级 为什么把它从 layout | — |
| `src/components/_internal/useClickOutside.ts` | 事件监听 | targetRefs 多元素支持、exclude 参数 |
| `src/components/_internal/useFocusTrap.ts` | 删除 Tab 循环 | autofocus 优先级策略、多弹窗竞态时的恢复时机 |
| `src/components/basic/Button.vue` | clamp() 尺寸 → px，variant | 新增 variant、loading 状态行为 |
| `src/components/basic/IconSvg.vue` | — | — |
| `src/components/basic/Tag.vue` | clamp() → px，variant 枚举修改 需我确认：新增 variant 颜色、closable 行为 合并说明：原 Badge.vue 已合并到 T | 新增 variant 颜色、closable 行为 合并说明：原 Badge.vue 已合并到 Tag，Badge 的 count |
| `src/components/chart/BaseChart.vue` | clamp() → px，canvas resize 逻辑，ECharts dispose 需我确认：loading | loading |
| `src/components/chart/Chart.vue` | clamp() → px，ECharts 初始化逻辑，resize 监听删除 需我确认：ChartType 类型扩展、color palette 默认值 | ChartType 类型扩展、color palette 默认值 |
| `src/components/chart/options/advanced/boxplot.ts` | — | — |
| `src/components/chart/options/advanced/candlestick.ts` | — | — |
| `src/components/chart/options/advanced/funnel.ts` | — | — |
| `src/components/chart/options/advanced/gauge.ts` | — | — |
| `src/components/chart/options/advanced/graph.ts` | — | — |
| `src/components/chart/options/advanced/heatmap.ts` | — | — |
| `src/components/chart/options/advanced/radar.ts` | — | — |
| `src/components/chart/options/advanced/sankey.ts` | — | — |
| `src/components/chart/options/advanced/sunburst.ts` | — | — |
| `src/components/chart/options/advanced/timeline.ts` | — | — |
| `src/components/chart/options/advanced/tree.ts` | — | — |
| `src/components/chart/options/advanced/treemap.ts` | — | — |
| `src/components/chart/options/advanced/wordCloud.ts` | — | — |
| `src/components/chart/options/common.ts` | DEFAULT_COLORS 色板删除，textColor | 色板值修改、grid 间距调整 |
| `src/components/chart/options/core/area.ts` | — | — |
| `src/components/chart/options/core/bar.ts` | — | — |
| `src/components/chart/options/core/line.ts` | — | — |
| `src/components/chart/options/core/mixed.ts` | — | — |
| `src/components/chart/options/core/pictorialBar.ts` | — | — |
| `src/components/chart/options/core/pie.ts` | — | — |
| `src/components/chart/options/core/scatter.ts` | — | — |
| `src/components/chart/options/core/waterfall.ts` | — | — |
| `src/components/chart/options/index.ts` | 修改 builder 映射表键名、buildChartOption 签名 需我确认：新增 chartType 支持 | 新增 chartType 支持 |
| `src/components/chart/utils/echarts-setup.ts` | 组件 | 新增图表类型注册 |
| `src/components/chart/utils/types.ts` | ChartType | 新增图表类型枚举值 |
| `src/components/data/Avatar.vue` | clamp() 尺寸 → px，fallback 文字逻辑 需我确认：shape 形状、size 尺寸挡位 | shape 形状、size 尺寸挡位 |
| `src/components/data/Card.vue` | clamp() → px，grid | variant 类型扩展、actions slot 结构 |
| `src/components/data/Collapse.vue` | 动画时序，展开 | accordion 互斥模式、defaultOpen 行为 |
| `src/components/data/composables/cell-types.ts` | — | — |
| `src/components/data/composables/types.ts` | — | 字段增删、枚举值扩展 @approved 2026-09-17 `type` 字段经确认新增（Excel 输入习惯对齐，见 workspace 方案） ==== |
| `src/components/data/composables/useTableColumns.ts` | — | autoFitSampleSize |
| `src/components/data/composables/useTableCore.ts` | — | sortHistory 行为、truncateThreshold 默认值、pageSize 逻辑 （#419 例外：排序比较器抽到 table-sort.ts  |
| `src/components/data/composables/useTableEdit.ts` | — | 编辑状态管理、批处理 cellChange |
| `src/components/data/composables/useTableExtras.ts` | — | 导出 CSV 格式、右键菜单结构、namespace 存储隔离逻辑 ==================== 周边功能：搜索 |
| `src/components/data/composables/useTableFilter.ts` | — | OptionSort 排序策略、筛选下拉定位算法 ==================== 筛选全链路（状态 |
| `src/components/data/composables/useTablePersistence.ts` | — | — |
| `src/components/data/DataTable.vue` | clamp() → px，table-layout:fixed 删除，列宽计算链路，结构层级 允许：autoFit 开启时外部 col.width 已被禁止，列 | props 增删、默认值修改、模板结构变更、CSS 变量替换 |
| `src/components/data/DataTableColumnSettings.vue` | — | — |
| `src/components/data/Divider.vue` | clamp() margin → px，dashed | direction 方向、text 插槽位置 |
| `src/components/data/Image.vue` | lazy loading 逻辑删除，尺寸比例，fallback 占位 需我确认：src fallback、aspect-ratio 默认值 | src fallback、aspect-ratio 默认值 |
| `src/components/data/Skeleton.vue` | 流光动画时序、行高 | loading 独立控制粒度、圆角形态扩展 |
| `src/components/data/ToggleList.vue` | clamp() → px，展开 | ExtraColumn 接口扩展、toggle 行为 |
| `src/components/data/Tree.vue` | clamp() → px，递归渲染结构 需我确认：TreeNode 接口扩展、勾选联动逻辑 | TreeNode 接口扩展、勾选联动逻辑 |
| `src/components/feedback/Drawer.vue` | clamp() → px，动画时序，z-index，宽度断点 需我确认：placement 定位逻辑、header | placement 定位逻辑、header |
| `src/components/feedback/ErrorBoundary.vue` | — | — |
| `src/components/feedback/Loading.vue` | skeleton 动画时序，spinner 尺寸比例 需我确认：variant 类型扩展、颜色 | variant 类型扩展、颜色 |
| `src/components/feedback/OfflineIndicator.vue` | online | 离线提示样式、重连回调 |
| `src/components/feedback/Popover.vue` | clamp() → px，浮动定位算法，z-index 需我确认：trigger 触发方式、placement 位置选项 | trigger 触发方式、placement 位置选项 |
| `src/components/feedback/ReadOnlyOverlay.vue` | 遮罩透明度；z-index 层级 = var(--vcl-z-readonly, 2500)（压 modal | visible 触发逻辑、slot 内容区 |
| `src/components/feedback/Result.vue` | clamp() → px，slot 层级修改 需我确认：status 图标映射、extra slot 结构 | status 图标映射、extra slot 结构 |
| `src/components/feedback/Toast.vue` | clamp() → px，动画时序；z-index 层级 = var(--vcl-z-top, 9999)（最高优先级通知，ImagePreview 内嵌时临时 | — |
| `src/components/form/CameraCapture.vue` | — | 布局结构、采集参数（4:3 高清）、拍照后交付方式（capture 事件） |
| `src/components/form/date-panel/DatePanel.vue` | clamp() → px，本地时区构造 new Date(y, m, d) 改动 ⭐ iso 始终按 format 格式化；范围模式下以 selected 数组 | — |
| `src/components/form/date-panel/TimeColumns.vue` | clamp() → px，分钟 step 对齐逻辑删除 ⭐ 时 | — |
| `src/components/form/Input.vue` | clamp() → px，浮动标签动画时序，type 枚举修改 需我确认：校验规则接口、新增 type ⭐ 统一上浮骑缝（floating）样式 — 标签上浮骑 | 校验规则接口、新增 type ⭐ 统一上浮骑缝（floating）样式 — 标签上浮骑缝，视觉统一，节省空间 合并：Input + InputNumber +  |
| `src/components/form/Upload.vue` | clamp() → px，拖拽区尺寸比例，进度条动画 需我确认：accept 文件类型、multiple 多文件逻辑、预览图尺寸 | accept 文件类型、multiple 多文件逻辑、预览图尺寸 |
| `src/components/form/utils/date-utils.ts` | clamp() → px，本地时区构造 new Date(y, m, d) 改动 | — |
| `src/components/form/utils/slider-utils.ts` | 步进对齐 | — |
| `src/components/index.ts` | — | 新增组件导出、export 路径调整 设计令牌必须先于所有组件样式进入产物 CSS（vcl-ui |
| `src/components/layout/AppLayout.vue` | clamp() → px，侧边栏结构 | navItems 结构、logo |
| `src/components/layout/ModalBox.vue` | clamp() → px，动画时序修改，z-index 层级 需我确认：detail 模式行为、Select 内嵌渲染 ⭐ 基础外壳（遮罩 | detail 模式行为、Select 内嵌渲染 ⭐ 基础外壳（遮罩 |
| `src/components/layout/utils/navData.ts` | NavNode 接口结构调整，navTree 数据删除 需我确认：新增导航条目、icon 字段扩展 | 新增导航条目、icon 字段扩展 |
| `src/components/login/forgot-password.vue` | clamp() → px，表单结构 | — |
| `src/components/login/login.vue` | clamp() → px，表单结构 | — |
| `src/components/login/portal_login.vue` | clamp() → px，表单结构，maxWidth 逻辑 | — |
| `src/components/login/register.vue` | clamp() → px，表单结构 | — |
| `src/components/nav/Breadcrumb.vue` | clamp() → px，RouterLink 路径逻辑 需我确认：separator 分隔符、item 接口字段 | separator 分隔符、item 接口字段 |
| `src/components/nav/Menu.vue` | 递归渲染结构，hover | item 字段扩展、submenu 定位方式 |
| `src/components/nav/Pagination.vue` | clamp() → px，页码计算逻辑，ellipsis 行为 需我确认：pageSize 选项、maxPages 显示数 | pageSize 选项、maxPages 显示数 |
| `src/components/nav/Steps.vue` | clamp() → px，Step 接口，连线样式 需我确认：direction 方向、current 状态管理 | direction 方向、current 状态管理 |
| `src/components/nav/Tabs.vue` | clamp() → px，active 指示器动画，TabItem 接口 需我确认：underline | underline |
| `src/components/nav/utils/pagination-utils.ts` | totalPages 计算逻辑改动（pageSize<=0 必须按 1 处理，否则 Math.ceil(total | — |
| `src/components/shared/types.ts` | Option | 新增全局类型、字段扩展 通用选项结构 |
| `src/components/storage/indexedDB.ts` | storageGet | 新增存储后端、TTL 策略 本地存储抽象层 —— 按场景自动选后端 Storage（localStorage） → 轻量 KV：token、用户标记、开关、小配 |
| `src/components/storage/local-storage.ts` | — | — |
