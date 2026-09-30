<script setup lang="ts">
import { reportWarn } from '@/components/_internal/runtime-observer'
// ⛔ 保护 — 图表基础组件，禁止：clamp() → px，canvas resize 逻辑，ECharts dispose
//    需我确认：loading/error slot、主题配置、toolbar 默认按钮
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { init } from './utils/echarts-setup'
import type { EChartsOption } from 'echarts'
import type { BaseChartProps } from './utils/types'
import { toSize } from './utils/chart-utils'
import { useT } from '@/components/_internal/i18n'

const t = useT()

const props = withDefaults(
  defineProps<
    BaseChartProps & {
      /** 工具栏按钮（saveAsImage 保存图片 / zoom 区域缩放 / dataView 数据视图），传 false 全关 */
      toolbar?: Array<'saveAsImage' | 'zoom' | 'dataView'> | false
    }
  >(),
  {
    /** 原生 ECharts option（必传，null 时渲染空态） */
    option: null,
    /** 加载态（showLoading 蒙层） */
    loading: false,
    /** 空数据文案 */
    emptyText: '',
    /** 容器高（默认 '100%' 随父容器） */
    height: '100%',
    /** 容器宽（默认 '100%'） */
    width: '100%',
    /** ECharts 内置 dark 主题 */
    darkMode: false,
    toolbar: () => ['saveAsImage', 'zoom'],
  },
)

const chartRef = ref<HTMLDivElement>()
let chartInstance: ReturnType<typeof init> | null = null
let resizeObserver: ResizeObserver | null = null

const containerStyle = computed(() => ({
  width: toSize(props.width, '100%'),
  height: toSize(props.height, 'clamp(280px, 50vh, 480px)'),
}))

const showEmpty = computed(() => {
  if (props.loading) return false
  if (!props.option) return true
  const opt = props.option as Record<string, unknown>

  // Timeline compound option: 检查 baseOption 和 options 数组
  const baseOption = opt.baseOption as Record<string, unknown> | undefined
  if (baseOption) {
    const optionsArr = opt.options as unknown[] | undefined
    return !optionsArr?.length
  }

  // Standard option
  const series = opt.series as unknown[] | undefined
  const hasSeries = !!series?.length
  const dataset = opt.dataset as Record<string, unknown> | undefined
  const source = dataset?.source as unknown[] | undefined
  const hasDataset = !!source && source.length > 1
  return !hasSeries && !hasDataset
})

/** 无障碍：从 option.title 提取图表名称，作为容器 aria-label（读屏把 canvas 当图片朗读） */
const emptyText = computed(() => props.emptyText || t('common.empty'))
const ariaLabel = computed(() => {
  const opt = props.option as Record<string, unknown> | null
  const title = opt?.title as string | Record<string, unknown> | Array<Record<string, unknown>> | undefined
  if (!title) return emptyText.value
  if (typeof title === 'string') return title
  if (Array.isArray(title)) {
    const texts = title.map((t) => t?.text).filter(Boolean) as string[]
    return texts.length ? texts.join('、') : emptyText.value
  }
  const text = title.text
  return text ? String(text) : emptyText.value
})

/** 构建 toolbar 配置 */
function buildToolbox(): import('echarts').ToolboxComponentOption | undefined {
  if (props.toolbar === false) return undefined
  const buttons = props.toolbar || ['saveAsImage', 'zoom']
  const feature: NonNullable<import('echarts').ToolboxComponentOption['feature']> = {}
  if (buttons.includes('saveAsImage')) feature.saveAsImage = { title: t('chart.saveImage') }
  if (buttons.includes('zoom')) feature.dataZoom = { title: { zoom: t('chart.zoomRegion'), back: t('chart.zoomBack') } }
  if (buttons.includes('dataView')) feature.dataView = { title: t('chart.dataView'), readOnly: true }
  return { show: true, right: 4, top: 4, feature }
}

/** 合并 toolbar 到 option（合并而非覆盖用户自定义的 toolbox 配置）
 * 支持 standard option 和 timeline compound option ({ baseOption, options })
 */
function mergeToolbox(opt: EChartsOption | null): EChartsOption | null {
  if (!opt) return opt
  const toolbox = buildToolbox()
  if (!toolbox) return opt

  // Timeline compound option: toolbox 挂到 baseOption 内部
  const compound = opt as unknown as { baseOption?: Record<string, unknown> }
  if (compound.baseOption) {
    const bo = compound.baseOption
    if ('title' in bo) toolbox.top = 36
    const userToolbox = bo.toolbox as Record<string, unknown> | undefined
    const mergedToolbox = userToolbox
      ? {
          ...toolbox,
          ...userToolbox,
          feature: { ...toolbox.feature, ...(userToolbox.feature as Record<string, unknown>) },
        }
      : toolbox
    return { ...opt, baseOption: { ...bo, toolbox: mergedToolbox } } as EChartsOption
  }

  // Standard option
  if ('title' in opt) toolbox.top = 36
  const userToolbox = (opt as Record<string, unknown>).toolbox as Record<string, unknown> | undefined
  const mergedToolbox = userToolbox
    ? {
        ...toolbox,
        ...userToolbox,
        feature: { ...toolbox.feature, ...(userToolbox.feature as Record<string, unknown>) },
      }
    : toolbox
  return { ...opt, toolbox: mergedToolbox } as EChartsOption
}

function ensureInstance() {
  if (!chartRef.value) return
  const el = chartRef.value
  // 任一维度为 0 则跳过，等 ResizeObserver 通知
  if (el.clientWidth === 0 || el.clientHeight === 0) return

  if (chartInstance && !chartInstance.isDisposed()) {
    // 实例已存在，仅 resize
    chartInstance.resize()
    return
  }

  // 创建新实例
  const theme = props.darkMode ? 'dark' : undefined
  try {
    chartInstance = init(el, theme)
  } catch (e) {
    reportWarn('[BaseChart] ECharts 初始化失败:', e)
    return
  }
  if (!chartInstance) return
  const opt = mergeToolbox(props.option)
  if (opt) {
    // Compound option (timeline) 不支持 notMerge:true，会破坏 Timeline 组件内部状态
    const isCompound = !!(opt as Record<string, unknown>).baseOption
    try {
      chartInstance.setOption(opt, isCompound ? false : true)
    } catch (e) {
      // ECharts Timeline compound option 在某些版本有内部 bug（ondraw/layoutInstance 错误）
      // 降级：去掉 compound 结构，仅渲染第一个 option 的内容
      if (isCompound) {
        const compound = opt as unknown as { baseOption?: Record<string, unknown>; options?: unknown[] }
        const fallbackOpt = (compound.options?.[0] || compound.baseOption) as EChartsOption | undefined
        if (fallbackOpt) {
          try {
            chartInstance.setOption(mergeToolbox(fallbackOpt)!, true)
          } catch {
            /* 最终降级失败，放弃渲染 */
          }
        }
      } else {
        reportWarn('[BaseChart] setOption 失败:', e)
      }
    }
  }
  if (props.loading) {
    chartInstance.showLoading()
  }
}

function destroyInstance() {
  if (chartInstance && !chartInstance.isDisposed()) {
    chartInstance.dispose()
  }
  chartInstance = null
}

let _roPending = false
function setupObserver() {
  if (!chartRef.value) return
  if (resizeObserver) resizeObserver.disconnect()
  // 环境降级：无 ResizeObserver（旧 Safari/WebView）时退化为 window resize
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (_roPending) return
      _roPending = true
      requestAnimationFrame(() => {
        _roPending = false
        ensureInstance()
      })
    })
    resizeObserver.observe(chartRef.value)
  }
}

// option 变化
watch(
  () => props.option,
  (val) => {
    if (chartInstance && !chartInstance.isDisposed()) {
      if (val) {
        const merged = mergeToolbox(val)!
        const isCompound = !!(merged as Record<string, unknown>).baseOption
        try {
          // 普通更新用合并模式 + replaceMerge：notMerge:true 会让图例切换等常规更新
          // 全量重建坐标系，用户拖过的 dataZoom 被重置回起点。replaceMerge:['series']
          // 防止新旧系列名不同时旧 series 残留
          if (isCompound) {
            chartInstance.setOption(merged, false)
          } else {
            chartInstance.setOption(merged, { notMerge: false, lazyUpdate: true, replaceMerge: ['series'] })
          }
        } catch {
          // compound option 出错时降级为第一个子 option
          if (isCompound) {
            const compound = merged as unknown as { baseOption?: Record<string, unknown>; options?: unknown[] }
            const fallbackOpt = (compound.options?.[0] || compound.baseOption) as EChartsOption | undefined
            if (fallbackOpt) {
              try {
                chartInstance.setOption(mergeToolbox(fallbackOpt)!, true)
              } catch {
                /* give up */
              }
            }
          }
        }
      } else {
        chartInstance.clear()
      }
    } else if (val) {
      ensureInstance()
    }
  },
)

// loading 变化
watch(
  () => props.loading,
  (val) => {
    if (!chartInstance || chartInstance.isDisposed()) return
    if (val) chartInstance.showLoading()
    else chartInstance.hideLoading()
  },
)

// darkMode 变化：重建实例
watch(
  () => props.darkMode,
  () => {
    destroyInstance()
    nextTick(() => ensureInstance())
  },
)

onMounted(() => {
  nextTick(() => {
    ensureInstance()
    setupObserver()
    // 无 ResizeObserver 的环境：用 window resize 兜底
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', ensureInstance)
    }
  })
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', ensureInstance)
  destroyInstance()
})

defineExpose({
  /** 原始 ECharts 实例（只读访问，调用前判空） */
  get chart() {
    return chartInstance
  },
  /** 获取当前 option 副本 */
  getOption() {
    return chartInstance?.getOption()
  },
  /** 设置 option（内部会自动注入 toolbox 配置） */
  setOption(opt: EChartsOption, opts?: { notMerge?: boolean; replaceMerge?: string[] }) {
    if (!chartInstance || chartInstance.isDisposed()) return
    // 检查 DOM 元素是否仍然挂载（避免在 Vue 重新渲染后操作已替换的 canvas）
    if (!chartRef.value || !chartRef.value.isConnected) return
    try {
      chartInstance.setOption(mergeToolbox(opt)!, opts)
    } catch {
      /* 静默降级：ECharts 在 DOM 被替换后 setOption 可能出错 */
    }
  },
  /** 重新计算尺寸（容器变化时调用） */
  resize(opts?: { width?: number; height?: number; silent?: boolean }) {
    chartInstance?.resize(opts)
  },
  /** 派发图表行为（showTip / highlight / dispatch 等） */
  dispatchAction(payload: Record<string, unknown>) {
    chartInstance?.dispatchAction(payload as import('echarts/types/dist/shared').Payload)
  },
  /** 清空当前实例所有内容（保留实例） */
  clear() {
    chartInstance?.clear()
  },
  /** 显示加载动画 */
  showLoading(type?: string, opts?: Record<string, unknown>) {
    chartInstance?.showLoading(type, opts)
  },
  /** 隐藏加载动画 */
  hideLoading() {
    chartInstance?.hideLoading()
  },
})
</script>

<template>
  <div ref="chartRef" class="base-chart" :style="containerStyle" role="img" :aria-label="ariaLabel">
    <!-- 空数据遮罩 -->
    <div v-if="showEmpty" class="chart-empty-overlay" role="status">
      <span class="chart-empty-text">{{ emptyText }}</span>
    </div>
  </div>
</template>

<style scoped>
.base-chart {
  position: relative;
  overflow: visible;
  min-width: 0;
  min-height: 0;
}

.chart-empty-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg);
  opacity: 0.85;
  border-radius: var(--radius-md);
  z-index: 1;
}

.chart-empty-text {
  font-size: calc(15px * var(--vcl-scale));
  color: var(--color-text-muted);
}
</style>
