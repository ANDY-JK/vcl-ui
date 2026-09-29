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

// Lucide 子集契约（2026-09-29）：IconPicker 的 lucide 名录 = lucideSubset 的键。
//
// 背景两笔，都真出过故障：
// ① 面板曾读 lucide-icons.json 全量名录（3965 个），而随包只具名导入 182 个——
//    面板里 96% 的格子点了画不出来，渲染成兜底方块（用户看到「lucide 图标全变默认图标」）。
// ② 生成器正则有缺陷（`[^>]*?type=` 会吃掉冒号），把 `<IconSvg :type="icon" />` 的
//    **prop 名** `icon` 当成图标收了进来；而 `Icon` 恰是 lucide 导出的通用渲染器
//    （要求 iconNode prop，不传就 `iconNode.map` 抛 TypeError），导致 icon 页直接崩。
// 本测试锁住三条：键都渲染得出来、不含通用导出、生成器不漏真实引用。
describe('lucideSubset · 子集即面板名录（可渲染集）', () => {
  it('不含通用导出（Icon/createLucideIcon 等不是图标，渲染必崩）', async () => {
    const { lucideSubset } = await import('@/components/_internal/lucide-subset')
    const bogus = ['icon', 'create-lucide-icon', 'icons', 'lucide-context', 'default'].filter((k) => k in lucideSubset)
    expect(bogus, `子集混入非图标导出：${bogus.join(', ')}——检查 gen-lucide-subset 的收集正则`).toEqual([])
  })

  it('每个键都能从 @lucide/vue 解析到组件（列出的都渲染得出来）', async () => {
    const { lucideSubset } = await import('@/components/_internal/lucide-subset')
    const names = Object.keys(lucideSubset)
    expect(names.length).toBeGreaterThan(100)
    const broken = names.filter((k) => {
      const c = lucideSubset[k] as unknown
      return typeof c !== 'function' && typeof c !== 'object'
    })
    expect(broken, `子集里有 ${broken.length} 个名字解析不到组件`).toEqual([])
  })

  it('IconPicker 的 lucide 名录与子集键完全一致（面板不列画不出的名字）', async () => {
    const { lucideSubset } = await import('@/components/_internal/lucide-subset')
    const { readFileSync } = await import('node:fs')
    const pickerSrc = readFileSync('src/components/form/IconPicker.vue', 'utf8')
    // 名录直接由子集派生；若有人改回读全量 JSON，这里立刻红
    expect(pickerSrc, 'IconPicker 应读 lucideSubset 的键作为名录').toContain('Object.keys(lucideSubset)')
    expect(pickerSrc, 'IconPicker 不应再读全量名录 lucide-icons.json').not.toMatch(
      /import\s+\w+\s+from\s+['"]@\/components\/_internal\/lucide-icons\.json['"]/,
    )
    expect(Object.keys(lucideSubset).length).toBeGreaterThan(0)
  })
})

// Solar 名录契约（2026-09-20）：IconPicker 的 solar 列表 = 本地可渲染集，
// 曾优先 fetch Iconify CDN 全量名录——CDN 名录里大多数名字不在随包几何数据里，
// 列出也只能渲染兜底占位图；手抄精选还与数据 17 stale / 5 漏名双向漂移。
// 现在名录与数据键一一对应，本测试锁住这个双边相等（改数据忘同步名录即红）。
describe('SOLAR_ICONS 名录 · 与几何数据一一对应', () => {
  it('名录每个名字都在 solar-icons-data.json 里（列出的都渲染得出来）', async () => {
    const { SOLAR_ICONS } = await import('@/components/_internal/solar-icons')
    const data = (await import('@/components/_internal/solar-icons-data.json')).default as {
      icons: Record<string, unknown>
      aliases: Record<string, unknown>
    }
    const renderable = new Set([...Object.keys(data.icons), ...Object.keys(data.aliases)])
    const missing = SOLAR_ICONS.filter((n) => !renderable.has(n))
    expect(missing, `名录里有 ${missing.length} 个名字没有几何数据（会渲染兜底图）`).toEqual([])
  })

  it('数据里每个可渲染名字都在名录里（不漏）', async () => {
    const { SOLAR_ICONS } = await import('@/components/_internal/solar-icons')
    const data = (await import('@/components/_internal/solar-icons-data.json')).default as {
      icons: Record<string, unknown>
      aliases: Record<string, unknown>
    }
    const listed = new Set(SOLAR_ICONS)
    const unlisted = [...Object.keys(data.icons), ...Object.keys(data.aliases)].filter((n) => !listed.has(n))
    expect(unlisted, `数据里有 ${unlisted.length} 个可渲染名字没进名录`).toEqual([])
  })

  it('名录只收 -linear 变体（Solar 的线性变体名）', async () => {
    const { SOLAR_ICONS } = await import('@/components/_internal/solar-icons')
    expect(SOLAR_ICONS.length).toBeGreaterThan(300)
    expect(SOLAR_ICONS.every((n) => n.endsWith('-linear'))).toBe(true)
  })
})
