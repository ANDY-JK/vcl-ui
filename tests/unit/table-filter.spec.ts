// useTableFilter 行为锁定测试（DataTable 筛选安全网补全）
// 覆盖：选项统计/计数/render label、选项排序、快捷操作（全选/反选/重复/唯一）、
// 筛选应用/清除、搜索过滤选项
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useTableFilter } from '@/components/data/composables/useTableFilter'
import type { Column } from '@/components/data/composables/types'

const cols: Column[] = [
  { key: 'city', title: '城市' },
  { key: 'status', title: '状态', render: (v: unknown) => (v === 'active' ? '启用中' : '已停用') },
]

const data = [
  { city: '北京', status: 'active' },
  { city: '上海', status: 'active' },
  { city: '北京', status: 'disabled' },
  { city: '广州', status: 'active' },
]

function makeFilter() {
  const emitted: Record<string, string[]>[] = []
  const emit = (e: string, filters: Record<string, string[]>) => {
    if (e === 'filter') emitted.push(filters)
  }
  const tableWrapRef = { value: null }
  const hiddenColumns = ref(new Set<string>())
  const api = useTableFilter({ columns: cols, data } as never, emit as never, tableWrapRef, hiddenColumns, () => {})
  return { api, emitted, hiddenColumns }
}

/** 打开某列筛选（绕过 toggleFilter 的 DOM 依赖，直接用导出的内部状态） */
function openFilter(api: ReturnType<typeof useTableFilter>, colKey: string) {
  api.activeFilterKey.value = colKey
  api.filterDraft.value = api.initFilterDraft(colKey)
}

describe('useTableFilter 行为锁定', () => {
  it('computeFilterOptions：统计唯一值计数 + render label（经 activeFilterOptions）', () => {
    const { api } = makeFilter()
    openFilter(api, 'city')
    expect(api.activeFilterOptions.value.map((o) => o.value)).toEqual(['北京', '广州', '上海']) // localeCompare
    expect(api.activeFilterOptions.value.find((o) => o.value === '北京')?.count).toBe(2)
  })

  it('render label：status 列选项带 render 文本', () => {
    const { api } = makeFilter()
    openFilter(api, 'status')
    const opts = api.activeFilterOptions.value
    // render 富文本化：active → 启用中
    expect(opts.find((o) => o.value === 'active')?.label).toBe('启用中')
    expect(opts.find((o) => o.value === 'active')?.count).toBe(3)
  })

  it('filterQuickAction：全选 / 反选', () => {
    const { api } = makeFilter()
    openFilter(api, 'city')
    const draft = api.filterDraft.value!
    const expectedAll = ['北京', '广州', '上海'] // localeCompare 排序（中文按拼音）
    // 全选：选中所有可见选项
    api.filterQuickAction('all')
    expect(draft.selectedValues).toEqual(expectedAll)
    // 反选：toggle 每个
    api.filterQuickAction('none')
    expect(draft.selectedValues).toEqual([])
    // 再反选一次：全选回来
    api.filterQuickAction('none')
    expect(draft.selectedValues).toHaveLength(3)
  })

  it('filterQuickAction：duplicates 选重复值，unique 选唯一值', () => {
    const { api } = makeFilter()
    openFilter(api, 'city')
    api.filterQuickAction('duplicates')
    expect(api.filterDraft.value!.selectedValues).toEqual(['北京']) // 北京出现 2 次
    api.filterQuickAction('unique')
    expect(api.filterDraft.value!.selectedValues).toEqual(['广州', '上海'])
  })

  it('toggleFilterValue：切换单个选项', () => {
    const { api } = makeFilter()
    openFilter(api, 'city')
    api.toggleFilterValue('北京')
    expect(api.filterDraft.value!.selectedValues).toEqual(['北京'])
    api.toggleFilterValue('北京') // 再点取消
    expect(api.filterDraft.value!.selectedValues).toEqual([])
  })

  it('applyFilter：选中写入 filterState，空选清除；emit 非空筛选', () => {
    const { api, emitted } = makeFilter()
    openFilter(api, 'city')
    api.toggleFilterValue('北京')
    api.applyFilter()
    expect(api.filterState.value.city?.selectedValues).toEqual(['北京'])
    expect(emitted).toEqual([{ city: ['北京'] }])
    // 空选 → 清除筛选
    openFilter(api, 'city')
    api.filterDraft.value!.selectedValues = [] // 手动清空草稿（模拟用户取消全部）
    api.applyFilter()
    expect(api.filterState.value.city).toBeUndefined()
  })

  it('filteredOptions：搜索过滤选项（拼音/文本）', () => {
    const { api } = makeFilter()
    openFilter(api, 'city')
    api.filterDraft.value!.searchText = 'bei' // 北京拼音
    expect(api.filteredOptions.value.map((o) => o.value)).toEqual(['北京'])
  })

  it('optionSort：按计数排序', () => {
    const { api } = makeFilter()
    openFilter(api, 'city')
    api.optionSort.value = 'count-desc'
    expect(api.filteredOptions.value[0].value).toBe('北京') // 计数 2 最高
  })

  it('isFilterActive：已应用筛选的列返回 true', () => {
    const { api } = makeFilter()
    expect(api.isFilterActive('city')).toBe(false)
    openFilter(api, 'city')
    api.toggleFilterValue('北京')
    api.applyFilter()
    expect(api.isFilterActive('city')).toBe(true)
  })

  it('removeFilter：清除单列筛选并 emit', () => {
    const { api, emitted } = makeFilter()
    openFilter(api, 'city')
    api.toggleFilterValue('北京')
    api.applyFilter()
    api.removeFilter('city')
    expect(api.filterState.value.city).toBeUndefined()
    expect(emitted[emitted.length - 1]).toEqual({})
  })
})
