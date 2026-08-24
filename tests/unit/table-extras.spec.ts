// useTableExtras 行为锁定测试（DataTable 安全网补全：行选择 + 列显隐）
import { describe, it, expect } from 'vitest'
import { ref, computed } from 'vue'
import { useTableExtras } from '@/components/data/composables/useTableExtras'
import type { Column, ColumnFilterState } from '@/components/data/composables/types'

const cols: Column[] = [
  { key: 'id', title: 'ID' },
  { key: 'name', title: '姓名' },
  { key: 'city', title: '城市' },
]

const data = [
  { id: '1', name: '张三', city: '北京' },
  { id: '2', name: '李四', city: '上海' },
  { id: '3', name: '王五', city: '北京' },
]

function makeExtras(props: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  const emitted: Record<string, unknown>[] = []
  const emit = (...args: unknown[]) => emitted.push(args)
  const displayData = ref(data)
  const hiddenColumns = ref(new Set<string>())
  const filterState = ref<Record<string, ColumnFilterState>>({})
  const api = useTableExtras(
    { columns: cols, data, rowKey: 'id', ...props } as never,
    emit as never,
    {
      displayData: computed(() => displayData.value),
      tableWrapRef: { value: null },
      filteredOptions: computed(() => []),
      filterDraft: ref(null),
      hiddenColumns,
      filterState,
      pagedData: computed(() => displayData.value),
      ...overrides,
    } as never,
  )
  return { api, emitted, hiddenColumns, filterState, displayData }
}

describe('useTableExtras 行选择', () => {
  it('toggleRowSelect：选中/取消单行并 emit', () => {
    const { api, emitted } = makeExtras()
    api.toggleRowSelect(data[0])
    expect(api._selectedKeys.value).toEqual(['1'])
    // emit update:selectedKeys
    expect(emitted[0]).toEqual(['update:selectedKeys', ['1']])
    // emit selectionChange（含行对象）
    expect(emitted[1][0]).toBe('selectionChange')
    expect(emitted[1][1]).toEqual(['1'])
    expect(emitted[1][2]).toEqual([data[0]])
    // 再点取消
    api.toggleRowSelect(data[0])
    expect(api._selectedKeys.value).toEqual([])
  })

  it('isAllSelected：全部选中时为 true，部分为 false', () => {
    const { api } = makeExtras()
    expect(api.isAllSelected.value).toBe(false)
    api.toggleRowSelect(data[0])
    api.toggleRowSelect(data[1])
    api.toggleRowSelect(data[2])
    expect(api.isAllSelected.value).toBe(true)
    api.toggleRowSelect(data[0])
    expect(api.isAllSelected.value).toBe(false)
  })

  it('toggleSelectAll：全选当前页，再点取消当前页', () => {
    const { api } = makeExtras()
    api.toggleSelectAll()
    expect(api._selectedKeys.value).toEqual(['1', '2', '3'])
    api.toggleSelectAll()
    expect(api._selectedKeys.value).toEqual([])
  })

  it('toggleSelectAll：保留已选中的其他页行', () => {
    const { api, displayData } = makeExtras()
    api.toggleRowSelect(data[0]) // 预选第 1 行
    // 当前页只显示第 2、3 行
    displayData.value = [data[1], data[2]]
    api.toggleSelectAll() // 全选当前页
    expect(api._selectedKeys.value).toEqual(['1', '2', '3'])
  })

  it('selectedKeys prop 变化同步到内部', () => {
    const { api } = makeExtras({}, {})
    // props.selectedKeys 初始为空，测试外部受控更新
    // （useTableExtras watch props.selectedKeys —— 构造时 props.selectedKeys 传 '1'）
    const { api: api2 } = makeExtras({ selectedKeys: ['1'] })
    expect(api2._selectedKeys.value).toEqual(['1'])
    expect(api._selectedKeys.value).toEqual([])
  })
})

describe('useTableExtras 列显隐', () => {
  it('hideCurrentColumn：隐藏右键列并清其筛选', () => {
    const { api, hiddenColumns, filterState } = makeExtras()
    filterState.value = { name: { searchText: '', selectedValues: ['张三'] } }
    // 模拟右键菜单选中 name 列
    api.contextMenu.value.columnKey = 'name'
    api.hideCurrentColumn()
    expect(hiddenColumns.value.has('name')).toBe(true)
    expect(filterState.value.name).toBeUndefined()
  })

  it('hideCurrentColumn：只剩 1 列时拒绝隐藏', () => {
    const { api, hiddenColumns } = makeExtras()
    hiddenColumns.value = new Set(['name', 'city']) // 只剩 id
    api.contextMenu.value.columnKey = 'id'
    api.hideCurrentColumn()
    expect(hiddenColumns.value.has('id')).toBe(false)
  })

  it('showAllColumns：显示全部隐藏列', () => {
    const { api, hiddenColumns } = makeExtras()
    hiddenColumns.value = new Set(['name', 'city'])
    api.showAllColumns()
    expect(hiddenColumns.value.size).toBe(0)
  })
})
