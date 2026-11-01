/**
 * DataTable 可编辑格子的错误说明关联（TD-96 / #337）
 *
 * ## 缺陷
 *
 * 可编辑单元格只有 `aria-invalid`：读屏能说「这个格子无效」，但**说不出为什么** ——
 * 错误文案虽然渲染在输入框下方（`role="alert"` 会念一次），但与输入框**没有关联**，
 * 焦点回到输入框后再也找不到那条说明。与 #316 修掉的 `Select` 是同一个缺口。
 *
 * ## 判据
 *
 * · 校验失败时：输入框有 `aria-describedby`，且指向的**同一个元素确实存在**并带错误文案
 * · 校验通过时：不挂 `aria-describedby`（避免指向不存在的 id，与 #316 同一原则）
 * · 同一张表多行多列：id 不撞（用单元格坐标拼）
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import DataTable from '@/components/data/DataTable.vue'
import type { Column } from '@/components/data/composables/types'

// number 列放**第一列**：text 列什么都能收，归一化不会失败；
// 要触发"提交被拒"必须让非法值进入数值列。
const COLS: Column[] = [
  { key: 'amount', title: '金额', type: 'number', editable: true },
  { key: 'name', title: '名称' },
]

const ROWS = [
  { id: 'r1', name: '甲', amount: '100' },
  { id: 'r2', name: '乙', amount: '200' },
]

const BASE = {
  columns: COLS,
  data: ROWS,
  rowKey: 'id',
  editable: true,
  virtualScroll: false,
  autoFit: false,
  persistence: 'none' as const,
}

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

/** 双击进入编辑态（逐格试，直到出现输入框）；返回输入框 */
async function enterEdit(w: VueWrapper) {
  const cells = w.findAll('td')
  for (const c of cells) {
    await c.trigger('dblclick')
    await nextTick()
    if (w.find('.cell-edit-input').exists()) return w.find('.cell-edit-input')
  }
  throw new Error('前置失败：没有任何单元格能进入内联编辑')
}

/** 双击进入编辑 → 输入非法值 → Enter 提交（被归一化拒绝） */
async function failCommit(w: VueWrapper, text: string) {
  const input = await enterEdit(w)
  await input.setValue(text)
  await input.trigger('keydown', { key: 'Enter' })
  await nextTick()
  await nextTick()
  return w.find('.cell-edit-input')
}

describe('DataTable · 可编辑格子的错误说明关联', () => {
  it('**校验失败时输入框指向真实的错误文案元素**', async () => {
    wrapper = mount(DataTable, { props: BASE as never, attachTo: document.body })
    const input = await failCommit(wrapper, 'abc')
    expect(wrapper.find('.cell-edit-invalid-hint').exists(), '前置：应显示错误提示').toBe(true)

    const describedby = input.attributes('aria-describedby')
    expect(describedby, '校验失败却没有 aria-describedby → 读屏说不出为什么').toBeTruthy()
    const target = wrapper.element.querySelector(`#${CSS.escape(describedby!)}`)
    expect(target, 'aria-describedby 指向了不存在的 id（悬空引用）').toBeTruthy()
    expect(target!.textContent?.trim(), '指向的元素里没有错误文案').toBeTruthy()
  })

  it('**校验通过时不挂 aria-describedby**（不指向不存在的 id）', async () => {
    wrapper = mount(DataTable, { props: BASE as never, attachTo: document.body })
    const input = await enterEdit(wrapper)
    expect(input.attributes('aria-describedby')).toBeUndefined()
  })

  it('**多行多列的 id 不撞**（用单元格坐标拼）', async () => {
    wrapper = mount(DataTable, { props: BASE as never, attachTo: document.body })
    await failCommit(wrapper, 'abc')
    const hint = wrapper.find('.cell-edit-invalid-hint')
    const id = hint.attributes('id')
    expect(id, '错误提示元素没有 id').toBeTruthy()
    // 同一张表里 id 只应出现一次
    expect(wrapper.element.querySelectorAll(`#${CSS.escape(id!)}`).length).toBe(1)
  })
})
