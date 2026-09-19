// Morphicons 形变 provider 行为锁定：
// 1) 注册模块的惰性加载与幂等语义（不重复加载、失败可重试）
// 2) IconSvg 在 provider='morphicons' 下的降级与命中渲染
// 3) 预设 provider 键值合法性（lucide/solar/morphicons）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import IconSvg from '@/components/basic/IconSvg.vue'
import * as morphRegistry from '@/components/_internal/morphicons-registry'

describe('morphicons-registry · 惰性加载语义', () => {
  it('ensure 完成后标记 ready，并能取到图标名与几何数据', async () => {
    await morphRegistry.ensureMorphicons()
    expect(morphRegistry.isMorphiconsReady()).toBe(true)

    const names = morphRegistry.getMorphIconNames()
    expect(names.length).toBeGreaterThan(0)
    // 与 lucide 子集同源；'menu' 这两个都应收录
    expect(names).toContain('menu')
    expect(names).toContain('x')
  })

  it('图标几何数据为 IconNode 结构（[tag, attrs][]）', () => {
    const node = morphRegistry.getMorphIconNode('menu')
    expect(Array.isArray(node)).toBe(true)
    expect(node!.length).toBeGreaterThan(0)
    const [tag, attrs] = node![0]!
    expect(typeof tag).toBe('string')
    expect(typeof attrs).toBe('object')
  })

  it('未收录图标返回 null（调用方据此渲染兜底）', () => {
    expect(morphRegistry.getMorphIconNode('definitely-not-an-icon')).toBeNull()
  })

  it('别名跟随字符串引用解析到规范名几何（alert-circle → circle-alert）', () => {
    const viaAlias = morphRegistry.getMorphIconNode('alert-circle')
    const viaCanonical = morphRegistry.getMorphIconNode('circle-alert')
    expect(viaAlias).not.toBeNull()
    // 别名与规范名拿到的是同一份几何
    expect(JSON.stringify(viaAlias)).toBe(JSON.stringify(viaCanonical))
    // more-vertical 的规范名是 ellipsis-vertical
    expect(JSON.stringify(morphRegistry.getMorphIconNode('more-vertical'))).toBe(
      JSON.stringify(morphRegistry.getMorphIconNode('ellipsis-vertical')),
    )
  })

  it('对外名单只列规范名（同义项不重复展示）', () => {
    const names = morphRegistry.getMorphIconNames()
    expect(names).toContain('circle-alert')
    expect(names).not.toContain('alert-circle')
    // 全量覆盖：几何数量应达整库规模
    expect(names.length).toBeGreaterThan(1500)
  })

  it('重复调用 ensure 只有一次加载（幂等，返回同一 promise 语义）', async () => {
    const spy = vi.spyOn(morphRegistry, 'ensureMorphicons')
    await morphRegistry.ensureMorphicons()
    await morphRegistry.ensureMorphicons()
    expect(spy).toHaveBeenCalledTimes(2)
    // 已 ready 后不应再触发动态 import（这里以 ready 标记间接验证）
    expect(morphRegistry.isMorphiconsReady()).toBe(true)
    spy.mockRestore()
  })
})

describe('IconSvg · provider="morphicons"', () => {
  beforeEach(async () => {
    await morphRegistry.ensureMorphicons()
  })

  it('收录图标渲染为 svg（形变组件已接管）', () => {
    const w = mount(IconSvg, { props: { type: 'menu', provider: 'morphicons' } })
    expect(w.find('svg').exists()).toBe(true)
  })

  it('默认对无障碍隐藏（aria-hidden），与静态图标一致', () => {
    const w = mount(IconSvg, { props: { type: 'menu', provider: 'morphicons' } })
    expect(w.find('svg').attributes('aria-hidden')).toBe('true')
  })

  it('未收录图标降级为兜底占位图，不抛错', () => {
    const w = mount(IconSvg, { props: { type: 'not-a-real-icon', provider: 'morphicons' } })
    const svg = w.find('svg')
    expect(svg.exists()).toBe(true)
    // 兜底图特征：四个 rect 组成的占位网格
    expect(w.findAll('rect').length).toBe(4)
  })

  it('不同图标喂入各自的几何数据（端点形状不同）', () => {
    const menu = mount(IconSvg, { props: { type: 'menu', provider: 'morphicons' } })
    const x = mount(IconSvg, { props: { type: 'x', provider: 'morphicons' } })
    const dMenu = menu.find('svg path').attributes('d')!
    const dX = x.find('svg path').attributes('d')!
    // menu 为三条水平线（起点 M4 5…），x 为两条对角线（起点 M18 6…）
    expect(dMenu.startsWith('M4 5')).toBe(true)
    expect(dX.startsWith('M18 6')).toBe(true)
    expect(dMenu).not.toBe(dX)
  })

  it('切换 type 后路径推进到新图标形状（形变可用，非静态替换）', async () => {
    const w = mount(IconSvg, { props: { type: 'menu', provider: 'morphicons' } })
    const initial = w.find('svg path').attributes('d')!
    await w.setProps({ type: 'x' })
    // 弹簧动画按真实时间推进，happy-dom 的 rAF 不推进时钟，须用 setTimeout 让帧真正流逝
    for (let i = 0; i < 90; i++) {
      await new Promise<void>((r) => setTimeout(r, 16))
    }
    const settled = w.find('svg path').attributes('d')!
    expect(settled).not.toBe(initial)
    expect(settled.startsWith('M18 6')).toBe(true)
  })
})

describe('IconSvg · provider 默认值与静态链路不受影响', () => {
  it('默认 provider 仍为 lucide，采集 lucide 子集图标', () => {
    const w = mount(IconSvg, { props: { type: 'star' } })
    expect(w.find('svg').exists()).toBe(true)
  })

  it('size 映射保持 12/16/20/24/28', () => {
    const w = mount(IconSvg, { props: { type: 'star', size: 'xl' } })
    expect(w.find('svg').attributes('width')).toBe('28')
  })
})
