<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import Chart from '@/components/chart/Chart.vue'
import DataTable from '@/components/data/DataTable.vue'
import type { Column } from '@/components/data/composables/types'
import type { ChartProps } from './types'

// Props 逐一声明以保留 IDE 类型提示，未用 $attrs 透传
const props = withDefaults(defineProps<{
  type?: ChartProps['type']; option?: ChartProps['option']; data?: ChartProps['data']
  categories?: string[]; series?: ChartProps['series']; darkMode?: boolean
  colors?: string[]; title?: string; showLegend?: boolean; showTooltip?: boolean
  smooth?: boolean; showSymbol?: boolean; showDataLabel?: boolean
  horizontal?: boolean; stacked?: boolean; stacked100?: boolean
  legendPosition?: ChartProps['legendPosition']
  xAxis?: ChartProps['xAxis']; yAxis?: ChartProps['yAxis']
  animation?: boolean; animationDuration?: number
  toolbar?: ChartProps['toolbar']; palette?: ChartProps['palette']
  markLine?: ChartProps['markLine']; markArea?: ChartProps['markArea']
  columns?: Column[]; tableData?: Record<string, any>[]
  showTable?: boolean; tableTitle?: string; rowKey?: string; chartRatio?: number
}>(), {
  darkMode: false, showLegend: true, showTooltip: true, smooth: true, showSymbol: true,
  showDataLabel: false, horizontal: false, stacked: false, stacked100: false,
  legendPosition: 'bottom', animation: true, animationDuration: 800,
  toolbar: () => ['saveAsImage','zoom'], showTable: true, tableTitle: '', rowKey: 'rank',
  chartRatio: 0.45, columns: () => [], tableData: () => [],
})

const emit = defineEmits<{
  'chart-click': [params: any]
  'chart-ready': [instance: any]
}>()

// 图例/表格本地开关（初始值来自 prop，之后由按钮控制）
const showLegendLocal = ref(props.showLegend)
const showTableLocal = ref(props.showTable)

const chartWidth = computed(() => showTableLocal.value ? `${props.chartRatio * 100}%` : '100%')
const tableWidth = computed(() => showTableLocal.value ? `${(1 - props.chartRatio) * 100}%` : '0%')

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

function checkLayout() {
  if (!rootRef.value) return
  const w = rootRef.value.clientWidth
  isVertical.value = showTableLocal.value && w > 0 && w < rootMinW.value
}

onMounted(() => {
  if (rootRef.value) {
    // 环境降级：无 ResizeObserver 时先做一次布局判断，后续依赖窗口 resize
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
    }
  }
})

onUnmounted(() => {
  _ro?.disconnect()
  _ro = null
})

function onChartClick(p: any) { emit('chart-click', p) }
function onChartReady(inst: any) { emit('chart-ready', inst) }
</script>

<template>
  <div ref="rootRef" class="ct-root">
    <div class="ct-header">
      <slot name="header">
        <span v-if="tableTitle" class="ct-title">{{ tableTitle }}</span>
      </slot>
      <div class="ct-toggles">
        <button class="ct-toggle" :class="{ off: !showLegendLocal }" @click="showLegendLocal = !showLegendLocal">
          🏷️{{ showLegendLocal ? '图例' : '关' }}
        </button>
        <button class="ct-toggle" :class="{ off: !showTableLocal }" @click="showTableLocal = !showTableLocal">
          📋{{ showTableLocal ? '表格' : '关' }}
        </button>
      </div>
    </div>

    <div class="ct-body" :class="{ vertical: isVertical }">
      <div class="ct-chart" :style="{ width: chartWidth, minWidth: CHART_MIN_W + 'px' }">
        <Chart
          :type="type" :option="option" :data="data"
          :categories="categories" :series="series" :dark-mode="darkMode"
          :colors="colors" :title="title" :show-legend="showLegendLocal" :show-tooltip="showTooltip"
          :smooth="smooth" :show-symbol="showSymbol" :show-data-label="showDataLabel"
          :horizontal="horizontal" :stacked="stacked" :stacked100="stacked100"
          :legend-position="legendPosition" :x-axis="xAxis" :y-axis="yAxis"
          :animation="animation" :animation-duration="animationDuration"
          :toolbar="toolbar" :palette="palette"
          :mark-line="markLine" :mark-area="markArea"
          @click="onChartClick" @chart-ready="onChartReady"
        />
      </div>
      <div v-if="showTableLocal" class="ct-table" :style="{ width: tableWidth }">
        <DataTable :columns="columns" :data="tableData" :row-key="rowKey"
          :striped="true" dense autoHeight />
      </div>
    </div>

    <div v-if="$slots.footer" class="ct-footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.ct-root { display:flex; flex-direction:column; height:100%; min-height:240px; width:100%; container-type:inline-size; }
.ct-header { display:flex; align-items:center; justify-content:space-between; padding-bottom: var(--space-2); flex-shrink:0; }
.ct-title { font-size:14px; font-weight:600; }
.ct-toggles { display:flex; align-items:center; gap: var(--space-1); margin-left:auto; }
.ct-toggle { display:flex; align-items:center; gap:3px; padding: var(--space-1) 8px; border-radius: var(--radius-lg); border:1px solid var(--color-border); background:var(--color-bg); font-size:11px; cursor:pointer; white-space:nowrap; }
.ct-toggle:hover { border-color:var(--color-primary); }
.ct-toggle.off { opacity:0.4; }
.ct-body { flex:1; display:flex; gap: var(--space-2); min-height:0; min-width:0; }
.ct-chart { height:100%; min-height:200px; min-width:200px; }
.ct-table { height:100%; min-height:200px; min-width:180px; overflow:auto; padding-left: var(--space-1); }
.ct-footer { flex-shrink:0; padding-top: var(--space-2); }
/* 放不下时纵向堆叠 */
.ct-body.vertical { flex-direction:column; gap: var(--space-2); }
.ct-body.vertical .ct-chart { width:100%!important; height:50%; min-width:0; }
.ct-body.vertical .ct-table { width:100%!important; height:50%; padding-left:0; padding-top: var(--space-2); }
</style>
