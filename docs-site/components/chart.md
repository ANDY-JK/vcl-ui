# 图表（chart）

> 本页由 `npm run gen:docs` 从源码自动生成，请勿手改；改源码后重新生成（`check:docs` 闸口会卡漂移）。

## 组件一览

| 组件 | Props 数 | Events 数 | Slots 数 |
| --- | --- | --- | --- |
| `Chart` | 29 | 12 | 0 |
| `BaseChart` | 7 | 0 | 0 |
| `ChartTable` | 31 | 2 | 2 |
| `ChartLegend` | 1 | 2 | 0 |

---

## `Chart`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/chart`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | `ChartType` | `undefined` | 否 | 图表类型（line/bar/pie 等，见 ChartType）；传 option 时可省略 |
| `option` | `EChartsOption` | `undefined` | 否 | 原生 ECharts option（优先级最高，传入后覆盖快捷 props 组装） |
| `data` | `ChartData \| number[] \| number[][] \| { name: string; value: number }[]` | `() => ({})` | 否 | 快捷数据：单序列数值数组 / 多序列二维数组 / 饼图 { name, value } 列表 / ChartData 完整结构 |
| `categories` | `string[]` | `() => []` | 否 | X 轴类目（快捷模式的类目轴） |
| `series` | `ChartSeriesItem[]` | `() => []` | 否 | 快捷多序列（name + data，与 categories 对齐） |
| `height` | `number \| string` | `'100%'` | 否 | 容器高（数字 px 或 CSS 值，默认 '100%' 随父容器） |
| `width` | `number \| string` | `'100%'` | 否 | 容器宽（默认 '100%'） |
| `darkMode` | `boolean` | `false` | 否 | 暗色主题（ECharts 内置 dark 色板，独立于全局 useTheme） |
| `colors` | `string[]` | `() => []` | 否 | 自定义系列颜色（覆盖内置色板） |
| `loading` | `boolean` | `false` | 否 | 加载态（showLoading 蒙层） |
| `emptyText` | `string` | `() => t('common.empty')` | 否 | 空数据文案 |
| `title` | `string` | `''` | 否 | 图表标题 |
| `showLegend` | `boolean` | `true` | 否 | 显示图例（默认开） |
| `showTooltip` | `boolean` | `true` | 否 | 显示悬浮提示（默认开） |
| `smooth` | `boolean` | `true` | 否 | 折线平滑（默认开） |
| `showSymbol` | `boolean` | `true` | 否 | 折线数据点符号（默认开） |
| `showDataLabel` | `boolean` | `false` | 否 | 在数据点上显示数值标签 |
| `horizontal` | `boolean` | `false` | 否 | 柱状图切换为条形图（X/Y 轴互换） |
| `stacked` | `boolean` | `false` | 否 | 堆叠模式 |
| `stacked100` | `boolean` | `false` | 否 | 百分比堆叠模式 |
| `legendPosition` | `'top' \| 'bottom' \| 'left' \| 'right'` | `'bottom'` | 否 | 图例位置 |
| `xAxis` | `AxisConfig` | `undefined` | 否 | X 轴配置 |
| `yAxis` | `AxisConfig` | `undefined` | 否 | Y 轴配置 |
| `animation` | `boolean` | `true` | 否 | 加载动画开关 |
| `animationDuration` | `number` | `DEFAULT_ANIMATION_MS` | 否 | 动画时长（毫秒） |
| `toolbar` | `ToolbarButton[] \| false` | `() => ['saveAsImage', 'zoom']` | 否 | 工具栏按钮，传入 false 全关 |
| `palette` | `PalettePreset` | `undefined` | 否 | 内置色板预设 |
| `markLine` | `MarkLineConfig \| MarkLineConfig[]` | `undefined` | 否 | 标注线（均值线/目标线/警戒线），支持多条 |
| `markArea` | `MarkAreaConfig \| MarkAreaConfig[]` | `undefined` | 否 | 标注区域（高亮区间） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'chart-ready'` | `instance: ReturnType<typeof import('echarts').init>` | ECharts 实例就绪（拿到实例可做 setOption/dispose 等深度定制） |
| `click` | `params: ECElementEvent` | 元素点击（透传 ECharts 事件，params 为点击目标信息） |
| `dblclick` | `params: ECElementEvent` | 元素双击 |
| `mousedown` | `params: ECElementEvent` | 元素按下 |
| `mouseup` | `params: ECElementEvent` | 元素抬起 |
| `mouseover` | `params: ECElementEvent` | 元素悬停进入 |
| `mouseout` | `params: ECElementEvent` | 元素悬停离开 |
| `globalout` | `params: ECElementEvent` | 画布空白处点击（全局坐标系） |
| `contextmenu` | `params: ECElementEvent` | 右键 |
| `legendselectchanged` | `params: ECElementEvent` | 图例选中态变化（含取消选中） |
| `datazoom` | `params: ECElementEvent` | 数据缩放（dataZoom 组件拖动/缩放） |
| `finished` | `params: ECElementEvent` | 渲染完成一帧 |

## `BaseChart`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `option` | `EChartsOption \| null` | `null` | 是 | 原生 ECharts option（必传，null 时渲染空态） |
| `loading` | `boolean` | `false` | 否 | 加载态（showLoading 蒙层） |
| `emptyText` | `string` | `''` | 否 | 空数据文案 |
| `height` | `number \| string` | `'100%'` | 否 | 容器高（默认 '100%' 随父容器） |
| `width` | `number \| string` | `'100%'` | 否 | 容器宽（默认 '100%'） |
| `darkMode` | `boolean` | `false` | 否 | ECharts 内置 dark 主题 |
| `toolbar` | `Array<'saveAsImage' \| 'zoom' \| 'dataView'> \| false` | `() => ['saveAsImage', 'zoom']` | 否 | 工具栏按钮（saveAsImage 保存图片 / zoom 区域缩放 / dataView 数据视图），传 false 全关 |

## `ChartTable`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/chart-table`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | `ChartProps['type']` | — | 否 | 同 Chart：图表类型（chart:表格 上下组合的上半部分） |
| `option` | `ChartProps['option']` | — | 否 | 同 Chart：原生 ECharts option |
| `data` | `ChartProps['data']` | — | 否 | 同 Chart：快捷数据 |
| `categories` | `string[]` | — | 否 | 同 Chart：X 轴类目 |
| `series` | `ChartProps['series']` | — | 否 | 同 Chart：快捷多序列 |
| `darkMode` | `boolean` | `false` | 否 | 同 Chart：ECharts 内置 dark 主题 |
| `colors` | `string[]` | — | 否 | 同 Chart：自定义系列颜色 |
| `title` | `string` | — | 否 | 同 Chart：图表标题 |
| `showLegend` | `boolean` | `true` | 否 | 同 Chart：显示图例（初始值，之后由表头按钮控制） |
| `showTooltip` | `boolean` | `true` | 否 | 同 Chart：显示悬浮提示 |
| `smooth` | `boolean` | `true` | 否 | 同 Chart：折线平滑 |
| `showSymbol` | `boolean` | `true` | 否 | 同 Chart：数据点符号 |
| `showDataLabel` | `boolean` | `false` | 否 | 同 Chart：数据点数值标签 |
| `horizontal` | `boolean` | `false` | 否 | 同 Chart：条形图（X/Y 互换） |
| `stacked` | `boolean` | `false` | 否 | 同 Chart：堆叠 |
| `stacked100` | `boolean` | `false` | 否 | 同 Chart：百分比堆叠 |
| `legendPosition` | `ChartProps['legendPosition']` | `'bottom'` | 否 | 同 Chart：图例位置（默认 'bottom'） |
| `xAxis` | `ChartProps['xAxis']` | — | 否 | 同 Chart：X 轴配置 |
| `yAxis` | `ChartProps['yAxis']` | — | 否 | 同 Chart：Y 轴配置 |
| `animation` | `boolean` | `true` | 否 | 同 Chart：动画开关 |
| `animationDuration` | `number` | `DEFAULT_ANIMATION_MS` | 否 | 同 Chart：动画时长（毫秒） |
| `toolbar` | `ChartProps['toolbar']` | `() => ['saveAsImage', 'zoom']` | 否 | 同 Chart：工具栏按钮 |
| `palette` | `ChartProps['palette']` | — | 否 | 同 Chart：内置色板预设 |
| `markLine` | `ChartProps['markLine']` | — | 否 | 同 Chart：标注线（均值线/目标线/警戒线） |
| `markArea` | `ChartProps['markArea']` | — | 否 | 同 Chart：标注区域（高亮区间） |
| `columns` | `Column[]` | `() => []` | 否 | 下半部分表格列定义（DataTable Column 结构） |
| `tableData` | `TableRow[]` | `() => []` | 否 | 下半部分表格数据 |
| `showTable` | `boolean` | `true` | 否 | 显示表格区（初始值，之后由按钮控制；默认开） |
| `tableTitle` | `string` | `''` | 否 | 表格区标题 |
| `rowKey` | `string` | `'rank'` | 否 | 表格行键字段（默认 'rank'） |
| `chartRatio` | `number` | `0.45` | 否 | 图表区占容器高度比例 0-1（默认 0.45，其余给表格） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'chart-click'` | `params: ECElementEvent` | 图表元素点击（透传 ECharts 事件） |
| `'chart-ready'` | `instance: ECharts` | ECharts 实例就绪 |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `footer` | — | 图表底部扩展区域（仅传入时渲染） | — |
| `header` | — | 图表头部区域；不传则回退 tableTitle 属性标题 | &#123;&#123; tableTitle &#125;&#125; |

## `ChartLegend`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `items` | `{ key?: string; name: string; color: string; visible: boolean }[]` | — | 是 | 图例项：名称 + 色值 + 当前可见态。 `key` 是项的**唯一身份**（与展示名分开，#489）：两个系列可以同名，而隐藏集合、 DOM key 都必须按身份走 —— 否则点其中一个会两个一起消失。 不传 `key`（或传空串）时退化为按**展示名**，此时同名项在 `toggle` 事件里 无法区分（都发同一个 name）—— 需要精确控制请显式传 `key`（#492）。 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `toggle` | `identity: string` | 点击单个图例：切换该项（传了 key 发 key，否则发展示名） |
| `'toggle-all'` | `visible: boolean` | 全部显示 / 全部隐藏 |

