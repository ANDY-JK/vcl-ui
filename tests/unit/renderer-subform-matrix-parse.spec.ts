/**
 * 子表单 / 评分矩阵的**列定义解析**（第 142 轮）。
 *
 * 列定义是 `label|key|type` 换行分隔的自由文本，用户手写必然出错。原解析只有
 * `split('\n').filter(Boolean)`，于是三种畸形输入静默产生坏结构：
 *
 * 1. **纯空格行**：`filter(Boolean)` 只挡空串，`"   "` 活着 → 多出一列"列"，数据里多一个键；
 * 2. **缺 key 的行**：回退成字面量 `'col'`，**两行都缺 → 共用同一数据字段**（输入互串、只存一个值），
 *    且 `v-for :key="col.key"` 重复 → Vue 重复 key；
 * 3. **显式重复 key**：同上，两列绑同一字段。
 *
 * 评分矩阵（`RendererMatrix`）的行/列标题有同样的纯空格行问题（表头多一个空白格）。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import RendererSubform from '@/components/form-builder/renderer/RendererSubform.vue'
import RendererMatrix from '@/components/form-builder/renderer/RendererMatrix.vue'
import type { FormField } from '@/components/form-builder/types'

const subform = (cols: string) =>
  ({ id: 'sf1', key: 'items', type: 'subform', label: '明细', props: { subformColumns: cols } }) as unknown as FormField
const matrix = (rows: string, cols: string) =>
  ({ id: 'm1', key: 'score', type: 'matrix', label: '评分', props: { matrixRows: rows, matrixCols: cols } }) as unknown as FormField

const placeholders = (w: ReturnType<typeof mount>) =>
  w.findAll('.fb-subform-input').map((i) => i.attributes('placeholder'))

describe('子表单列定义 · 畸形输入的容错', () => {
  it('**纯空格行不该产生幻影列**', () => {
    const w = mount(RendererSubform, {
      props: { field: subform('甲|a|text\n   \n乙|b|text'), modelValue: [{}] },
    })
    expect(placeholders(w), `实际列：${JSON.stringify(placeholders(w))}`).toEqual(['甲', '乙'])
    w.unmount()
  })

  it('制表符/全角空格行同样不算列', () => {
    const w = mount(RendererSubform, {
      props: { field: subform('甲|a|text\n\t\n　\n乙|b|text'), modelValue: [{}] },
    })
    expect(placeholders(w)).toEqual(['甲', '乙'])
    w.unmount()
  })

  it('**两行都缺 key 不能共用同一数据字段**（输入互串）', async () => {
    const w = mount(RendererSubform, {
      props: { field: subform('备注\n金额'), modelValue: [{}] },
    })
    const inputs = w.findAll('.fb-subform-input')
    expect(inputs.length).toBe(2)
    await inputs[0].setValue('第一列的值')
    await nextTick()
    // 受控组件：必须把 emit 结果回灌，才看得出"两列是否绑同一字段"
    const emitted = w.emitted('update:modelValue') ?? []
    const row = (emitted.at(-1)?.[0] as Record<string, unknown>[])[0]
    expect(Object.keys(row).length, `应只产生一个键，实际 ${JSON.stringify(row)}`).toBe(1)
    await w.setProps({ modelValue: [row] })
    await nextTick()
    expect(w.findAll('.fb-subform-input')[1].element.value, '第二列不该跟着变').toBe('')
    w.unmount()
  })

  it('**显式重复 key 也要拆开**（否则两列绑同一字段）', async () => {
    const w = mount(RendererSubform, {
      props: { field: subform('甲|dup|text\n乙|dup|number'), modelValue: [{}] },
    })
    const inputs = w.findAll('.fb-subform-input')
    await inputs[0].setValue('A')
    await nextTick()
    const emitted = w.emitted('update:modelValue') ?? []
    const row = (emitted.at(-1)?.[0] as Record<string, unknown>[])[0]
    expect(Object.keys(row).length, `键：${JSON.stringify(Object.keys(row))}`).toBe(1)
    await w.setProps({ modelValue: [row] })
    await nextTick()
    expect(w.findAll('.fb-subform-input')[1].element.value, '第二列绑的是同一字段就会跟着变').toBe('')
    w.unmount()
  })

  it('正常三列仍按 label/key/type 解析，多余段忽略', () => {
    const w = mount(RendererSubform, {
      props: { field: subform('甲|a|text|多余\n乙|b|number'), modelValue: [{}] },
    })
    expect(placeholders(w)).toEqual(['甲', '乙'])
    w.unmount()
  })

  it('label 空白时给可辨识的回退名（不都是同一个"列"）', () => {
    const w = mount(RendererSubform, {
      props: { field: subform('|a|text\n|b|text'), modelValue: [{}] },
    })
    const ph = placeholders(w)
    expect(ph.length).toBe(2)
    expect(ph[0], `两列占位相同会分不清：${JSON.stringify(ph)}`).not.toBe(ph[1])
    w.unmount()
  })
})

describe('评分矩阵 · 标题行的同一类容错', () => {
  it('**纯空格行不该产生空白表头**', () => {
    const w = mount(RendererMatrix, {
      props: { field: matrix('行1\n   \n行2', '列1\n\t\n列2'), modelValue: null },
    })
    const text = w.text()
    expect(text).toContain('行1')
    expect(text).toContain('行2')
    expect(text).toContain('列1')
    expect(text).toContain('列2')
    const rows = w.findAll('.fb-matrix-row')
    expect(rows.length, `有效行应只有 2 条：实际 ${rows.length}`).toBe(2)
    const headCells = w.findAll('.fb-matrix-head .fb-matrix-cell')
    expect(headCells.length, `表头应是 1 个角标 + 2 列：实际 ${headCells.length}`).toBe(3)
    w.unmount()
  })
})
