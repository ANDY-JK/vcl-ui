/**
 * chart/options/common.ts — 未覆盖的纯函数（2026-10-23）
 *
 * ## 为什么补
 *
 * 317 行 / 未覆盖 34 条（55.8%），已有 chart-options.spec.ts 测了 6 个，
 * 本文件补其余 9 个。都是纯函数，不依赖 DOM / ECharts 实例。
 *
 * ## 最该锁住的契约
 *
 *   · **resolvePalette 优先级：customColors > 预设 > DEFAULT_COLORS**
 *     （这是用户自定义色的唯一通道，优先级错了用户色会被预设吞掉）
 *   · **buildLegendConfig 的三条防重叠策略**：长名称截断（>8字）、
 *     >10 条自动右侧竖排（用户未指定位置时）、>15 条 scroll 模式
 *   · **resolveLegendPosition 四个方向的映射**
 *   · **textColor / mutedColor 的深浅主题切换**（受保护注释强调的语义）
 *   · **buildXAxis/buildYAxis 强制标尺**（splitLine + axisTick + solid）
 *     —— 注释明说「组件内置行为，外部不可覆盖」
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ANIMATION_MS,
  DEFAULT_COLORS,
  PALETTE_PRESETS,
  textColor,
  mutedColor,
  resolvePalette,
  resolveLegendPosition,
  buildLegendConfig,
  buildXAxis,
  buildYAxis,
} from '@/components/chart/options/common'
import type { BuildParams } from '@/components/chart/utils/types'

function p(over: Partial<BuildParams> = {}): BuildParams {
  return {
    type: 'bar',
    categories: ['A', 'B', 'C'],
    series: [{ name: 's1', data: [1, 2, 3] }],
    data: {},
    title: '',
    ...over,
  } as BuildParams
}

describe('常量', () => {
  it('DEFAULT_ANIMATION_MS = 800', () => {
    expect(DEFAULT_ANIMATION_MS).toBe(800)
  })

  it('**DEFAULT_COLORS 非空且是数组**（受保护注释：禁止删除色板）', () => {
    expect(Array.isArray(DEFAULT_COLORS)).toBe(true)
    expect(DEFAULT_COLORS.length).toBeGreaterThan(0)
    expect(DEFAULT_COLORS.every((c) => typeof c === 'string')).toBe(true)
  })

  it('PALETTE_PRESETS 每个预设都是非空字符串数组', () => {
    for (const [name, colors] of Object.entries(PALETTE_PRESETS)) {
      expect(colors.length, `预设 ${name} 不该为空`).toBeGreaterThan(0)
      expect(colors.every((c) => typeof c === 'string')).toBe(true)
    }
  })
})

describe('textColor / mutedColor 主题切换', () => {
  it('浅色模式 → 深色文字', () => {
    expect(textColor(p({ darkMode: false }))).toBe('#505560')
    expect(mutedColor(p({ darkMode: false }))).toBe('#5F6672')
  })

  it('深色模式 → 亮色文字', () => {
    expect(textColor(p({ darkMode: true }))).toBe('#E0E0E0')
    expect(mutedColor(p({ darkMode: true }))).toBe('#888')
  })

  it('**两模式颜色必须不同**（否则主题切换失效）', () => {
    expect(textColor(p({ darkMode: false }))).not.toBe(textColor(p({ darkMode: true })))
    expect(mutedColor(p({ darkMode: false }))).not.toBe(mutedColor(p({ darkMode: true })))
  })
})

describe('resolvePalette 优先级', () => {
  it('**customColors 非空 → 永远优先**（用户自定义色的唯一通道）', () => {
    const custom = ['#123456', '#654321']
    expect(resolvePalette('warm', custom)).toEqual(custom)
    expect(resolvePalette(undefined, custom)).toEqual(custom)
  })

  it('customColors 为空 + 有预设名 → 用预设', () => {
    const warm = PALETTE_PRESETS['warm']
    if (warm) expect(resolvePalette('warm', [])).toEqual(warm)
  })

  it('customColors 为空 + 无预设名 → DEFAULT_COLORS（不抛错）', () => {
    expect(resolvePalette('不存在的预设', [])).toEqual(DEFAULT_COLORS)
    expect(resolvePalette(undefined, [])).toEqual(DEFAULT_COLORS)
  })
})

describe('resolveLegendPosition 四方向映射', () => {
  it('top → { top: 0 }', () => {
    expect(resolveLegendPosition('top')).toEqual({ top: 0 })
  })

  it('bottom → { bottom: 0 }', () => {
    expect(resolveLegendPosition('bottom')).toEqual({ bottom: 0 })
  })

  it('left → 垂直、贴左居中', () => {
    expect(resolveLegendPosition('left')).toEqual({ left: 0, top: 'middle', orient: 'vertical' })
  })

  it('right → 垂直、贴右居中', () => {
    expect(resolveLegendPosition('right')).toEqual({ right: 0, top: 'middle', orient: 'vertical' })
  })
})

describe('buildLegendConfig 防重叠策略', () => {
  it('showLegend=false → option 为 undefined', () => {
    const r = buildLegendConfig(['a'], false, 'bottom', p())
    expect(r.option).toBeUndefined()
    expect(r.effectivePosition).toBe('bottom')
  })

  it('data 为空 → option 为 undefined', () => {
    const r = buildLegendConfig([], true, 'bottom', p())
    expect(r.option).toBeUndefined()
  })

  it('**>10 条且用户未指定垂直位置 → 自动右侧竖排**', () => {
    const names = Array.from({ length: 12 }, (_, i) => `系列${i + 1}`)
    const r = buildLegendConfig(names, true, 'bottom', p())
    expect(r.effectivePosition, '应自动改 right').toBe('right')
    expect(r.option?.orient, '应竖排').toBe('vertical')
  })

  it('**用户显式指定 left → 不自动改**（尊重用户意图）', () => {
    const names = Array.from({ length: 12 }, (_, i) => `系列${i + 1}`)
    const r = buildLegendConfig(names, true, 'left', p())
    expect(r.effectivePosition, '用户指定的位置不该被覆盖').toBe('left')
    expect(r.option?.orient).toBe('vertical')
  })

  it('**长名称（>8字）→ textStyle.width 收窄到 90**', () => {
    const r = buildLegendConfig(['短名', '这是一个很长很长很长很长的系列名称'], true, 'bottom', p())
    expect(r.option?.textStyle?.width, '有长名称时应收窄').toBe(90)
  })

  it('全短名 → width 110', () => {
    const r = buildLegendConfig(['a', 'bb', 'ccc'], true, 'bottom', p())
    expect(r.option?.textStyle?.width).toBe(110)
  })

  it('**>15 条（垂直位置）→ 开启 scroll 模式**', () => {
    const names = Array.from({ length: 16 }, (_, i) => `系列${i + 1}`)
    const r = buildLegendConfig(names, true, 'right', p())
    expect(r.option?.type, '16 条竖排应滚动').toBe('scroll')
    expect(r.option?.height).toBe('65%')
  })

  it('15 条（含）不滚动', () => {
    const names = Array.from({ length: 15 }, (_, i) => `系列${i + 1}`)
    const r = buildLegendConfig(names, true, 'right', p())
    expect(r.option?.type, '15 条不该滚动').toBeUndefined()
  })

  it('图例文字颜色跟随主题', () => {
    const light = buildLegendConfig(['a'], true, 'bottom', p({ darkMode: false }))
    const dark = buildLegendConfig(['a'], true, 'bottom', p({ darkMode: true }))
    expect(light.option?.textStyle?.color).toBe('#505560')
    expect(dark.option?.textStyle?.color).toBe('#E0E0E0')
  })

  it('水平位置带 left:center 居中', () => {
    const r = buildLegendConfig(['a', 'b'], true, 'bottom', p())
    expect(r.option?.left).toBe('center')
    expect(r.option?.bottom).toBe(0)
  })
})

describe('buildXAxis / buildYAxis 强制标尺', () => {
  it('**X 轴强制 splitLine + axisTick + solid**（注释：内置行为，外部不可覆盖）', () => {
    const x = buildXAxis(p())
    expect(x.type).toBe('category')
    expect(x.axisTick).toEqual({ show: true, alignWithLabel: true })
    expect(x.splitLine.show).toBe(true)
    expect(x.splitLine.lineStyle.type).toBe('solid')
  })

  it('**Y 轴强制 splitLine + axisTick**', () => {
    const y = buildYAxis(p())
    expect(y.type).toBe('value')
    expect(y.axisTick.show).toBe(true)
    expect(y.splitLine.show).toBe(true)
    expect(y.splitLine.lineStyle.type).toBe('solid')
  })

  it('标尺颜色跟随主题', () => {
    const light = buildXAxis(p({ darkMode: false }))
    const dark = buildXAxis(p({ darkMode: true }))
    expect(light.splitLine.lineStyle.color).toBe('#C0C4CC')
    expect(dark.splitLine.lineStyle.color).toBe('#444')
  })

  it('**autoLabelRotate 参与：>4 字分类名自动旋转 45°**', () => {
    const x = buildXAxis(p({ categories: ['很长的分类名称一', '很长的分类名称二'] }))
    expect(x.axisLabel.rotate).toBe(45)
  })

  it('extra.labelRotate 覆盖自动旋转', () => {
    const x = buildXAxis(p({ categories: ['很长的分类名称一'] }), { labelRotate: 90 })
    expect(x.axisLabel.rotate, 'extra 应优先于自动计算').toBe(90)
  })

  it('Y 轴 min/max 透传', () => {
    const y = buildYAxis(p(), { min: 0, max: 100 })
    expect(y.min).toBe(0)
    expect(y.max).toBe(100)
  })

  it('**extra 未传时回退 p.yAxis.min/max**（这条走显式行而非 ...extra 展开）', () => {
    const y = buildYAxis(p({ yAxis: { min: 5, max: 95 } } as never))
    expect(y.min, '应从 p.yAxis 取 min').toBe(5)
    expect(y.max, '应从 p.yAxis 取 max').toBe(95)
  })

  it('extra 优先于 p.yAxis', () => {
    const y = buildYAxis(p({ yAxis: { min: 5, max: 95 } } as never), { min: 0, max: 100 })
    expect(y.min, 'extra.min 应压过 p.yAxis.min').toBe(0)
    expect(y.max).toBe(100)
  })

  it('轴名透传', () => {
    const x = buildXAxis(p(), { name: '月份' })
    expect(x.name).toBe('月份')
    const y = buildYAxis(p({ yAxis: { title: '销量' } } as never))
    expect(y.name).toBe('销量')
  })
})
