/**
 * tabs 容器的"激活页"在页签被重编号后失效 → 正文整块空白（第 132 轮修）。
 *
 * 缺陷现场：切到第二页 → 设计器删掉一行标签页（`PropsContainerSection` 按下标重新生成 `name`，
 * 后面的 name 全部前移），或外部直接改 schema → 运行时存的激活名在 `tabs` 里找不到，
 * `fieldsInTab` 用 `findIndex` 得 -1 → **该容器一个字段都不渲染**，而页签栏高亮的还是那个
 * 已经不存在的页。用户看到"有页签、没内容"，且不知道该怎么办。
 *
 * 修法：`activeTabOf` 校验存的名字是否还在列表里，不在就回落第一个页签。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import FormBuilder from '@/components/form-builder/FormBuilder.vue'
import type { FormSchema, FormField, FieldContainer } from '@/components/form-builder/types'

function inContainer(key: string, c: FieldContainer, slot = 0): FormField {
  return { key, type: 'text', label: `字段-${key}`, container: { ...c, slot } } as FormField
}

function mountBuilder(schema: FormSchema) {
  const w = mount(FormBuilder, {
    props: { schema, modelValue: {} },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
  return w
}

const tabsOf = (names: string[], labels: string[]): FieldContainer => ({
  id: 'tc',
  type: 'tabs',
  tabs: names.map((name, i) => ({ name, label: labels[i] })),
})

describe('tabs 激活页失效后回落第一个（不让正文变空白）', () => {
  it('切到第二页后把页签缩成 1 个 → 仍显示第一页字段', async () => {
    const w = mountBuilder({
      fields: [inContainer('a', tabsOf(['t1', 't2'], ['页一', '页二']), 0), inContainer('b', tabsOf(['t1', 't2'], ['页一', '页二']), 1)],
    } as FormSchema)
    await nextTick()
    const tabs = w.findAll('[role="tab"]')
    expect(tabs.length).toBe(2)
    await tabs[1].trigger('click')
    await nextTick()
    expect(w.text(), '切页后显示第二页字段').toContain('字段-b')

    // 模拟设计器删掉一行：tabs 只剩一个
    const one = tabsOf(['t1'], ['页一'])
    await w.setProps({ schema: { fields: [inContainer('a', one, 0), inContainer('b', one, 1)] } as FormSchema })
    await nextTick()
    const text = w.text()
    expect(w.findAll('[role="tab"]').length, '页签应只剩 1 个').toBe(1)
    expect(text, '**不能空白**：应回落显示第一页').toContain('字段-a')
    expect(text, '第二页字段不该出现').not.toContain('字段-b')
    w.unmount()
  })

  it('name 整体换掉（外部改 schema，t1/t2 → x1/x2）→ 回落第一个而不是空白', async () => {
    const w = mountBuilder({
      fields: [
        inContainer('a', tabsOf(['t1', 't2'], ['页一', '页二']), 0),
        inContainer('b', tabsOf(['t1', 't2'], ['页一', '页二']), 1),
      ],
    } as FormSchema)
    await nextTick()
    await w.findAll('[role="tab"]')[1].trigger('click')
    await nextTick()
    expect(w.text(), '先确认在第二页').toContain('字段-b')

    // 全部换成新 name（外部改 schema / 重新导入模板都会这样）
    const renamed = tabsOf(['x1', 'x2'], ['新一', '新二'])
    await w.setProps({
      schema: {
        fields: [inContainer('a', renamed, 0), inContainer('b', renamed, 1)],
      } as FormSchema,
    })
    await nextTick()
    expect(w.findAll('[role="tab"]').map((t) => t.text())).toEqual(['新一', '新二'])
    expect(w.text(), '改名后要回落第一页，不能空白').toContain('字段-a')
    w.unmount()
  })

  it('存的激活名还在列表里（只是顺序变了）→ 保持原选择，不乱跳', async () => {
    const w = mountBuilder({
      fields: [inContainer('a', tabsOf(['t1', 't2'], ['页一', '页二']), 0), inContainer('b', tabsOf(['t1', 't2'], ['页一', '页二']), 1)],
    } as FormSchema)
    await nextTick()
    await w.findAll('[role="tab"]')[1].trigger('click')
    await nextTick()
    expect(w.text()).toContain('字段-b')
    // 把 t2 移到第一位（name 不变，只换顺序）
    const reordered = tabsOf(['t2', 't1'], ['页二', '页一'])
    await w.setProps({
      schema: {
        fields: [inContainer('a', reordered, 1), inContainer('b', reordered, 0)],
      } as FormSchema,
    })
    await nextTick()
    expect(w.text(), 't2 仍然存在 → 应继续显示第二页内容').toContain('字段-b')
    w.unmount()
  })

  it('页签为空数组时不死循环/不报错（回落空串）', async () => {
    const empty: FieldContainer = { id: 'tc', type: 'tabs', tabs: [] }
    const w = mountBuilder({ fields: [inContainer('a', empty, 0)] } as FormSchema)
    await nextTick()
    expect(w.findAll('[role="tab"]').length).toBe(0)
    expect(w.text()).not.toContain('字段-a')
    w.unmount()
  })
})
