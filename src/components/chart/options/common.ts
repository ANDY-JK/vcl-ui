// ⛔ 保护 — 图表公共配置，禁止：DEFAULT_COLORS 色板删除，textColor/mutedColor 逻辑
//    需我确认：色板值修改、grid 间距调整
import type { EChartsOption, DataZoomComponentOption } from 'echarts'
import type { BuildParams, MarkLineConfig, MarkAreaConfig } from '../utils/types'
import type { ChartOption } from '@/components/_internal/api-any'

/** 图表默认动画时长（组件的 prop 默认值与 options 兜底共用一份） */
export const DEFAULT_ANIMATION_MS = 800

/** 默认色板 —— 对齐项目 CSS 变量主色系 */
export const DEFAULT_COLORS = [
  '#4F6EF7',
  '#22AD5F',
  '#F59E0B',
  '#E54545',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#10B981',
  '#F97316',
  '#6366F1',
  '#14B8A6',
  '#D946EF',
  '#0EA5E9',
  '#84CC16',
  '#EAB308',
  '#A855F7',
]

/** 内置色板预设 —— 对标 Excel 配色方案 */
export const PALETTE_PRESETS: Record<string, string[]> = {
  default: DEFAULT_COLORS,
  ocean: ['#0077B6', '#00B4D8', '#90E0EF', '#CAF0F8', '#03045E', '#023E8A', '#0096C7', '#48CAE4'],
  forest: ['#2D6A4F', '#40916C', '#52B788', '#95D5B2', '#1B4332', '#74C69D', '#A7C957', '#386641'],
  sunset: ['#FF6B35', '#F7C59F', '#EFEFD0', '#004E89', '#1A659E', '#F25F5C', '#FFB347', '#70C1B3'],
  midnight: ['#7B2FBE', '#4A00E0', '#8E2DE2', '#C33764', '#1D267D', '#0C134F', '#5C469C', '#D4ADFC'],
  pastel: ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#D4BAFF', '#FFB3E6', '#B3FFE0'],
}

/** 获取文字颜色（适配深浅主题） */
export function textColor(p: BuildParams): string {
  return p.darkMode ? '#E0E0E0' : '#505560'
}

/** 获取辅助文字颜色（适配深浅主题） */
export function mutedColor(p: BuildParams): string {
  return p.darkMode ? '#888' : '#5F6672'
}

/** 根据预设名称获取色板，fallback 为默认 */
export function resolvePalette(palette: string | undefined, customColors: string[]): string[] {
  if (customColors.length > 0) return customColors
  if (palette && PALETTE_PRESETS[palette]) return PALETTE_PRESETS[palette]
  return DEFAULT_COLORS
}

/** 根据 legendPosition 返回 legend 位置配置 */
export function resolveLegendPosition(pos: BuildParams['legendPosition']): ChartOption {
  const vertical = pos === 'left' || pos === 'right'
  if (vertical) {
    return pos === 'left'
      ? { left: 0, top: 'middle', orient: 'vertical' }
      : { right: 0, top: 'middle', orient: 'vertical' }
  }
  return pos === 'top' ? { top: 0 } : { bottom: 0 }
}

/**
 * 构建图例配置（共享 — 所有 chart builder 统一使用）
 * 防重叠策略：大 itemGap + 内边距 + 长名称截断 + >10条自动右侧竖排
 */
export function buildLegendConfig(
  data: string[],
  showLegend: boolean,
  position: BuildParams['legendPosition'] = 'bottom',
  p: BuildParams,
): { option: ChartOption | undefined; effectivePosition: BuildParams['legendPosition'] } {
  const empty = { option: undefined, effectivePosition: position }
  if (!showLegend || data.length === 0) return empty

  const userVertical = position === 'left' || position === 'right'
  // 智能策略：>10条且用户未指定垂直位置 → 自动右侧竖排
  const autoVertical = !userVertical && data.length > 10
  const effectivePosition: BuildParams['legendPosition'] = autoVertical ? 'right' : position
  const isVertical = effectivePosition === 'left' || effectivePosition === 'right'

  // 长名称 formatter（>8字自动截断），不改 data 以保持点击切换匹配
  const maxNameLen = 8
  const hasLongNames = data.some((n: string) => n.length > maxNameLen)

  const baseStyle = {
    data: data as (string | number)[],
    textStyle: {
      color: textColor(p),
      fontSize: 12,
      fontFamily: 'sans-serif',
      // 统一限制单项文本宽度，防止单个长名称挤爆行宽导致重叠
      width: hasLongNames ? 90 : 110,
      overflow: 'truncate' as const,
    },
    itemWidth: 14,
    itemHeight: 10,
    itemGap: 24,
    padding: [8, 16] as [number, number],
  }

  if (isVertical) {
    const vertPos =
      effectivePosition === 'left'
        ? { left: 0, top: 'middle', orient: 'vertical' as const }
        : { right: 0, top: 'middle', orient: 'vertical' as const }
    return {
      option: {
        ...baseStyle,
        ...vertPos,
        ...(data.length > 15 ? { type: 'scroll' as const, height: '65%' } : {}),
      },
      effectivePosition,
    }
  }

  // 水平图例（顶部/底部）：大 gap + padding 防重叠，ECharts 原生换行
  return {
    option: {
      ...baseStyle,
      left: 'center',
      ...(effectivePosition === 'top' ? { top: 0 } : { bottom: 0 }),
    },
    effectivePosition,
  }
}

/** 构建标注线 markLine 配置 */
export function buildMarkLine(ml: MarkLineConfig | MarkLineConfig[] | undefined): Record<string, unknown> | undefined {
  if (!ml) return undefined
  const items = Array.isArray(ml) ? ml : [ml]
  return {
    silent: true,
    symbol: 'none',
    data: items.map((m: MarkLineConfig) => {
      if (m.type)
        return {
          type: m.type,
          name: m.label || m.type,
          lineStyle: m.color ? { color: m.color, type: 'dashed' } : { type: 'dashed' },
        }
      return {
        yAxis: m.value,
        name: m.label || String(m.value ?? ''),
        lineStyle: m.color ? { color: m.color, type: 'dashed' } : { type: 'dashed' },
      }
    }),
  }
}

/** 构建标注区域 markArea 配置 */
export function buildMarkArea(ma: MarkAreaConfig | MarkAreaConfig[] | undefined): Record<string, unknown> | undefined {
  if (!ma) return undefined
  const items = Array.isArray(ma) ? ma : [ma]
  return {
    silent: true,
    data: items.map((a: MarkAreaConfig) => [
      { yAxis: a.from, itemStyle: { color: a.color || 'rgba(79,110,247,0.08)' } },
      { yAxis: a.to },
    ]),
  }
}

/**
 * 智能默认值：检测是否需要旋转 X 轴标签
 * 规则：任意分类名超过 4 个字符 → 自动旋转 45°
 */
export function autoLabelRotate(categories: string[]): number {
  const hasLong = categories.some((c) => c && c.length > 4)
  return hasLong ? 45 : 0
}

/**
 * 智能默认值：检测是否需要 dataZoom
 * 规则：数据点数超过 50 个 → 自动开启底部滑动条
 */
export function autoDataZoom(
  categories: string[],
  darkMode: boolean,
): DataZoomComponentOption | DataZoomComponentOption[] | undefined {
  if (categories.length <= 50) return undefined
  return [
    {
      type: 'slider',
      start: 0,
      end: categories.length <= 100 ? 100 : Math.floor(10000 / categories.length),
      height: 20,
      bottom: 0,
      textStyle: { color: darkMode ? '#E0E0E0' : '#505560' },
    },
  ]
}

/**
 * 智能默认值：单系列自动隐藏 legend
 * 规则：用户未显式设置 showLegend 且只有 1 条系列 → 不显示 legend
 */
export function smartLegend(showLegend: boolean, seriesCount: number): boolean {
  if (!showLegend) return false
  return seriesCount > 1
}

/**
 * tooltip 动态方向：避免被父容器截断
 * appendToBody 确保渲染在 document.body 层级
 * position 函数动态避开边缘
 */
// tooltip 的 position 回调：echarts 只导出回调签名不导出这几个内部参数类型
// （DOM/rect/size 都是它运行时传的），且本实现一个都不用（下划线前缀），故 unknown
function buildTooltip(showTooltip: boolean, trigger: 'axis' | 'item' = 'axis'): Record<string, unknown> | undefined {
  if (!showTooltip) return undefined
  return {
    trigger,
    appendToBody: true,
    position: function (
      point: [number, number],
      _params: unknown,
      _dom: unknown,
      _rect: unknown,
      size: { contentSize: [number, number]; viewSize: [number, number] },
    ): [number, number] {
      const [x, y] = point
      const [tw, th] = size.contentSize
      const [vw, vh] = size.viewSize
      // 默认右下方
      let px = x + 14
      let py = y + 14
      // 右侧溢出 → 左侧
      if (px + tw > vw - 4) px = x - tw - 14
      // 底部溢出 → 上方
      if (py + th > vh - 4) py = y - th - 14
      // 左边界保护
      if (px < 4) px = 4
      // 上边界保护
      if (py < 4) py = 4
      return [px, py] as [number, number]
    },
  }
}

/** 构建公共外层：title / tooltip / grid / color / animation（图例由 ChartLegend 独立渲染） */
export function buildCommonChrome(p: BuildParams): EChartsOption {
  const seriesNames = p.series.map((s) => s.name).filter(Boolean) as string[]
  const dataZoom = autoDataZoom(p.categories, p.darkMode)

  // grid 填满（无 ECharts legend 占位）
  const gridTop = p.title ? 44 : 16
  const gridBottom = dataZoom ? 50 : 30
  const gridLeft = 50
  const gridRight = 50

  return {
    backgroundColor: 'transparent' as const,
    color: resolvePalette(p.palette, p.colors),
    animation: p.animation ?? true,
    animationDuration: p.animationDuration ?? DEFAULT_ANIMATION_MS,
    dataZoom,
    title: p.title
      ? {
          text: p.title,
          left: 'center',
          top: 4,
          textStyle: { fontSize: 14, color: textColor(p), fontWeight: 600 },
        }
      : undefined,
    tooltip: buildTooltip(p.showTooltip),
    // ⛔ legend.show:false — 保内部状态，ChartLegend 的 legendToggleSelect 依赖它
    legend: { show: false, data: seriesNames as string[] },
    grid: {
      left: gridLeft,
      right: gridRight,
      bottom: gridBottom,
      top: gridTop,
      show: true,
      borderColor: p.darkMode ? '#444' : '#C0C4CC',
      borderWidth: 1,
    },
  }
}

/* ================================================================
   强制标尺——组件内置行为，外部不可覆盖
   ================================================================ */

/** 构建 X 轴（category），强制 splitLine + axisTick + 实线 */
export function buildXAxis(p: BuildParams, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'category',
    data: p.categories as (string | number)[],
    axisLabel: {
      color: mutedColor(p),
      rotate: extra?.labelRotate ?? p.xAxis?.labelRotate ?? autoLabelRotate(p.categories),
    },
    axisTick: { show: true, alignWithLabel: true },
    splitLine: { show: true, lineStyle: { color: p.darkMode ? '#444' : '#C0C4CC', type: 'solid', width: 1 } },
    name: extra?.name ?? p.xAxis?.title,
    ...(extra || {}),
  }
}

/** 构建 Y 轴（value），强制 splitLine + axisTick + 实线 */
export function buildYAxis(p: BuildParams, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'value',
    axisLabel: { color: mutedColor(p) },
    axisTick: { show: true },
    splitLine: { show: true, lineStyle: { color: p.darkMode ? '#444' : '#C0C4CC', type: 'solid', width: 1 } },
    name: extra?.name ?? p.yAxis?.title,
    min: extra?.min ?? p.yAxis?.min,
    max: extra?.max ?? p.yAxis?.max,
    ...(extra || {}),
  }
}
