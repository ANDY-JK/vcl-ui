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

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | `ChartType` | `undefined` | 否 | — |
| `option` | `EChartsOption` | `undefined` | 否 | — |
| `data` | `ChartData \| number[] \| number[][] \| { name: string; value: number }[]` | `() => ({})` | 否 | — |
| `categories` | `string[]` | `() => []` | 否 | — |
| `series` | `ChartSeriesItem[]` | `() => []` | 否 | — |
| `height` | `number \| string` | `'100%'` | 否 | — |
| `width` | `number \| string` | `'100%'` | 否 | — |
| `darkMode` | `boolean` | `false` | 否 | — |
| `colors` | `string[]` | `() => []` | 否 | — |
| `loading` | `boolean` | `false` | 否 | — |
| `emptyText` | `string` | `() => t('common.empty')` | 否 | — |
| `title` | `string` | `''` | 否 | — |
| `showLegend` | `boolean` | `true` | 否 | — |
| `showTooltip` | `boolean` | `true` | 否 | — |
| `smooth` | `boolean` | `true` | 否 | — |
| `showSymbol` | `boolean` | `true` | 否 | — |
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
| `'chart-ready'` | `instance: ReturnType<typeof import('echarts').init>` | — |
| `click` | `params: ECElementEvent` | — |
| `dblclick` | `params: ECElementEvent` | — |
| `mousedown` | `params: ECElementEvent` | — |
| `mouseup` | `params: ECElementEvent` | — |
| `mouseover` | `params: ECElementEvent` | — |
| `mouseout` | `params: ECElementEvent` | — |
| `globalout` | `params: ECElementEvent` | — |
| `contextmenu` | `params: ECElementEvent` | — |
| `legendselectchanged` | `params: ECElementEvent` | — |
| `datazoom` | `params: ECElementEvent` | — |
| `finished` | `params: ECElementEvent` | — |

## `BaseChart`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `option` | `EChartsOption \| null` | `null` | 是 | — |
| `loading` | `boolean` | `false` | 否 | — |
| `emptyText` | `string` | `''` | 否 | — |
| `height` | `number \| string` | `'100%'` | 否 | — |
| `width` | `number \| string` | `'100%'` | 否 | — |
| `darkMode` | `boolean` | `false` | 否 | — |
| `toolbar` | `Array<'saveAsImage' \| 'zoom' \| 'dataView'> \| false` | `() => ['saveAsImage', 'zoom']` | 否 | — |

## `ChartTable`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | `ChartProps['type']` | — | 否 | — |
| `option` | `ChartProps['option']` | — | 否 | — |
| `data` | `ChartProps['data']` | — | 否 | — |
| `categories` | `string[]` | — | 否 | — |
| `series` | `ChartProps['series']` | — | 否 | — |
| `darkMode` | `boolean` | `false` | 否 | — |
| `colors` | `string[]` | — | 否 | — |
| `title` | `string` | — | 否 | — |
| `showLegend` | `boolean` | `true` | 否 | — |
| `showTooltip` | `boolean` | `true` | 否 | — |
| `smooth` | `boolean` | `true` | 否 | — |
| `showSymbol` | `boolean` | `true` | 否 | — |
| `showDataLabel` | `boolean` | `false` | 否 | — |
| `horizontal` | `boolean` | `false` | 否 | — |
| `stacked` | `boolean` | `false` | 否 | — |
| `stacked100` | `boolean` | `false` | 否 | — |
| `legendPosition` | `ChartProps['legendPosition']` | `'bottom'` | 否 | — |
| `xAxis` | `ChartProps['xAxis']` | — | 否 | — |
| `yAxis` | `ChartProps['yAxis']` | — | 否 | — |
| `animation` | `boolean` | `true` | 否 | — |
| `animationDuration` | `number` | `DEFAULT_ANIMATION_MS` | 否 | — |
| `toolbar` | `ChartProps['toolbar']` | `() => ['saveAsImage', 'zoom']` | 否 | — |
| `palette` | `ChartProps['palette']` | — | 否 | — |
| `markLine` | `ChartProps['markLine']` | — | 否 | — |
| `markArea` | `ChartProps['markArea']` | — | 否 | — |
| `columns` | `Column[]` | `() => []` | 否 | — |
| `tableData` | `Record<string, any>[]` | `() => []` | 否 | — |
| `showTable` | `boolean` | `true` | 否 | — |
| `tableTitle` | `string` | `''` | 否 | — |
| `rowKey` | `string` | `'rank'` | 否 | — |
| `chartRatio` | `number` | `0.45` | 否 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'chart-click'` | `params: ECElementEvent` | — |
| `'chart-ready'` | `instance: ECharts` | — |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `footer` | — | — |
| `header` | — | {{ tableTitle }} |

## `ChartLegend`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `items` | `{ name: string; color: string; visible: boolean }[]` | — | 是 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `toggle` | `name: string` | — |
| `'toggle-all'` | `visible: boolean` | — |

