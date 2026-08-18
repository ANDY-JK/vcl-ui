<script setup lang="ts">
import { ref } from 'vue'
import Chart from '@/components/chart/Chart.vue'
import ChartLegend from '@/components/chart/ChartLegend.vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'

const darkMode = ref(false)

// ChartLegend 独立图例数据
const legendItems = ref([
  { name: '苹果', color: '#FF6B6B', visible: true },
  { name: '香蕉', color: '#FFD93D', visible: true },
  { name: '橘子', color: '#FF9F43', visible: true },
  { name: '葡萄', color: '#6C5CE7', visible: false },
  { name: '西瓜', color: '#00B894', visible: true },
])

/* ===== 示例数据 ===== */
const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const lineSeries = [
  { name: '访问量', data: [820, 932, 901, 934, 1290, 1330, 1320, 1520, 1620, 1400, 1350, 1420] },
  { name: '订单量', data: [320, 332, 301, 334, 390, 430, 420, 520, 620, 540, 480, 510] },
]

const barSeries = [
  { name: '苹果', data: [120, 200, 150, 80, 70, 110, 130] },
  { name: '橙子', data: [80, 90, 120, 100, 110, 140, 90] },
  { name: '香蕉', data: [60, 70, 80, 90, 100, 110, 120] },
]

const pieData = [
  { name: '搜索引擎', value: 435 },
  { name: '直接访问', value: 310 },
  { name: '社交媒体', value: 234 },
  { name: '邮件营销', value: 135 },
  { name: '联盟广告', value: 98 },
]

const scatterSeries = [
  {
    name: '身高体重',
    data: [
      [161, 51],
      [167, 63],
      [172, 70],
      [175, 75],
      [180, 82],
      [158, 48],
      [163, 55],
      [170, 65],
      [177, 78],
      [185, 88],
      [160, 50],
      [168, 60],
      [173, 68],
      [178, 80],
      [182, 85],
    ],
    symbolSize: 10,
  },
]

const areaSeries = [
  { name: 'PV', data: [1240, 1320, 1010, 1340, 1490, 1600, 1580, 1720, 1820, 1600, 1450, 1520] },
  { name: 'UV', data: [820, 932, 901, 934, 1090, 1130, 1120, 1220, 1320, 1100, 1050, 1120] },
]

const radarIndicators = [
  { name: '速度', max: 100 },
  { name: '力量', max: 100 },
  { name: '技巧', max: 100 },
  { name: '耐力', max: 100 },
  { name: '防守', max: 100 },
  { name: '进攻', max: 100 },
]
const radarSeries = [
  { name: '玩家A', data: [{ value: [85, 72, 90, 78, 65, 88] }] },
  { name: '玩家B', data: [{ value: [70, 88, 65, 92, 80, 72] }] },
]

const funnelSeries = [
  {
    name: '转化',
    data: [
      { value: 5000, name: '曝光' },
      { value: 3500, name: '点击' },
      { value: 1200, name: '加购' },
      { value: 800, name: '下单' },
      { value: 500, name: '支付' },
    ],
  },
]

const heatmapData: [number, number, number][] = []
for (let h = 0; h < 24; h++) {
  for (let d = 0; d < 7; d++) heatmapData.push([d, h, Math.floor(Math.random() * 100)])
}
const heatmapXCats = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const heatmapYCats = Array.from({ length: 24 }, (_, i) => `${i}时`)

const candlestickData: [number, number, number, number][] = [
  [20, 34, 10, 38],
  [40, 35, 30, 50],
  [33, 38, 28, 40],
  [38, 42, 35, 45],
  [42, 48, 38, 52],
  [50, 52, 36, 55],
  [48, 45, 40, 50],
  [45, 55, 42, 58],
  [55, 52, 48, 56],
  [52, 60, 50, 62],
  [60, 58, 48, 63],
  [58, 65, 55, 68],
]

const sankeyNodes = [
  { name: '首页' },
  { name: '列表页' },
  { name: '详情页' },
  { name: '购物车' },
  { name: '订单页' },
  { name: '支付页' },
]
const sankeyLinks = [
  { source: '首页', target: '列表页', value: 100 },
  { source: '列表页', target: '详情页', value: 60 },
  { source: '列表页', target: '购物车', value: 30 },
  { source: '详情页', target: '购物车', value: 40 },
  { source: '购物车', target: '订单页', value: 60 },
  { source: '订单页', target: '支付页', value: 45 },
]

const treemapData = [
  {
    name: '电子产品',
    children: [
      { name: '手机', value: 1200 },
      { name: '平板', value: 600 },
      { name: '笔记本', value: 900 },
      { name: '耳机', value: 300 },
      { name: '手表', value: 400 },
    ],
  },
  {
    name: '服装',
    children: [
      { name: '上衣', value: 500 },
      { name: '裤子', value: 400 },
      { name: '鞋子', value: 600 },
      { name: '配饰', value: 200 },
    ],
  },
  {
    name: '食品',
    children: [
      { name: '零食', value: 300 },
      { name: '饮料', value: 250 },
      { name: '生鲜', value: 350 },
    ],
  },
]

const sunburstData = [
  {
    name: '总部',
    children: [
      {
        name: '研发部',
        children: [
          { name: '前端', value: 30 },
          { name: '后端', value: 35 },
          { name: '测试', value: 15 },
          { name: '运维', value: 12 },
        ],
      },
      {
        name: '产品部',
        children: [
          { name: '产品经理', value: 15 },
          { name: '设计师', value: 12 },
        ],
      },
      {
        name: '销售部',
        children: [
          { name: '国内', value: 40 },
          { name: '海外', value: 25 },
        ],
      },
      { name: '运营部', value: 20 },
    ],
  },
]

const graphNodes = [
  { name: '用户A', category: 0 },
  { name: '用户B', category: 0 },
  { name: '用户C', category: 0 },
  { name: '用户D', category: 0 },
  { name: '用户E', category: 0 },
  { name: '用户F', category: 1 },
  { name: '用户G', category: 1 },
  { name: '用户H', category: 1 },
]
const graphLinks = [
  { source: '用户A', target: '用户B' },
  { source: '用户A', target: '用户C' },
  { source: '用户B', target: '用户D' },
  { source: '用户C', target: '用户D' },
  { source: '用户D', target: '用户E' },
  { source: '用户F', target: '用户G' },
  { source: '用户F', target: '用户H' },
  { source: '用户A', target: '用户F' },
  { source: '用户B', target: '用户G' },
]

const boxplotData: number[][] = [
  [10, 18, 25, 32, 40],
  [12, 20, 28, 35, 42],
  [8, 15, 22, 30, 38],
  [14, 22, 28, 36, 45],
  [11, 19, 26, 33, 41],
  [9, 16, 24, 31, 39],
  [13, 21, 27, 34, 43],
]

const mixedSeries = [
  { name: '销售额', type: 'bar', data: [420, 460, 500, 480, 520, 580, 620, 600, 650, 700, 720, 750] },
  { name: '利润率', type: 'line', data: [12, 15, 13, 17, 16, 18, 20, 19, 22, 21, 23, 25] },
]
</script>

<template>
  <div class="demo">
    <div class="demo-header">
      <div>
        <h2 class="demo-title">Chart 图表</h2>
        <p class="demo-desc">
          基于 ECharts 的统一图表组件，支持 16 种图表类型。默认宽高 <code>100%</code> 自适应容器，容器多大图表就多大。
        </p>
      </div>
      <label class="dark-toggle">
        <input v-model="darkMode" type="checkbox" />
        暗色模式 {{ darkMode ? '🌙' : '☀️' }}
      </label>
    </div>

    <!-- 趋势类 -->
    <Card title="趋势类 — line / area / bar / mixed" style="margin-bottom: 14px">
      <div class="chart-grid">
        <div class="chart-cell">
          <h4>折线图 line — 平滑 + 图例 + 标题</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart type="line" :categories="months" :series="lineSeries" :dark-mode="darkMode" title="月度访问趋势" />
          </div>
        </div>
        <div class="chart-cell">
          <h4>面积图 area — 填充渐变</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart type="area" :categories="months" :series="areaSeries" :dark-mode="darkMode" title="PV / UV" />
          </div>
        </div>
        <div class="chart-cell">
          <h4>柱状图 bar — 多系列对比</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart type="bar" :categories="days" :series="barSeries" :dark-mode="darkMode" title="水果销量" />
          </div>
        </div>
        <div class="chart-cell">
          <h4>混合图表 mixed — 柱状 + 折线双轴</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart
              type="mixed"
              :categories="months"
              :series="mixedSeries"
              :dark-mode="darkMode"
              title="销售额 & 利润率"
            />
          </div>
        </div>
      </div>
    </Card>

    <!-- 分布类 -->
    <Card title="分布类 — pie / scatter / radar" style="margin-bottom: 20px">
      <div class="chart-grid">
        <div class="chart-cell">
          <h4>饼图 pie — 环形 + 标签</h4>
          <div class="chart-wrap" style="height: 380px">
            <Chart type="pie" :data="{ pieData }" :dark-mode="darkMode" title="流量来源" />
          </div>
        </div>
        <div class="chart-cell">
          <h4>散点图 scatter — 无平滑</h4>
          <div class="chart-wrap" style="height: 380px">
            <Chart type="scatter" :series="scatterSeries" :dark-mode="darkMode" title="身高-体重" :smooth="false" />
          </div>
        </div>
        <div class="chart-cell" style="grid-column: 1 / -1">
          <h4>雷达图 radar — 双系列对比</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart
              type="radar"
              :data="{ radarIndicators }"
              :series="radarSeries"
              :dark-mode="darkMode"
              title="能力雷达"
            />
          </div>
        </div>
      </div>
    </Card>

    <!-- 业务类 -->
    <Card title="业务类 — gauge / funnel / heatmap" style="margin-bottom: 20px">
      <div class="chart-grid">
        <div class="chart-cell">
          <h4>仪表盘 gauge</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart
              type="gauge"
              :data="{ gaugeData: [{ value: 72, name: '完成率' }] }"
              :dark-mode="darkMode"
              title="季度目标"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>漏斗图 funnel</h4>
          <div class="chart-wrap" style="height: 380px">
            <Chart type="funnel" :series="funnelSeries" :dark-mode="darkMode" title="转化漏斗" />
          </div>
        </div>
        <div class="chart-cell" style="grid-column: 1 / -1">
          <h4>热力图 heatmap — 24h × 7d</h4>
          <div class="chart-wrap" style="height: 380px">
            <Chart
              type="heatmap"
              :data="{ heatmapData, heatmapXCategories: heatmapXCats, heatmapYCategories: heatmapYCats }"
              :dark-mode="darkMode"
              title="周访问时段热力"
            />
          </div>
        </div>
      </div>
    </Card>

    <!-- 层次类 -->
    <Card title="层次类 — treemap / sunburst" style="margin-bottom: 20px">
      <div class="chart-grid">
        <div class="chart-cell">
          <h4>矩形树图 treemap — 可下钻</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart type="treemap" :data="{ treeData: treemapData }" :dark-mode="darkMode" title="销售分布" />
          </div>
        </div>
        <div class="chart-cell">
          <h4>旭日图 sunburst — 层级展示</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart type="sunburst" :data="{ treeData: sunburstData }" :dark-mode="darkMode" title="组织架构" />
          </div>
        </div>
      </div>
    </Card>

    <!-- 流程类 -->
    <Card title="流程类 — sankey / graph" style="margin-bottom: 20px">
      <div class="chart-grid">
        <div class="chart-cell">
          <h4>桑基图 sankey — 流向分析</h4>
          <div class="chart-wrap" style="height: 380px">
            <Chart type="sankey" :data="{ sankeyNodes, sankeyLinks }" :dark-mode="darkMode" title="用户流转" />
          </div>
        </div>
        <div class="chart-cell">
          <h4>关系图 graph — 力导向布局</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart type="graph" :data="{ graphNodes, graphLinks }" :dark-mode="darkMode" title="社交网络" />
          </div>
        </div>
      </div>
    </Card>

    <!-- 金融类 -->
    <Card title="金融类 — candlestick / boxplot" style="margin-bottom: 20px">
      <div class="chart-grid">
        <div class="chart-cell">
          <h4>K 线图 candlestick — 红涨绿跌</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart
              type="candlestick"
              :categories="months"
              :data="{ candlestickData }"
              :dark-mode="darkMode"
              title="月度股价"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>箱线图 boxplot — 分布特征</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart type="boxplot" :categories="days" :data="{ boxplotData }" :dark-mode="darkMode" title="周数据分布" />
          </div>
        </div>
      </div>
    </Card>

    <!-- 🆕 新增图表类型 -->
    <Card title="🆕 新增 — waterfall / pictorialBar / tree / wordCloud / timeline" style="margin-bottom: 20px">
      <div class="chart-grid">
        <div class="chart-cell">
          <h4>瀑布图 waterfall — 财务收支</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart
              type="waterfall"
              :categories="['起始', '营收', '成本', '利润', '税费', '净利']"
              :series="[{ name: '金额', data: [800, 200, -150, 350, -80, 270] }]"
              :dark-mode="darkMode"
              title="收支瀑布"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>象形柱状 pictorialBar — 符号柱</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart
              type="pictorialBar"
              :categories="['Q1', 'Q2', 'Q3', 'Q4']"
              :series="[
                { name: 'A', data: [60, 80, 55, 70] },
                { name: 'B', data: [45, 65, 75, 50] },
              ]"
              :dark-mode="darkMode"
              title="季度对比"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>树图 tree — 组织架构</h4>
          <div class="chart-wrap" style="height: 380px">
            <Chart
              type="tree"
              :data="{
                treeData: [
                  {
                    name: 'CEO',
                    children: [
                      { name: 'CTO', children: [{ name: '前端组' }, { name: '后端组' }] },
                      { name: 'CFO', children: [{ name: '财务' }, { name: '审计' }] },
                      { name: 'COO' },
                    ],
                  },
                ],
              }"
              :dark-mode="darkMode"
              title="组织架构"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>词云 wordCloud — 文本分析</h4>
          <div class="chart-wrap" style="height: 380px">
            <Chart
              type="wordCloud"
              :series="[
                {
                  name: '',
                  data: [
                    { name: '人工智能', value: 80 },
                    { name: '大数据', value: 65 },
                    { name: '云计算', value: 55 },
                    { name: '区块链', value: 45 },
                    { name: '物联网', value: 40 },
                    { name: '5G', value: 50 },
                    { name: '量子计算', value: 25 },
                    { name: '元宇宙', value: 35 },
                    { name: '边缘计算', value: 30 },
                    { name: '数字孪生', value: 20 },
                    { name: '隐私计算', value: 28 },
                    { name: 'Web3', value: 32 },
                  ],
                },
              ]"
              :dark-mode="darkMode"
              title="技术热词"
            />
          </div>
        </div>
        <div class="chart-cell" style="grid-column: 1 / -1">
          <h4>时间轴 timeline — 时序播放</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart
              type="timeline"
              :data="{
                timelineData: [
                  { time: 'Q1', categories: ['A', 'B', 'C'], series: [{ name: '收入', data: [10, 20, 15] }] },
                  { time: 'Q2', categories: ['A', 'B', 'C'], series: [{ name: '收入', data: [25, 18, 22] }] },
                  { time: 'Q3', categories: ['A', 'B', 'C'], series: [{ name: '收入', data: [30, 22, 28] }] },
                  { time: 'Q4', categories: ['A', 'B', 'C'], series: [{ name: '收入', data: [20, 30, 18] }] },
                ],
              }"
              :dark-mode="darkMode"
              title="季度趋势"
            />
          </div>
        </div>
      </div>
    </Card>

    <!-- 🆕 高级功能演示 -->
    <Card title="🆕 高级功能 — 堆叠 / 条形 / 数据标签 / 百分比堆叠" style="margin-bottom: 20px">
      <div class="chart-grid">
        <div class="chart-cell">
          <h4>堆叠柱状图 stacked</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart
              type="bar"
              :categories="days"
              :series="barSeries"
              :dark-mode="darkMode"
              stacked
              show-data-label
              title="堆叠销量"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>百分比堆叠 stacked100</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart
              type="bar"
              :categories="days"
              :series="barSeries"
              :dark-mode="darkMode"
              stacked100
              title="百分比分布"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>条形图 horizontal</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart
              type="bar"
              :categories="['苹果', '橙子', '香蕉', '葡萄', '西瓜', '芒果', '草莓']"
              :series="[{ name: '销量', data: [120, 98, 86, 75, 55, 48, 42] }]"
              :dark-mode="darkMode"
              horizontal
              show-data-label
              title="水果销量排行"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>折线图 + 数据标签</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart
              type="line"
              :categories="days"
              :series="[{ name: 'UV', data: [820, 932, 901, 934, 1090, 1130, 1120] }]"
              :dark-mode="darkMode"
              show-data-label
              title="带标签的折线"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>堆叠面积图 stacked</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart
              type="area"
              :categories="months"
              :series="areaSeries"
              :dark-mode="darkMode"
              stacked
              title="堆叠面积"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>图例左侧 + Y轴范围</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart
              type="line"
              :categories="days"
              :series="[{ name: 'UV', data: [820, 932, 901, 934, 1090, 1130, 1120] }]"
              :dark-mode="darkMode"
              legend-position="left"
              :y-axis="{ min: 500, max: 1200, title: '人次' }"
              title="左侧图例"
            />
          </div>
        </div>
      </div>
    </Card>

    <!-- 🆕 极简推断模式 -->
    <Card title="🆕 极简模式 — 裸数据自动推断，无需传 type/categories/series" style="margin-bottom: 20px">
      <div class="chart-grid">
        <div class="chart-cell">
          <h4>一维数组 :data="[12, 18, 24, 30, 36]"</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart :data="[12, 18, 24, 30, 36]" :dark-mode="darkMode" title="极简一维" />
          </div>
        </div>
        <div class="chart-cell">
          <h4>二维数组 :data="[[12,18,24], [8,12,15]]"</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart
              :data="[
                [12, 18, 24],
                [8, 12, 15],
              ]"
              :dark-mode="darkMode"
              title="极简二维"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>对象数组 :data="[{name:'Q1',value:12},...]"</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart
              :data="[
                { name: 'Q1', value: 12 },
                { name: 'Q2', value: 18 },
                { name: 'Q3', value: 24 },
                { name: 'Q4', value: 30 },
              ]"
              :dark-mode="darkMode"
              title="极简对象"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>长标签自动旋转（>4字自动45°）</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart
              type="bar"
              :categories="['第一季度', '第二季度', '第三季度', '第四季度', '全年汇总']"
              :series="[{ name: '营收', data: [120, 200, 150, 180, 650] }]"
              :dark-mode="darkMode"
              title="智能标签旋转"
            />
          </div>
        </div>
      </div>
    </Card>

    <!-- 🆕 标注线 + 标注区 -->
    <Card title="🆕 标注线 markLine / 标注区 markArea" style="margin-bottom: 20px">
      <div class="chart-grid">
        <div class="chart-cell">
          <h4>均值线 + 目标线</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart
              type="bar"
              :categories="days"
              :series="[{ name: 'UV', data: [820, 932, 901, 934, 1290, 1130, 1120] }]"
              :dark-mode="darkMode"
              :mark-line="[
                { type: 'average', label: '均值' },
                { value: 1000, label: '目标线', color: '#E54545' },
              ]"
              title="标注线示例"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>标注区域 — 绿区标正常范围</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart
              type="line"
              :categories="days"
              :series="[{ name: 'UV', data: [820, 932, 901, 934, 1090, 1130, 1120] }]"
              :dark-mode="darkMode"
              :mark-area="[{ from: 800, to: 1100, label: '正常', color: 'rgba(34,173,95,0.12)' }]"
              :mark-line="[
                { value: 800, label: '下限', color: '#F59E0B' },
                { value: 1100, label: '上限', color: '#F59E0B' },
              ]"
              title="区间标注"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>柱状图 + 均值线</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart
              type="bar"
              :categories="months"
              :series="[{ name: '月收入', data: [420, 460, 500, 480, 520, 580, 620, 600, 650, 700, 720, 750] }]"
              :dark-mode="darkMode"
              :mark-line="[
                { type: 'average', label: '月均' },
                { value: 650, label: '冲刺线', color: '#22AD5F' },
              ]"
              title="收入趋势"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>堆叠 + 标注区（红色警戒带）</h4>
          <div class="chart-wrap" style="height: 320px">
            <Chart
              type="bar"
              :categories="days"
              :series="barSeries"
              :dark-mode="darkMode"
              stacked
              :mark-area="[{ from: 200, to: 350, label: '警戒区', color: 'rgba(229,69,69,0.1)' }]"
              title="带警戒的堆叠"
            />
          </div>
        </div>
      </div>
    </Card>

    <!-- 🆕 色板预设 -->
    <Card title="🆕 色板预设 palette — 一键换皮（5套内置方案）" style="margin-bottom: 20px">
      <div class="chart-grid">
        <div class="chart-cell">
          <h4>ocean 海洋</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart type="pie" :data="{ pieData }" :dark-mode="darkMode" palette="ocean" title="海洋色" />
          </div>
        </div>
        <div class="chart-cell">
          <h4>forest 森林</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart type="pie" :data="{ pieData }" :dark-mode="darkMode" palette="forest" title="森林色" />
          </div>
        </div>
        <div class="chart-cell">
          <h4>sunset 日落</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart type="pie" :data="{ pieData }" :dark-mode="darkMode" palette="sunset" title="日落色" />
          </div>
        </div>
        <div class="chart-cell">
          <h4>midnight 午夜</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart type="pie" :data="{ pieData }" :dark-mode="darkMode" palette="midnight" title="午夜色" />
          </div>
        </div>
        <div class="chart-cell">
          <h4>pastel 马卡龙</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart type="pie" :data="{ pieData }" :dark-mode="darkMode" palette="pastel" title="马卡龙色" />
          </div>
        </div>
        <div class="chart-cell">
          <h4>midnight 柱状图效果</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart
              type="bar"
              :categories="days"
              :series="barSeries"
              :dark-mode="darkMode"
              palette="midnight"
              title="午夜柱状"
            />
          </div>
        </div>
      </div>
    </Card>

    <!-- 🆕 组合演示 -->
    <Card title="🆕 多属性组合 — 堆叠+色板+标注+数据标签同时使用" style="margin-bottom: 20px">
      <div class="chart-grid">
        <div class="chart-cell">
          <h4>堆叠条形 + 数据标签 + ocean 色板</h4>
          <div class="chart-wrap" style="height: 380px">
            <Chart
              type="bar"
              :categories="days"
              :series="barSeries"
              :dark-mode="darkMode"
              stacked
              horizontal
              show-data-label
              palette="ocean"
              title="横向堆叠"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>折线 + 标注线 + 数据标签 + sunset + 区间</h4>
          <div class="chart-wrap" style="height: 380px">
            <Chart
              type="line"
              :categories="months"
              :series="lineSeries"
              :dark-mode="darkMode"
              show-data-label
              :mark-line="[{ type: 'average', label: '平均' }]"
              palette="sunset"
              :mark-area="[{ from: 800, to: 1200, color: 'rgba(255,107,53,0.06)' }]"
              title="全开模式"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>面积图 + 堆叠 + forest 色板</h4>
          <div class="chart-wrap" style="height: 380px">
            <Chart
              type="area"
              :categories="months"
              :series="areaSeries"
              :dark-mode="darkMode"
              stacked
              palette="forest"
              title="森林堆叠面积"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>百分比堆叠 + 左侧图例 + pastel</h4>
          <div class="chart-wrap" style="height: 380px">
            <Chart
              type="bar"
              :categories="days"
              :series="barSeries"
              :dark-mode="darkMode"
              stacked100
              legend-position="left"
              palette="pastel"
              title="百分比横向"
            />
          </div>
        </div>
      </div>
    </Card>

    <!-- 🆕 暗色全体验 -->
    <Card title="🆕 暗色模式 — 深色背景下各色板效果" style="margin-bottom: 20px">
      <div class="chart-grid">
        <div class="chart-cell">
          <h4>默认色板 dark</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart
              type="bar"
              :categories="days"
              :series="[
                { name: 'A', data: [60, 80, 55, 70, 62, 90, 78] },
                { name: 'B', data: [45, 65, 75, 50, 55, 68, 60] },
              ]"
              dark-mode
              palette="default"
              title="暗色默认"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>ocean dark</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart
              type="bar"
              :categories="days"
              :series="[
                { name: 'A', data: [60, 80, 55, 70, 62, 90, 78] },
                { name: 'B', data: [45, 65, 75, 50, 55, 68, 60] },
              ]"
              dark-mode
              palette="ocean"
              title="暗色海洋"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>sunset dark</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart
              type="bar"
              :categories="days"
              :series="[
                { name: 'A', data: [60, 80, 55, 70, 62, 90, 78] },
                { name: 'B', data: [45, 65, 75, 50, 55, 68, 60] },
              ]"
              dark-mode
              palette="sunset"
              title="暗色日落"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>midnight dark</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart
              type="bar"
              :categories="days"
              :series="[
                { name: 'A', data: [60, 80, 55, 70, 62, 90, 78] },
                { name: 'B', data: [45, 65, 75, 50, 55, 68, 60] },
              ]"
              dark-mode
              palette="midnight"
              title="暗色午夜"
            />
          </div>
        </div>
      </div>
    </Card>

    <!-- 🆕 散点图 + 标注结合 -->
    <Card title="🆕 散点图 + 标注 — 体重分布参考" style="margin-bottom: 20px">
      <div class="chart-grid">
        <div class="chart-cell">
          <h4>散点图 + 均值十字线</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart
              type="scatter"
              :series="[
                {
                  name: '样本',
                  data: [
                    [161, 51],
                    [167, 63],
                    [172, 70],
                    [175, 75],
                    [180, 82],
                    [158, 48],
                    [163, 55],
                    [170, 65],
                    [177, 78],
                    [185, 88],
                    [160, 50],
                    [168, 60],
                    [173, 68],
                    [178, 80],
                    [182, 85],
                    [155, 45],
                    [165, 58],
                    [171, 72],
                    [176, 76],
                    [183, 90],
                    [159, 52],
                    [169, 62],
                    [174, 69],
                  ],
                },
              ]"
              :dark-mode="darkMode"
              :mark-line="[
                { type: 'average', label: 'X均值' },
                { type: 'average', label: 'Y均值' },
              ]"
              title="BMI分布"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>散点 + 标注区（标准体重范围）</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart
              type="scatter"
              :series="[
                {
                  name: '样本',
                  data: [
                    [161, 51],
                    [167, 63],
                    [172, 70],
                    [175, 75],
                    [180, 82],
                    [158, 48],
                    [163, 55],
                    [170, 65],
                    [177, 78],
                    [185, 88],
                    [160, 50],
                    [168, 60],
                    [173, 68],
                    [178, 80],
                    [182, 85],
                    [155, 45],
                    [165, 58],
                    [171, 72],
                    [176, 76],
                    [183, 90],
                  ],
                },
              ]"
              :dark-mode="darkMode"
              :mark-area="[{ from: 55, to: 75, label: '标准', color: 'rgba(34,173,95,0.08)' }]"
              title="体重分布"
              palette="forest"
            />
          </div>
        </div>
      </div>
    </Card>

    <!-- 状态 & 参数演示 -->
    <Card title="参数演示" style="margin-bottom: 20px">
      <div class="chart-grid">
        <div class="chart-cell">
          <h4>Loading 加载态</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart
              type="bar"
              :categories="months"
              :series="lineSeries"
              :dark-mode="darkMode"
              loading
              title="数据加载中..."
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>空数据 emptyText</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart type="line" :dark-mode="darkMode" empty-text="暂无可用数据" />
          </div>
        </div>
        <div class="chart-cell">
          <h4>自定义色板 colors + 无图例 showLegend=false</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart
              type="pie"
              :data="{ pieData }"
              :dark-mode="darkMode"
              title="自定义配色"
              :colors="['#8B5CF6', '#EC4899', '#F97316', '#06B6D4', '#10B981']"
              :show-legend="false"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>无标题无图例 + 阶梯折线 smooth=false</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart
              type="line"
              :categories="days"
              :series="[{ name: '销量', data: [120, 200, 150, 80, 70, 110, 130] }]"
              :dark-mode="darkMode"
              :show-legend="false"
              :smooth="false"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>隐藏数据点 showSymbol=false</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart
              type="area"
              :categories="months"
              :series="areaSeries"
              :dark-mode="darkMode"
              :show-symbol="false"
              title="纯面积"
            />
          </div>
        </div>
        <div class="chart-cell">
          <h4>完整 option 模式 — 直接传入 ECharts 配置</h4>
          <div class="chart-wrap" style="height: 360px">
            <Chart
              :dark-mode="darkMode"
              :option="{
                title: { text: '自定义 Option', left: 'center', textStyle: { fontSize: 13 } },
                xAxis: { type: 'category', data: ['A', 'B', 'C', 'D', 'E'] },
                yAxis: { type: 'value' },
                series: [{ type: 'bar', data: [35, 62, 48, 79, 55], itemStyle: { borderRadius: [6, 6, 0, 0] } }],
              }"
            />
          </div>
        </div>
      </div>
    </Card>

    <!-- Props 表格 -->
    <Card title="Props">
      <table class="props-table">
        <thead>
          <tr>
            <th>Prop</th>
            <th>类型</th>
            <th>默认值</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>type</code></td>
            <td>ChartType</td>
            <td>—</td>
            <td>图表类型（16种见下方）</td>
          </tr>
          <tr>
            <td><code>option</code></td>
            <td>EChartsOption</td>
            <td>—</td>
            <td>完整 ECharts 配置（传入后忽略简化 props）</td>
          </tr>
          <tr>
            <td><code>data</code></td>
            <td>ChartData</td>
            <td>{}</td>
            <td>完整数据对象（pieData / radarIndicators / sankeyNodes 等专用字段）</td>
          </tr>
          <tr>
            <td><code>categories</code></td>
            <td>string[]</td>
            <td>[]</td>
            <td>X 轴类目标签</td>
          </tr>
          <tr>
            <td><code>series</code></td>
            <td>ChartSeriesItem[]</td>
            <td>[]</td>
            <td>系列数据，每项可设 name / data / color / type 等</td>
          </tr>
          <tr>
            <td><code>height</code></td>
            <td>number | string</td>
            <td>'100%'</td>
            <td>图表高度，数字自动补 px，字符串原样（如 '300px' / '100%'）</td>
          </tr>
          <tr>
            <td><code>width</code></td>
            <td>number | string</td>
            <td>'100%'</td>
            <td>图表宽度，同上</td>
          </tr>
          <tr>
            <td><code>darkMode</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>暗色模式（ECharts dark 主题）</td>
          </tr>
          <tr>
            <td><code>colors</code></td>
            <td>string[]</td>
            <td>[]</td>
            <td>自定义色板，覆盖默认 16 色</td>
          </tr>
          <tr>
            <td><code>loading</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>加载中状态</td>
          </tr>
          <tr>
            <td><code>emptyText</code></td>
            <td>string</td>
            <td>'暂无数据'</td>
            <td>空数据提示文字</td>
          </tr>
          <tr>
            <td><code>title</code></td>
            <td>string</td>
            <td>''</td>
            <td>图表标题</td>
          </tr>
          <tr>
            <td><code>showLegend</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>显示图例</td>
          </tr>
          <tr>
            <td><code>showTooltip</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>显示提示浮层</td>
          </tr>
          <tr>
            <td><code>smooth</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>折线平滑（line/area）</td>
          </tr>
          <tr>
            <td><code>showSymbol</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>显示数据点标记（line/area）</td>
          </tr>
          <tr>
            <td><code>showDataLabel</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>数据点上显示数值</td>
          </tr>
          <tr>
            <td><code>horizontal</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>柱状图切换为条形图</td>
          </tr>
          <tr>
            <td><code>stacked</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>堆叠模式</td>
          </tr>
          <tr>
            <td><code>stacked100</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>百分比堆叠</td>
          </tr>
          <tr>
            <td><code>legendPosition</code></td>
            <td>string</td>
            <td>'bottom'</td>
            <td>图例位置：top/bottom/left/right</td>
          </tr>
          <tr>
            <td><code>xAxis</code></td>
            <td>AxisConfig</td>
            <td>—</td>
            <td>X 轴配置：{ title, min, max, labelRotate }</td>
          </tr>
          <tr>
            <td><code>yAxis</code></td>
            <td>AxisConfig</td>
            <td>—</td>
            <td>Y 轴配置：{ title, min, max }</td>
          </tr>
          <tr>
            <td><code>animation</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>加载动画开关</td>
          </tr>
          <tr>
            <td><code>animationDuration</code></td>
            <td>number</td>
            <td>800</td>
            <td>动画时长（毫秒）</td>
          </tr>
          <tr>
            <td><code>toolbar</code></td>
            <td>Array | false</td>
            <td>['saveAsImage','zoom']</td>
            <td>工具栏按钮，支持 saveAsImage/zoom/dataView</td>
          </tr>
          <tr>
            <td><code>colors</code></td>
            <td>string[]</td>
            <td>[]</td>
            <td>自定义色板（留空=默认16色）</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <!-- 图表类型速查 -->
    <Card title="图表类型速查" style="margin-top: 20px">
      <table class="props-table">
        <thead>
          <tr>
            <th>type 值</th>
            <th>名称</th>
            <th>常用数据字段</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>line</code></td>
            <td>折线图</td>
            <td>categories + series</td>
          </tr>
          <tr>
            <td><code>bar</code></td>
            <td>柱状图</td>
            <td>categories + series</td>
          </tr>
          <tr>
            <td><code>pie</code></td>
            <td>饼图</td>
            <td>pieData 或 series[0].data</td>
          </tr>
          <tr>
            <td><code>scatter</code></td>
            <td>散点图</td>
            <td>series (data 为 [x,y][] 数组)</td>
          </tr>
          <tr>
            <td><code>area</code></td>
            <td>面积图</td>
            <td>categories + series</td>
          </tr>
          <tr>
            <td><code>radar</code></td>
            <td>雷达图</td>
            <td>radarIndicators + series</td>
          </tr>
          <tr>
            <td><code>gauge</code></td>
            <td>仪表盘</td>
            <td>gaugeData</td>
          </tr>
          <tr>
            <td><code>funnel</code></td>
            <td>漏斗图</td>
            <td>series[0].data（含 name/value）</td>
          </tr>
          <tr>
            <td><code>heatmap</code></td>
            <td>热力图</td>
            <td>heatmapData + heatmapXCategories + heatmapYCategories</td>
          </tr>
          <tr>
            <td><code>treemap</code></td>
            <td>矩形树图</td>
            <td>treeData（层次结构）</td>
          </tr>
          <tr>
            <td><code>candlestick</code></td>
            <td>K 线图</td>
            <td>categories + candlestickData</td>
          </tr>
          <tr>
            <td><code>sankey</code></td>
            <td>桑基图</td>
            <td>sankeyNodes + sankeyLinks</td>
          </tr>
          <tr>
            <td><code>sunburst</code></td>
            <td>旭日图</td>
            <td>treeData（层次结构）</td>
          </tr>
          <tr>
            <td><code>graph</code></td>
            <td>关系图</td>
            <td>graphNodes + graphLinks</td>
          </tr>
          <tr>
            <td><code>boxplot</code></td>
            <td>箱线图</td>
            <td>categories + boxplotData</td>
          </tr>
          <tr>
            <td><code>mixed</code></td>
            <td>混合图表</td>
            <td>categories + series（每项设 type: 'bar'|'line'）</td>
          </tr>
          <tr>
            <td><code>waterfall</code></td>
            <td>瀑布图（🆕）</td>
            <td>categories + series（首列做基底）</td>
          </tr>
          <tr>
            <td><code>pictorialBar</code></td>
            <td>象形柱状（🆕）</td>
            <td>categories + series</td>
          </tr>
          <tr>
            <td><code>tree</code></td>
            <td>树图（🆕）</td>
            <td>treeData（层次结构）</td>
          </tr>
          <tr>
            <td><code>timeline</code></td>
            <td>时间轴（🆕）</td>
            <td>timelineData（时间点数组）</td>
          </tr>
          <tr>
            <td><code>wordCloud</code></td>
            <td>词云（🆕）</td>
            <td>series[0].data [{name, value}]</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <!-- 独立图例组件 -->
    <Card title="ChartLegend 独立图例组件" style="margin-top: 20px">
      <p style="font-size: 13px; color: var(--color-text-muted); margin-bottom: 12px">
        flex-wrap + gap 自然撑高，永不重叠。图例点击切换显隐，适合与 BaseChart 配合使用。
      </p>
      <div style="margin-bottom: 12px; display: flex; gap: 8px">
        <Button text="全选" variant="ghost" size="sm" @click="legendItems.forEach((i) => (i.visible = true))" />
        <Button text="全不选" variant="ghost" size="sm" @click="legendItems.forEach((i) => (i.visible = false))" />
      </div>
      <ChartLegend
        :items="legendItems"
        @toggle="
          (name) => {
            const it = legendItems.find((i) => i.name === name)
            if (it) it.visible = !it.visible
          }
        "
      />
      <div style="margin-top: 12px; font-size: 13px; color: var(--color-text-muted)">
        <span v-for="item in legendItems" :key="item.name" style="margin-right: 12px">
          <span :style="{ opacity: item.visible ? 1 : 0.3 }"
            >{{ item.name }}: {{ item.visible ? '显示' : '隐藏' }}</span
          >
        </span>
      </div>
      <p style="font-size: 12px; color: var(--color-text-muted); margin-top: 12px">
        <code>ChartLegend</code> Props: <code>items: { name, color, visible }[]</code> | Events:
        <code>@toggle(name: string)</code>
      </p>
    </Card>

    <!-- Events -->
    <Card title="Events" style="margin-top: 20px">
      <table class="props-table">
        <thead>
          <tr>
            <th>事件</th>
            <th>参数</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>chart-ready</code></td>
            <td>ECharts 实例</td>
            <td>图表初始化完成，可获取实例做高级操作</td>
          </tr>
          <tr>
            <td><code>click</code></td>
            <td>eventParams</td>
            <td>点击图表元素</td>
          </tr>
          <tr>
            <td><code>dblclick</code></td>
            <td>eventParams</td>
            <td>双击</td>
          </tr>
          <tr>
            <td><code>legendselectchanged</code></td>
            <td>eventParams</td>
            <td>图例选择变化</td>
          </tr>
          <tr>
            <td><code>datazoom</code></td>
            <td>eventParams</td>
            <td>区域缩放</td>
          </tr>
          <tr>
            <td><code>mouseover / mouseout</code></td>
            <td>eventParams</td>
            <td>鼠标移入/移出</td>
          </tr>
          <tr>
            <td><code>finished</code></td>
            <td>eventParams</td>
            <td>渲染完成</td>
          </tr>
        </tbody>
      </table>
    </Card>
  </div>
</template>

<style scoped>
.demo {
}
.demo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.demo-title {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 4px;
}
.demo-desc {
  color: var(--color-text-muted);
  margin-bottom: 16px;
  font-size: 14px;
}
.demo-desc code {
  background: var(--color-bg-alt);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 12px;
}
.dark-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
@media (max-width: 767px) {
  .chart-grid {
    grid-template-columns: 1fr;
  }
}

.chart-cell {
  padding: 8px 10px;
  background: var(--color-bg);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  min-width: 0;
  overflow: hidden;
}
.chart-cell h4 {
  margin: 0 0 4px 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  font-weight: 600;
}

.chart-wrap {
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.props-table {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}
.props-table th {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 2px solid var(--color-border);
}
.props-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--color-border-light);
}
.props-table code {
  background: var(--color-bg-alt);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
}
</style>
