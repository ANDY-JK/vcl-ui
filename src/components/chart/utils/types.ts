// ⛔ 保护 — 图表类型定义，禁止：ChartType/ChartData 接口结构调整
//    需我确认：新增图表类型枚举值
import type { EChartsOption } from 'echarts'
import type { ChartOption } from '@/components/_internal/api-any'

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
  /** 折线/散点是否显示数据点（与 Chart props 同名项一致，line/scatter builder 直读） */
  showSymbol?: boolean
  areaStyle?: Record<string, unknown> | boolean
  barMaxWidth?: number
  symbolSize?: number
  yAxisIndex?: number
  // 保留索引签名以兼容 ECharts 灵活配置（data 已收紧为 unknown[]；索引值用 unknown，
  // 取未声明字段的消费方自行收窄，不再让 any 无声穿透）
  [key: string]: unknown
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
  areaStyle?: ChartOption | boolean
}

/** 雷达图指标 */
export interface RadarIndicator {
  name: string
  max: number
}

/** 桑基图节点/连接 */
export interface SankeyNode {
  name: string
  itemStyle?: ChartOption
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
  itemStyle?: ChartOption
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
  treeData?: Record<string, unknown>[]
  // 关系图
  graphNodes?: GraphNode[]
  graphLinks?: GraphLink[]
  // 箱线图：[min, Q1, median, Q3, max]
  boxplotData?: number[][]
  // 时间轴
  timelineData?: Array<{ time: string; categories: string[]; series: Record<string, unknown>[] }>
}

/** Chart.vue Props */
export interface ChartProps {
  /** 图表类型（line/bar/pie 等，见 ChartType）；传 option 时可省略 */
  type?: ChartType
  /** 原生 ECharts option（优先级最高，传入后覆盖快捷 props 组装） */
  option?: EChartsOption
  /** 快捷数据：单序列数值数组 / 多序列二维数组 / 饼图 { name, value } 列表 / ChartData 完整结构 */
  data?: ChartData | number[] | number[][] | { name: string; value: number }[]
  /** X 轴类目（快捷模式的类目轴） */
  categories?: string[]
  /** 快捷多序列（name + data，与 categories 对齐） */
  series?: ChartSeriesItem[]
  /** 容器高（数字 px 或 CSS 值，默认 '100%' 随父容器） */
  height?: number | string
  /** 容器宽（默认 '100%'） */
  width?: number | string
  /** 暗色主题（ECharts 内置 dark 色板，独立于全局 useTheme） */
  darkMode?: boolean
  /** 自定义系列颜色（覆盖内置色板） */
  colors?: string[]
  /** 加载态（showLoading 蒙层） */
  loading?: boolean
  /** 空数据文案 */
  emptyText?: string
  /** 图表标题 */
  title?: string
  /** 显示图例（默认开） */
  showLegend?: boolean
  /** 显示悬浮提示（默认开） */
  showTooltip?: boolean
  /** 折线平滑（默认开） */
  smooth?: boolean
  /** 折线数据点符号（默认开） */
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
  /** 原生 ECharts option（必传，null 时渲染空态） */
  option: EChartsOption | null
  /** 加载态（showLoading 蒙层） */
  loading?: boolean
  /** 空数据文案 */
  emptyText?: string
  /** 容器高（默认 '100%' 随父容器） */
  height?: number | string
  /** 容器宽（默认 '100%'） */
  width?: number | string
  /** ECharts 内置 dark 主题 */
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
