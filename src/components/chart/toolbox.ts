/**
 * chartToolbox — ECharts toolbox 的合并与让位（#460 从 BaseChart.vue 拆出）
 *
 * 三条不变量（都是踩过的坑，注释随代码一起搬）：
 *   1. **合并而不覆盖**：用户自设的 toolbox 优先，feature 逐键合并；
 *   2. **让位**：toolbar 画在 canvas 上时，grid.top 必须下移一行（仅当用户没自设 grid.top）；
 *   3. **有标题才下移**：判断必须看 title 是否**真的有文本**，不能看键是否存在
 *      （builder 会留 `title: ''`），否则工具栏正好压在图上。
 *
 * timeline 复合形态是 `{ baseOption, options: [...] }`：`options` 与 baseOption 同级，
 * 各时间点的子 option 也要各自让位。
 */
import type { EChartsOption, ToolboxComponentOption } from 'echarts'

export type ToolbarFeature = 'saveAsImage' | 'zoom' | 'dataView' | 'restore'

export const TB_TOP_DEFAULT = 4
export const TB_TOP_TITLED = 36

export interface ToolboxI18n {
  saveImage: string
  zoomRegion: string
  zoomBack: string
  dataView: string
}

/** canvas 浮层工具栏配置（HTML 工具行模式下返回 undefined，由宿主上方 HTML 行承载） */
export function buildToolbox(
  toolbar: ToolbarFeature[] | false | undefined,
  useHtmlToolbar: boolean,
  i18n: ToolboxI18n,
): ToolboxComponentOption | undefined {
  if (toolbar === false) return undefined
  if (useHtmlToolbar) return undefined
  const buttons = toolbar || ['saveAsImage', 'zoom']
  const feature: NonNullable<ToolboxComponentOption['feature']> = {}
  if (buttons.includes('saveAsImage')) feature.saveAsImage = { title: i18n.saveImage }
  if (buttons.includes('zoom')) feature.dataZoom = { title: { zoom: i18n.zoomRegion, back: i18n.zoomBack } }
  if (buttons.includes('dataView')) feature.dataView = { title: i18n.dataView, readOnly: true }
  return { show: true, right: 4, top: 4, feature }
}

/**
 * 给图区让出工具栏那一行。仅当用户未自设 grid.top 时兜底，尊重自定义。
 * **纯函数**：返回新对象，从不 mutate 入参（调用方忘记用返回值曾是真实 bug）。
 */
export function reserveToolboxBand<T extends Record<string, unknown>>(target: T, toolboxTop: number): T {
  const needed = Math.round(toolboxTop + 32) // 工具栏行高 ~24 + 8 呼吸
  const g = target.grid as Record<string, unknown> | undefined
  if (g && g.top != null) return target // 用户自设 grid.top，不动
  return { ...target, grid: g ? { ...g, top: needed } : { top: needed } }
}

/**
 * option 里是否**真的有标题文本**。
 * 不能用 `'title' in opt`：builder 写的是 `title: p.title`（空标题也留键），
 * 按"键存在"判定会把"无标题"当"有标题" → 工具栏下移 36px 而 grid.top 仍是 16px → 压图。
 */
export function hasTitleText(target: Record<string, unknown>): boolean {
  const title = target.title as unknown
  if (!title) return false // 含 ''、null、undefined
  if (typeof title === 'string') return title.trim().length > 0
  if (Array.isArray(title)) return title.some((x) => !!(x as { text?: unknown } | null)?.text)
  return !!(title as { text?: unknown }).text
}

/** 合并 toolbar 到 option（合并而非覆盖用户自定义的 toolbox 配置），standard 与 timeline 两种形态都支持 */
export function mergeToolbox(
  opt: EChartsOption | null,
  deps: { toolbar: ToolbarFeature[] | false | undefined; useHtmlToolbar: boolean; i18n: ToolboxI18n },
): EChartsOption | null {
  if (!opt) return opt
  const toolbox = buildToolbox(deps.toolbar, deps.useHtmlToolbar, deps.i18n)
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
    const reservedBo = reserveToolboxBand(bo, boToolTop)
    // ECharts timeline 复合形态是 `{ baseOption, options: [...] }` —— options 是 baseOption 的兄弟
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
