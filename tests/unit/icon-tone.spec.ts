/**
 * IconSvg · `tone` 四级语义（吸收 BoardUI 的 icon-primary…quaternary）
 *
 * 吸收的是**分级用法**，不是它的调色板：四个 tone 全部指向 tokens.css 里的
 * `--vcl-icon-*` 别名，而别名指回既有文字色阶 —— 主题覆盖 / 暗色 / 自定义主题 / 等比缩放
 * 都自动跟随，组件里不写死任何颜色值。
 *
 * 这里钉住四件事：
 *   1. tone 映射到正确的 CSS 变量（不是硬编码色值）
 *   2. 显式 `color` 优先于 tone（不破坏既有调用）
 *   3. 都不传时是 currentColor（继承文字色，保持历史行为）
 *   4. 非法 tone 不崩、也不静默变黑
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import IconSvg from '@/components/basic/IconSvg.vue'

/**
 * 取渲染后 svg 的**描边色**：lucide 是线性图标（fill=none + stroke=currentColor），
 * 组件传下去的 color 最终落在 stroke 上 —— 断言读 stroke 才是断言真实生效的那条通道。
 * 兜底顺序：stroke → color 属性 → style.color（不同 provider 的落点不同）。
 */
function paintOf(w: ReturnType<typeof mount>): string {
  const el = w.element as SVGElement | HTMLElement
  const target = (el.tagName.toLowerCase() === 'svg' ? el : (el.querySelector('svg') ?? el)) as SVGElement
  const stroke = target.getAttribute('stroke')
  if (stroke && stroke !== 'currentColor') return stroke.trim()
  const attr = target.getAttribute('color')
  if (attr && attr !== 'currentColor') return attr.trim()
  const style = target.getAttribute('style') ?? ''
  const m = /color:\s*([^;]+)/.exec(style)
  if (m?.[1]) return m[1].trim()
  return 'currentColor'
}

describe('IconSvg · tone 四级', () => {
  it.each([
    ['primary', 'var(--vcl-icon-primary)'],
    ['secondary', 'var(--vcl-icon-secondary)'],
    ['tertiary', 'var(--vcl-icon-tertiary)'],
    ['quaternary', 'var(--vcl-icon-quaternary)'],
  ])('tone=%s → %s（走令牌，不写死色值）', (tone, expected) => {
    const w = mount(IconSvg, { props: { type: 'check', tone } })
    expect(paintOf(w)).toBe(expected)
    w.unmount()
  })

  it('显式 color 优先于 tone（既有调用不被 tone 改写）', () => {
    const w = mount(IconSvg, { props: { type: 'check', tone: 'tertiary', color: '#ff0000' } })
    expect(paintOf(w)).toBe('#ff0000')
    w.unmount()
  })

  it('都不传 → currentColor（继承文字色，保持历史行为）', () => {
    const w = mount(IconSvg, { props: { type: 'check' } })
    expect(paintOf(w)).toBe('currentColor')
    w.unmount()
  })

  it('非法 tone 名只得到一个未声明的 var()：不崩、也不静默变黑', () => {
    const w = mount(IconSvg, { props: { type: 'check', tone: 'ghost' } })
    expect(paintOf(w)).toBe('var(--vcl-icon-ghost)')
    w.unmount()
  })
})
