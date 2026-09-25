// useTableExtras 补测（table-extras.spec.ts 未覆盖面：CSV 格式细节/Excel 惰性导出/右键菜单定位/
// 筛选键盘导航/全局事件/indeterminate/selectedKeys watch 同步）
import { describe, it, expect, vi } from 'vitest'
import { ref, computed, reactive, nextTick } from 'vue'
import { useTableExtras } from '@/components/data/composables/useTableExtras'
import { downloadBlob } from '@/components/_internal/utils'
import type { Column, ColumnFilterState } from '@/components/data/composables/types'

type XlsxMock = {
  utils: {
    aoa_to_sheet: ReturnType<typeof vi.fn>
    book_new: ReturnType<typeof vi.fn>
    book_append_sheet: ReturnType<typeof vi.fn>
  }
  writeFile: ReturnType<typeof vi.fn>
}

vi.mock('@/components/_internal/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/_internal/utils')>()
  return { ...actual, downloadBlob: vi.fn() }
})
vi.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}))

const cols: Column[] = [
  { key: 'id', title: 'ID' },
  { key: 'name', title: '姓名' },
]
const data = [
  { id: '1', name: '=SUM(A1)' }, // 公式注入防护目标
  { id: '2', name: 'He said "hi"' }, // 引号转义目标
]

function makeExtras(props: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  const emitted: unknown[][] = []
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

describe('CSV 导出细节', () => {
  function lastBlob(): Blob {
    const call = vi.mocked(downloadBlob).mock.calls.at(-1)!
    return call[0] as Blob
  }

  it('BOM 前缀 + 表头 + 公式值加引号 + 内嵌引号双写', async () => {
    const { api } = makeExtras()
    api.exportCSV()
    const text = await lastBlob().text()
    expect(text.startsWith('﻿')).toBe(true)
    const [header, ...rows] = text.slice(1).trim().split('\n')
    expect(header).toBe('"ID","姓名"')
    expect(rows[0]).toBe('"1","\'=SUM(A1)"') // = 开头 → 单引号前缀
    expect(rows[1]).toBe('"2","He said ""hi"""') // " → "" 双写
  })

  it('隐藏列不进 CSV；exportScope=page 只导当前页；cellOverrides 优先', async () => {
    const { api, hiddenColumns, displayData } = makeExtras(
      { exportScope: 'page' },
      {
        pagedData: computed(() => [data[0]]),
        cellOverrides: ref({ '1': { name: '覆盖值' } }),
      },
    )
    hiddenColumns.value = new Set(['name'])
    api.exportCSV()
    const lines = (await lastBlob().text()).slice(1).trim().split('\n')
    expect(lines[0]).toBe('"ID"') // name 列被隐藏 → 表头只剩 ID
    expect(lines[1]).toBe('"1"') // body 行同样只含 ID 列
    expect(lines.join('\n')).not.toContain('姓名')

    hiddenColumns.value = new Set()
    displayData.value = data
    api.exportCSV()
    const lines2 = (await lastBlob().text()).slice(1).trim().split('\n')
    expect(lines2[0]).toBe('"ID","姓名"')
    expect(lines2[1]).toBe('"1","覆盖值"') // override 优先；且 page 模式只有 1 行 body
    expect(lines2.length).toBe(2)
  })
})

describe('Excel 导出（惰性 xlsx）', () => {
  it('无 @export 监听：aoa=表头+body、列宽自适应（中文 2 字宽估算）、sheet 名走 i18n', async () => {
    const xlsx = (await import('xlsx')) as unknown as XlsxMock
    const { api } = makeExtras()
    await api.exportExcel()
    const aoa = xlsx.utils.aoa_to_sheet.mock.calls[0][0] as unknown[][]
    expect(aoa[0]).toEqual(['ID', '姓名'])
    expect(aoa[1]).toEqual(['1', '=SUM(A1)']) // 编辑显示值原样进表
    expect(aoa[2]).toEqual(['2', 'He said "hi"'])
    const ws = xlsx.utils.book_append_sheet.mock.calls[0][1] as { '!cols': { wch: number }[] }
    // 「姓名」中文 2 字 ×2 + 保底 12 → 12；「ID」4 < 12 → 12
    expect(ws['!cols'].map((c) => c.wch)).toEqual([12, 12])
    expect(xlsx.writeFile).toHaveBeenCalled()
  })
})

describe('右键菜单', () => {
  it('showContextMenu：关筛选 + 定位 + above 时 y 存原始 clientY（供 bottom 定位）', () => {
    const { api } = makeExtras()
    const closeFilter = vi.fn()
    const e = { clientX: 10, clientY: 12, currentTarget: document.createElement('th') } as never
    api.showContextMenu(cols[0], e, closeFilter)
    expect(closeFilter).toHaveBeenCalledTimes(1)
    expect(api.contextMenu.value.visible).toBe(true)
    expect(api.contextMenu.value.columnKey).toBe('id')
    expect(api.contextMenu.value.x).toBeGreaterThanOrEqual(8) // 边界裁剪最低 8px
    expect(api.contextMenu.value.above).toBe(false)

    // 未显示时样式 = display:none
    api.closeContextMenu()
    expect(api.contextMenuStyle.value).toEqual({ display: 'none' })
  })

  it('contextMenuStyle：above=true 走 bottom 定位（底边贴点击点）', () => {
    const { api } = makeExtras()
    api.contextMenu.value = {
      visible: true,
      x: 100,
      y: 190,
      above: true,
      columnKey: null,
      rowKey: null,
      row: null,
      rowIndex: -1,
    }
    const s = api.contextMenuStyle.value as Record<string, string>
    expect(s.bottom).toBe(`${window.innerHeight - 190}px`)
    expect(s.top).toBe('auto')
    expect(s.left).toBe('100px')

    api.contextMenu.value.above = false
    const s2 = api.contextMenuStyle.value as Record<string, string>
    expect(s2.top).toBe('190px')
    expect(s2.bottom).toBeUndefined()
  })

  it('showRowContextMenu：无 rowContextActions 不弹；有则定位行右键（columnKey 置空）', () => {
    const { api } = makeExtras()
    const e = { clientX: 10, clientY: 10 } as never
    api.showRowContextMenu(data[0], e) // 未配 actions
    expect(api.contextMenu.value.visible).toBe(false)

    const { api: api2 } = makeExtras({ rowContextActions: [{ label: 'A' }, { label: 'B' }] })
    api2.showRowContextMenu(data[1], e)
    expect(api2.contextMenu.value.visible).toBe(true)
    expect(api2.contextMenu.value.rowKey).toBe('2')
    expect(api2.contextMenu.value.row).toEqual(data[1]) // ref 深代理，toBe 必败用 toEqual
    expect(api2.contextMenu.value.rowIndex).toBe(1)
    expect(api2.contextMenu.value.columnKey).toBeNull()
  })
})

describe('筛选下拉键盘导航', () => {
  it('ArrowDown/Up 游标移动与上下限夹紧；Enter 切换选项选中；无选项时 no-op', () => {
    const filterDraft = ref<ColumnFilterState | null>({ searchText: '', selectedValues: [] })
    const { api } = makeExtras({}, {
      filteredOptions: computed(() => [{ value: '甲' }, { value: '乙' }]),
      filterDraft,
    })
    const kd = (key: string) => {
      const e = { key, preventDefault: vi.fn() } as unknown as KeyboardEvent
      api.onFilterKeydown(e)
      return e.preventDefault
    }
    expect(kd('ArrowDown')).toHaveBeenCalled()
    expect(api.filterFocusIndex.value).toBe(0)
    kd('ArrowDown')
    expect(api.filterFocusIndex.value).toBe(1)
    kd('ArrowDown') // 超限夹紧
    expect(api.filterFocusIndex.value).toBe(1)
    kd('ArrowUp')
    expect(api.filterFocusIndex.value).toBe(0)
    kd('ArrowUp') // 下限夹紧
    expect(api.filterFocusIndex.value).toBe(0)

    api.onFilterKeydown({ key: 'Enter', preventDefault: vi.fn() } as never)
    expect(filterDraft.value!.selectedValues).toEqual(['甲'])
    api.onFilterKeydown({ key: 'Enter', preventDefault: vi.fn() } as never)
    expect(filterDraft.value!.selectedValues).toEqual([])

    // 空选项：不 preventDefault 不动游标
    const emptyApi = makeExtras().api
    const e0 = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as KeyboardEvent
    emptyApi.onFilterKeydown(e0)
    expect(e0.preventDefault).not.toHaveBeenCalled()
  })
})

describe('全局事件', () => {
  it('onGlobalKeydown：Escape 优先关筛选，其次关右键菜单', () => {
    const { api } = makeExtras()
    const activeFilterKey = ref<string | null>('city')
    const closeFilter = vi.fn()
    api.onGlobalKeydown({ key: 'Escape' } as never, activeFilterKey, api.contextMenu as never, closeFilter)
    expect(closeFilter).toHaveBeenCalledTimes(1)

    activeFilterKey.value = null
    api.contextMenu.value.visible = true
    api.onGlobalKeydown({ key: 'Escape' } as never, activeFilterKey, api.contextMenu as never, closeFilter)
    expect(api.contextMenu.value.visible).toBe(false)
    expect(closeFilter).toHaveBeenCalledTimes(1)

    api.onGlobalKeydown({ key: 'a' } as never, activeFilterKey, api.contextMenu as never, closeFilter)
  })

  it('onDocumentClick：筛选面板/触发图标内部不关筛选，外部全关', () => {
    const { api } = makeExtras()
    api.contextMenu.value.visible = true
    const closeFilter = vi.fn()
    const target = (cls: string | null) => {
      const el = document.createElement('div')
      vi.spyOn(el, 'closest').mockImplementation((sel: string) => (cls && sel === cls ? el : null) as never)
      return el
    }
    api.onDocumentClick({ target: target('.dt-filter-dropdown') } as never, closeFilter)
    expect(closeFilter).not.toHaveBeenCalled()
    expect(api.contextMenu.value.visible).toBe(false) // 右键菜单仍被外部点击关掉

    api.onDocumentClick({ target: target('.th-filter-icon') } as never, closeFilter)
    expect(closeFilter).not.toHaveBeenCalled()

    api.contextMenu.value.visible = true
    api.onDocumentClick({ target: target(null) } as never, closeFilter)
    expect(closeFilter).toHaveBeenCalledTimes(1)
    expect(api.contextMenu.value.visible).toBe(false)
  })

  it('onScrollClose：筛选面板内滚动不关；面板外滚动关筛选并顺带关右键菜单', () => {
    const { api } = makeExtras()
    const activeFilterKey = ref<string | null>('city')
    const closeFilter = vi.fn()
    const inDrop = document.createElement('div')
    vi.spyOn(inDrop, 'closest').mockReturnValue(inDrop as never)
    const outDrop = document.createElement('div')
    vi.spyOn(outDrop, 'closest').mockReturnValue(null as never)

    api.onScrollClose({ target: inDrop } as never, activeFilterKey, closeFilter)
    expect(closeFilter).not.toHaveBeenCalled()

    api.contextMenu.value.visible = true
    api.onScrollClose({ target: outDrop } as never, activeFilterKey, closeFilter)
    expect(closeFilter).toHaveBeenCalledTimes(1)
    expect(api.contextMenu.value.visible).toBe(false)
  })
})

describe('行选择补充面', () => {
  it('isIndeterminateSelection：部分选中 true，全中/全不中/空数据 false（pagedData 口径）', () => {
    const { api } = makeExtras()
    expect(api.isIndeterminateSelection.value).toBe(false) // 全不中
    api._selectedKeys.value = ['1']
    expect(api.isIndeterminateSelection.value).toBe(true)
    api._selectedKeys.value = ['1', '2']
    expect(api.isIndeterminateSelection.value).toBe(false)

    const { api: api2 } = makeExtras({}, { pagedData: computed(() => []) })
    api2._selectedKeys.value = ['1']
    expect(api2.isIndeterminateSelection.value).toBe(false) // 空页
  })

  it('selectedKeys prop watch：外部受控变化同步内部（reactive props 对齐宿主）', async () => {
    const emitted: unknown[][] = []
    const props = reactive({ columns: cols, data, rowKey: 'id', selectedKeys: ['1'] as string[] })
    const api = useTableExtras(props as never, ((...args: unknown[]) => emitted.push(args)) as never, {
      displayData: computed(() => data),
      tableWrapRef: { value: null },
      filteredOptions: computed(() => []),
      filterDraft: ref(null),
      hiddenColumns: ref(new Set<string>()),
      filterState: ref({}),
      pagedData: computed(() => data),
      hasExportListener: () => false,
    } as never)
    expect(api._selectedKeys.value).toEqual(['1'])
    props.selectedKeys = ['1', '2']
    await nextTick()
    expect(api._selectedKeys.value).toEqual(['1', '2'])
    expect(emitted).toEqual([]) // watch 同步不回 emit（仅用户操作才 emit）
  })
})
