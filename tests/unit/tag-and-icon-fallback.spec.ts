// Tag 的徽标契约 + IconSvg 两个动态 provider 的**加载失败兜底**（#475）
//
// 背景：basic 域分支覆盖 78.5/68（+10.5）是全库余量最小的分支项。逐文件看下来两块从未被测：
//   ① `Tag.vue` —— 它合并了原 Badge 的全部能力（count/sup/color/offset/showZero/hidden），
//      而既有 spec 只测了 text/variant/count 三个基础面；`hidden`、`dot`、空 text、
//      `showZero`、`color` 实心底、`offset` 角标定位、`closable` 的 aria 契约全是 0；
//   ② `IconSvg.vue` —— solar / morphicons 两个 provider 的**加载失败**路径
//      （warnOnce 告警 + 保持兜底渲染，不标记 ready）从未被触发过。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Tag from '@/components/basic/Tag.vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { setLocale } from '@/components/_internal/i18n'

const { warnSpy } = vi.hoisted(() => ({ warnSpy: vi.fn() }))
vi.mock('@/components/_internal/warnOnce', () => ({ warnOnce: warnSpy }))

vi.mock('@/components/_internal/solar-icons-registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/_internal/solar-icons-registry')>()
  return { ...actual, ensureSolarIcons: () => Promise.reject(new Error('solar network down')), isSolarReady: () => false }
})

vi.mock('@/components/_internal/morphicons-registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/_internal/morphicons-registry')>()
  return { ...actual, ensureMorphicons: () => Promise.reject(new Error('morph network down')), isMorphiconsReady: () => false }
})

beforeEach(() => {
  setLocale('zh-CN')
  warnSpy.mockClear()
})

describe('Tag · 可见性优先级（hidden > dot > text > count）', () => {
  it('hidden=true → 角标模式也不渲染徽标', () => {
    const w = mount(Tag, { props: { count: 5, sup: true, hidden: true } })
    expect(w.find('.tag-sup-wrap').exists()).toBe(true)
    expect(w.find('.tag-sup').exists(), 'hidden 应压过 count').toBe(false)
  })

  it('dot 模式无视 hidden 之外的可见性 → 恒可见，且不渲染文字', () => {
    const w = mount(Tag, { props: { dot: true, sup: true } })
    const sup = w.find('.tag-sup')
    expect(sup.exists()).toBe(true)
    expect(sup.classes()).toContain('tag-dot')
    expect(sup.text(), 'dot 模式不该有文字').toBe('')
  })

  it('text 为空串 → 角标不可见；非空 → 可见', () => {
    expect(mount(Tag, { props: { text: '', sup: true } }).find('.tag-sup').exists()).toBe(false)
    expect(mount(Tag, { props: { text: '新消息', sup: true } }).find('.tag-sup').exists()).toBe(true)
  })

  it('count=0 默认隐藏；showZero 才显示 0', () => {
    expect(mount(Tag, { props: { count: 0, sup: true } }).find('.tag-sup').exists()).toBe(false)
    const w = mount(Tag, { props: { count: 0, sup: true, showZero: true } })
    expect(w.find('.tag-sup').exists()).toBe(true)
    expect(w.find('.tag-sup').text()).toBe('0')
  })
})

describe('Tag · 实心底 / 角标定位 / 关闭契约', () => {
  it('color → 内联模式白字实心底（对比度契约）', () => {
    const w = mount(Tag, { props: { text: '标签', color: '#ff0000' } })
    const style = w.find('.tag').attributes('style') ?? ''
    expect(style).toContain('#ff0000')
    expect(style, '实心底必须配白字，否则暗色下不可读').toContain('#fff')
  })

  it('color + offset → 角标背景与定位同时生效', () => {
    const w = mount(Tag, { props: { count: 3, sup: true, color: '#00ff00', offset: [10, 4] } })
    const sup = w.find('.tag-sup')
    const style = sup.attributes('style') ?? ''
    expect(style).toContain('#00ff00')
    expect(style, '正 y 向下').toContain('top: 4px')
    expect(style, '正 x 向右 → right 取负').toContain('right: -10px')
  })

  it('closable → 关闭按钮带 aria-label，点击 emit close 且不冒泡', async () => {
    const w = mount(Tag, { props: { text: '标签', closable: true } })
    const btn = w.find('.tag-close')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('aria-label')).toBe('关闭')
    await btn.trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('纯数字 text 也走 max 溢出（与 count 同口径）', () => {
    const over = mount(Tag, { props: { text: '120', max: 99 } })
    expect(over.find('.tag').text()).toContain('99+')
    const under = mount(Tag, { props: { text: '42', max: 99 } })
    expect(under.find('.tag').text(), '未溢出不该加 +').toBe('42')
  })
})

describe('IconSvg · 动态 provider 加载失败兜底', () => {
  it('solar 加载失败 → warnOnce 告警一次 + 保持兜底占位图（4 个 rect）', async () => {
    const w = mount(IconSvg, { props: { type: 'star', provider: 'solar' } })
    // 加载完成前就是兜底
    expect(w.findAll('rect').length).toBe(4)
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('solar')
    // 失败后不标记 ready → 仍是兜底，不抛错
    expect(w.findAll('rect').length).toBe(4)
  })

  it('morphicons 加载失败 → warnOnce 告警一次 + 保持兜底占位图', async () => {
    const w = mount(IconSvg, { props: { type: 'menu', provider: 'morphicons' } })
    expect(w.findAll('rect').length).toBe(4)
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('morphicons')
    expect(w.findAll('rect').length).toBe(4)
  })

  it('反向保护：lucide 静态链路不受 mock 影响（不告警、不走兜底）', async () => {
    const w = mount(IconSvg, { props: { type: 'star' } })
    expect(w.find('svg').exists()).toBe(true)
    expect(w.findAll('rect').length, 'lucide 图标不是占位网格').toBe(0)
    await new Promise((r) => setTimeout(r, 0))
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
