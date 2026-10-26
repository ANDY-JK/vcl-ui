/**
 * 设计器属性面板·条件组与级联 / 容器专属区（第 132 轮）。
 * 此前分支覆盖：`PropsConditionGroup.vue` 40%（35 个分支）、`PropsContainerSection.vue` 31%（36 个分支）。
 *
 * 这俩组件干的是"把用户在面板里填的东西写进节点"的活，写错不报错、界面也正常，
 * 只有导出 schema 或渲染时才暴露。重点钉三件事：
 *   · 条件组三套字段（显示/必填/禁用）**互不串**，且清空要真的清掉
 *   · 容器配置（grid/flex/tabs/collapse/steps）**只写自己那几个键**，不覆盖别的键
 *   · 行文本 → 数组的解析（空行过滤、顺序、附带字段）
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ConditionGroup from '@/components/form-builder/designer/PropsConditionGroup.vue'
import ContainerSection from '@/components/form-builder/designer/PropsContainerSection.vue'
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import Group from '@/components/form/Group.vue'
import type { DesignerNode } from '@/components/form-builder/designer/types'

const FIELD_OPTIONS = [
  { value: 'a', label: '字段A' },
  { value: 'b', label: '字段B' },
]

function mountCond(node: Partial<DesignerNode>, fieldOptions = FIELD_OPTIONS) {
  const w = mount(ConditionGroup, {
    props: { node: { id: 'n1', key: 'k1', label: '字段', type: 'text', ...node } as DesignerNode, fieldOptions },
  })
  const lastPatch = (): Partial<DesignerNode> | undefined =>
    (w.emitted('update') as Array<[Partial<DesignerNode>]> | undefined)?.at(-1)?.[0]
  return { w, lastPatch }
}

function mountContainer(node: Partial<DesignerNode>) {
  const w = mount(ContainerSection, {
    props: { node: { id: 'c1', key: 'c1', label: '容器', isContainer: true, ...node } as DesignerNode },
  })
  const lastPatch = (): Partial<DesignerNode> | undefined =>
    (w.emitted('update') as Array<[Partial<DesignerNode>]> | undefined)?.at(-1)?.[0]
  return { w, lastPatch }
}

// ════════════════════════════════════════════════════════════════════
// 条件组
// ════════════════════════════════════════════════════════════════════
describe('条件组：三套条件互不串', () => {
  const GROUPS = [
    { name: '显示', field: 'visibleWhenField', value: 'visibleWhenValue', not: 'visibleWhenNot' },
    { name: '必填', field: 'requiredWhenField', value: 'requiredWhenValue', not: 'requiredWhenNot' },
    { name: '禁用', field: 'disabledWhenField', value: 'disabledWhenValue', not: 'disabledWhenNot' },
  ] as const

  it('三组标题都渲染（布局元素除外）', () => {
    const { w } = mountCond({})
    const titles = w.findAll('.ldp-section-title').map((n) => n.text())
    for (const g of GROUPS) {
      expect(titles.some((x) => x.includes(g.name)), `缺「${g.name}」标题`).toBe(true)
    }
    w.unmount()
  })

  it('divider / title 这类布局元素**不渲染**任何条件组', () => {
    for (const type of ['divider', 'title']) {
      const { w } = mountCond({ type })
      expect(w.findAll('.ldp-section-title').length, `${type} 不该有条件组`).toBe(0)
      w.unmount()
    }
  })

  it.each(GROUPS)('$name：未选触发字段时只有 TriggerField 一个控件', () => {
    const { w } = mountCond({})
    // 本组没有值时，该组只渲染 1 个 Select（其余两组同理）
    const sections = w.findAll('.ldp-prop')
    expect(sections.length).toBe(3) // 三组各一个触发字段
    w.unmount()
  })

  it.each(GROUPS)('$name：选了触发字段后出现「匹配值」与「反向匹配」开关', (g) => {
    const { w } = mountCond({ [g.field]: 'a' } as Partial<DesignerNode>)
    const labels = w.findAll('label').map((l) => l.text())
    expect(labels.filter((x) => x.includes('匹配值')).length, '应出现匹配值').toBe(1)
    expect(labels.filter((x) => x.includes('反向匹配')).length, '应出现反向匹配开关').toBe(1)
    w.unmount()
  })

  it('**三组各自独立**：只配了显示组，必填组不该出现匹配值', () => {
    const { w } = mountCond({ visibleWhenField: 'a' })
    const labels = w.findAll('label').map((l) => l.text())
    expect(labels.filter((x) => x.includes('匹配值')).length, '只有显示组展开').toBe(1)
    w.unmount()
  })
})

describe('条件组：写值只碰自己那几个键', () => {
  it('选触发字段只带该组的 fieldKey（其余两组的键不出现）', () => {
    const { w, lastPatch } = mountCond({})
    // 第一组的 Select（触发字段）
    w.findAllComponents(Select)[0].vm.$emit('update:modelValue', 'a')
    const p = lastPatch()!
    expect(Object.keys(p)).toEqual(['visibleWhenField'])
    expect(p.visibleWhenField).toBe('a')
    w.unmount()
  })

  it('**清空触发字段写 undefined**（让条件失效，而不是留下空串让它永远匹配空）', () => {
    const { w, lastPatch } = mountCond({ visibleWhenField: 'a' })
    w.findAllComponents(Select)[0].vm.$emit('update:modelValue', '')
    const p = lastPatch()!
    expect(Object.keys(p)).toEqual(['visibleWhenField'])
    expect(p.visibleWhenField, '空选择应写 undefined').toBeUndefined()
    w.unmount()
  })

  it('写匹配值只带 valueKey，且清空写空串（不清成 undefined）', () => {
    const { w, lastPatch } = mountCond({ visibleWhenField: 'a' })
    const input = w.findComponent(Input)
    input.vm.$emit('update:modelValue', '店A')
    expect(lastPatch()).toEqual({ visibleWhenValue: '店A' })
    input.vm.$emit('update:modelValue', null)
    expect(lastPatch(), '清空写空串').toEqual({ visibleWhenValue: '' })
    w.unmount()
  })

  it('切换「不匹配」开关只带 notKey，且强制成布尔', () => {
    const { w, lastPatch } = mountCond({ visibleWhenField: 'a' })
    const sw = w.findComponent(Group)
    sw.vm.$emit('update:modelValue', true)
    expect(lastPatch()).toEqual({ visibleWhenNot: true })
    sw.vm.$emit('update:modelValue', 0)
    expect(lastPatch(), '假值也要存成 false 而不是 0').toEqual({ visibleWhenNot: false })
    w.unmount()
  })

  it('三组的 valueKey 各写各的（写必填组的匹配值不会落到显示组）', () => {
    const { w, lastPatch } = mountCond({ requiredWhenField: 'b' })
    const inputs = w.findAllComponents(Input)
    expect(inputs.length, '只有必填组展开 → 只有 1 个匹配值输入').toBe(1)
    inputs[0].vm.$emit('update:modelValue', 'v')
    expect(lastPatch()).toEqual({ requiredWhenValue: 'v' })
    w.unmount()
  })
})

describe('条件组：级联选项', () => {
  it('只有带静态选项的字段类型（select/combobox/radio/checkbox）才显示级联区', () => {
    for (const type of ['select', 'combobox', 'radio', 'checkbox']) {
      const { w } = mountCond({ type })
      const titles = w.findAll('.ldp-section-title').map((n) => n.text())
      expect(titles.some((x) => x.includes('级联')), `${type} 该有级联区`).toBe(true)
      w.unmount()
    }
    for (const type of ['text', 'number', 'date', 'subform']) {
      const { w } = mountCond({ type })
      const titles = w.findAll('.ldp-section-title').map((n) => n.text())
      expect(titles.some((x) => x.includes('级联')), `${type} 不该有级联区`).toBe(false)
      w.unmount()
    }
  })

  it('**没有任何其它字段可依赖时不显示级联区**（否则下拉是空的）', () => {
    const { w } = mountCond({ type: 'select' }, [])
    const titles = w.findAll('.ldp-section-title').map((n) => n.text())
    expect(titles.some((x) => x.includes('级联')), '无候选字段时不该显示级联').toBe(false)
    w.unmount()
  })

  it('选了依赖字段后才出现「映射表」文本域', () => {
    const a = mountCond({ type: 'select' })
    expect(a.w.find('textarea').exists(), '未选依赖字段时不该有映射表').toBe(false)
    a.w.unmount()
    const b = mountCond({ type: 'select', optionsFrom: 'a' })
    expect(b.w.find('textarea').exists(), '选了依赖字段应出现映射表').toBe(true)
    b.w.unmount()
  })

  it('选依赖字段写 optionsFrom；清空写 undefined', () => {
    const { w, lastPatch } = mountCond({ type: 'select' })
    // 级联区的 Select 是最后一个
    const sel = w.findAllComponents(Select).at(-1)!
    sel.vm.$emit('update:modelValue', 'a')
    expect(lastPatch()).toEqual({ optionsFrom: 'a' })
    sel.vm.$emit('update:modelValue', '')
    expect(lastPatch()!.optionsFrom, '清空写 undefined').toBeUndefined()
    w.unmount()
  })

  it('映射表文本原样写入 optionsMap（含换行与冒号）', () => {
    const { w, lastPatch } = mountCond({ type: 'select', optionsFrom: 'a' })
    const ta = w.find('textarea')
    const text = '店A:选项1,选项2\n店B:选项3'
    ;(ta.element as HTMLTextAreaElement).value = text
    ta.trigger('input')
    expect(lastPatch()).toEqual({ optionsMap: text })
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
// 容器专属区
// ════════════════════════════════════════════════════════════════════
describe('容器区：只渲染自己类型的配置', () => {
  const TYPES = ['grid', 'flex', 'tabs', 'collapse', 'steps']

  it('每种容器只显示自己的区块标题（互不串）', () => {
    for (const type of TYPES) {
      const { w } = mountContainer({ type })
      const titles = w.findAll('.ldp-section-title').map((n) => n.text())
      expect(titles.length, `${type} 应只有 1 个配置区块`).toBe(1)
      w.unmount()
    }
  })

  it('普通字段类型（text）只显示容器类型一行，没有任何配置区块', () => {
    const { w } = mountContainer({ type: 'text' })
    expect(w.findAll('.ldp-section-title').length).toBe(0)
    expect(w.findAll('.ldp-prop').length, '只有"容器类型"一行').toBe(1)
    w.unmount()
  })
})

describe('容器区：grid', () => {
  it('列数默认 2，改 3 只写 containerConfig.columns', () => {
    const { w, lastPatch } = mountContainer({ type: 'grid' })
    const sel = w.findComponent(Select)
    expect(sel.props('modelValue'), '默认 2 列').toBe(2)
    sel.vm.$emit('update:modelValue', 3)
    expect(lastPatch()).toEqual({ containerConfig: { columns: 3 } })
    w.unmount()
  })

  it('改列数**保留**其它容器配置（不整体重建）', () => {
    const { w, lastPatch } = mountContainer({
      type: 'grid',
      containerConfig: { gap: 8, wrap: false } as never,
    })
    w.findComponent(Select).vm.$emit('update:modelValue', 4)
    expect(lastPatch()).toEqual({ containerConfig: { gap: 8, wrap: false, columns: 4 } })
    w.unmount()
  })
})

describe('容器区：flex', () => {
  it('默认值：gap=12、wrap=true、justify=start', () => {
    const { w } = mountContainer({ type: 'flex' })
    const sels = w.findAllComponents(Select)
    expect(sels[0].props('modelValue'), 'gap 默认 12').toBe(12)
    expect(sels[1].props('modelValue'), 'justify 默认 start').toBe('start')
    expect(w.findComponent(Group).props('modelValue'), 'wrap 默认 true').toBe(true)
    w.unmount()
  })

  it('`wrap: false` 要能正确显示为关闭（不能用 `||` 判默认）', () => {
    const { w } = mountContainer({ type: 'flex', containerConfig: { wrap: false } as never })
    expect(w.findComponent(Group).props('modelValue'), 'wrap=false 必须显示为关').toBe(false)
    w.unmount()
  })

  it('改 gap / wrap / justify 各只写自己那个键', () => {
    const { w, lastPatch } = mountContainer({ type: 'flex' })
    const sels = w.findAllComponents(Select)
    sels[0].vm.$emit('update:modelValue', 24)
    expect(lastPatch()).toEqual({ containerConfig: { gap: 24 } })
    w.findComponent(Group).vm.$emit('update:modelValue', false)
    expect(lastPatch()).toEqual({ containerConfig: { wrap: false } })
    sels[1].vm.$emit('update:modelValue', 'center')
    expect(lastPatch()).toEqual({ containerConfig: { justify: 'center' } })
    w.unmount()
  })
})

describe('容器区：tabs / collapse / steps 的行文本解析', () => {
  it('tabs：空行被过滤，name 按下标生成 tab1..tabN', () => {
    const { w, lastPatch } = mountContainer({ type: 'tabs' })
    const ta = w.find('textarea')
    ;(ta.element as HTMLTextAreaElement).value = '页一\n\n页二\n'
    ta.trigger('input')
    const cfg = lastPatch()!.containerConfig as { tabs: { label: string; name: string }[] }
    expect(cfg.tabs).toEqual([
      { label: '页一', name: 'tab1' },
      { label: '页二', name: 'tab2' },
    ])
    w.unmount()
  })

  it('tabs：已有列表回显为「每行一个标签」', () => {
    const { w } = mountContainer({
      type: 'tabs',
      containerConfig: { tabs: [{ label: '甲', name: 't1' }, { label: '乙', name: 't2' }] } as never,
    })
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('甲\n乙')
    w.unmount()
  })

  it('collapse：每项 expanded 置 true（新加的项默认展开）', () => {
    const { w, lastPatch } = mountContainer({ type: 'collapse' })
    const ta = w.find('textarea')
    ;(ta.element as HTMLTextAreaElement).value = '第一组\n第二组'
    ta.trigger('input')
    const cfg = lastPatch()!.containerConfig as { collapseItems: { title: string; expanded: boolean }[] }
    expect(cfg.collapseItems).toEqual([
      { title: '第一组', expanded: true },
      { title: '第二组', expanded: true },
    ])
    w.unmount()
  })

  it('steps：只写 title（步骤没有 expanded 之类的附带字段）', () => {
    const { w, lastPatch } = mountContainer({ type: 'steps' })
    const ta = w.find('textarea')
    ;(ta.element as HTMLTextAreaElement).value = '填信息\n确认\n完成'
    ta.trigger('input')
    const cfg = lastPatch()!.containerConfig as { steps: { title: string }[] }
    expect(cfg.steps).toEqual([{ title: '填信息' }, { title: '确认' }, { title: '完成' }])
    w.unmount()
  })

  it('三种列表都**保留**其它容器配置（不整体重建）', () => {
    for (const [type, key] of [
      ['tabs', 'tabs'],
      ['collapse', 'collapseItems'],
      ['steps', 'steps'],
    ] as const) {
      const { w, lastPatch } = mountContainer({ type, containerConfig: { gap: 8 } as never })
      const ta = w.find('textarea')
      ;(ta.element as HTMLTextAreaElement).value = 'x'
      ta.trigger('input')
      const cfg = lastPatch()!.containerConfig as Record<string, unknown>
      expect(cfg.gap, `${type} 应保留 gap`).toBe(8)
      expect(Array.isArray(cfg[key]), `${type} 应写入 ${key}`).toBe(true)
      w.unmount()
    }
  })
})