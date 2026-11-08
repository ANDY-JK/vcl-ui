/**
 * icon-variants · 从 IconSvg 抽出的纯函数
 *
 * 抽出来的理由不是"好看"，是**闸口先亮了**：`basic` 域止涨线 220 行，IconSvg 到了 216（余量 1.8%）。
 * 里面一半是与组件生命周期无关的映射（尺寸表 / 类名 / kebab→Pascal / Solar 变体名 / 兜底 SVG）。
 * 搬走后组件 216 → 158 行，余量回到 60（27%）。
 *
 * 用例钉的是**易错点**，不是覆盖率：
 *   1. Solar 变体名的补全规则（六个后缀 + 两段式 `bold-duotone`）
 *   2. kebab→Pascal 的空段容忍（`foo--bar` 不能崩）
 *   3. 尺寸名的兜底（未知尺寸 → md / icon-sz-md，不能渲染成 0 宽）
 *   4. 兜底 SVG 必须带 aria-hidden（装饰性图形不该被读屏念）
 */
import { describe, expect, it } from 'vitest'
import {
  PX_CLASS,
  SOLAR_VARIANTS,
  renderFallback,
  sizeClass,
  sizeMap,
  toPascal,
  toSolarIconName,
} from '@/components/_internal/icon-variants'

describe('icon-variants · toSolarIconName', () => {
  it.each([
    ['home', 'solar:home-linear'],
    ['home-linear', 'solar:home-linear'],
    ['home-bold', 'solar:home-bold'],
    ['home-broken', 'solar:home-broken'],
    ['home-outline', 'solar:home-outline'],
    ['home-line-duotone', 'solar:home-line-duotone'],
  ])('%s → %s', (input, expected) => {
    expect(toSolarIconName(input)).toBe(expected)
  })

  it('**两段式变体 bold-duotone 不被误判**（末尾一段不命中，但后两段命中）', () => {
    expect(toSolarIconName('home-bold-duotone')).toBe('solar:home-bold-duotone')
  })

  it('末尾不是变体时补默认 -linear', () => {
    expect(SOLAR_VARIANTS).not.toContain('home')
    expect(toSolarIconName('home')).toBe('solar:home-linear')
  })
})

describe('icon-variants · toPascal', () => {
  it.each([
    ['arrow-left', 'ArrowLeft'],
    ['home', 'Home'],
    ['arrow-up-right', 'ArrowUpRight'],
  ])('%s → %s', (input, expected) => {
    expect(toPascal(input)).toBe(expected)
  })

  it('**空段不炸**（foo--bar：filter(Boolean) 之后不能取到 undefined[0]）', () => {
    expect(() => toPascal('foo--bar')).not.toThrow()
    expect(toPascal('foo--bar')).toBe('FooBar')
  })
})

describe('icon-variants · 尺寸', () => {
  it.each([
    ['xs', 'icon-sz-xs'],
    ['md', 'icon-sz-md'],
    ['xl', 'icon-sz-xl'],
  ])('sizeClass(%s) → %s', (size, expected) => {
    expect(sizeClass(size)).toBe(`icon-svg ${expected}`)
  })

  it('未知尺寸兜底到 md（不能渲染成 0 宽）', () => {
    expect(sizeClass('huge')).toBe('icon-svg icon-sz-md')
    expect(sizeMap.md).toBe(20)
  })

  it('sizeMap 与 PX_CLASS 一一对应（加档位时不会只改一半）', () => {
    for (const px of Object.values(sizeMap)) {
      expect(PX_CLASS[px]).toBeDefined()
    }
    expect(Object.keys(PX_CLASS).length).toBe(Object.keys(sizeMap).length)
  })
})

describe('icon-variants · 兜底 SVG', () => {
  it('渲染 svg 且**带 aria-hidden**（装饰图形不该被读屏念）', () => {
    const vnode = renderFallback(20, 'red') as { type?: string; props?: Record<string, unknown> }
    expect(vnode.type).toBe('svg')
    expect(vnode.props?.['aria-hidden']).toBe(true)
    expect(vnode.props?.width).toBe(20)
    expect(vnode.props?.color).toBe('red')
  })

  it('未知尺寸也走 md 类名（与 sizeClass 同口径）', () => {
    const vnode = renderFallback(999, 'blue') as { props?: Record<string, unknown> }
    expect(vnode.props?.class).toBe('icon-svg icon-sz-md')
  })
})
