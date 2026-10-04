// Card 角标（corner）回归守护 —— 三形态 × 四角 × 五语义色 + 两层锚点结构
// 背景：ribbon 单层百分比 translate 因丝带宽高不等恒偏角平分线（节点 64 立案），
// 重构为外层 0 尺寸锚点 + 内层 .grid-corner-mark translate(-50%,-50%) 自定位。
// 本文件守护：class 组合正确、两层结构不被拍扁、dot 形态文字读屏节点保留。
import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import Card from '@/components/data/Card.vue'

const mounted: VueWrapper[] = []
function track<T extends VueWrapper>(w: T): T {
  mounted.push(w)
  return w
}
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
})

describe('Card 角标（corner）', () => {
  it('未传 corner 不渲染 .grid-corner', () => {
    const w = track(mount(Card, { props: { title: '标题' } }))
    expect(w.find('.grid-corner').exists()).toBe(false)
  })

  it('corner="NEW" 默认 ribbon + top-right + primary，两层锚点结构完整', () => {
    const w = track(mount(Card, { props: { title: '标题', corner: 'NEW' } }))
    const anchor = w.find('.grid-corner')
    expect(anchor.exists()).toBe(true)
    expect(anchor.classes()).toEqual(
      expect.arrayContaining(['grid-corner--ribbon', 'grid-corner--top-right', 'grid-corner--primary']),
    )
    // 两层结构：外层锚点 + 内层 mark，文本节点保留在 mark 里
    const mark = w.find('.grid-corner-mark')
    expect(mark.exists()).toBe(true)
    expect(mark.text()).toBe('NEW')
    expect(anchor.find('.grid-corner-mark').exists()).toBe(true)
  })

  it('pill 形态 + top-left + info 的 class 组合', () => {
    const w = track(
      mount(Card, {
        props: { corner: '运行中', cornerVariant: 'pill', cornerPosition: 'top-left', cornerColor: 'info' },
      }),
    )
    expect(w.find('.grid-corner').classes()).toEqual(
      expect.arrayContaining(['grid-corner--pill', 'grid-corner--top-left', 'grid-corner--info']),
    )
  })

  it('dot 形态：文字视觉隐藏由 CSS（font-size:0）承担，DOM 文本节点保留供读屏', () => {
    const w = track(
      mount(Card, {
        props: { corner: '异常', cornerVariant: 'dot', cornerColor: 'danger' },
      }),
    )
    const anchor = w.find('.grid-corner')
    expect(anchor.classes()).toEqual(
      expect.arrayContaining(['grid-corner--dot', 'grid-corner--danger']),
    )
    // 读屏可读性依赖 DOM 文本节点存在（CSS 隐藏不算移除）
    expect(w.find('.grid-corner-mark').text()).toBe('异常')
  })

  it('四角位置类逐一可渲染', () => {
    for (const pos of ['top-right', 'top-left', 'bottom-right', 'bottom-left'] as const) {
      const w = track(mount(Card, { props: { corner: '标', cornerPosition: pos } }))
      expect(w.find('.grid-corner').classes()).toContain(`grid-corner--${pos}`)
    }
  })
})
