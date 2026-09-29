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
export async function ensureWordCloud(): Promise<void> {
  if (_wordCloudLoaded) return
  try {
    await import('echarts-wordcloud')
    _wordCloudLoaded = true
  } catch {
    warnOnce('Chart', 'wordCloud 图表类型需安装 echarts-wordcloud：npm i echarts-wordcloud（当前渲染将留空）')
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
