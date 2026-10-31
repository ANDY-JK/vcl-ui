<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import Chart from '@/components/chart/Chart.vue'
import { useT } from '@/components/_internal/i18n'
import type { Column } from '@/components/data/composables/types'
import type { ChartProps } from './utils/types'
import type { ECElementEvent, ECharts } from 'echarts'
import { DEFAULT_ANIMATION_MS } from './options/common'

// DataTable 动态加载：chart 域不再静态依赖 data 域（M15），
// 表格部分独立成 chunk，仅 showTable 为 true 时才拉取
const DataTable = defineAsyncComponent(() => import('@/components/data/DataTable.vue'))

const t = useT()

// Props 逐一声明以保留 IDE 类型提示，未用 $attrs 透传
const props = withDefaults(
  defineProps<{
    /** 同 Chart：图表类型（chart:表格 上下组合的上半部分） */
    type?: ChartProps['type']
    /** 同 Chart：原生 ECharts option */
    option?: ChartProps['option']
    /** 同 Chart：快捷数据 */
    data?: ChartProps['data']
    /** 同 Chart：X 轴类目 */
    categories?: string[]
    /** 同 Chart：快捷多序列 */
    series?: ChartProps['series']
    /** 同 Chart：ECharts 内置 dark 主题 */
    darkMode?: boolean
    /** 同 Chart：自定义系列颜色 */
    colors?: string[]
    /** 同 Chart：图表标题 */
    title?: string
    /** 同 Chart：显示图例（初始值，之后由表头按钮控制） */
    showLegend?: boolean
    /** 同 Chart：显示悬浮提示 */
    showTooltip?: boolean
    /** 同 Chart：折线平滑 */
    smooth?: boolean
    /** 同 Chart：数据点符号 */
    showSymbol?: boolean
    /** 同 Chart：数据点数值标签 */
    showDataLabel?: boolean
    /** 同 Chart：条形图（X/Y 互换） */
    horizontal?: boolean
    /** 同 Chart：堆叠 */
    stacked?: boolean
    /** 同 Chart：百分比堆叠 */
    stacked100?: boolean
    /** 同 Chart：图例位置（默认 'bottom'） */
    legendPosition?: ChartProps['legendPosition']
    /** 同 Chart：X 轴配置 */
    xAxis?: ChartProps['xAxis']
    /** 同 Chart：Y 轴配置 */
    yAxis?: ChartProps['yAxis']
    /** 同 Chart：动画开关 */
    animation?: boolean
    /** 同 Chart：动画时长（毫秒） */
    animationDuration?: number
    /** 同 Chart：工具栏按钮 */
    toolbar?: ChartProps['toolbar']
    /** 同 Chart：内置色板预设 */
    palette?: ChartProps['palette']
    /** 同 Chart：标注线（均值线/目标线/警戒线） */
    markLine?: ChartProps['markLine']
    /** 同 Chart：标注区域（高亮区间） */
    markArea?: ChartProps['markArea']
    /** 下半部分表格列定义（DataTable Column 结构） */
    columns?: Column[]
    /** 下半部分表格数据 */
    tableData?: Record<string, any>[]
    /** 显示表格区（初始值，之后由按钮控制；默认开） */
    showTable?: boolean
    /** 表格区标题 */
    tableTitle?: string
    /** 表格行键字段（默认 'rank'） */
    rowKey?: string
    /** 图表区占容器高度比例 0-1（默认 0.45，其余给表格） */
    chartRatio?: number
  }>(),
  {
    darkMode: false,
    showLegend: true,
    showTooltip: true,
    smooth: true,
    showSymbol: true,
    showDataLabel: false,
    horizontal: false,
    stacked: false,
    stacked100: false,
    legendPosition: 'bottom',
    animation: true,
    animationDuration: DEFAULT_ANIMATION_MS,
    toolbar: () => ['saveAsImage', 'zoom'],
    showTable: true,
    tableTitle: '',
    rowKey: 'rank',
    chartRatio: 0.45,
    columns: () => [],
    tableData: () => [],
  },
)

const emit = defineEmits<{
  // echarts 主入口导出这两个类型（UMD re-export types/dist/echarts）
  /** 图表元素点击（透传 ECharts 事件） */
  'chart-click': [params: ECElementEvent]
  /** ECharts 实例就绪 */
  'chart-ready': [instance: ECharts]
}>()

// 图例/表格本地开关（初始值来自 prop，之后由按钮控制）
const showLegendLocal = ref(props.showLegend)
const showTableLocal = ref(props.showTable)

// 百分比取整到 2 位：(1-0.45)*100 浮点尾差会产出 55.00000000000001% 混进 style
const pct = (v: number) => `${Math.round(v * 100) / 100}%`
const chartWidth = computed(() => (showTableLocal.value ? pct(props.chartRatio * 100) : '100%'))
const tableWidth = computed(() => (showTableLocal.value ? pct((1 - props.chartRatio) * 100) : '0%'))

// 图表最低宽度
const CHART_MIN_W = 200
// 表格每列最低约 60px（与 DataTable headerMinW 对齐）+ 内边距
const tableMinWidth = computed(() => {
  if (!props.columns?.length) return 180
  return props.columns.length * 60 + 16
})
// 复合最低宽度 = 图表最低 + 表格最低 + 间距，避免图表被过度压缩
const rootMinW = computed(() => {
  if (!showTableLocal.value) return CHART_MIN_W
  return CHART_MIN_W + tableMinWidth.value + 20 // 20 = body gap + table padding
})

// ResizeObserver：监听根容器，放不下时自动纵向堆叠（图表上+表格下）
const rootRef = ref<HTMLDivElement>()
const isVertical = ref(false)
let _ro: ResizeObserver | null = null
let _roPending = false
let _winResizeFallback: (() => void) | null = null

function checkLayout() {
  if (!rootRef.value) return
  const w = rootRef.value.clientWidth
  isVertical.value = showTableLocal.value && w > 0 && w < rootMinW.value
}

onMounted(() => {
  if (rootRef.value) {
    // 环境降级：无 ResizeObserver（旧 WebView）时先判断一次 + 监听 window resize，
    // 否则旋转屏幕/拖拽分栏后图表-表格堆叠方向永不更新（BaseChart.vue 同款兜底）
    if (typeof ResizeObserver !== 'undefined') {
      _ro = new ResizeObserver(() => {
        if (_roPending) return
        _roPending = true
        requestAnimationFrame(() => {
          _roPending = false
          checkLayout()
        })
      })
      _ro.observe(rootRef.value)
    } else {
      checkLayout()
      _winResizeFallback = () => checkLayout()
      window.addEventListener('resize', _winResizeFallback)
    }
  }
})

onUnmounted(() => {
  _ro?.disconnect()
  _ro = null
  if (_winResizeFallback) {
    window.removeEventListener('resize', _winResizeFallback)
    _winResizeFallback = null
  }
})

function onChartClick(p: ECElementEvent) {
  emit('chart-click', p)
}
function onChartReady(inst: ECharts) {
  emit('chart-ready', inst)
}
</script>

<template>
  <div ref="rootRef" class="ct-root">
    <div class="ct-header">
      <!-- @slot header: 图表头部区域；不传则回退 tableTitle 属性标题 -->
      <slot name="header">
        <span v-if="tableTitle" class="ct-title">{{ tableTitle }}</span>
      </slot>
      <div class="ct-toggles">
        <button
          type="button"
          class="ct-toggle"
          :class="{ off: !showLegendLocal }"
          @click="showLegendLocal = !showLegendLocal"
        >
          🏷️{{ showLegendLocal ? t('chart.legend') : t('chart.off') }}
        </button>
        <button
          type="button"
          class="ct-toggle"
          :class="{ off: !showTableLocal }"
          @click="showTableLocal = !showTableLocal"
        >
          📋{{ showTableLocal ? t('chart.table') : t('chart.off') }}
        </button>
      </div>
    </div>

    <div class="ct-body" :class="{ vertical: isVertical }">
      <div class="ct-chart" :style="{ width: chartWidth, minWidth: CHART_MIN_W + 'px' }">
        <Chart
          :type="type"
          :option="option"
          :data="data"
          :categories="categories"
          :series="series"
          :dark-mode="darkMode"
          :colors="colors"
          :title="title"
          :show-legend="showLegendLocal"
          :show-tooltip="showTooltip"
          :smooth="smooth"
          :show-symbol="showSymbol"
          :show-data-label="showDataLabel"
          :horizontal="horizontal"
          :stacked="stacked"
          :stacked100="stacked100"
          :legend-position="legendPosition"
          :x-axis="xAxis"
          :y-axis="yAxis"
          :animation="animation"
          :animation-duration="animationDuration"
          :toolbar="toolbar"
          :palette="palette"
          :mark-line="markLine"
          :mark-area="markArea"
          @click="onChartClick"
          @chart-ready="onChartReady"
        />
      </div>
      <div v-if="showTableLocal" class="ct-table" :style="{ width: tableWidth }">
        <DataTable :columns="columns" :data="tableData" :row-key="rowKey" :striped="true" dense auto-height />
      </div>
    </div>

    <div v-if="$slots.footer" class="ct-footer">
      <!-- @slot footer: 图表底部扩展区域（仅传入时渲染） -->
      <slot name="footer" />
    </div>
  </div>
</template>

<style src="./chart-table-scoped.css" scoped></style>
