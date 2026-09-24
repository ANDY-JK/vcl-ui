<script lang="ts">
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：emptyText 默认值工厂在 setup 之前执行（defineProps 被提升），不能引用 setup 局部变量 */
const t = useT()
</script>

<script setup lang="ts">
// ⛔ 保护 — 图表封装，禁止：clamp() → px，ECharts 初始化逻辑，resize 监听删除
//    需我确认：ChartType 类型扩展、color palette 默认值
import { computed, ref, watch, onUnmounted } from 'vue'
import type { EChartsOption, ECElementEvent } from 'echarts'
import BaseChart from './BaseChart.vue'
import ChartLegend from './ChartLegend.vue'
import { buildChartOption } from './options'
import { ensureWordCloud } from './utils/echarts-setup'
import { DEFAULT_COLORS } from './options/common'
import type { ChartProps, ChartData, BuildParams, ChartSeriesItem } from './utils/types'
import { toSize } from './utils/chart-utils'
import { DEFAULT_ANIMATION_MS } from './options/common'

const props = withDefaults(defineProps<ChartProps>(), {
  type: undefined,
  option: undefined,
  data: () => ({}),
  categories: () => [],
  series: () => [],
  height: '100%',
  width: '100%',
  darkMode: false,
  colors: () => [],
  loading: false,
  emptyText: () => t('common.empty'),
  title: '',
  showLegend: true,
  showTooltip: true,
  smooth: true,
  showSymbol: true,
  showDataLabel: false,
  horizontal: false,
  stacked: false,
  stacked100: false,
  legendPosition: 'bottom',
  xAxis: undefined,
  yAxis: undefined,
  animation: true,
  animationDuration: DEFAULT_ANIMATION_MS,
  toolbar: () => ['saveAsImage', 'zoom'],
  palette: undefined,
  markLine: undefined,
  markArea: undefined,
})

const emit = defineEmits<{
  /** ECharts 实例就绪（拿到实例可做 setOption/dispose 等深度定制） */
  'chart-ready': [instance: ReturnType<typeof import('echarts').init>]
  /** 元素点击（透传 ECharts 事件，params 为点击目标信息） */
  click: [params: ECElementEvent]
  /** 元素双击 */
  dblclick: [params: ECElementEvent]
  /** 元素按下 */
  mousedown: [params: ECElementEvent]
  /** 元素抬起 */
  mouseup: [params: ECElementEvent]
  /** 元素悬停进入 */
  mouseover: [params: ECElementEvent]
  /** 元素悬停离开 */
  mouseout: [params: ECElementEvent]
  /** 画布空白处点击（全局坐标系） */
  globalout: [params: ECElementEvent]
  /** 右键 */
  contextmenu: [params: ECElementEvent]
  /** 图例选中态变化（含取消选中） */
  legendselectchanged: [params: ECElementEvent]
  /** 数据缩放（dataZoom 组件拖动/缩放） */
  datazoom: [params: ECElementEvent]
  /** 渲染完成一帧 */
  finished: [params: ECElementEvent]
}>()

const baseChartRef = ref<InstanceType<typeof BaseChart>>()

/* ================================================================
   极简推断
   ================================================================ */

function inferChartData(raw: unknown): { categories: string[]; series: ChartSeriesItem[] } | null {
  if (!raw) return null

  if (Array.isArray(raw) && raw.every((v) => typeof v === 'number')) {
    return { categories: raw.map((_, i) => `${i + 1}`), series: [{ name: '', data: raw }] }
  }
  if (Array.isArray(raw) && raw.every((v) => Array.isArray(v))) {
    const maxLen = Math.max(...raw.map((a: unknown[]) => a.length))
    return {
      categories: Array.from({ length: maxLen }, (_, i) => `${i + 1}`),
      series: raw.map((arr: number[], i: number) => ({ name: t('chart.seriesFallback', { n: i + 1 }), data: arr })),
    }
  }
  if (Array.isArray(raw) && raw.every((v) => typeof v === 'object' && v !== null && ('name' in v || 'value' in v))) {
    return {
      categories: raw.map((d) => String((d as Record<string, unknown>).name ?? '')),
      series: [{ name: '', data: raw.map((d) => (d as Record<string, unknown>).value ?? 0) }],
    }
  }
  return null
}

function validateData(categories: string[], series: ChartSeriesItem[]): void {
  for (const s of series) {
    if (s.data && Array.isArray(s.data) && categories.length > 0 && s.data.length !== categories.length) {
      console.warn(
        `[Chart] 系列 "${s.name}" 数据长度(${s.data.length})与分类数(${categories.length})不一致，ECharts 将自动处理不等长数据`,
      )
    }
  }
}

/* ================================================================
   构建 option — ECharts 内置图例关闭，由 ChartLegend 接管
   ================================================================ */

const resolvedOption = computed<EChartsOption | null>(() => {
  if (props.option) return props.option

  if (!props.type && !props.series?.length && !props.categories?.length) {
    const inferred = inferChartData(props.data)
    if (inferred) {
      return buildChartOption('bar', buildParams(inferred.categories, inferred.series))
    }
    return null
  }

  if (!props.type) return null
  const dataObj = props.data as ChartData | undefined
  const cats = props.categories?.length ? props.categories : dataObj?.categories || []
  const srs = props.series?.length ? props.series : dataObj?.series || []
  validateData(cats, srs)
  return buildChartOption(props.type, buildParams(cats, srs))
})

function buildParams(categories: string[], series: ChartSeriesItem[]): BuildParams {
  return {
    type: props.type || 'bar',
    categories,
    series,
    data: (props.data as ChartData) || {},
    title: props.title || '',
    showLegend: false, // ⛔ ECharts 内置图例关闭
    showTooltip: props.showTooltip ?? true,
    smooth: props.smooth ?? true,
    showSymbol: props.showSymbol ?? true,
    colors: props.colors || [],
    darkMode: props.darkMode ?? false,
    showDataLabel: props.showDataLabel,
    horizontal: props.horizontal,
    stacked: props.stacked,
    stacked100: props.stacked100,
    legendPosition: props.legendPosition,
    xAxis: props.xAxis,
    yAxis: props.yAxis,
    animation: props.animation,
    animationDuration: props.animationDuration,
    palette: props.palette,
    markLine: props.markLine,
    markArea: props.markArea,
    // 大数据降采样透传（未配置时由各 builder 按点数阈值自动决定）
    sampling: (props as Record<string, unknown>).sampling as BuildParams['sampling'],
  }
}

/* ================================================================
   ChartLegend 数据 + 交互
   ================================================================ */

const hiddenSeries = ref<Set<string>>(new Set())

/**
 * 最终渲染 option：应用 HTML 图例隐藏状态。
 * ECharts 内置图例被 showLegend:false 关闭，legendToggleSelect 对无 legend 的
 * series 是空操作（空系列名/饼图数据项场景均失效），改为隐藏系列数据后重新
 * setOption 控制显隐。浅拷贝即可 —— option 含函数字段（如 tooltip.position），
 * 不能用 structuredClone。
 * wordCloudReady 作为依赖：当 echarts-wordcloud 异步加载完成后，
 * 触发 computed 重新计算 → BaseChart setOption → wordCloud series 正确渲染。
 */
const chartOption = computed<EChartsOption | null>(() => {
  // 读取 wordCloudReady 触发依赖（wordCloud 模块异步加载完成后重新计算）
  void wordCloudReady.value
  const opt = resolvedOption.value
  const hidden = hiddenSeries.value
  if (!opt || hidden.size === 0) return opt
  const rawSeries = opt.series
  if (!Array.isArray(rawSeries)) return opt
  const seriesArr = rawSeries.map((s) => ({ ...s })) as Array<Record<string, unknown>>
  const isItemLegend = props.type === 'pie' || props.type === 'funnel'
  for (let i = 0; i < seriesArr.length; i++) {
    const s = seriesArr[i]
    const data = s.data
    if (!Array.isArray(data)) continue
    if (isItemLegend) {
      // 饼图/漏斗：图例项对应 series[0].data 数据项 → 过滤掉隐藏项
      // 注意：兜底名必须与 legendItems 的 t('chart.itemFallback') 一致，否则点击图例无法隐藏对应项
      s.data = data.filter((d, di) => {
        const name = String(
          typeof d === 'object' && d !== null
            ? ((d as { name?: string }).name ?? t('chart.itemFallback', { n: di + 1 }))
            : t('chart.itemFallback', { n: di + 1 }),
        )
        return !hidden.has(name)
      })
    } else if (hidden.has(String(s.name ?? t('chart.seriesFallback', { n: i + 1 })))) {
      // 常规系列：按名称置空数据实现隐藏
      s.data = []
    }
  }
  return { ...opt, series: seriesArr } as unknown as EChartsOption
})

const legendItems = computed(() => {
  if (!props.showLegend || !resolvedOption.value) return []
  const opt = resolvedOption.value as Record<string, unknown>
  const colors: string[] = (opt.color as string[]) || DEFAULT_COLORS
  const seriesArr = (opt.series as Record<string, unknown>[]) || []

  // 饼图 / 漏斗：从 series[0].data 提取各数据项名
  if ((props.type === 'pie' || props.type === 'funnel') && Array.isArray(seriesArr[0]?.data)) {
    return (seriesArr[0].data as Record<string, unknown>[]).map((d, i: number) => {
      const name = String(
        typeof d === 'object'
          ? (d.name ?? t('chart.itemFallback', { n: i + 1 }))
          : t('chart.itemFallback', { n: i + 1 }),
      )
      return {
        name,
        color: colors[i % colors.length] || '#999',
        visible: !hiddenSeries.value.has(name),
      }
    })
  }

  // 雷达：每个 series 是一个系列
  return seriesArr.map((s: Record<string, unknown>, i: number) => {
    const name = String(s.name ?? t('chart.seriesFallback', { n: i + 1 }))
    return {
      name,
      color: colors[i % colors.length] || '#999',
      visible: !hiddenSeries.value.has(name),
    }
  })
})

function onLegendToggle(name: string) {
  // 同步本地状态（chartOption 依赖它重新 setOption 控制系列显隐）
  const s = new Set(hiddenSeries.value)
  if (s.has(name)) s.delete(name)
  else s.add(name)
  hiddenSeries.value = s
  emitLegendSelectChanged()
}

function onLegendToggleAll(visible: boolean) {
  if (visible) {
    // 全部显示：清空 hidden
    hiddenSeries.value = new Set()
  } else {
    // 全部隐藏：将所有图例项加入 hidden
    hiddenSeries.value = new Set(legendItems.value.map((i) => i.name))
  }
  emitLegendSelectChanged()
}

function emitLegendSelectChanged() {
  const selected: Record<string, boolean> = {}
  for (const item of legendItems.value) selected[item.name] = item.visible
  ;(emit as (event: string, ...args: unknown[]) => void)('legendselectchanged', {
    type: 'legendselectchanged',
    selected,
  })
}

function bindEvents() {
  const instance = baseChartRef.value?.chart
  if (!instance || instance.isDisposed()) return
  const events = [
    'click',
    'dblclick',
    'mousedown',
    'mouseup',
    'mouseover',
    'mouseout',
    'globalout',
    'contextmenu',
    'legendselectchanged',
    'datazoom',
    'finished',
  ] as const
  for (const name of events) {
    instance.off(name)
    const handler = (params: unknown) => {
      if (name === 'legendselectchanged' && typeof params === 'object' && params !== null && 'selected' in params) {
        const p = params as { selected: Record<string, boolean> }
        const h = new Set<string>()
        for (const [key, val] of Object.entries(p.selected)) {
          if (!val) h.add(key)
        }
        hiddenSeries.value = h
      }
      ;(emit as (event: string, ...args: unknown[]) => void)(name, params)
    }
    instance.on(name as string, handler)
  }
}

// wordCloud 图表类型按需加载 echarts-wordcloud 模块（~30KB gzip）
// 其他类型不需要此模块，避免增加首屏 bundle
// 加载完成后 wordCloudReady=true → :key 变化 → BaseChart 重新创建 → 自动 setOption
const wordCloudReady = ref(false)
let _isMounted = true
onUnmounted(() => {
  _isMounted = false
})
watch(
  () => props.type,
  async (t) => {
    if (t === 'wordCloud') {
      await ensureWordCloud()
      if (!_isMounted) return
      // wordCloudReady 变化触发 :key 变化 → BaseChart 重新挂载 → 自动渲染 wordCloud
      wordCloudReady.value = true
    } else {
      wordCloudReady.value = false
    }
  },
  { immediate: true },
)

// 监听实例变化（覆盖 mount/type/darkMode 所有重建场景）
watch(
  () => baseChartRef.value?.chart,
  (inst, _old) => {
    if (inst && !inst.isDisposed()) {
      bindEvents()
      ;(emit as (event: string, ...args: unknown[]) => void)('chart-ready', inst)
    }
  },
)

defineExpose({
  /** 原始 ECharts 实例（透传自 BaseChart） */
  get chart() {
    return baseChartRef.value?.chart
  },
  /** 获取当前 option 副本 */
  getOption() {
    return baseChartRef.value?.getOption()
  },
  /** 设置 option（透传给 BaseChart，会自动注入 toolbox） */
  setOption(opt: EChartsOption, opts?: { notMerge?: boolean; replaceMerge?: string[] }) {
    baseChartRef.value?.setOption(opt, opts)
  },
  /** 重新计算尺寸 */
  resize(opts?: { width?: number; height?: number; silent?: boolean }) {
    baseChartRef.value?.resize(opts)
  },
  /** 派发图表行为（showTip / highlight 等） */
  dispatchAction(payload: Record<string, unknown>) {
    baseChartRef.value?.dispatchAction(payload)
  },
  /** 清空当前实例所有内容（保留实例） */
  clear() {
    baseChartRef.value?.clear()
  },
  /** 显示加载动画 */
  showLoading(type?: string, opts?: Record<string, unknown>) {
    baseChartRef.value?.showLoading(type, opts)
  },
  /** 隐藏加载动画 */
  hideLoading() {
    baseChartRef.value?.hideLoading()
  },
})
</script>

<template>
  <div class="chart-root" :style="{ height: toSize(height, '100%'), width: toSize(width, '100%') }">
    <BaseChart
      ref="baseChartRef"
      :key="props.type === 'wordCloud' ? `wc-${wordCloudReady}` : 'chart'"
      class="chart-canvas-area"
      :option="props.type === 'wordCloud' && !wordCloudReady ? null : chartOption"
      height="100%"
      width="100%"
      :dark-mode="darkMode"
      :loading="loading"
      :empty-text="emptyText"
      :toolbar="toolbar"
    />
    <ChartLegend
      v-if="legendItems.length > 0"
      :items="legendItems"
      @toggle="onLegendToggle"
      @toggle-all="onLegendToggleAll"
    />
  </div>
</template>

<style scoped>
.chart-root {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.chart-canvas-area {
  flex: 1;
  min-height: clamp(80px, 20vw, 120px);
  min-width: 0;
}
</style>
