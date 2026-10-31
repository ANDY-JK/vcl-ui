// useTableExtras 行为锁定测试（DataTable 安全网补全：行选择 + 列显隐）
import { describe, it, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { useTableExtras } from '@/components/data/composables/useTableExtras'
import { downloadBlob } from '@/components/_internal/utils'
import type { Column, ColumnFilterState } from '@/components/data/composables/types'

// 导出落到 downloadBlob（造 a 标签点击），jsdom 下不真下载——mock 掉只断言调用
vi.mock('@/components/_internal/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/_internal/utils')>()
  return { ...actual, downloadBlob: vi.fn() }
})

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
      hasExportListener: () => false,
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
    // emit update:selected-keys
    expect(emitted[0]).toEqual(['update:selected-keys', ['1']])
    // emit selectionChange（含行对象）
    expect(emitted[1][0]).toBe('selection-change')
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

describe('useTableExtras 行选择 · rowKey 字段缺失', () => {
  // 行对象没有 rowKey 字段时，行 key 必须回退到稳定 id，而不是共用空串 ''
  const noKeyData = [{ name: '甲' }, { name: '乙' }]
  function makeNoKeyExtras() {
    return makeExtras(
      { data: noKeyData },
      {
        displayData: computed(() => noKeyData),
        pagedData: computed(() => noKeyData),
      },
    )
  }

  it('各行独立选中，不因空串键互相串台', () => {
    const { api } = makeNoKeyExtras()
    api.toggleRowSelect(noKeyData[0])
    expect(api._selectedKeys.value).toHaveLength(1)
    // 只选了一行，不能因为两行键都是 '' 而判定全选
    expect(api.isAllSelected.value).toBe(false)
    api.toggleRowSelect(noKeyData[1])
    expect(api._selectedKeys.value).toHaveLength(2)
    expect(api._selectedKeys.value[0]).not.toBe(api._selectedKeys.value[1])
    // 取消第一行只移除它
    api.toggleRowSelect(noKeyData[0])
    expect(api._selectedKeys.value).toHaveLength(1)
  })

  it('selectionChange 只回传被选中的那一行', () => {
    const { api, emitted } = makeNoKeyExtras()
    api.toggleRowSelect(noKeyData[0])
    const selectionChange = emitted.find((e) => e[0] === 'selection-change')
    expect(selectionChange?.[2]).toEqual([noKeyData[0]])
  })
})

// v2（Q5）：onExport 回调 prop 收敛为 @export 事件——监听在否决定服务端导出还是内置导出
describe('useTableExtras 导出（@export 事件化）', () => {
  it('挂了 @export 监听：emit export，不下载内置 CSV', () => {
    const { api, emitted } = makeExtras({}, { hasExportListener: () => true })
    api.exportCSV()
    expect(emitted).toEqual([['export']])
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('没挂监听：走内置 CSV 下载，不 emit export', () => {
    const { api, emitted } = makeExtras()
    api.exportCSV()
    expect(emitted).toEqual([])
    expect(downloadBlob).toHaveBeenCalledTimes(1)
  })

  it('excel 导出同样让位 @export（不惰性加载 xlsx）', async () => {
    const { api, emitted } = makeExtras({}, { hasExportListener: () => true })
    await api.exportExcel()
    expect(emitted).toEqual([['export']])
  })
})
