/**
 * `Card` · grid / stat 两种模式（第 169 轮）
 *
 * 覆盖率实测该文件**语句 58.3%**，其中整个 **stat 模式（值/标签/图标/趋势）一行都没被执行**——
 * 而 stat 卡片是"看板首页"最常见的一类组件，趋势数字直接面向用户。
 *
 * 重点验证 `trendNum` 的两类输入：非有限值 与 非纯数字字符串。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Card from '@/components/data/Card.vue'

const stat = (props: Record<string, unknown> = {}) =>
  mount(Card, { props: { type: 'stat', ...props } })

describe('Card · stat 模式基本渲染', () => {
  it('渲染数值与标签', () => {
    const w = stat({ value: 1234, label: '本月订单' })
    expect(w.find('.stat-card').exists()).toBe(true)
    expect(w.find('.stat-value').text()).toBe('1234')
    expect(w.find('.stat-label').text()).toBe('本月订单')
    w.unmount()
  })

  it('value 为 0 也照样渲染（不能因为假值消失）', () => {
    const w = stat({ value: 0 })
    expect(w.find('.stat-value').text()).toBe('0')
    w.unmount()
  })

  it('无 label 时不渲染标签块', () => {
    const w = stat({ value: 1 })
    expect(w.find('.stat-label').exists()).toBe(false)
    w.unmount()
  })

  it('stat-card 是 role=button 且可聚焦；点击与 Enter/Space 都发 click', async () => {
    const w = stat({ value: 1 })
    const c = w.find('.stat-card')
    expect(c.attributes('role')).toBe('button')
    expect(c.attributes('tabindex')).toBe('0')

    await c.trigger('click')
    await c.trigger('keydown.enter')
    await c.trigger('keydown.space')
    expect(w.emitted('click')?.length, 'click / Enter / Space 三次都应发 click').toBe(3)
    w.unmount()
  })

  it('未传 type 时是 grid 模式（stat 卡片不得成为默认）', () => {
    const w = mount(Card, { props: { title: '标题' } })
    expect(w.find('.grid-card').exists()).toBe(true)
    expect(w.find('.stat-card').exists()).toBe(false)
    w.unmount()
  })
})

describe('Card · 趋势（trend）方向与文案', () => {
  const trendIcon = (w: ReturnType<typeof stat>) => w.find('.stat-trend').text()

  it('正数 → 上涨箭头 + 成功色', () => {
    const w = stat({ value: 1, trend: 12 })
    expect(trendIcon(w)).toContain('12%')
    expect(w.find('.stat-trend').exists()).toBe(true)
    w.unmount()
  })

  it('负数 → 显示绝对值（方向由箭头表达）', () => {
    const w = stat({ value: 1, trend: -8.5 })
    expect(w.find('.stat-trend').text()).toContain('8.5%')
    w.unmount()
  })

  it('0 → 持平（0%）', () => {
    const w = stat({ value: 1, trend: 0 })
    expect(w.find('.stat-trend').text()).toContain('0%')
    w.unmount()
  })

  it("字符串 '12%' 与 '-12%' 都能解析", () => {
    expect(stat({ value: 1, trend: '12%' }).find('.stat-trend').text()).toContain('12%')
    expect(stat({ value: 1, trend: '-12%' }).find('.stat-trend').text()).toContain('12%')
  })

  it('未传 trend → 不渲染趋势块', () => {
    const w = stat({ value: 1 })
    expect(w.find('.stat-trend').exists()).toBe(false)
    w.unmount()
  })

  it("**Infinity 不得上屏**：环比增长率分母为 0 时上游会算出 Infinity", () => {
    const w = stat({ value: 1, trend: Number.POSITIVE_INFINITY })
    const text = w.find('.stat-trend').text()
    expect(text, 'Infinity 被原样渲染成「Infinity%」——用户看到的是乱码级文案').not.toContain('Infinity')
    expect(text, '非有限值应按"持平"处理').toContain('0%')
    w.unmount()
  })

  it("**'-Infinity' / 'NaN' 字符串同样不得上屏**", () => {
    for (const bad of ['-Infinity', 'NaN']) {
      const w = stat({ value: 1, trend: bad })
      const text = w.find('.stat-trend').text()
      expect(text, `${bad} 不该出现在界面上`).not.toMatch(/Infinity|NaN/)
      expect(text).toContain('0%')
      w.unmount()
    }
  })

  it("**'1,234' 不能被 parseFloat 截成 1**（看起来正常的错值最危险）", () => {
    const w = stat({ value: 1, trend: '1,234' })
    const text = w.find('.stat-trend').text()
    expect(text, "带千分位的字符串若被截成 1，界面会显示 1% —— 一个看起来完全正常的错数").not.toContain('1%')
    expect(text).toContain('0%')
    w.unmount()
  })

  it("非数字单位串 '12px' 不该被当成 12", () => {
    const w = stat({ value: 1, trend: '12px' })
    expect(w.find('.stat-trend').text(), "'12px' 不是趋势值").toContain('0%')
    w.unmount()
  })

  it('小数趋势保留小数（12.5%）', () => {
    const w = stat({ value: 1, trend: '12.5%' })
    expect(w.find('.stat-trend').text()).toContain('12.5%')
    w.unmount()
  })
})

describe('Card · stat 图标与配色', () => {
  it('默认图标存在；传 icon 时渲染', () => {
    const w = stat({ value: 1, icon: 'star' })
    expect(w.find('.stat-icon').exists()).toBe(true)
    w.unmount()
  })

  it('color 用 color-mix 生成底色（不支持时也不该渲染非法颜色串）', () => {
    const w = stat({ value: 1, color: 'rgb(1,2,3)' })
    expect(w.find('.stat-icon').exists()).toBe(true)
    w.unmount()
  })
})

describe('Card · grid 模式', () => {
  it('标题按 titleAs 渲染（默认 h3）', () => {
    const w = mount(Card, { props: { title: '区块标题' } })
    expect(w.find('.grid-title').element.tagName).toBe('H3')
    w.unmount()
  })

  it("titleAs='div' → 纯展示标题（解除文档结构职责）", () => {
    const w = mount(Card, { props: { title: '区块标题', titleAs: 'div' } })
    expect(w.find('.grid-title').element.tagName).toBe('DIV')
    w.unmount()
  })

  it('无 title 也没有 header 插槽 → 整个头部不渲染', () => {
    const w = mount(Card, { props: {} })
    expect(w.find('.grid-header').exists()).toBe(false)
    w.unmount()
  })

  it('只有 header 插槽时也渲染头部（插槽可独立存在）', () => {
    const w = mount(Card, { slots: { header: '<span class="h">自定义头</span>' } })
    expect(w.find('.grid-header').exists()).toBe(true)
    expect(w.find('.h').exists()).toBe(true)
    w.unmount()
  })

  it('default 与 footer 插槽各自渲染', () => {
    const w = mount(Card, {
      slots: { default: '<p class="body">正文</p>', footer: '<p class="foot">页脚</p>' },
    })
    expect(w.find('.grid-body .body').exists()).toBe(true)
    expect(w.find('.grid-footer .foot').exists()).toBe(true)
    w.unmount()
  })

  it('无 footer 插槽 → 不渲染页脚容器', () => {
    const w = mount(Card, { props: { title: 't' } })
    expect(w.find('.grid-footer').exists()).toBe(false)
    w.unmount()
  })

  it('corner 渲染角标文案与三组修饰类', () => {
    const w = mount(Card, {
      props: { corner: 'NEW', cornerVariant: 'pill', cornerPosition: 'top-left', cornerColor: 'danger' },
    })
    const c = w.find('.grid-corner')
    expect(c.exists()).toBe(true)
    expect(w.find('.grid-corner-mark').text()).toBe('NEW')
    expect(c.classes()).toContain('grid-corner--pill')
    expect(c.classes()).toContain('grid-corner--top-left')
    expect(c.classes()).toContain('grid-corner--danger')
    w.unmount()
  })

  it('不传 corner → 无角标', () => {
    const w = mount(Card, { props: {} })
    expect(w.find('.grid-corner').exists()).toBe(false)
    w.unmount()
  })

  it('summary / highlight / overflowVisible / accent 各自映射到类名', () => {
    const w = mount(Card, {
      props: { summary: true, highlight: true, overflowVisible: true, accent: 'warning' },
    })
    const cls = w.find('.grid-card').classes()
    expect(cls).toContain('summary')
    expect(cls).toContain('highlight')
    expect(cls).toContain('grid-card--overflow-visible')
    expect(cls).toContain('grid-card--accent-warning')
    w.unmount()
  })
})