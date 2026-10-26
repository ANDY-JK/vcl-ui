/**
 * 设计器属性面板·事件配置页（第 131 轮）。此前**分支覆盖 14%**（81 个分支只走到 11 个）。
 *
 * 这个页面把 `eventConfig` 分成三块（onChange / onBlur / 联动）分别编辑，而每块编辑时都要
 * **重建 `eventConfig` 再合并**。这类"嵌套重建"最容易出的错是**丢掉别的块刚配好的值** ——
 * 界面上看不出来（你配的这块是对的），只有导出 schema 时才发现目标字段或接口地址没了。
 *
 * 因此重点：三块互不覆盖、动作专属字段的条件渲染、以及"死配置"的清理。
 * 交互一律通过子组件的 `update:modelValue` 驱动（与 designer-props-panel.spec.ts 一致）。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import PropsEventPage from '@/components/form-builder/designer/PropsEventPage.vue'
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import Group from '@/components/form/Group.vue'
import type { DesignerNode, DesignerEventConfig } from '@/components/form-builder/designer/types'

const FIELD_OPTIONS = [
  { value: 'a', label: '字段A' },
  { value: 'b', label: '字段B' },
]

function mountPage(eventConfig: Partial<DesignerEventConfig> | undefined) {
  const w = mount(PropsEventPage, {
    props: {
      node: { id: 'n1', key: 'k1', label: '字段', type: 'text', eventConfig } as DesignerNode,
      fieldOptions: FIELD_OPTIONS,
    },
  })
  const lastPatch = (): Partial<DesignerNode> | undefined => {
    const evs = w.emitted('update') as Array<[Partial<DesignerNode>]> | undefined
    return evs?.at(-1)?.[0]
  }
  const lastEvt = (): DesignerEventConfig | undefined => lastPatch()?.eventConfig
  const labels = () => w.findAll('label').map((l) => l.text())
  return { w, lastPatch, lastEvt, labels }
}

// ════════════════════════════════════════════════════════════════════
describe('契约：patch 形状', () => {
  it('每个 emit 只带 eventConfig 一个顶层键（避免把节点其它字段一起覆盖）', () => {
    const src = readFileSync('src/components/form-builder/designer/PropsEventPage.vue', 'utf8')
    const calls = [...src.matchAll(/emit\('update',\s*\{([\s\S]*?)\}\)/g)].map((m) => m[1].trim())
    expect(calls.length, '前提：抓到了 emit 调用').toBeGreaterThanOrEqual(6)
    for (const body of calls) {
      expect(body.startsWith('eventConfig:'), `patch 出现了别的顶层键：${body.slice(0, 40)}`).toBe(true)
    }
  })
})

describe('区块标题不重复（拆分自 PropsPanel 的残留）', () => {
  it('本页只有 2 个区块标题，且互不相同', () => {
    const { w } = mountPage(undefined)
    const titles = w.findAll('.ldp-section-title').map((n) => n.text())
    expect(titles.length, '事件页应有 2 个区块标题').toBe(2)
    expect(new Set(titles).size, `标题重复了：${JSON.stringify(titles)}`).toBe(2)
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('onChange 卡片：动作专属字段的条件渲染', () => {
  it('未启用时不显示展开区', () => {
    const { w } = mountPage(undefined)
    expect(w.findAll('.ldp-event-body').length, '未启用不该有展开区').toBe(0)
    w.unmount()
  })

  it('启用后展开动作选择；**未选动作时没有专属字段**', () => {
    const { w, labels } = mountPage({ onChange: { enabled: true, action: '' } })
    expect(w.findAll('.ldp-event-body').length).toBe(1)
    expect(labels(), '未选动作时不应出现目标字段/接口地址').toEqual(['联动类型'])
    w.unmount()
  })

  it('setValue / toggleVisible 才出现「目标字段」，且不出现「接口地址」', () => {
    for (const action of ['setValue', 'toggleVisible']) {
      const { w, labels } = mountPage({ onChange: { enabled: true, action } })
      expect(labels(), `${action} 应出现目标字段`).toContain('目标字段')
      expect(labels(), `${action} 不该出现接口地址`).not.toContain('接口地址')
      w.unmount()
    }
  })

  it('callApi 才出现「接口地址」，且不出现「目标字段」', () => {
    const { w, labels } = mountPage({ onChange: { enabled: true, action: 'callApi' } })
    expect(labels()).toContain('接口地址')
    expect(labels()).not.toContain('目标字段')
    w.unmount()
  })

  it('linkField / showTip **没有**专属字段（实现如此，不是漏配）', () => {
    for (const action of ['linkField', 'showTip']) {
      const { w, labels } = mountPage({ onChange: { enabled: true, action } })
      expect(labels(), `${action} 不该有专属字段`).toEqual(['联动类型'])
      w.unmount()
    }
  })
})

describe('onChange 卡片：编辑时不吃掉别的配置', () => {
  it('写接口地址时**保留**已配好的 action 与 targetField（此前会把 targetField 丢掉）', () => {
    const { w, lastEvt } = mountPage({
      onChange: { enabled: true, action: 'callApi', targetField: 'b', apiUrl: '' },
    })
    w.findComponent(Input).vm.$emit('update:modelValue', 'https://api.example.com/x')
    const evt = lastEvt()!
    expect(evt.onChange?.apiUrl).toBe('https://api.example.com/x')
    expect(evt.onChange?.targetField, '先配的目标字段不能因为填接口地址而消失').toBe('b')
    expect(evt.onChange?.action).toBe('callApi')
    w.unmount()
  })

  it('写接口地址时**不丢其它块**（onBlur / 联动都必须原样保留）', () => {
    const { w, lastEvt } = mountPage({
      onChange: { enabled: true, action: 'callApi' },
      onBlur: { enabled: true, action: 'format' },
      linkageType: 'followValue',
      linkageFormula: '{{a}}{{b}}',
    })
    w.findComponent(Input).vm.$emit('update:modelValue', 'https://api.example.com/x')
    const evt = lastEvt()!
    expect(evt.onBlur, 'onBlur 块不能丢').toEqual({ enabled: true, action: 'format' })
    expect(evt.linkageType).toBe('followValue')
    expect(evt.linkageFormula).toBe('{{a}}{{b}}')
    w.unmount()
  })

  it('目标字段下拉的候选来自 fieldOptions（不是写死的）', () => {
    const { w } = mountPage({ onChange: { enabled: true, action: 'setValue' } })
    // 展开区里除动作选择外还有一个 Select（目标字段）
    const selects = w.find('.ldp-event-body').findAllComponents(Select)
    expect(selects.length, '展开区应有 2 个 Select：动作 + 目标字段').toBe(2)
    expect((selects[1].props('options') as unknown[]).length, '目标字段候选应来自 fieldOptions').toBe(2)
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('onBlur 卡片', () => {
  it('未启用无展开区；启用后出现动作选择', () => {
    const a = mountPage(undefined)
    expect(a.w.findAll('.ldp-event-body').length).toBe(0)
    a.w.unmount()
    const b = mountPage({ onBlur: { enabled: true, action: '' } })
    expect(b.w.findAll('.ldp-event-body').length, 'onBlur 启用后应有展开区').toBe(1)
    b.w.unmount()
  })

  it('onBlur 展开区里**没有**目标字段/接口地址（它只有动作选择）', () => {
    const { w, labels } = mountPage({ onBlur: { enabled: true, action: 'format' } })
    expect(labels()).toEqual(['联动类型'])
    w.unmount()
  })

  it('两个都启用时有两个展开区', () => {
    const { w } = mountPage({
      onChange: { enabled: true, action: 'setValue' },
      onBlur: { enabled: true, action: 'submit' },
    })
    expect(w.findAll('.ldp-event-body').length).toBe(2)
    w.unmount()
  })

  it('onBlur 动作变化**不丢** onChange 配置', () => {
    const { w, lastEvt } = mountPage({
      onChange: { enabled: true, action: 'setValue', targetField: 'a' },
      onBlur: { enabled: true, action: '' },
    })
    // 第二个展开区里的 Select 是 onBlur 的动作选择
    const blurBody = w.findAll('.ldp-event-body')[1]
    blurBody.findComponent(Select).vm.$emit('update:modelValue', 'format')
    const evt = lastEvt()!
    expect(evt.onBlur?.action).toBe('format')
    expect(evt.onChange, 'onChange 配置不能因编辑 onBlur 而丢').toEqual({
      enabled: true,
      action: 'setValue',
      targetField: 'a',
    })
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('字段联动', () => {
  it('linkageType 未设或为 none 时**不渲染**联动公式', () => {
    for (const lt of [undefined, 'none' as const]) {
      const { w, labels } = mountPage({ linkageType: lt })
      expect(labels(), `linkageType=${String(lt)} 不该有联动公式`).toEqual(['联动类型'])
      w.unmount()
    }
  })

  it.each([
    ['followValue', '值'],
    ['followOptions', '选项'],
    ['showHide', '显隐'],
  ])('linkageType=%s 时出现联动公式与对应帮助提示', (lt, hintWord) => {
    const { w, labels } = mountPage({ linkageType: lt as 'followValue' })
    expect(labels()).toContain('联动公式')
    const help = w.find('.ldp-linkage-help')
    expect(help.exists(), '应有帮助提示区').toBe(true)
    expect(help.text(), `帮助提示应提到「${hintWord}」`).toContain(hintWord)
    w.unmount()
  })

  it('只有 showHide 出现「目标字段」', () => {
    const sh = mountPage({ linkageType: 'showHide' })
    expect(sh.labels()).toContain('目标字段')
    sh.w.unmount()
    for (const lt of ['followValue', 'followOptions'] as const) {
      const { w, labels } = mountPage({ linkageType: lt })
      expect(labels(), `${lt} 不该有目标字段`).not.toContain('目标字段')
      w.unmount()
    }
  })

  it('三种联动的公式 placeholder 互不相同（三类公式写法不同，提示必须区分）', () => {
    const seen = new Map<string, string>()
    for (const lt of ['followValue', 'followOptions', 'showHide'] as const) {
      const { w } = mountPage({ linkageType: lt })
      // 联动公式是 Input（不是 Select）；同一配置里 Select 可能也有 placeholder，故按组件类型取
      const input = w.findComponent(Input)
      expect(input.exists(), `${lt} 应有联动公式输入框`).toBe(true)
      const ph = String(input.props('placeholder') ?? '')
      expect(ph, `${lt} 的公式 placeholder 不该为空`).toBeTruthy()
      seen.set(lt, ph)
      w.unmount()
    }
    expect(seen.size).toBe(3)
    expect(new Set(seen.values()).size, `三者应互不相同：${JSON.stringify([...seen])}`).toBe(3)
  })

  it('写联动公式时**不丢** onChange / onBlur / linkageType', () => {
    const { w, lastEvt } = mountPage({
      onChange: { enabled: true, action: 'setValue', targetField: 'a' },
      onBlur: { enabled: true, action: 'format' },
      linkageType: 'followValue',
      linkageFormula: '',
    })
    w.findComponent(Input).vm.$emit('update:modelValue', '{{a}}+{{b}}')
    const evt = lastEvt()!
    expect(evt.linkageFormula).toBe('{{a}}+{{b}}')
    expect(evt.onChange, 'onChange 不能丢').toBeTruthy()
    expect(evt.onBlur, 'onBlur 不能丢').toBeTruthy()
    expect(evt.linkageType).toBe('followValue')
    w.unmount()
  })

  it('showHide 选目标字段时**保留 apiUrl**（此前重建整个 onChange 会抹掉它）', () => {
    const { w, lastEvt } = mountPage({
      linkageType: 'showHide',
      onChange: { enabled: true, action: 'callApi', apiUrl: 'https://api.example.com/y' },
    })
    // showHide 区的目标字段 Select：本页最后一个 Select
    const all = w.findAllComponents(Select)
    const target = all.at(-1)!
    target.vm.$emit('update:modelValue', 'b')
    const evt = lastEvt()!
    expect(evt.onChange?.targetField).toBe('b')
    expect(evt.onChange?.apiUrl, 'apiUrl 不能被显隐联动的目标字段抹掉').toBe('https://api.example.com/y')
    expect(evt.linkageType).toBe('showHide')
    w.unmount()
  })

  it('切联动类型走整份 eventConfig 展开（不丢兄弟键）', () => {
    const src = readFileSync('src/components/form-builder/designer/PropsEventPage.vue', 'utf8')
    const i = src.indexOf('linkageType: $event as')
    expect(i).toBeGreaterThan(0)
    // 往前 200 字符里应出现 `...node.eventConfig`
    expect(src.slice(Math.max(0, i - 200), i), '切联动类型应展开原 eventConfig').toContain('...node.eventConfig')
  })
})

// ════════════════════════════════════════════════════════════════════
describe('开关：把某块关掉时保留其内部配置（便于再打开）', () => {
  it('关掉 onChange 后 targetField/apiUrl 仍在（只是 enabled=false）', () => {
    const { w, lastEvt } = mountPage({
      onChange: { enabled: true, action: 'callApi', targetField: 'b', apiUrl: 'https://a.example.com' },
    })
    const toggle = w.findAllComponents(Group)[0]
    toggle.vm.$emit('update:modelValue', false)
    const evt = lastEvt()!
    expect(evt.onChange?.enabled).toBe(false)
    expect(evt.onChange?.targetField, '关掉开关不该抹掉已配的目标字段').toBe('b')
    expect(evt.onChange?.apiUrl).toBe('https://a.example.com')
    w.unmount()
  })

  it('关掉 onBlur 后 action 仍在', () => {
    const { w, lastEvt } = mountPage({ onBlur: { enabled: true, action: 'format' } })
    const toggles = w.findAllComponents(Group)
    toggles.at(-1)!.vm.$emit('update:modelValue', false)
    const evt = lastEvt()!
    expect(evt.onBlur?.enabled).toBe(false)
    expect(evt.onBlur?.action, '关掉开关不该抹掉已选动作').toBe('format')
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('onFocus 死配置已移除', () => {
  it('面板里**没有**「获得焦点」开关（运行时只派发 change/blur，配了没人读）', () => {
    const { w } = mountPage({ onFocus: { enabled: true, action: 'x' } })
    expect(w.text()).not.toContain('获得焦点')
    w.unmount()
  })

  it('运行时确实只有 change/blur 两个触发器（移除依据；将来支持 focus 就该改回这条）', () => {
    const src = readFileSync('src/components/form-builder/useFormEvents.ts', 'utf8')
    const m = src.match(/function handleFieldChange\(field: FormField, trigger: ([^)]+)\)/)
    expect(m, '找不到 handleFieldChange 签名').toBeTruthy()
    expect(m![1]).toContain("'change'")
    expect(m![1]).toContain("'blur'")
    expect(m![1], '运行时一旦支持 focus，就该把面板开关加回来并改这条用例').not.toContain('focus')
  })

  it('to-schema 也不再导出 events.onFocus，但保留 onChange / onBlur', () => {
    const src = readFileSync('src/components/form-builder/designer/types/to-schema.ts', 'utf8')
    expect(src, '不该再有 onFocus 导出').not.toContain('evt?.onFocus?.enabled')
    expect(src).toContain('evt?.onChange?.enabled')
    expect(src).toContain('evt?.onBlur?.enabled')
  })
})