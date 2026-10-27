<script setup lang="ts">
import { reportEvent } from '@/components/_internal/runtime-observer'
// ⛔ 保护 — 图表基础组件，禁止：clamp() → px，canvas resize 逻辑，ECharts dispose
//    需我确认：loading/error slot、主题配置、toolbar 默认按钮
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { init } from './utils/echarts-setup'
import type { EChartsOption } from 'echarts'
import type { BaseChartProps } from './utils/types'
import { toSize } from './utils/chart-utils'
import { useT } from '@/components/_internal/i18n'
import IconSvg from '@/components/basic/IconSvg.vue'

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

/**
 * 实例"换新"的响应式印记（每次创建/销毁 +1）。
 *
 * 为什么需要它（第 156 轮）：`chartInstance` 是普通闭包变量，**不是响应式状态** ——
 * 父组件 `watch(() => baseChartRef.value?.chart, …)` 只在 getter 的其他依赖变化时才重新求值，
 * 于是"实例从无到有"这一步**观察不到**：父组件的 `bindEvents()` 与 `chart-ready` 事件
 * 双双落空（实测文档列出的 click/datazoom/finished 等事件一个都不发）。
 * 暴露一个自增印记，把"实例换新"变成可 watch 的信号（不改变实例本身的读写语义）。
 */
const instanceSeq = ref(0)

const containerStyle = computed(() => ({
  width: toSize(props.width, '100%'),
  height: toSize(props.height, 'clamp(280px, 50vh, 480px)'),
}))

/** 工具栏承载方式：默认 saveAsImage/zoom 走「图上方 HTML 行」（不压图）；含 dataView 时保留 ECharts canvas 浮层。
 *  之前工具栏画在 canvas 内右上角、与图区重叠——改为独立一行上移。 */
const useHtmlToolbar = computed(() => Array.isArray(props.toolbar) && !props.toolbar.includes('dataView'))

interface ToolBtn {
  key: string
  action: 'saveAsImage' | 'zoom' | 'restore'
  icon: string
  label: string
}
const toolBtns = computed<ToolBtn[]>(() => {
  if (!useHtmlToolbar.value || !Array.isArray(props.toolbar)) return []
  const list: ToolBtn[] = []
  for (const f of props.toolbar) {
    if (f === 'saveAsImage')
      list.push({ key: 'save', action: 'saveAsImage', icon: 'download', label: t('chart.saveImage') })
    if (f === 'zoom') {
      list.push({ key: 'zoom', action: 'zoom', icon: 'zoom-in', label: t('chart.zoomRegion') })
      list.push({ key: 'restore', action: 'restore', icon: 'rotate-ccw', label: t('chart.zoomBack') })
    }
  }
  return list
})

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

function onTool(action: ToolBtn['action']) {
  const inst = chartInstance
  if (!inst) return
  if (action === 'saveAsImage') {
    const bg = props.darkMode ? '#1f2937' : '#ffffff'
    const url = inst.getDataURL({ pixelRatio: 2, backgroundColor: bg })
    const a = document.createElement('a')
    a.href = url
    a.download = `${(ariaLabel.value || 'chart').replace(/[^\w\u4e00-\u9fa5-]/g, '')}.png`
    a.click()
  } else if (action === 'zoom') {
    // 放大：聚焦到中部区域（无 dataZoom 的图无副作用）
    inst.dispatchAction({ type: 'dataZoom', start: 25, end: 75 })
  } else {
    inst.dispatchAction({ type: 'restore' })
  }
}

/** 构建 toolbar 配置 */
function buildToolbox(): import('echarts').ToolboxComponentOption | undefined {
  if (props.toolbar === false) return undefined
  // HTML 工具行模式（默认 saveAsImage/zoom）：canvas 不画浮层工具栏，改由图上方 HTML 行承载，避免压图
  if (useHtmlToolbar.value) return undefined
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
/** 给图区让出工具栏那一行：工具栏画在 canvas 上（right:4 横排 3 图标，顶 ~24px），
 * 默认图区会顶到工具栏下方 → 重叠。仅当用户未自设 grid.top 时兜底，尊重自定义。
 * 返回新对象（不 mutate 入参——option 可能是 computed/引用，避免污染源）。 */
function reserveToolboxBand<T extends Record<string, unknown>>(target: T, toolboxTop: number): T {
  const needed = Math.round(toolboxTop + 32) // 工具栏行高 ~24 + 8 呼吸
  const g = target.grid as Record<string, unknown> | undefined
  if (g && g.top != null) return target // 用户自设 grid.top，不动
  return { ...target, grid: g ? { ...g, top: needed } : { top: needed } }
}

const TB_TOP_DEFAULT = 4
const TB_TOP_TITLED = 36

/**
 * option 里是否**真的有标题文本**。
 *
 * ⚠️ 不能用 `'title' in opt`：各 builder 写的是 `title: p.title`
 * （`p.title = props.title || ''`），**空标题也留一个 title 键**。
 * 按"键存在"判定就把"无标题"当成"有标题" → toolbox 下移 36px，
 * 而 grid.top 仍是 builder 给的 16px → 工具栏正好压在图上
 * （`reserveToolboxBand` 存在的意义就是防这个，被绕过了）。第 155 轮修。
 */
function hasTitleText(target: Record<string, unknown>): boolean {
  const title = target.title as unknown
  if (!title) return false // 含 ''、null、undefined
  if (typeof title === 'string') return title.trim().length > 0
  if (Array.isArray(title)) return title.some((x) => !!(x as { text?: unknown } | null)?.text)
  return !!(title as { text?: unknown }).text
}

function mergeToolbox(opt: EChartsOption | null): EChartsOption | null {
  if (!opt) return opt
  const toolbox = buildToolbox()
  if (!toolbox) return opt

  // Timeline compound option: toolbox 挂到 baseOption 内部
  const compound = opt as unknown as { baseOption?: Record<string, unknown> }
  if (compound.baseOption) {
    const bo = { ...compound.baseOption }
    const boToolTop = hasTitleText(bo) ? TB_TOP_TITLED : TB_TOP_DEFAULT
    if (hasTitleText(bo)) toolbox.top = TB_TOP_TITLED
    const userToolbox = bo.toolbox as Record<string, unknown> | undefined
    const mergedToolbox = userToolbox
      ? {
          ...toolbox,
          ...userToolbox,
          feature: { ...toolbox.feature, ...(userToolbox.feature as Record<string, unknown>) },
        }
      : toolbox
    // ⚠️ `reserveToolboxBand` 是**纯函数**（返回新对象、从不 mutate 入参）——
    // 原来这里丢掉了返回值，等于 timeline 复合图的"让位"从未生效（第 155 轮修）。
    const reservedBo = reserveToolboxBand(bo, boToolTop)
    // ⚠️ ECharts timeline 复合形态是 `{ baseOption, options: [...] }` —— `options` 是
    // baseOption 的**兄弟**，不是它的属性（本文件 `showEmpty` 读的也是顶层 `opt.options`）。
    // 此前读 `bo.options` 恒为 undefined → 各时间点的子 option 从未让位。第 155 轮修。
    const timelineChild = (opt as unknown as { options?: unknown }).options
    const childOptions = Array.isArray(timelineChild)
      ? (timelineChild as Array<Record<string, unknown>>).map((o) =>
          reserveToolboxBand({ ...o }, hasTitleText(o) ? TB_TOP_TITLED : boToolTop),
        )
      : timelineChild
    return {
      ...opt,
      options: childOptions,
      baseOption: { ...reservedBo, toolbox: mergedToolbox },
    } as EChartsOption
  }

  // Standard option
  const stdToolTop = hasTitleText(opt) ? TB_TOP_TITLED : TB_TOP_DEFAULT
  if (hasTitleText(opt)) toolbox.top = TB_TOP_TITLED
  const userToolbox = (opt as Record<string, unknown>).toolbox as Record<string, unknown> | undefined
  const mergedToolbox = userToolbox
    ? {
        ...toolbox,
        ...userToolbox,
        feature: { ...toolbox.feature, ...(userToolbox.feature as Record<string, unknown>) },
      }
    : toolbox
  return { ...reserveToolboxBand(opt as Record<string, unknown>, stdToolTop), toolbox: mergedToolbox } as EChartsOption
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
    reportEvent('chart/init-failed', '[BaseChart] ECharts 初始化失败:', { error: String(e) }, 'error')
    return
  }
  if (!chartInstance) return
  instanceSeq.value++ // 实例就绪 → 通知父组件（可 watch）
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
        reportEvent('chart/set-option-failed', '[BaseChart] setOption 失败:', { error: String(e) }, 'error')
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
  // 这里**不**再自增 instanceSeq：销毁本身没有消费方 —— 父组件 watch 到的
  // `chart` 为 null 也不能做什么，而"重建"必然由新实例的自增覆盖。
  // （第 156 轮：先写了销毁也自增，负向对照证明它不可被任何断言捕获 → 撤掉，
  //   没有消费方的信号不留，免得下一位读者以为"对称才正确"。）
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
  /** 实例换新印记（自增；每次创建/销毁变化一次）——给父组件 watch 用，见文件内说明 */
  get instanceSeq() {
    return instanceSeq.value
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
  <div class="base-chart-frame" :style="containerStyle" role="img" :aria-label="ariaLabel">
    <!-- 图上方 HTML 工具行（下载/放大/还原）：与图区分行，不再压在 canvas 上 -->
    <div v-if="toolBtns.length" class="chart-toolbar">
      <button
        v-for="b in toolBtns"
        :key="b.key"
        type="button"
        class="chart-tool-btn"
        :title="b.label"
        :aria-label="b.label"
        @click="onTool(b.action)"
      >
        <!-- 2026-10-02 纯图标（用户偏好），悬停 title/aria-label 给出语义 -->
        <IconSvg :type="b.icon" size="sm" />
      </button>
    </div>
    <div ref="chartRef" class="base-chart">
      <!-- 空数据遮罩 -->
      <div v-if="showEmpty" class="chart-empty-overlay" role="status">
        <span class="chart-empty-text">{{ emptyText }}</span>
      </div>
    </div>
  </div>
</template>

<style src="./base-chart-scoped.css" scoped></style>
