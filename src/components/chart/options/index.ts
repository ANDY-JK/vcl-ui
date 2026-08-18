// ⛔ 保护 — 图表选项构建入口，禁止：修改 builder 映射表键名、buildChartOption 签名
//    需我确认：新增 chartType 支持
import type { EChartsOption } from 'echarts'
import type { ChartType, BuildParams } from '../utils/types'

// 基础图表 builders
import { buildLine } from './core/line'
import { buildBar } from './core/bar'
import { buildPie } from './core/pie'
import { buildArea } from './core/area'
import { buildScatter } from './core/scatter'
import { buildMixed } from './core/mixed'
import { buildWaterfall } from './core/waterfall'
import { buildPictorialBar } from './core/pictorialBar'

// 高级图表 builders
import { buildRadar } from './advanced/radar'
import { buildGauge } from './advanced/gauge'
import { buildFunnel } from './advanced/funnel'
import { buildHeatmap } from './advanced/heatmap'
import { buildCandlestick } from './advanced/candlestick'
import { buildSankey } from './advanced/sankey'
import { buildTreemap } from './advanced/treemap'
import { buildSunburst } from './advanced/sunburst'
import { buildGraph } from './advanced/graph'
import { buildBoxplot } from './advanced/boxplot'
import { buildTree } from './advanced/tree'
import { buildTimeline } from './advanced/timeline'
import { buildWordCloud } from './advanced/wordCloud'

/** 图表类型 → builder 映射表 */
const builders: Record<ChartType, (p: BuildParams) => EChartsOption> = {
  line: buildLine,
  bar: buildBar,
  pie: buildPie,
  area: buildArea,
  scatter: buildScatter,
  radar: buildRadar,
  gauge: buildGauge,
  funnel: buildFunnel,
  heatmap: buildHeatmap,
  treemap: buildTreemap,
  candlestick: buildCandlestick,
  sankey: buildSankey,
  sunburst: buildSunburst,
  graph: buildGraph,
  boxplot: buildBoxplot,
  mixed: buildMixed,
  // 新增
  waterfall: buildWaterfall,
  pictorialBar: buildPictorialBar,
  tree: buildTree,
  timeline: buildTimeline,
  wordCloud: buildWordCloud,
}

/** 入口：根据图表类型和参数构建完整 EChartsOption */
export function buildChartOption(type: ChartType, params: BuildParams): EChartsOption {
  const builder = builders[type]
  if (!builder) {
    console.warn(`[Chart] 未知图表类型 "${type}"，回退为柱状图`)
    return buildBar(params)
  }
  return builder(params)
}
