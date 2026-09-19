// 修复锁定：表头全选框要反映"部分选中"，表头 th 不冒充 button 角色
// 背景：全选框只绑 checked，部分选中时显示为未选（用户以为没选，一点全选反而清空）；
//      th 上 role="button" 会盖掉 columnheader 语义，使 aria-sort 失效
import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import DataTable from '@/components/data/DataTable.vue'
import type { Column } from '@/components/data/composables/types'

const COLS: Column[] = [
  { key: 'name', title: '名称', sortable: true },
  { key: 'value', title: '数值' },
]

const DATA = [
  { id: 'r0', name: '行0', value: '0' },
  { id: 'r1', name: '行1', value: '1' },
  { id: 'r2', name: '行2', value: '2' },
]

const mounted: VueWrapper[] = []

function mountTable(props: Record<string, unknown> = {}) {
  const w = mount(DataTable, {
    props: {
      columns: COLS,
      data: DATA,
      rowKey: 'id',
      virtualScroll: false,
      autoFit: false,
      persistence: 'none',
      ...props,
    },
    attachTo: document.body,
  })
  mounted.push(w)
  return w
}

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
})

function headerCheckbox(w: VueWrapper): HTMLInputElement {
  return w.find('.th-checkbox input[type="checkbox"]').element as HTMLInputElement
}

describe('DataTable · 表头全选框', () => {
  it('部分选中：indeterminate=true 且 checked=false', () => {
    const w = mountTable({ selectable: true, selectedKeys: ['r0'] })
    const box = headerCheckbox(w)

    expect(box.checked).toBe(false)
    expect(box.indeterminate).toBe(true)
  })

  it('全部选中：checked=true 且 indeterminate=false', () => {
    const w = mountTable({ selectable: true, selectedKeys: ['r0', 'r1', 'r2'] })
    const box = headerCheckbox(w)

    expect(box.checked).toBe(true)
    expect(box.indeterminate).toBe(false)
  })

  it('全未选中：indeterminate=false', () => {
    const w = mountTable({ selectable: true, selectedKeys: [] })

    expect(headerCheckbox(w).indeterminate).toBe(false)
  })
})

describe('DataTable · 表头可排序语义', () => {
  it('th 不冒充 button 角色，保留 tabindex 与 aria-sort', async () => {
    const w = mountTable()
    const th = w.findAll('th').find((t) => t.text().includes('名称'))!

    expect(th.attributes('role')).toBeUndefined()
    expect(th.attributes('tabindex')).toBe('0')

    await th.trigger('click')
    expect(th.attributes('aria-sort')).toBe('ascending')
  })
})
