// 性能压测：useTableCore 大数据管道耗时（DataTable 核心热点）
// 目的：量化 1 万行 × 10 列下 displayData/rowMetaMap 的开销，作为性能基线
// 注意：这是粗粒度基准（单次运行），不设硬断言，只输出耗时供观察
import { describe, it, expect } from 'vitest'
import { ref, computed } from 'vue'
import { useTableCore } from '@/components/data/composables/useTableCore'
import type { Column, ColumnFilterState } from '@/components/data/composables/types'

const ROWS = 10_000
const COLS = 10

function genCols(n: number): Column[] {
  return Array.from({ length: n }, (_, i) => ({ key: `col${i}`, title: `列${i}` }))
}

function genRows(n: number): Record<string, any>[] {
  return Array.from({ length: n }, (_, i) => {
    const row: Record<string, any> = { id: `r${i}` }
    for (let c = 0; c < COLS; c++) row[`col${c}`] = `值${i}-${c}`
    return row
  })
}

describe('useTableCore 大数据性能基线', () => {
  it(`displayData + rowMetaMap 在 ${ROWS} 行 × ${COLS} 列下的耗时`, () => {
    const cols = genCols(COLS)
    const data = genRows(ROWS)
    const filterState = ref<Record<string, ColumnFilterState>>({})
    const hiddenColumns = ref(new Set<string>())
    const visibleColumns = computed(() => cols)
    const globalSearch = ref('')
    const core = useTableCore(
      { data, rowKey: 'id' } as never,
      (() => {}) as never,
      filterState,
      hiddenColumns,
      visibleColumns,
      globalSearch,
    )

    // 首次访问触发全量计算
    const t0 = performance.now()
    const rows = core.displayData.value
    const t1 = performance.now()
    const meta = core.rowMetaMap.value
    const t2 = performance.now()

    expect(rows).toHaveLength(ROWS)
    expect(meta.size).toBe(ROWS)

    // eslint-disable-next-line no-console
    console.log(`[perf] displayData: ${(t1 - t0).toFixed(1)}ms, rowMetaMap(${ROWS}行): ${(t2 - t1).toFixed(1)}ms, 合计: ${(t2 - t0).toFixed(1)}ms`)
  })

  it(`全局搜索在 ${ROWS} 行下的耗时（渲染文本 + 拼音匹配）`, () => {
    const cols = genCols(COLS)
    const data = genRows(ROWS)
    const filterState = ref<Record<string, ColumnFilterState>>({})
    const hiddenColumns = ref(new Set<string>())
    const visibleColumns = computed(() => cols)
    const globalSearch = ref('')
    const core = useTableCore(
      { data, rowKey: 'id', pinyinSearch: true } as never,
      (() => {}) as never,
      filterState,
      hiddenColumns,
      visibleColumns,
      globalSearch,
    )

    const t0 = performance.now()
    globalSearch.value = '值9999'
    const result = core.displayData.value
    const t1 = performance.now()
    expect(result.length).toBeGreaterThan(0)
    // eslint-disable-next-line no-console
    console.log(`[perf] 全局搜索: ${(t1 - t0).toFixed(1)}ms, 命中 ${result.length} 行`)
  })

  it(`客户端排序 ${ROWS} 行耗时`, () => {
    const cols = genCols(COLS)
    const data = genRows(ROWS)
    const filterState = ref<Record<string, ColumnFilterState>>({})
    const hiddenColumns = ref(new Set<string>())
    const visibleColumns = computed(() => cols)
    const globalSearch = ref('')
    const core = useTableCore(
      { data, rowKey: 'id' } as never,
      (() => {}) as never,
      filterState,
      hiddenColumns,
      visibleColumns,
      globalSearch,
    )

    const t0 = performance.now()
    core.toggleSort(cols[1])
    core.displayData.value // 触发排序计算
    const t1 = performance.now()
    // eslint-disable-next-line no-console
    console.log(`[perf] 客户端排序: ${(t1 - t0).toFixed(1)}ms`)
  })
})
