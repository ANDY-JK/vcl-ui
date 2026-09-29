// useTableFilter 补测（table-filter.spec.ts 未覆盖的分支：服务端 filterValues/跨列计数/render 异常/
// 四向排序/滚动百分比/下拉定位/开切关/全选边界/externalFilters 同步）
import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useTableFilter } from '@/components/data/composables/useTableFilter'
import type { Column } from '@/components/data/composables/types'

const cols: Column[] = [
  { key: 'city', title: '城市' },
  { key: 'status', title: '状态' },
]
const data = [
  { city: '北京', status: 'active' },
  { city: '上海', status: 'active' },
  { city: '北京', status: 'disabled' },
  { city: '广州', status: 'active' },
]

function makeFilter(
  overrides: {
    externalFilters?: () => Record<string, string[]> | undefined
    columns?: Column[]
    data?: Record<string, unknown>[]
  } = {},
) {
  const emitted: Record<string, string[]>[] = []
  const emit = (e: string, filters: Record<string, string[]>) => {
    if (e === 'filter') emitted.push(filters)
  }
  const closeContextMenu = vi.fn()
  const api = useTableFilter(
    { columns: overrides.columns ?? cols, data: overrides.data ?? data, pinyinSearch: false } as never,
    emit as never,
    { value: null },
    ref(new Set<string>()),
    closeContextMenu,
    overrides.externalFilters,
  )
  return { api, emitted, closeContextMenu }
}

/** 打开某列筛选（绕过 toggleFilter 的 DOM 依赖，直接用内部状态） */
function openFilter(api: ReturnType<typeof useTableFilter>, colKey: string) {
  api.activeFilterKey.value = colKey
  api.filterDraft.value = api.initFilterDraft(colKey)
}

describe('computeFilterOptions 分支', () => {
  it('服务端模式：filterValues 优先（count 0，数值感知排序）', () => {
    const { api } = makeFilter({
      columns: [{ key: 'n', title: '编号', filterValues: ['10', '2', '1'] }],
      data: [],
    })
    openFilter(api, 'n')
    expect(api.activeFilterOptions.value).toEqual([
      { value: '1', count: 0 },
      { value: '2', count: 0 },
      { value: '10', count: 0 },
    ])
  })

  it('跨列联动计数：他列有激活筛选时只统计同时命中的行', () => {
    const { api } = makeFilter()
    api.filterState.value = { status: { searchText: '', selectedValues: ['active'] } }
    openFilter(api, 'city')
    const opts = api.activeFilterOptions.value
    // 北京 2 行但只有 1 行 active → 计数 1；上海 active → 1；广州 active → 1
    expect(opts.find((o) => o.value === '北京')?.count).toBe(1)
    expect(opts.find((o) => o.value === '上海')?.count).toBe(1)
    // 三个城市都在列（ICU 拼音序：北京 < 广州 < 上海）
    expect(opts.map((o) => o.value)).toEqual(['北京', '广州', '上海'])
  })

  it('render 抛异常：warn 后放弃 label（选项仍保留，label undefined）', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { api } = makeFilter({
      columns: [
        {
          key: 'status',
          title: '状态',
          render: (v: unknown) => {
            if (v === 'active') throw new Error('boom')
            return String(v)
          },
        },
      ],
    })
    openFilter(api, 'status')
    const opts = api.activeFilterOptions.value
    expect(opts.find((o) => o.value === 'active')?.label).toBeUndefined()
    expect(opts.find((o) => o.value === 'disabled')?.label).toBe('disabled')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('render 异常'), 'status')
  })
})

describe('选项排序与滚动', () => {
  it('optionSort 四向：name（默认）/ name-desc / count / count-desc', () => {
    const { api } = makeFilter()
    openFilter(api, 'city')
    // ICU 中文排序按拼音：北京(bei) < 广州(guang) < 上海(shang)
    api.optionSort.value = 'name'
    expect(api.filteredOptions.value.map((o) => o.value)).toEqual(['北京', '广州', '上海'])
    api.optionSort.value = 'name-desc'
    expect(api.filteredOptions.value.map((o) => o.value)).toEqual(['上海', '广州', '北京'])
    api.optionSort.value = 'count'
    // 升序：北京(2)排最后；广州/上海并列 1 保持 name 稳定序（广州在前）
    expect(api.filteredOptions.value.map((o) => o.count)).toEqual([1, 1, 2])
    expect(api.filteredOptions.value.at(-1)!.value).toBe('北京')
    api.optionSort.value = 'count-desc'
    expect(api.filteredOptions.value[0].value).toBe('北京')
  })

  it('onFilterOptionsScroll：进度百分比与可滚动判定', () => {
    const { api } = makeFilter()
    const target = { scrollTop: 50, scrollHeight: 200, clientHeight: 100 }
    api.onFilterOptionsScroll({ target } as never)
    expect(api.filterOptionsScrollable.value).toBe(true)
    expect(api.filterOptionsScrollPct.value).toBe(50)
    api.onFilterOptionsScroll({ target: { scrollTop: 100, scrollHeight: 80, clientHeight: 100 } } as never)
    expect(api.filterOptionsScrollable.value).toBe(false)
    expect(api.filterOptionsScrollPct.value).toBe(0)
  })
})

describe('下拉定位与开切关', () => {
  function fakeTh(rect: { top: number; bottom: number }) {
    const th = document.createElement('th')
    vi.spyOn(th, 'getBoundingClientRect').mockReturnValue(rect as DOMRect)
    return th
  }

  it('toggleFilter：下方空间足 → top 定位（表头下沿 +4px）', () => {
    const { api, closeContextMenu } = makeFilter()
    const th = fakeTh({ top: 100, bottom: 130 } as never)
    const e = { currentTarget: th, stopPropagation: vi.fn(), clientX: 0, clientY: 0 } as never
    api.toggleFilter(cols[0], e)
    expect(api.activeFilterKey.value).toBe('city')
    expect(e.stopPropagation).toHaveBeenCalled()
    expect(closeContextMenu).toHaveBeenCalledTimes(1)
    expect(api.filterDropdownAbove.value).toBe(false)
    expect(api.filterDropdownStyle.value.top).toBe('134px') // rect.bottom + offset 4
    expect(api.filterDropdownStyle.value.position).toBe('fixed')
    expect(api.filterDropdownStyle.value.width).toMatch(/^\d+px$/)
  })

  it('toggleFilter：贴近视口底部 → 翻转 above（bottom 定位、top auto）', () => {
    const { api } = makeFilter()
    const th = fakeTh({ top: 700, bottom: 730 } as never)
    api.toggleFilter(cols[0], { currentTarget: th, stopPropagation: vi.fn(), clientX: 0, clientY: 0 } as never)
    expect(api.filterDropdownAbove.value).toBe(true)
    const s = api.filterDropdownStyle.value
    expect(s.top).toBe('auto')
    expect(s.bottom).toBe(`${window.innerHeight - 700 + 4}px`)
  })

  it('toggleFilter 同列再点 → 关闭；切列时回调 _closeCallbacks 并复位 optionSort', () => {
    const { api } = makeFilter()
    const th = fakeTh({ top: 100, bottom: 130 } as never)
    const mk = () => ({ currentTarget: th, stopPropagation: vi.fn(), clientX: 0, clientY: 0 }) as never
    api.toggleFilter(cols[0], mk())
    api.optionSort.value = 'count'
    const cb = vi.fn()
    api._closeCallbacks.add(cb)
    api.toggleFilter(cols[1], mk()) // 切列
    expect(cb).toHaveBeenCalledTimes(1)
    expect(api.activeFilterKey.value).toBe('status')
    expect(api.optionSort.value).toBe('name') // 每次打开复位

    api.toggleFilter(cols[1], mk()) // 同列再点 → 关
    expect(api.activeFilterKey.value).toBeNull()
    expect(api.filterDraft.value).toBeNull()
    expect(api.filterDropdownStyle.value).toEqual({})
  })
})

describe('applyFilter 全选边界与清除', () => {
  it('选中全部值 = 未筛选（delete 而非写入）；部分选中才写 filterState', () => {
    const { api, emitted } = makeFilter()
    openFilter(api, 'city')
    const all = api.activeFilterOptions.value.map((o) => o.value)
    api.filterDraft.value!.selectedValues = [...all]
    api.applyFilter()
    expect(api.filterState.value.city).toBeUndefined()
    expect(emitted.at(-1)).toEqual({})

    api.filterDraft.value = { searchText: '', selectedValues: ['北京'] }
    api.activeFilterKey.value = 'city'
    api.applyFilter()
    expect(api.filterState.value.city?.selectedValues).toEqual(['北京'])
    expect(emitted.at(-1)).toEqual({ city: ['北京'] })
  })

  it('resetFilter 清当前列并 emit；clearAllFilters 清空全部', () => {
    const { api, emitted } = makeFilter()
    openFilter(api, 'city')
    api.filterDraft.value!.selectedValues = ['北京']
    api.applyFilter()
    api.activeFilterKey.value = 'city'
    api.resetFilter()
    expect(api.filterState.value.city).toBeUndefined()
    api.filterState.value = {
      city: { searchText: '', selectedValues: ['北京'] },
      status: { searchText: '', selectedValues: ['active'] },
    }
    api.clearAllFilters()
    expect(api.filterState.value).toEqual({})
    expect(emitted.at(-1)).toEqual({})
  })
})

describe('externalFilters 同步（服务端模式）', () => {
  it('外部有值 → 同步内部（整体替换）；外部从有值变空对象 → 显式清空（_hadExternalData 门）', async () => {
    const ext = ref<Record<string, string[]> | undefined>(undefined)
    const { api } = makeFilter({ externalFilters: () => ext.value })
    ext.value = { status: ['active'] }
    await nextTick()
    expect(api.filterState.value.status?.selectedValues).toEqual(['active'])
    ext.value = {} // 曾有过数据 → 显式清空
    await nextTick()
    expect(api.filterState.value).toEqual({})
  })

  it('初始即空对象且从未有过数据 → 保留内部状态（持久化恢复不被误清）；外部有值到达即整体接管', async () => {
    const ext = ref<Record<string, string[]> | undefined>({})
    const { api } = makeFilter({ externalFilters: () => ext.value })
    api.filterState.value = { city: { searchText: '', selectedValues: ['北京'] } } // 模拟持久化恢复
    // 初始 {} 未触发同步（watch 无 immediate）→ 内部保留
    expect(api.filterState.value.city?.selectedValues).toEqual(['北京'])
    ext.value = { status: ['active'] } // 外部有值 → 整体接管（服务端语义：外部为准）
    await nextTick()
    expect(api.filterState.value).toEqual({ status: { searchText: '', selectedValues: ['active'] } })
  })

  it('外部 undefined → 清空内部；值未变化时 watch 不重写对象（防循环）', async () => {
    const ext = ref<Record<string, string[]> | undefined>(undefined)
    const { api } = makeFilter({ externalFilters: () => ext.value })
    ext.value = { city: ['北京'] }
    await nextTick()
    expect(Object.keys(api.filterState.value)).toEqual(['city'])
    const first = api.filterState.value
    await nextTick() // 未变化 → 不重写对象
    expect(api.filterState.value).toBe(first)

    ext.value = undefined
    await nextTick()
    expect(api.filterState.value).toEqual({})
  })
})
