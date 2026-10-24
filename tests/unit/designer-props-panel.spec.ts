/**
 * PropsPanel.vue — 设计器右栏属性面板（686 行）逐项契约
 *
 * ## 为什么补（单文件口径 语句 79.7% / 分支 62.2% / **函数 32.9%**，44 行未覆盖）
 *
 * 既有 2 个 spec 只覆盖 number / scan-code 两种字段类型，而这个面板是**按字段类型
 * 分叉的巨型模板**：约 40 个内联事件处理器、9 个 `template v-if` 类型块、5 个页签、
 * 一组「注册表 defaults 里有没有这个 key」的能力判定。也就是**每种字段类型渲染哪些行、
 * 每行 emit 出什么结构，此前基本靠肉眼**。本轮按「行」定位（用 i18n 文案精确匹配
 * `.ldp-prop > label`），把下列内容锁死：
 *
 * ① 五个页签的渲染、`aria-selected`/`active` 同步、点击与 Enter/Space 键盘切换；
 * ② **容器节点只有「基本」页**，且从字段切到容器时失效页签被拉回 basic（否则面板空白）；
 * ③ 基础页通用项：label（paragraph 用 textarea、其余用 Input）、`name-change` 同步、
 *    key（null → 空串）、span 的 Number 化、required/disabled/readonly 三个开关；
 * ④ **按类型分叉**：placeholder、图标（IconPicker + 清除按钮）、后缀文字、hint、
 *    默认值（text/textarea/number/switch 各走不同转换器）、options 编辑器（按行切分并
 *    **去掉空行**）、min/max/step、maxLength、rows、rateMax/rateAllowHalf、
 *    cascaderOptions 的 JSON 合法态、accept/multiple/maxSize、
 *    scanFormats/scanPrefix/scanLength、slider；
 * ⑤ **能力判定为假时不渲染**（`hasHint` 只认 input/select/upload 三类分类；
 *    `isTextInput` 排除 textarea；`hasOptions` 看注册表有无 options）；
 * ⑥ 样式页：labelPosition/controlWidth/size/radius 四个下拉、borderColor 与
 *    focusBorderColor 的「取色器 + 文本框」双入口、customClass，且**合并时不能丢其它
 *    styleConfig 键**；⑦ 六个子组件（容器段/高级字段/条件组/校验页/事件页/数据页）的
 *    `@update` 转发；⑧ `visibleWhenFieldOptions` 过滤自身、容器与无 key 的节点。
 *
 * ## harness
 *
 * 全部用 **`vm.$emit` 驱动子组件**（Input/Select/Group/IconPicker 都是自定义组件，
 * 原生 `setValue` 打不到它们的 v-model），只有原生 `<textarea>`/`<input type=color>`
 * 才走 `setValue`。行定位失败会直接抛错（`rowOf` 里断言存在），避免「找不到控件却静默
 * 通过」——这是本轮刻意加的护栏。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

import PropsPanel from '@/components/form-builder/designer/PropsPanel.vue'
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import Group from '@/components/form/Group.vue'
import IconPicker from '@/components/form/IconPicker.vue'
import PropsContainerSection from '@/components/form-builder/designer/PropsContainerSection.vue'
import PropsAdvancedFields from '@/components/form-builder/designer/PropsAdvancedFields.vue'
import PropsConditionGroup from '@/components/form-builder/designer/PropsConditionGroup.vue'
import PropsValidationPage from '@/components/form-builder/designer/PropsValidationPage.vue'
import PropsEventPage from '@/components/form-builder/designer/PropsEventPage.vue'
import PropsDataPage from '@/components/form-builder/designer/PropsDataPage.vue'
import type { DesignerNode } from '@/components/form-builder/designer/types'
import { useT } from '@/components/_internal/i18n'

const t = useT()

/* ═══════════ 夹具 ═══════════ */

const node = (over: Record<string, unknown> = {}): DesignerNode =>
  ({ id: 'n1', type: 'text', label: '姓名', key: 'name', ...over }) as unknown as DesignerNode

const allNodes: DesignerNode[] = [
  node({ id: 'n1', type: 'text', label: '姓名', key: 'name' }),
  node({ id: 'n2', type: 'select', label: '城市', key: 'city' }),
  node({ id: 'n3', type: 'group', label: '分组', key: '' }), // 无 key → 不进可选项
  node({ id: 'n4', type: 'grid', label: '栅格', key: 'grid1' }), // 容器 → 不进可选项
]

function mountPanel(nodeOver: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const w = mount(PropsPanel, {
    props: { node: node(nodeOver), allNodes, ...extra },
    attachTo: document.body,
  })
  return w
}

/** 按 i18n 文案精确定位一行；找不到直接抛错，避免「控件不存在却静默通过」 */
function rowOf(w: ReturnType<typeof mountPanel>, label: string) {
  const r = w
    .findAll('.ldp-prop')
    .find((el) => el.find('label').exists() && el.find('label').text() === label)
  if (!r) throw new Error(`找不到属性行：${label}`)
  return r
}

/** 样式页容器 = 「自定义类名」行所在的 .ldp-prop-page（按内容定位，不靠下标猜页序） */
function stylePage(w: ReturnType<typeof mountPanel>): HTMLElement {
  return rowOf(w, t('fbp.customClass')).element.closest('.ldp-prop-page') as HTMLElement
}

const lastUpdate = (w: ReturnType<typeof mountPanel>) => {
  const ev = w.emitted('update')
  expect(ev, '至少 emit 过 update').toBeTruthy()
  return ev![ev!.length - 1]![0] as Record<string, unknown>
}

afterEach(() => {
  document.body.innerHTML = ''
})

/* ═══════════ ① 页签 ═══════════ */

describe('属性页签', () => {
  it('**非容器五个页签，点击切换且 aria-selected/active 同步**', async () => {
    const w = mountPanel({ type: 'text' })
    await flushPromises()
    const tabs = w.findAll('.ldp-prop-tab')
    expect(tabs.length, '五个页签').toBe(5)
    expect(tabs[0]!.attributes('aria-selected'), '默认在基本页').toBe('true')
    expect(tabs[0]!.classes().includes('active')).toBe(true)

    await tabs[2]!.trigger('click') // 样式
    await nextTick()
    expect(tabs[2]!.attributes('aria-selected'), '样式页选中').toBe('true')
    expect(tabs[0]!.attributes('aria-selected'), '基本页取消').toBe('false')
    expect(tabs[2]!.classes().includes('active')).toBe(true)
    // v-show：基本页隐藏、样式页显示（.ldp-prop-page 的第一个就是基本页）
    expect(w.find('.ldp-prop-page').element.style.display, '基本页隐藏').toBe('none')
    expect(stylePage(w).style.display, '样式页显示').not.toBe('none')
    w.unmount()
  })

  it('**键盘 Enter 与 Space 都能切页签**', async () => {
    const w = mountPanel({ type: 'text' })
    await flushPromises()
    const tabs = w.findAll('.ldp-prop-tab')
    await tabs[3]!.trigger('keydown.enter')
    await nextTick()
    expect(tabs[3]!.attributes('aria-selected'), 'Enter 切到事件页').toBe('true')
    await tabs[4]!.trigger('keydown.space')
    await nextTick()
    expect(tabs[4]!.attributes('aria-selected'), 'Space 切到数据页').toBe('true')
    expect(tabs[3]!.attributes('aria-selected')).toBe('false')
    w.unmount()
  })

  it('**容器节点只有「基本」页签**', async () => {
    const w = mountPanel({ type: 'grid' })
    await flushPromises()
    const tabs = w.findAll('.ldp-prop-tab')
    expect(tabs.length, '容器只有一个页签').toBe(1)
    expect(tabs[0]!.text()).toBe(t('fbp.tabBasic'))
    w.unmount()
  })

  it('**从字段（在样式页）切到容器 → 失效页签被拉回基本页**', async () => {
    const w = mountPanel({ type: 'text' })
    await flushPromises()
    await w.findAll('.ldp-prop-tab')[2]!.trigger('click') // 到样式页
    await nextTick()
    expect(w.findAll('.ldp-prop-tab')[2]!.attributes('aria-selected')).toBe('true')

    // 换成容器节点：容器没有样式页，必须回落到 basic，否则面板整片空白
    await w.setProps({ node: node({ id: 'n9', type: 'grid', label: '栅格' }) })
    await flushPromises()
    const tabs = w.findAll('.ldp-prop-tab')
    expect(tabs.length).toBe(1)
    expect(tabs[0]!.attributes('aria-selected'), '回落基本页').toBe('true')
    expect(w.find('.ldp-prop-page').element.style.display, '基本页可见').not.toBe('none')
    w.unmount()
  })

  it('**切页签时面板滚回顶部**（长表单里否则看不到新页内容）', async () => {
    const w = mountPanel({ type: 'text' })
    await flushPromises()
    const panel = w.find('.ldp-props').element as HTMLElement
    panel.scrollTop = 480
    await w.findAll('.ldp-prop-tab')[1]!.trigger('click')
    await nextTick()
    expect(panel.scrollTop, '回到顶部').toBe(0)
    w.unmount()
  })
})

/* ═══════════ ② 基础页通用项 ═══════════ */

describe('基础页通用项', () => {
  it('**label 输入同时 emit update.label 与 name-change**', async () => {
    const w = mountPanel({ type: 'text' })
    await flushPromises()
    rowOf(w, t('fbp.labelName')).findComponent(Input).vm.$emit('update:modelValue', '联系人')
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ label: '联系人' })
    expect(w.emitted('name-change')![0]![0], 'name-change 同步').toBe('联系人')
    w.unmount()
  })

  it('**paragraph 用 textarea 编辑 label，且不再渲染 Input**', async () => {
    const w = mountPanel({ type: 'paragraph', type2: undefined })
    await flushPromises()
    const row = rowOf(w, t('fbp.labelName'))
    const ta = row.find('textarea')
    expect(ta.exists(), 'paragraph 用多行编辑').toBe(true)
    expect(row.findComponent(Input).exists(), '不再是单行 Input').toBe(false)
    await ta.setValue('这是一段说明\n第二行')
    expect(lastUpdate(w)).toEqual({ label: '这是一段说明\n第二行' })
    w.unmount()
  })

  it('**name-change 收到 null/undefined 时空串兜底**', async () => {
    const w = mountPanel({ type: 'text' })
    await flushPromises()
    rowOf(w, t('fbp.labelName')).findComponent(Input).vm.$emit('update:modelValue', null)
    await flushPromises()
    expect(lastUpdate(w), 'null 落成空串').toEqual({ label: '' })
    expect(w.emitted('name-change')![0]![0]).toBe('')
    w.unmount()
  })

  it('**key 输入 emit update.key，null 落成空串**', async () => {
    const w = mountPanel({ type: 'text' })
    await flushPromises()
    const inp = rowOf(w, t('fbp.fieldKey')).findComponent(Input)
    inp.vm.$emit('update:modelValue', 'phone')
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ key: 'phone' })
    inp.vm.$emit('update:modelValue', null)
    await flushPromises()
    expect(lastUpdate(w), 'null → 空串而不是 "null"').toEqual({ key: '' })
    w.unmount()
  })

  it('**span 下拉把值转成 Number**', async () => {
    const w = mountPanel({ type: 'text' })
    await flushPromises()
    const sel = rowOf(w, t('fbp.spanWidth')).findComponent(Select)
    sel.vm.$emit('update:modelValue', 12)
    await flushPromises()
    expect(lastUpdate(w), 'span 是数字而非字符串').toEqual({ span: 12 })
    sel.vm.$emit('update:modelValue', '8')
    await flushPromises()
    expect(lastUpdate(w), '字符串也要转成数字').toEqual({ span: 8 })
    w.unmount()
  })

  it('**required/disabled/readonly 三个开关各自双向 emit**', async () => {
    const w = mountPanel({ type: 'text' })
    await flushPromises()
    for (const [labelKey, field] of [
      [t('fbp.required'), 'required'],
      [t('fbp.disabled'), 'disabled'],
      [t('fbp.readonly'), 'readonly'],
    ] as Array<[string, string]>) {
      const sw = rowOf(w, labelKey).findComponent(Group)
      sw.vm.$emit('update:modelValue', true)
      await flushPromises()
      expect(lastUpdate(w), `${field} → true`).toEqual({ [field]: true })
      sw.vm.$emit('update:modelValue', false)
      await flushPromises()
      expect(lastUpdate(w), `${field} → false`).toEqual({ [field]: false })
      // 真值非布尔量：不做 !! 转换的实现在这里会漏出 1 / "yes"
      sw.vm.$emit('update:modelValue', 1)
      await flushPromises()
      expect(lastUpdate(w), `${field} 必须归一成布尔`).toEqual({ [field]: true })
    }
    w.unmount()
  })

  it('**开关回显节点现值**', async () => {
    const w = mountPanel({ type: 'text', required: true, disabled: false, readonly: true })
    await flushPromises()
    expect(rowOf(w, t('fbp.required')).findComponent(Group).props('modelValue')).toBe(true)
    expect(rowOf(w, t('fbp.disabled')).findComponent(Group).props('modelValue')).toBe(false)
    expect(rowOf(w, t('fbp.readonly')).findComponent(Group).props('modelValue')).toBe(true)
    w.unmount()
  })
})

/* ═══════════ ③ 按字段类型分叉 ═══════════ */

describe('按字段类型分叉', () => {
  it('**text：placeholder / 图标 / 后缀 / hint / 默认值 / maxLength 全部可编辑**', async () => {
    const w = mountPanel({ type: 'text' })
    await flushPromises()

    rowOf(w, t('fbp.placeholder')).findComponent(Input).vm.$emit('update:modelValue', '请输入')
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ placeholder: '请输入' })

    const iconRow = rowOf(w, t('fbp.prefixIcon'))
    iconRow.findComponent(IconPicker).vm.$emit('update:modelValue', 'user')
    await flushPromises()
    expect(lastUpdate(w), '选图标').toEqual({ icon: 'user' })
    iconRow.findComponent(IconPicker).vm.$emit('update:modelValue', null)
    await flushPromises()
    expect(lastUpdate(w), 'null 图标落成空串').toEqual({ icon: '' })

    rowOf(w, t('fbp.suffixText')).findComponent(Input).vm.$emit('update:modelValue', '元')
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ suffixText: '元' })

    rowOf(w, t('fbp.hint')).findComponent(Input).vm.$emit('update:modelValue', '提示语')
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ hint: '提示语' })

    rowOf(w, t('fbp.defaultValue')).findComponent(Input).vm.$emit('update:modelValue', 'abc')
    await flushPromises()
    expect(lastUpdate(w), '文本默认值原样保留').toEqual({ defaultValue: 'abc' })

    rowOf(w, t('fbp.valMaxLen')).findComponent(Input).vm.$emit('update:modelValue', '20')
    await flushPromises()
    expect(lastUpdate(w), 'maxLength 走数字转换').toEqual({ maxLength: 20 })
    w.unmount()
  })

  it('**text：已有图标时出现清除按钮，点击 emit icon 空串**', async () => {
    const w = mountPanel({ type: 'text', icon: 'user' })
    await flushPromises()
    const cleared = w.findAll('.ldp-icon-clear')
    expect(cleared.length, '出现清除按钮').toBe(1)
    await cleared[0]!.trigger('click')
    expect(lastUpdate(w)).toEqual({ icon: '' })
    w.unmount()
  })

  it('**number：默认值/上下限/步长走数字转换，清空落 undefined**', async () => {
    const w = mountPanel({ type: 'number' })
    await flushPromises()
    const num = (label: string) => rowOf(w, label).findComponent(Input)

    num(t('fbp.defaultValue')).vm.$emit('update:modelValue', '42')
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ defaultValue: 42 })
    num(t('fbp.defaultValue')).vm.$emit('update:modelValue', '')
    await flushPromises()
    expect(lastUpdate(w), '清空必须落 undefined（落 0 会锁死输入框）').toEqual({ defaultValue: undefined })
    num(t('fbp.defaultValue')).vm.$emit('update:modelValue', 'abc')
    await flushPromises()
    expect(lastUpdate(w), '非数字落 undefined').toEqual({ defaultValue: undefined })

    for (const [label, field, v] of [
      [t('fbp.min'), 'min', '0'],
      [t('fbp.max'), 'max', '100'],
      [t('fbp.step'), 'step', '5'],
    ] as Array<[string, string, string]>) {
      num(label).vm.$emit('update:modelValue', v)
      await flushPromises()
      expect(lastUpdate(w), `${field} 数字转换`).toEqual({ [field]: Number(v) })
    }
    w.unmount()
  })

  it('**switch：默认值走 Group 布尔转换**', async () => {
    const w = mountPanel({ type: 'switch' })
    await flushPromises()
    const sw = rowOf(w, t('fbp.defaultOn'))
    const g = sw.findComponent(Group)
    g.vm.$emit('update:modelValue', true)
    await flushPromises()
    expect(lastUpdate(w), '布尔直传').toEqual({ defaultValue: true })
    g.vm.$emit('update:modelValue', 1)
    await flushPromises()
    expect(lastUpdate(w), '真值非布尔量也要归一成布尔').toEqual({ defaultValue: true })
    w.unmount()
  })

  it('**select：options 编辑器按行切分并丢掉空行**', async () => {
    const w = mountPanel({ type: 'select', options: ['A', 'B'] })
    await flushPromises()
    const ta = rowOf(w, t('fbp.optionsList')).find('textarea')
    expect((ta.element as HTMLTextAreaElement).value, '回显现有选项按行').toBe('A\nB')
    await ta.setValue('A\n\nB\n\nC')
    expect(lastUpdate(w), '空行被丢掉').toEqual({ options: ['A', 'B', 'C'] })
    w.unmount()
  })

  it('**textarea：有 rows、无图标/后缀行**（isTextInput 排除 textarea）', async () => {
    const w = mountPanel({ type: 'textarea' })
    await flushPromises()
    rowOf(w, t('fbp.rows')).findComponent(Input).vm.$emit('update:modelValue', '6')
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ rows: 6 })
    expect(() => rowOf(w, t('fbp.prefixIcon')), 'textarea 不该有图标行').toThrow()
    expect(() => rowOf(w, t('fbp.suffixText'))).toThrow()
    w.unmount()
  })

  it('**rate：上限与半星开关**', async () => {
    const w = mountPanel({ type: 'rate' })
    await flushPromises()
    rowOf(w, t('fbp.stars')).findComponent(Input).vm.$emit('update:modelValue', '10')
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ rateMax: 10 })
    const half = rowOf(w, t('fbp.allowHalf')).findComponent(Group)
    half.vm.$emit('update:modelValue', true)
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ rateAllowHalf: true })
    half.vm.$emit('update:modelValue', 'yes')
    await flushPromises()
    expect(lastUpdate(w), '字符串真值也要归一成布尔').toEqual({ rateAllowHalf: true })
    w.unmount()
  })

  it('**cascader：选项文本框原样传，且合法/非法 JSON 两态提示不同**', async () => {
    const w = mountPanel({ type: 'cascader' })
    await flushPromises()
    const hint = () => rowOf(w, t('fbp.cascaderOptions')).find('.ldp-prop-hint')
    expect(hint().text(), '空值判为非法').toContain(t('fbp.jsonBad'))
    expect(hint().classes().includes('ldp-prop-ok')).toBe(false)

    await rowOf(w, t('fbp.cascaderOptions')).find('textarea').setValue('[{"value":"zj","label":"浙江"}]')
    expect(lastUpdate(w), '原样传字符串（由下游解析）').toEqual({
      cascaderOptions: '[{"value":"zj","label":"浙江"}]',
    })

    const w2 = mountPanel({ type: 'cascader', cascaderOptions: '[{"value":"a","label":"A"}]' })
    await flushPromises()
    const h2 = rowOf(w2, t('fbp.cascaderOptions')).find('.ldp-prop-hint')
    expect(h2.text(), '合法 JSON 提示通过').toContain(t('fbp.jsonOk'))
    expect(h2.classes().includes('ldp-prop-ok'), '加上 ok 类').toBe(true)
    w.unmount()
    w2.unmount()
  })

  it('**upload：accept / multiple / maxSize**', async () => {
    const w = mountPanel({ type: 'upload' })
    await flushPromises()
    rowOf(w, t('fbp.accept')).findComponent(Input).vm.$emit('update:modelValue', 'image/*')
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ accept: 'image/*' })
    rowOf(w, t('fbp.multiple')).findComponent(Group).vm.$emit('update:modelValue', true)
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ multiple: true })
    rowOf(w, t('fbp.maxSize')).findComponent(Input).vm.$emit('update:modelValue', '5')
    await flushPromises()
    expect(lastUpdate(w), 'maxSize 数字转换').toEqual({ maxSize: 5 })
    w.unmount()
  })

  it('**scan-code：格式下拉 / 前缀 / 位数**', async () => {
    const w = mountPanel({ type: 'scan-code' })
    await flushPromises()
    rowOf(w, t('fbp.scanFormats')).findComponent(Select).vm.$emit('update:modelValue', 'qr')
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ scanFormats: 'qr' })
    rowOf(w, t('fbp.scanPrefix')).findComponent(Input).vm.$emit('update:modelValue', 'SKU-')
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ scanPrefix: 'SKU-' })
    rowOf(w, t('fbp.scanLength')).findComponent(Input).vm.$emit('update:modelValue', '13')
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ scanLength: 13 })
    w.unmount()
  })

  it('**slider：上下限/步长**', async () => {
    const w = mountPanel({ type: 'slider' })
    await flushPromises()
    rowOf(w, t('fbp.min')).findComponent(Input).vm.$emit('update:modelValue', '10')
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ min: 10 })
    rowOf(w, t('fbp.max')).findComponent(Input).vm.$emit('update:modelValue', '90')
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ max: 90 })
    w.unmount()
  })

  it('**hasHint 只认 input/select/upload 三类分类 —— 其余类型没有 hint 行**', async () => {
    for (const ty of ['scan-code', 'rate', 'slider', 'switch', 'paragraph'] as const) {
      const w = mountPanel({ type: ty })
      await flushPromises()
      expect(() => rowOf(w, t('fbp.hint')), `${ty} 不该有 hint 行`).toThrow()
      w.unmount()
    }
    // upload 属于 upload 分类 → 有 hint
    const w = mountPanel({ type: 'upload' })
    await flushPromises()
    expect(() => rowOf(w, t('fbp.hint'))).not.toThrow()
    w.unmount()
  })

  it('**hasProp(placeholder) 为假时不渲染占位行**（switch/rate/slider 的 defaults 只有 span）', async () => {
    for (const ty of ['switch', 'rate', 'slider', 'upload'] as const) {
      const w = mountPanel({ type: ty })
      await flushPromises()
      expect(() => rowOf(w, t('fbp.placeholder')), `${ty} 不该有占位行`).toThrow()
      w.unmount()
    }
    // 对照组：select 的 defaults 有 placeholder → 必须有这行
    const w = mountPanel({ type: 'select' })
    await flushPromises()
    expect(() => rowOf(w, t('fbp.placeholder'))).not.toThrow()
    w.unmount()
  })

  it('**maxLength 行只属于 text**（textarea/number/select 都不该有）', async () => {
    for (const ty of ['textarea', 'number', 'select', 'input'] as const) {
      const w = mountPanel({ type: ty })
      await flushPromises()
      expect(() => rowOf(w, t('fbp.valMaxLen')), `${ty} 不该有最大长度行`).toThrow()
      w.unmount()
    }
    const w = mountPanel({ type: 'text' })
    await flushPromises()
    expect(() => rowOf(w, t('fbp.valMaxLen'))).not.toThrow()
    w.unmount()
  })

  it('**hasOptions 为假时不渲染选项编辑器**（如 cascader 的 defaults 没有 options）', async () => {
    const w = mountPanel({ type: 'cascader' })
    await flushPromises()
    expect(() => rowOf(w, t('fbp.optionsList')), 'cascader 没有选项编辑器').toThrow()
    w.unmount()
  })
})

/* ═══════════ ④ 样式页 ═══════════ */

describe('样式页', () => {
  const gotoStyle = async (w: ReturnType<typeof mountPanel>) => {
    await w.findAll('.ldp-prop-tab')[2]!.trigger('click')
    await nextTick()
  }

  it('**四个下拉都合并进 styleConfig，且不丢已有键**', async () => {
    const w = mountPanel({ type: 'text', styleConfig: { customClass: 'keep-me' } })
    await flushPromises()
    await gotoStyle(w)

    for (const [label, field, v] of [
      [t('fbp.labelPosition'), 'labelPosition', 'top'],
      [t('fbp.controlWidth'), 'controlWidth', '50%'],
      [t('fbp.controlSize'), 'size', 'large'],
      [t('fbp.radius'), 'radius', '12px'],
    ] as Array<[string, string, string]>) {
      rowOf(w, label).findComponent(Select).vm.$emit('update:modelValue', v)
      await flushPromises()
      const sc = lastUpdate(w).styleConfig as Record<string, unknown>
      expect(sc[field], `${field} 写入`).toBe(v)
      expect(sc.customClass, '合并时保留其它键').toBe('keep-me')
    }
    w.unmount()
  })

  it('**四个下拉的回显默认值**', async () => {
    const w = mountPanel({ type: 'text' })
    await flushPromises()
    await gotoStyle(w)
    expect(rowOf(w, t('fbp.labelPosition')).findComponent(Select).props('modelValue'), '默认 left').toBe('left')
    expect(rowOf(w, t('fbp.controlWidth')).findComponent(Select).props('modelValue'), '默认 100%').toBe('100%')
    expect(rowOf(w, t('fbp.controlSize')).findComponent(Select).props('modelValue'), '默认 default').toBe('default')
    expect(rowOf(w, t('fbp.radius')).findComponent(Select).props('modelValue'), '默认 default').toBe('default')
    w.unmount()
  })

  it('**边框色：取色器与文本框两个入口都写 styleConfig.borderColor**', async () => {
    const w = mountPanel({ type: 'text' })
    await flushPromises()
    await gotoStyle(w)
    const row = rowOf(w, t('fbp.borderColor'))
    await row.find('input.ldp-color-picker').setValue('#112233')
    await flushPromises()
    expect((lastUpdate(w).styleConfig as Record<string, unknown>).borderColor).toBe('#112233')

    row.findComponent(Input).vm.$emit('update:modelValue', '#445566')
    await flushPromises()
    expect((lastUpdate(w).styleConfig as Record<string, unknown>).borderColor).toBe('#445566')
    row.findComponent(Input).vm.$emit('update:modelValue', null)
    await flushPromises()
    expect((lastUpdate(w).styleConfig as Record<string, unknown>).borderColor, 'null 落成空串').toBe('')
    w.unmount()
  })

  it('**聚焦色与自定义类名各自写入**', async () => {
    const w = mountPanel({ type: 'text' })
    await flushPromises()
    await gotoStyle(w)
    const focusRow = rowOf(w, t('fbp.focusBorderColor'))
    await focusRow.find('input.ldp-color-picker').setValue('#778899')
    await flushPromises()
    expect((lastUpdate(w).styleConfig as Record<string, unknown>).focusBorderColor).toBe('#778899')
    // 文本框入口（另一个通道，必须单独走一遍）
    focusRow.findComponent(Input).vm.$emit('update:modelValue', '#aabbcc')
    await flushPromises()
    expect((lastUpdate(w).styleConfig as Record<string, unknown>).focusBorderColor).toBe('#aabbcc')

    rowOf(w, t('fbp.customClass')).findComponent(Input).vm.$emit('update:modelValue', 'my-cls')
    await flushPromises()
    expect((lastUpdate(w).styleConfig as Record<string, unknown>).customClass).toBe('my-cls')
    w.unmount()
  })

  it('**容器节点：样式页整页隐藏**（v-show 语义，行仍在 DOM 但不可见）', async () => {
    const w = mountPanel({ type: 'grid' })
    await flushPromises()
    expect(stylePage(w).style.display, '容器节点看不到样式配置').toBe('none')
    w.unmount()
  })
})

/* ═══════════ ⑤ 子组件转发 ═══════════ */

describe('子组件 @update 转发', () => {
  it('**容器段：容器节点渲染并转发 update**', async () => {
    const w = mountPanel({ type: 'grid' })
    await flushPromises()
    const sec = w.findComponent(PropsContainerSection)
    expect(sec.exists(), '容器节点渲染容器段').toBe(true)
    sec.vm.$emit('update', { span: 12 })
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ span: 12 })
    w.unmount()
  })

  it('**字段节点不渲染容器段**', async () => {
    const w = mountPanel({ type: 'text' })
    await flushPromises()
    expect(w.findComponent(PropsContainerSection).exists()).toBe(false)
    w.unmount()
  })

  it('**高级字段段转发 update**', async () => {
    const w = mountPanel({ type: 'text' })
    await flushPromises()
    const adv = w.findComponent(PropsAdvancedFields)
    expect(adv.exists()).toBe(true)
    adv.vm.$emit('update', { defaultValue: 'x' })
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ defaultValue: 'x' })
    w.unmount()
  })

  it('**条件组转发 update，且 field-options 已过滤自身/容器/无 key**', async () => {
    const w = mountPanel({ type: 'text' })
    await flushPromises()
    const cg = w.findComponent(PropsConditionGroup)
    expect(cg.exists()).toBe(true)
    const opts = cg.props('fieldOptions') as Array<{ value: string }>
    const values = opts.map((o) => o.value)
    expect(values, '排除自身').not.toContain('name')
    expect(values, '保留有 key 的兄弟字段').toContain('city')
    expect(values, '排除无 key 的节点').not.toContain('')
    expect(values, '排除容器节点').not.toContain('grid1')

    cg.vm.$emit('update', { visibleWhen: { field: 'city', value: '北京' } })
    await flushPromises()
    expect(lastUpdate(w)).toEqual({ visibleWhen: { field: 'city', value: '北京' } })
    w.unmount()
  })

  it('**校验页/事件页/数据页三段转发 update**', async () => {
    const w = mountPanel({ type: 'text' })
    await flushPromises()
    for (const [comp, patch] of [
      [PropsValidationPage, { required: true }],
      [PropsEventPage, { events: ['click'] }],
      [PropsDataPage, { dataSource: 'api' }],
    ] as Array<[never, Record<string, unknown>]>) {
      const c = w.findComponent(comp)
      expect(c.exists(), '子页面渲染').toBe(true)
      c.vm.$emit('update', patch)
      await flushPromises()
      expect(lastUpdate(w)).toEqual(patch)
    }
    w.unmount()
  })
})

/* ═══════════ ⑥ 已知缺陷（未固化为用例） ═══════════
 *
 * L157 的 `v-if="node"` 是**死守卫**：props 里 node 是必填，唯一调用方 FormDesigner.vue
 * L568 又写了 `v-if="selectedNode"`，所以 node 永远为真、该守卫永不生效。
 * 更关键的是 L145-152 的 `watch(() => props.node.id, …)` **没有守卫**：一旦有人绕过调用方
 * 直接传 falsy node（例如把面板抽成公共组件后用 `v-if` 省掉），setup 期的 immediate 求值
 * 会立即抛 `TypeError: Cannot read properties of null (reading 'id')`。
 * 本轮**不把它固化成用例**（传 null 在仓库内不可达），仅作 P3 记录。
 *
 * 另：`visibleWhenFieldOptions` 里 `n.id !== props.node.id` 这一条**没有独立可观测效果**
 * —— 自身节点的 key 恒等于 `myKey`，已被紧随的 `n.key !== myKey` 排除；若自身无 key，
 * 也被 `n.key &&` 的真值判断排除。三条路径都排除自身，故删掉该条件行为不变（见报告 P3）。
 *
 * 同一处还导致 L157 `v-if="node"` 与 L679-684 的整段空态（`v-else`）成为**双行死代码**：
 * 覆盖率口径里 L157/L683 恒不为真，本轮补测后仍剩这两行 —— 不是漏测，是**不可达**。
 */

describe('滚动复位（节点切换）', () => {
  it('**换节点也会滚回顶部**', async () => {
    const w = mountPanel({ type: 'text' })
    await flushPromises()
    const panel = w.find('.ldp-props').element as HTMLElement
    panel.scrollTop = 300
    await w.setProps({ node: node({ id: 'n2', type: 'text', label: '电话', key: 'phone' }) })
    await flushPromises()
    expect(panel.scrollTop, '新节点面板从顶部看起').toBe(0)
    w.unmount()
  })
})