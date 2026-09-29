// useTableColumns 行为锁定测试（M3 下沉后列管理安全网：显隐/固定级联/拖拽排序/列宽/autoFit/卡片视图）
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ref, computed, nextTick, reactive } from 'vue'
import { useTableColumns } from '@/components/data/composables/useTableColumns'
import type { Column } from '@/components/data/composables/types'

const cols: Column[] = [
  { key: 'id', title: 'ID' },
  { key: 'name', title: '姓名' },
  { key: 'city', title: '城市' },
]

// 空数据：measureColumnWidth 采样为空 → maxW 恒 0，列宽断言只依赖表头最小宽（happy-dom 下确定性）
const emptyData = ref<Record<string, unknown>[]>([])

function makeApi(overrides: Partial<Record<string, unknown>> = {}) {
  const props = { columns: cols, autoFit: true, selectable: false, cardBreakpoint: 0, bordered: false, ...overrides }
  const displayData = computed(() => emptyData.value)
  const api = useTableColumns(props as never, { value: null } as never, displayData as never)
  return { api, props }
}

/** applyAutoFit 首调用走 setTimeout(0)，等一拍即执行完 */
async function settleAutoFit() {
  await new Promise((r) => setTimeout(r, 5))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useTableColumns 列显隐与展示顺序', () => {
  it('hiddenColumns 按 key 过滤 visibleColumns', () => {
    const { api } = makeApi()
    expect(api.visibleColumns.value.map((c) => c.key)).toEqual(['id', 'name', 'city'])
    api.hiddenColumns.value = new Set(['name'])
    expect(api.visibleColumns.value.map((c) => c.key)).toEqual(['id', 'city'])
  })

  it('displayColumns 按拖拽顺序重排，未登记列垫底', () => {
    const { api } = makeApi()
    api._columnOrder.value = ['city', 'id', 'name']
    expect(api.displayColumns.value.map((c) => c.key)).toEqual(['city', 'id', 'name'])
    // 缺 name：排序表里没有它 → 排到最后（稳定序）
    api._columnOrder.value = ['city', 'id']
    expect(api.displayColumns.value.map((c) => c.key)).toEqual(['city', 'id', 'name'])
  })
})

describe('useTableColumns 静态固定列同步', () => {
  it('构造时把 fixed 静态列并入动态固定集合', () => {
    const { api } = makeApi({
      columns: [
        { key: 'id', title: 'ID', fixed: 'left' as const },
        { key: 'name', title: '姓名' },
        { key: 'city', title: '城市', fixed: 'right' as const },
      ],
    })
    expect(api.isColumnFixed({ key: 'id' })).toBe('left')
    expect(api.isColumnFixed({ key: 'city' })).toBe('right')
    expect(api.isColumnFixed({ key: 'name' })).toBe(false)
  })

  it('columns 变化（增列）后重新同步静态 fixed', async () => {
    // watch 源读 props.columns 的 key 串——宿主里 props 是响应式的，测试里用 reactive 对齐
    const props = reactive({
      columns: [
        { key: 'id', title: 'ID', fixed: 'left' as const },
        { key: 'name', title: '姓名' },
      ] as Column[],
      autoFit: true,
      selectable: false,
    })
    const api = useTableColumns(
      props as never,
      { value: null } as never,
      computed(() => emptyData.value),
    )
    expect(api.dynamicFixedRight.value.size).toBe(0)
    props.columns = [...props.columns, { key: 'ops', title: '操作', fixed: 'right' as const }]
    await nextTick()
    expect(api.dynamicFixedLeft.value.has('id')).toBe(true)
    expect(api.dynamicFixedRight.value.has('ops')).toBe(true)
  })
})

describe('useTableColumns 级联固定', () => {
  it('fixLeftCascade：该列及之前所有列固定', () => {
    const { api } = makeApi()
    api.fixLeftCascade('name')
    expect([...api.dynamicFixedLeft.value]).toEqual(['id', 'name'])
    expect(api.dynamicFixedRight.value.size).toBe(0)
  })

  it('fixRightCascade：该列及之后所有列固定，并清左区重叠保持连续', () => {
    const { api } = makeApi()
    api.fixLeftCascade('city') // 左侧全固定
    expect([...api.dynamicFixedLeft.value]).toEqual(['id', 'name', 'city'])
    api.fixRightCascade('name') // 右侧 [name, city]
    expect([...api.dynamicFixedRight.value]).toEqual(['name', 'city'])
    // 左区去掉与右区重叠的 → 只剩 [id]
    expect([...api.dynamicFixedLeft.value]).toEqual(['id'])
  })

  it('unfixColumn：两侧同时移除；未知 key 的级联调用无副作用', () => {
    const { api } = makeApi()
    api.fixLeftCascade('name')
    api.fixRightCascade('name')
    api.unfixColumn('name')
    expect(api.dynamicFixedLeft.value.has('name')).toBe(false)
    expect(api.dynamicFixedRight.value.has('name')).toBe(false)
    const before = JSON.stringify([...api.dynamicFixedLeft.value])
    api.fixLeftCascade('不存在')
    expect(JSON.stringify([...api.dynamicFixedLeft.value])).toBe(before)
  })
})

describe('useTableColumns 列拖拽排序', () => {
  function makeDragEvent() {
    const transfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() }
    return {
      dataTransfer: transfer,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as DragEvent
  }

  it('dragStart/Over/Leave/Drop 全链路重排列序', () => {
    const { api } = makeApi()
    const e1 = makeDragEvent()
    api.onColDragStart(e1, 'id')
    expect(api._dragCol.value).toBe('id')
    expect(e1.dataTransfer!.setData).toHaveBeenCalledWith('text/plain', 'id')

    api.onColDragOver(makeDragEvent(), 'city')
    expect(api._dragOverCol.value).toBe('city')
    api.onColDragLeave(makeDragEvent(), 'name') // 非当前 hover 列 → 不清
    expect(api._dragOverCol.value).toBe('city')
    api.onColDragLeave(makeDragEvent(), 'city')
    expect(api._dragOverCol.value).toBeNull()

    api.onColDrop(makeDragEvent(), 'city') // id 拖到 city 后
    expect(api._columnOrder.value).toEqual(['name', 'city', 'id'])
    expect(api.displayColumns.value.map((c) => c.key)).toEqual(['name', 'city', 'id'])
    expect(api._dragCol.value).toBeNull()

    api.onColDrop(makeDragEvent(), 'id') // 拖回自身 → 顺序不变
    expect(api._columnOrder.value).toEqual(['name', 'city', 'id'])

    api._dragCol.value = 'name'
    api.onColDragEnd()
    expect(api._dragCol.value).toBeNull()
    expect(api._dragOverCol.value).toBeNull()
  })

  it('列序变化后固定区按前 N / 后 M 语义重建（不粘在旧 key 上）', async () => {
    const { api } = makeApi()
    api.fixLeftCascade('id') // 左 1
    api.fixRightCascade('city') // 右 1
    const e = makeDragEvent()
    api.onColDragStart(e, 'id')
    api.onColDrop(e, 'city') // 新序 [name, city, id]
    await nextTick()
    // 左 1 → 重建到新序前 1 列 [name]；右 1 → 新序后 1 列 [id]
    expect([...api.dynamicFixedLeft.value]).toEqual(['name'])
    expect([...api.dynamicFixedRight.value]).toEqual(['id'])
  })
})

describe('useTableColumns 列宽拖拽', () => {
  it('startResize 记录起点并挂 document 监听；move 按 diff 调宽（不低于表头底线）', () => {
    const { api } = makeApi()
    const th = document.createElement('th')
    vi.spyOn(th, 'getBoundingClientRect').mockReturnValue({ width: 120 } as DOMRect)
    const cell = document.createElement('span')
    vi.spyOn(cell, 'closest').mockReturnValue(th)

    const listeners: Record<string, unknown[]> = {}
    vi.spyOn(document, 'addEventListener').mockImplementation((ev, fn) => {
      listeners[ev] = listeners[ev] ?? []
      listeners[ev].push(fn)
      return document
    })
    vi.spyOn(document, 'removeEventListener').mockImplementation((ev, fn) => {
      const arr = listeners[ev] ?? []
      const i = arr.indexOf(fn)
      if (i >= 0) arr.splice(i, 1)
      return document
    })

    const ev = {
      clientX: 100,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      target: cell,
    } as unknown as MouseEvent
    api.startResize(cols[0], ev)
    expect(ev.preventDefault).toHaveBeenCalled()
    expect(api.resizing.value).toEqual({ colKey: 'id', startX: 100, startW: 120 })
    expect(document.body.style.cursor).toBe('col-resize')
    expect(document.body.style.userSelect).toBe('none')

    const move = (x: number) => (listeners.mousemove?.[0] as (e: { clientX: number }) => void)({ clientX: x })
    move(130)
    expect(api.columnWidths.value.id).toBe(150)
    move(-100) // 120 + (-200) < 0 → 压到表头最小宽底线 71
    expect(api.columnWidths.value.id).toBe(71)

    // 150ms 守护超时由 onResizeEnd 内部 setTimeout 注册 → 必须先在 fake timers 下触发 mouseup
    vi.useFakeTimers()
    ;(listeners.mouseup?.[0] as () => void)()
    expect(api.resizing.value).toBeNull()
    expect(api._resizeJustEnded.value).toBe(true)
    expect(document.body.style.cursor).toBe('')
    expect(api._userResizedCols.value.has('id')).toBe(true)
    // 拖完抑制 150ms 内 click 误触
    vi.advanceTimersByTime(150)
    expect(api._resizeJustEnded.value).toBe(false)

    api.onResizeMove({ clientX: 120 } as MouseEvent) // 已结束再 move → 无副作用
    api.onResizeEnd()
    expect(api.resizing.value).toBeNull()
    vi.useRealTimers()
  })
})

describe('useTableColumns autoFit', () => {
  it('容器未挂载时 applyAutoFit 直接返回', async () => {
    const { api } = makeApi()
    api.applyAutoFit()
    await settleAutoFit()
    expect(api.columnWidths.value).toEqual({})
  })

  it('装得下：多余空间按 ideal 占比分配，总宽恰好填满可用宽', async () => {
    // 802 - 2(边框) - 8(padding) = 792 可用；三列各 71 → 213 总最小宽，余量 579 均分
    const wrap = { getBoundingClientRect: () => ({ width: 802 }) }
    const p = { columns: cols, autoFit: true, selectable: false, bordered: false }
    const api2 = useTableColumns(
      p as never,
      { value: wrap } as never,
      computed(() => emptyData.value),
    )
    api2.applyAutoFit()
    await settleAutoFit()
    const widths = Object.values(api2.columnWidths.value)
    expect(widths.reduce((s, w) => s + w, 0)).toBe(792)
    expect(widths.every((w) => w >= 71)).toBe(true)
  })

  it('装不下：保持表头最小宽自然溢出（不压缩到 60 以下）', async () => {
    const wrap = { getBoundingClientRect: () => ({ width: 150 }) } // 可用 140 < 三列 213
    const p = { columns: cols, autoFit: true, selectable: false, bordered: false }
    const api = useTableColumns(
      p as never,
      { value: wrap } as never,
      computed(() => emptyData.value),
    )
    api.applyAutoFit()
    await settleAutoFit()
    expect(api.columnWidths.value).toEqual({ id: 71, name: 71, city: 71 })
  })

  it('用户手动拖过的列宽不被 autoFit 覆盖', async () => {
    const wrap = { getBoundingClientRect: () => ({ width: 802 }) }
    const p = { columns: cols, autoFit: true, selectable: false, bordered: false }
    const api = useTableColumns(
      p as never,
      { value: wrap } as never,
      computed(() => emptyData.value),
    )
    api._userResizedCols.value.add('name')
    api.columnWidths.value = { name: 999 }
    api.applyAutoFit()
    await settleAutoFit()
    expect(api.columnWidths.value.name).toBe(999)
  })

  it('autoFit=false 时 applyAutoFit 不计算', async () => {
    const wrap = { getBoundingClientRect: () => ({ width: 802 }) }
    const p = { columns: cols, autoFit: false, selectable: false, bordered: false }
    const api = useTableColumns(
      p as never,
      { value: wrap } as never,
      computed(() => emptyData.value),
    )
    api.applyAutoFit()
    await settleAutoFit()
    expect(api.columnWidths.value).toEqual({})
  })
})

describe('useTableColumns 固定列偏移', () => {
  it('fixedLeftOffsets：selectable 时首列起点含 40 复选框宽，后续列累加实际列宽', () => {
    const p = { columns: cols, selectable: true, bordered: false }
    const api = useTableColumns(
      p as never,
      { value: null } as never,
      computed(() => emptyData.value),
    )
    api.fixLeftCascade('name')
    expect(api.fixedLeftOffsets.value.id).toBe(40)
    expect(api.fixedLeftOffsets.value.name).toBe(40 + 71) // id 无用户列宽 → 表头最小宽 71
  })

  it('fixedRightOffsets：右侧固定列先让出操作列宽度（actionsWidth）', () => {
    const p = { columns: cols, selectable: false, bordered: false }
    const api = useTableColumns(
      p as never,
      { value: null } as never,
      computed(() => emptyData.value),
      computed(() => 80),
    )
    api.fixRightCascade('city')
    expect(api.fixedRightOffsets.value.city).toBe(80)
  })
})

describe('useTableColumns 双击单列自适应与卡片视图', () => {
  it('autoFitColumn：单列按表头最小宽兜底写入并标记用户调整', async () => {
    const api = makeApi().api
    api.autoFitColumn(cols[0])
    expect(api.columnWidths.value.id).toBe(71) // 空数据：max(71, 0+20)
    expect(api._userResizedCols.value.has('id')).toBe(true)
  })

  it('isCardView：cardBreakpoint 未设恒 false；设了则按窗口宽判定', () => {
    const p = { columns: cols, cardBreakpoint: 0 }
    const api = useTableColumns(
      p as never,
      { value: null } as never,
      computed(() => emptyData.value),
    )
    api._windowWidth.value = 320
    expect(api.isCardView.value).toBe(false)

    const p2 = { columns: cols, cardBreakpoint: 768 }
    const api2 = useTableColumns(
      p2 as never,
      { value: null } as never,
      computed(() => emptyData.value),
    )
    api2._windowWidth.value = 320
    expect(api2.isCardView.value).toBe(true)
    api2._windowWidth.value = 1024
    expect(api2.isCardView.value).toBe(false)
  })

  it('onWindowResizeCard：回写 window.innerWidth 并触发 autoFit 重算', async () => {
    const p = { columns: cols, cardBreakpoint: 768 }
    const api = useTableColumns(
      p as never,
      { value: null } as never,
      computed(() => emptyData.value),
    )
    api.onWindowResizeCard()
    expect(api._windowWidth.value).toBe(window.innerWidth)
    await settleAutoFit() // 双 RAF 收敛
  })
})
