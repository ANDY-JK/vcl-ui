// ⛔ 保护 — ECharts 初始化，禁止：组件/渲染器注册顺序修改
//    需我确认：新增图表类型注册
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import {
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  RadarChart,
  GaugeChart,
  FunnelChart,
  HeatmapChart,
  TreemapChart,
  CandlestickChart,
  SankeyChart,
  SunburstChart,
  GraphChart,
  BoxplotChart,
  PictorialBarChart,
  TreeChart,
} from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  ToolboxComponent,
  DataZoomComponent,
  VisualMapComponent,
  RadarComponent,
  PolarComponent,
  TransformComponent,
  DatasetComponent,
  GraphicComponent,
  MarkLineComponent,
  MarkPointComponent,
  TimelineComponent,
  MarkAreaComponent,
} from 'echarts/components'
// echarts-wordcloud 按需动态加载（~30KB gzip），仅在 wordCloud 图表类型使用时导入。
// 未安装该包时（可选 peer）动态 import 会 reject，须捕获降级而非 unhandled rejection。
import { warnOnce } from '../../_internal/warnOnce'
let _wordCloudLoaded = false

/**
 * 按需加载 echarts-wordcloud。
 *
 * 返回**是否可用**（第 141 轮改）：原来只返回 void，调用方拿不到成败，于是依赖缺失时
 * 图表照样按 wordCloud 出 option —— 而该 series 类型没注册，ECharts 什么也不画，
 * 界面上就是一个**没有任何提示的空白框**（只有控制台一条 warnOnce）。
 * 现在调用方可以据此显示"缺扩展"的可见提示。
 *
 * @param loader 仅用于测试注入（默认动态 import 真包）；生产调用不传
 */
export async function ensureWordCloud(
  loader: () => Promise<unknown> = () => import('echarts-wordcloud'),
): Promise<boolean> {
  if (_wordCloudLoaded) return true
  try {
    await loader()
    _wordCloudLoaded = true
    return true
  } catch {
    warnOnce('Chart', 'wordCloud 图表类型需安装 echarts-wordcloud：npm i echarts-wordcloud（当前渲染将留空）')
    return false
  }
}

use([
  CanvasRenderer,
  // 图表类型
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  RadarChart,
  GaugeChart,
  FunnelChart,
  HeatmapChart,
  TreemapChart,
  CandlestickChart,
  SankeyChart,
  SunburstChart,
  GraphChart,
  BoxplotChart,
  PictorialBarChart,
  TreeChart,
  // 组件
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  ToolboxComponent,
  DataZoomComponent,
  VisualMapComponent,
  RadarComponent,
  PolarComponent,
  TransformComponent,
  DatasetComponent,
  GraphicComponent,
  MarkLineComponent,
  MarkPointComponent,
  TimelineComponent,
  MarkAreaComponent,
])

export { init, getInstanceByDom, registerMap } from 'echarts/core'
