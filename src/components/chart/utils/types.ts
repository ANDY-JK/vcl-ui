// ⛔ 保护 — 图表类型定义，禁止：ChartType/ChartData 接口结构调整
//    需我确认：新增图表类型枚举值
import type { EChartsOption } from 'echarts'

/** 支持的图表类型 */
export type ChartType =
  | 'line' // 折线图
  | 'bar' // 柱状图
  | 'pie' // 饼图
  | 'scatter' // 散点图
  | 'area' // 面积图
  | 'radar' // 雷达图
  | 'gauge' // 仪表盘
  | 'funnel' // 漏斗图
  | 'heatmap' // 热力图
  | 'treemap' // 矩形树图
  | 'candlestick' // K 线图
  | 'sankey' // 桑基图
  | 'sunburst' // 旭日图
  | 'graph' // 关系图/力导向图
  | 'boxplot' // 箱线图
  | 'mixed' // 混合图表（折线 + 柱状叠加）
  | 'waterfall' // 瀑布图
  | 'pictorialBar' // 象形柱状图
  | 'tree' // 树图
  | 'timeline' // 时间轴
  | 'wordCloud' // 词云

/** 工具栏按钮选项 */
export type ToolbarButton = 'saveAsImage' | 'zoom' | 'dataView'

/** 内置主题色板预设 */
export type PalettePreset = 'default' | 'ocean' | 'forest' | 'sunset' | 'midnight' | 'pastel'

/** 标注线配置 */
export interface MarkLineConfig {
  type?: 'average' | 'min' | 'max' | 'median'
  value?: number
  label?: string
  color?: string
  yAxis?: boolean // true=按Y轴值，false=按X轴
}

/** 标注区域配置 */
export interface MarkAreaConfig {
  from: number
  to: number
  label?: string
  color?: string
}

/** 坐标轴配置 */
export interface AxisConfig {
  title?: string
  min?: number
  max?: number
  labelRotate?: number
}

/** 简化模式的系列数据项 */
export interface ChartSeriesItem {
  name?: string
  type?: string
  data?: unknown[]
  color?: string
  smooth?: boolean
  areaStyle?: Record<string, unknown> | boolean
  barMaxWidth?: number
  symbolSize?: number
  yAxisIndex?: number
  [key: string]: any // 保留索引签名以兼容 ECharts 灵活配置，data 字段已收紧为 unknown[]
}

/** 柱状图系列数据项（供外部精确调用） */
export interface BarSeriesItem {
  name: string
  data: number[]
  color?: string
  barMaxWidth?: number
}

/** 折线图系列数据项（供外部精确调用） */
export interface LineSeriesItem {
  name: string
  data: number[]
  color?: string
  smooth?: boolean
  showSymbol?: boolean
  areaStyle?: Record<string, any> | boolean
}

/** 雷达图指标 */
export interface RadarIndicator {
  name: string
  max: number
}

/** 桑基图节点/连接 */
export interface SankeyNode {
  name: string
  itemStyle?: Record<string, any>
}
export interface SankeyLink {
  source: string
  target: string
  value: number
}

/** 关系图节点/边 */
export interface GraphNode {
  id?: string
  name: string
  value?: number
  category?: number
  symbolSize?: number
  itemStyle?: Record<string, any>
}
export interface GraphLink {
  source: string
  target: string
  value?: number
}

/** 简化模式完整数据对象 */
export interface ChartData {
  categories?: string[]
  series?: ChartSeriesItem[]
  // 饼图
  pieData?: { name: string; value: number }[]
  // 雷达图
  radarIndicators?: RadarIndicator[]
  // 仪表盘
  gaugeData?: { value: number; name?: string }[]
  // 热力图：[xIndex, yIndex, value]
  heatmapData?: [number, number, number][]
  heatmapXCategories?: string[]
  heatmapYCategories?: string[]
  // K 线图：[open, close, low, high]
  candlestickData?: [number, number, number, number][]
  // 桑基图
  sankeyNodes?: SankeyNode[]
  sankeyLinks?: SankeyLink[]
  // 矩形树图 / 旭日图（层次数据）
  treeData?: any[]
  // 关系图
  graphNodes?: GraphNode[]
  graphLinks?: GraphLink[]
  // 箱线图：[min, Q1, median, Q3, max]
  boxplotData?: number[][]
  // 时间轴
  timelineData?: Array<{ time: string; categories: string[]; series: any[] }>
}

/** Chart.vue Props */
export interface ChartProps {
  type?: ChartType
  option?: EChartsOption
  data?: ChartData | number[] | number[][] | { name: string; value: number }[]
  categories?: string[]
  series?: ChartSeriesItem[]
  height?: number | string
  width?: number | string
  darkMode?: boolean
  colors?: string[]
  loading?: boolean
  emptyText?: string
  title?: string
  showLegend?: boolean
  showTooltip?: boolean
  smooth?: boolean
  showSymbol?: boolean
  // ---- 第3层「高级控制」新增 ----
  /** 在数据点上显示数值标签 */
  showDataLabel?: boolean
  /** 柱状图切换为条形图（X/Y 轴互换） */
  horizontal?: boolean
  /** 堆叠模式 */
  stacked?: boolean
  /** 百分比堆叠模式 */
  stacked100?: boolean
  /** 图例位置 */
  legendPosition?: 'top' | 'bottom' | 'left' | 'right'
  /** X 轴配置 */
  xAxis?: AxisConfig
  /** Y 轴配置 */
  yAxis?: AxisConfig
  /** 加载动画开关 */
  animation?: boolean
  /** 动画时长（毫秒） */
  animationDuration?: number
  /** 工具栏按钮，传入 false 全关 */
  toolbar?: ToolbarButton[] | false
  /** 内置色板预设 */
  palette?: PalettePreset
  /** 标注线（均值线/目标线/警戒线），支持多条 */
  markLine?: MarkLineConfig | MarkLineConfig[]
  /** 标注区域（高亮区间） */
  markArea?: MarkAreaConfig | MarkAreaConfig[]
}

/** BaseChart.vue Props */
export interface BaseChartProps {
  option: EChartsOption | null
  loading?: boolean
  emptyText?: string
  height?: number | string
  width?: number | string
  darkMode?: boolean
}

/** 内部 option 构建参数（已标准化） */
export interface BuildParams {
  type: ChartType
  categories: string[]
  series: ChartSeriesItem[]
  data: ChartData
  title: string
  showLegend: boolean
  showTooltip: boolean
  smooth: boolean
  showSymbol: boolean
  colors: string[]
  darkMode: boolean
  // 第3层高级控制
  showDataLabel?: boolean
  horizontal?: boolean
  stacked?: boolean
  stacked100?: boolean
  legendPosition?: 'top' | 'bottom' | 'left' | 'right'
  xAxis?: AxisConfig
  yAxis?: AxisConfig
  animation?: boolean
  animationDuration?: number
  toolbar?: ToolbarButton[] | false
  palette?: PalettePreset
  markLine?: MarkLineConfig | MarkLineConfig[]
  markArea?: MarkAreaConfig | MarkAreaConfig[]
  /** 大数据降采样（'lttb'）：line/area 系列点数超阈值时自动启用，传 null 强制关闭 */
  sampling?: 'lttb' | 'average' | 'min' | 'max' | 'sum' | null
}
