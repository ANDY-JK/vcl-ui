/* chartToolbox · 合并与让位三条不变量（#460）
 *
 * 从 BaseChart.vue 拆出的纯函数模块。三个坑都是真实回归：
 *   1. 合并而非覆盖（用户自设 toolbox 优先）；
 *   2. reserveToolboxBand 是纯函数（丢返回值曾让 timeline 让位从未生效）；
 *   3. 有标题才下移 —— 判据必须看 title 文本而不是键存在（builder 会留 title: ''）。
 */
import { describe, it, expect } from 'vitest'
import { buildToolbox, mergeToolbox, reserveToolboxBand, hasTitleText, TB_TOP_TITLED, TB_TOP_DEFAULT } from '@/components/chart/toolbox'
import type { EChartsOption } from 'echarts'

const i18n = { saveImage: 'save', zoomRegion: 'zoom', zoomBack: 'back', dataView: 'view' }
const deps = (toolbar: ('saveAsImage' | 'zoom' | 'dataView')[] | false | undefined, html = false) => ({
  toolbar,
  useHtmlToolbar: html,
  i18n,
})

describe('buildToolbox', () => {
  it('toolbar=false → 不生成；HTML 工具行模式 → 不画 canvas 浮层', () => {
    expect(buildToolbox(false, false, i18n)).toBeUndefined()
    expect(buildToolbox(['saveAsImage'], true, i18n)).toBeUndefined()
  })

  it('默认按钮 = saveAsImage + zoom；按需装配 feature 文案', () => {
    const tb = buildToolbox(undefined, false, i18n)!
    expect(tb.feature?.saveAsImage?.title).toBe('save')
    expect(tb.feature?.dataZoom).toEqual({ title: { zoom: 'zoom', back: 'back' } })
    expect(tb.feature?.dataView).toBeUndefined()
  })

  it('dataView 只读', () => {
    const tb = buildToolbox(['dataView'], false, i18n)!
    expect(tb.feature?.dataView).toEqual({ title: 'view', readOnly: true })
  })
})

describe('hasTitleText（键存在 ≠ 有文本）', () => {
  it('空串/空数组/null 都算无标题', () => {
    expect(hasTitleText({ title: '' })).toBe(false)
    expect(hasTitleText({ title: '   ' })).toBe(false)
    expect(hasTitleText({ title: [] })).toBe(false)
    expect(hasTitleText({ title: null })).toBe(false)
    expect(hasTitleText({})).toBe(false)
  })

  it('有文本（字符串/数组/对象）算有标题', () => {
    expect(hasTitleText({ title: '销量' })).toBe(true)
    expect(hasTitleText({ title: [{ text: 'A' }, {}] })).toBe(true)
    expect(hasTitleText({ title: { text: 'B' } })).toBe(true)
  })
})

describe('reserveToolboxBand（纯函数）', () => {
  it('无 grid → 新建 grid.top；有 grid 但无 top → 补齐', () => {
    expect(reserveToolboxBand({}, TB_TOP_DEFAULT)).toEqual({ grid: { top: 36 } })
    expect(reserveToolboxBand({ grid: { left: 8 } }, TB_TOP_DEFAULT)).toEqual({ grid: { left: 8, top: 36 } })
  })

  it('用户自设 grid.top → 原样返回（同一个引用），尊重自定义', () => {
    const src = { grid: { top: 60 } }
    expect(reserveToolboxBand(src, TB_TOP_DEFAULT)).toBe(src)
  })

  it('反向保护：不 mutate 入参', () => {
    const src: Record<string, unknown> = { grid: { left: 1 } }
    reserveToolboxBand(src, TB_TOP_TITLED)
    expect(src).toEqual({ grid: { left: 1 } }) // 入参未被写
  })
})

describe('mergeToolbox', () => {
  it('null option → 原样返回 null（不构造空对象）', () => {
    expect(mergeToolbox(null, deps(['saveAsImage']))).toBe(null)
  })

  it('无标题：toolbox.top 保持默认，grid.top 下移一格', () => {
    const out = mergeToolbox({ series: [] } as unknown as EChartsOption, deps(['saveAsImage']))!
    const o = out as unknown as { toolbox: { top: number }; grid: { top: number } }
    expect(o.toolbox.top).toBe(4)
    expect(o.grid.top).toBe(TB_TOP_DEFAULT + 32)
  })

  it('有标题：toolbox 下移到 36，grid 让位更多', () => {
    const out = mergeToolbox({ title: { text: 'T' }, series: [] } as unknown as EChartsOption, deps(['saveAsImage']))!
    const o = out as unknown as { toolbox: { top: number }; grid: { top: number } }
    expect(o.toolbox.top).toBe(TB_TOP_TITLED)
    expect(o.grid.top).toBe(TB_TOP_TITLED + 32)
  })

  it('合并而非覆盖：用户 toolbox 的键与 feature 逐项保留', () => {
    const out = mergeToolbox(
      { toolbox: { right: 99, feature: { myTool: { show: true } } }, series: [] } as unknown as EChartsOption,
      deps(['saveAsImage']),
    )!
    const o = out as unknown as { toolbox: { right: number; feature: Record<string, unknown> } }
    expect(o.toolbox.right).toBe(99) // 用户值优先
    expect(o.toolbox.feature.myTool).toEqual({ show: true })
    expect(o.toolbox.feature.saveAsImage).toBeTruthy() // 内置 feature 仍在
  })

  it('timeline 复合形态：baseOption 与各时间点子 option 各自让位（且 options 与 baseOption 同级）', () => {
    const out = mergeToolbox(
      {
        baseOption: { title: { text: 'timeline' }, series: [] },
        options: [{ series: [] }, { grid: { top: 80 }, series: [] }],
      } as unknown as EChartsOption,
      deps(['saveAsImage']),
    )!
    const o = out as unknown as {
      baseOption: { toolbox: unknown; grid: { top: number } }
      options: Array<{ grid?: { top: number } }>
    }
    expect(o.baseOption.toolbox).toBeTruthy()
    expect(o.baseOption.grid.top).toBe(TB_TOP_TITLED + 32)
    expect(o.options[0].grid?.top).toBe(TB_TOP_TITLED + 32) // 子 option 也让位
    expect(o.options[1].grid?.top).toBe(80) // 用户自设的不动
  })
})
