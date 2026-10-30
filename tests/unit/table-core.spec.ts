// P2-3 前置：DataTable 数据核心 useTableCore 行为锁定测试
// 为巨型组件（3311 行）拆分建立安全网 —— 排序/筛选/搜索/分页/虚拟滚动/行稳定 id
import { describe, it, expect } from 'vitest'
import { ref, computed, nextTick } from 'vue'
import { useTableCore, stableRowId } from '@/components/data/composables/useTableCore'
import type { Column, ColumnFilterState } from '@/components/data/composables/types'

const cols: Column[] = [
  { key: 'name', title: '姓名' },
  { key: 'age', title: '年龄', sortable: true },
  { key: 'city', title: '城市', sortable: true },
]

function makeCore(props: Record<string, unknown> = {}) {
  const filterState = ref<Record<string, ColumnFilterState>>({})
  const hiddenColumns = ref(new Set<string>())
  const visibleColumns = computed(() => cols)
  const globalSearch = ref('')
  const emit = () => {}
  const core = useTableCore(
    { data: [], ...props } as never,
    emit as never,
    filterState,
    hiddenColumns,
    visibleColumns,
    globalSearch,
  )
  return { core, filterState, hiddenColumns, globalSearch }
}
const rows = [
  { name: '张三', age: 30, city: '北京' },
  { name: '李四', age: 25, city: '上海' },
  { name: '王五', age: 35, city: '北京' },
]

describe('useTableCore 数据管道（P2-3 拆分安全网）', () => {
  it('toggleSort 三态：asc → desc → 清除', () => {
    const { core } = makeCore({ data: rows })
    // 初始无排序
    expect(core.sortState.value.key).toBe('')
    // 第一击：asc
    core.toggleSort(cols[1])
    expect(core.sortState.value).toEqual({ key: 'age', order: 'asc' })
    expect(core.displayData.value.map((r) => r.age)).toEqual([25, 30, 35])
    // 第二击：desc
    core.toggleSort(cols[1])
    expect(core.sortState.value).toEqual({ key: 'age', order: 'desc' })
    expect(core.displayData.value.map((r) => r.age)).toEqual([35, 30, 25])
    // 第三击：清除
    core.toggleSort(cols[1])
    expect(core.sortState.value.key).toBe('')
    expect(core.displayData.value).toHaveLength(3)
  })

  it('sortable: false 的列不可排序，未声明默认可排序', () => {
    const { core } = makeCore({ data: rows })
    // 未声明 sortable = 默认可排序
    core.toggleSort(cols[0])
    expect(core.sortState.value.key).toBe('name')
    // 显式 sortable: false 不可排序
    const noSortCol: Column = { key: 'age', title: '年龄', sortable: false }
    core.toggleSort(noSortCol)
    expect(core.sortState.value.key).toBe('name') // 仍保持 name
  })

  it('sortArrowClass：激活列与历史列区分', () => {
    const { core } = makeCore({ data: rows })
    core.toggleSort(cols[1]) // age asc
    core.toggleSort(cols[2]) // city asc
    // age 变成历史列
    expect(core.sortArrowClass(cols[1], 'asc')).toBe('history')
    expect(core.sortArrowClass(cols[2], 'asc')).toBe('active')
  })

  it('筛选：selectedValues 精确匹配且过滤隐藏列', () => {
    const { core, filterState, hiddenColumns } = makeCore({ data: rows })
    filterState.value = { city: { searchText: '', selectedValues: ['北京'] } }
    expect(core.displayData.value.map((r) => r.name)).toEqual(['张三', '王五'])
    // 隐藏 city 列后筛选失效
    hiddenColumns.value = new Set(['city'])
    expect(core.activeFilters.value).toHaveLength(0)
    expect(core.displayData.value).toHaveLength(3)
  })

  it('全局搜索：匹配渲染文本与拼音', () => {
    const { core, globalSearch } = makeCore({ data: rows })
    globalSearch.value = 'zhangsan' // 拼音命中"张三"
    expect(core.displayData.value.map((r) => r.name)).toEqual(['张三'])
    globalSearch.value = '30' // 数字文本命中
    expect(core.displayData.value.map((r) => r.name)).toEqual(['张三'])
  })

  it('分页：客户端从全量切当前页', () => {
    const { core } = makeCore({ data: rows, pageSize: 2 })
    expect(core.pagedData.value).toHaveLength(2)
    expect(core.totalPages.value).toBe(2)
    expect(core.displayPages.value).toEqual([1, 2])
    core.setPage(2)
    expect(core.pagedData.value).toHaveLength(1)
    expect(core.pagedData.value[0].name).toBe('王五')
  })

  it('displayPages 省略号逻辑（>9 页）', () => {
    const { core } = makeCore({
      data: Array.from({ length: 100 }, (_, i) => ({ name: `r${i}`, age: i, city: 'x' })),
      pageSize: 10,
    })
    core.setPage(5)
    expect(core.displayPages.value).toEqual([1, '...', 4, 5, 6, '...', 10])
  })

  it('服务端分页（total 存在）时不客户端切片', () => {
    const { core } = makeCore({ data: rows.slice(0, 1), pageSize: 2, total: 3 })
    // data 是服务端返回的当前页，不切片
    expect(core.pagedData.value).toHaveLength(1)
    expect(core.totalPages.value).toBe(2)
  })

  it('虚拟滚动：无分页 + maxHeight 时启用，start/end 随 scrollTop 计算', async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ name: `r${i}`, age: i, city: 'x' }))
    const { core } = makeCore({ data: many, virtualScroll: true, maxHeight: '300px', pageSize: 0 })
    expect(core.isVirtual.value).toBe(true)
    // 未滚动时 containerHeight=0 → 仅渲染 overscan（10）条，保守首屏
    expect(core.virtualVisibleData.value).toHaveLength(10)
    // 模拟滚动到 500px：_rowH()=40 → start = floor(500/40)-10 = 2
    core.scrollContainerRef.value = { scrollTop: 500, clientHeight: 280 } as never
    core.onTableScroll({ target: core.scrollContainerRef.value } as never)
    await nextTick()
    await new Promise((r) => requestAnimationFrame(r))
    expect(core.virtualStartIndex.value).toBe(2)
    // virtualTopOffset = start * rowHeight
    expect(core.virtualTopOffset.value).toBe(2 * 40)
    // 滚动后可见数据 = start 起的 slice
    expect(core.virtualVisibleData.value[0].name).toBe('r2')
  })

  it('stableRowId：无 rowKey 时行引用分配稳定 id', () => {
    const a = { name: 'x' }
    const b = { name: 'y' }
    expect(stableRowId(a)).toBe(stableRowId(a))
    expect(stableRowId(b)).toBe(stableRowId(b))
    expect(stableRowId(a)).not.toBe(stableRowId(b))
  })

  it('rowMetaMap：rowKey 优先，无则稳定 id，striped 交替', () => {
    const { core } = makeCore({ data: rows, rowKey: 'name' })
    const meta = core.rowMetaMap.value
    expect(meta.get(rows[0])?.key).toBe('张三')
    expect(meta.get(rows[0])?.striped).toBe(false)
    expect(meta.get(rows[1])?.striped).toBe(true)
  })
})

/* ═══════════ 显示文本 vs 取值：筛选/搜索口径（第 191 轮） ═══════════
 *
 * 表格里"显示文本"（走 getCellText，含 col.render）与"取值"（原始数据）是两条通道。
 * TD-86 记下要核对两处：
 *   · **筛选**必须按**取值**匹配（选项 value 是 1/2/3，与 render 出来的标签无关）；
 *   · **搜索**必须按**显示文本**匹配（用户搜的是屏幕上看到的内容）。
 * 两条都在这里钉死，避免以后有人"统一口径"时把其中一条改坏。
 */
describe('显示文本 vs 取值：筛选/搜索口径', () => {
  const renderCols: Column[] = [
    {
      key: 's',
      title: '状态',
      options: [{ value: 1, label: '待办', color: '#ef4444' }],
      render: (v: unknown) => (v === 1 ? '待办' : '已完成'),
    },
  ]
  const renderRows = [
    { id: 'r1', s: 1 },
    { id: 'r2', s: 2 },
  ]

  function makeRendered() {
    const filterState = ref<Record<string, ColumnFilterState>>({})
    const hiddenColumns = ref(new Set<string>())
    const visibleColumns = computed(() => renderCols)
    const globalSearch = ref('')
    const core = useTableCore(
      { data: renderRows } as never,
      (() => {}) as never,
      filterState,
      hiddenColumns,
      visibleColumns,
      globalSearch,
    )
    return { core, filterState, globalSearch }
  }

  it('**筛选按取值**：selectedValues 存字符串 "1" 也能命中数字 1 的行', () => {
    const { core, filterState } = makeRendered()
    filterState.value = { s: { searchText: '', selectedValues: ['1'] } }
    expect(core.displayData.value.map((r) => r.id)).toEqual(['r1'])
  })

  it('**搜索按显示文本**：搜 render 后的「待办」能命中', () => {
    const { core, globalSearch } = makeRendered()
    globalSearch.value = '待办'
    expect(core.displayData.value.map((r) => r.id), '显示文本可搜').toEqual(['r1'])
    globalSearch.value = '已完成'
    expect(core.displayData.value.map((r) => r.id)).toEqual(['r2'])
  })
})
