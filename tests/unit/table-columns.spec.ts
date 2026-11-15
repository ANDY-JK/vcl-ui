// useTableColumns 行为锁定测试（M3 下沉后列管理安全网：显隐/固定级联/拖拽排序/列宽/autoFit/卡片视图）
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ref, computed, nextTick, reactive } from 'vue'
import { useTableColumns } from '@/components/data/composables/useTableColumns'
import { measureColumnWidth } from '@/components/data/composables/utils'
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

  it('未知 key 的级联调用无副作用', () => {
    // 原用例还断言了 `unfixColumn('name')` 让 name 从两侧集合消失 —— 那条断言
    // **把缺陷锁死了**：集合级删除会在固定区中间打出空洞（本组件的 sticky 与
    // 计数逻辑都假设连续前缀/后缀）。该 API 已于 #292 删除，真实入口是列头右键
    // → DataTableColumnSettings.unfixFromMenu（级联语义，见 column-settings-panel.spec）。
    const { api } = makeApi()
    api.fixLeftCascade('name')
    api.fixRightCascade('name')
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
  /* ── 冷却计时器的状态机必须能回到"立即"（#508）──
   *
   * 冷却实现里两条分支对 `_autoFitTimer` 的处理**不对称**：
   *   首调用  → setTimeout(0)   → 回调里 `_autoFitTimer = null` 再跑 core  ✅
   *   合并调用 → setTimeout(300) → 回调**直接**跑 core，从不清零            ❌
   *
   * 于是"同帧并发合并"这件事只要发生过**一次**，`_autoFitTimer` 就永远是个
   * 已失效的 timer id（真值），此后每次 `applyAutoFit()` 都走合并分支：
   * **永久 300ms 延后**，注释里写的"首调用走 setTimeout(0)"变成不可达代码。
   * 用户可见症状：窗口缩放 / 数据加载后列宽总慢半拍，且拖窗口期间连续触发会
   * 被反复延后（冷却窗口永远关不上）。
   */

  it('**一次合并之后必须回到"立即执行"**（不能永久延后 300ms）', async () => {
    const wrap = { getBoundingClientRect: () => ({ width: 802 }) }
    const p = { columns: cols, autoFit: true, selectable: false, bordered: false }
    const api = useTableColumns(
      p as never,
      { value: wrap } as never,
      computed(() => emptyData.value),
    )

    vi.useFakeTimers()
    // 同帧两次调用 → 第一次 0ms、第二次把它合并成 300ms
    api.applyAutoFit()
    api.applyAutoFit()
    vi.advanceTimersByTime(400)
    expect(Object.keys(api.columnWidths.value).length, '合并那次应当已经算过').toBeGreaterThan(0)

    // 冷却早已结束：下一次调用必须**立刻**重算，而不是又排一个 300ms
    api.columnWidths.value = {}
    api.applyAutoFit()
    vi.advanceTimersByTime(10)
    expect(
      Object.keys(api.columnWidths.value).length,
      '冷却结束后应回到立即执行（10ms 内算完），现在却要等满 300ms',
    ).toBeGreaterThan(0)
    vi.useRealTimers()
  })

  it('同帧连发 5 次 → 冷却窗口内合并成**一次**重算（冷却的本意）', async () => {
    // 用容器量宽次数当"跑了几次 core"的观测点：每次 core 都会量一次容器
    let measured = 0
    const wrap = {
      getBoundingClientRect: () => {
        measured++
        return { width: 802 }
      },
    }
    const p = { columns: cols, autoFit: true, selectable: false, bordered: false }
    const api = useTableColumns(
      p as never,
      { value: wrap } as never,
      computed(() => emptyData.value),
    )

    vi.useFakeTimers()
    for (let i = 0; i < 5; i++) api.applyAutoFit() // 同一同步块内连发
    expect(measured, '还没到时间不该算').toBe(0)
    vi.advanceTimersByTime(300)
    expect(measured, '连发 5 次合并成 1 次，不是各算一遍').toBe(1)
    vi.useRealTimers()
  })

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

// ==================== measureColumnWidth 图片值 ====================
// 回归：autoFit 曾把头像列的 data-URI 字符串当文本量宽，量出 2212px（整表 2907px 被一列吞掉）
describe('measureColumnWidth 图片值', () => {
  it('data URI 图按 imageSize+20 计宽，不量字符串', () => {
    const col: Column = { key: 'avatar', title: '头像', imageSize: 44 }
    const { maxW } = measureColumnWidth(col, [{ avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"></svg>' }])
    expect(maxW).toBe(64)
  })

  it('http(s) 图片扩展名 URL 同样按缩略图计宽', () => {
    const col: Column = { key: 'avatar', title: '头像' }
    const { maxW } = measureColumnWidth(col, [{ avatar: 'https://cdn.example.com/photo.png' }])
    expect(maxW).toBe(60) // 默认 imageSize 40 + 20
  })

  it('图文混排列取两者较宽者', () => {
    const col: Column = { key: 'cell', title: '混合', imageSize: 40 }
    const { maxW } = measureColumnWidth(col, [{ cell: 'data:image/png;base64,AAAA' }, { cell: '一个挺长的文本内容需要更宽的列来容纳才行' }])
    expect(maxW).toBeGreaterThan(60) // 文本行比 60 宽 → 取文本宽
  })

  it('纯文本列行为不变（长串照样量出大宽度）', () => {
    const col: Column = { key: 'txt', title: '文本' }
    const { maxW } = measureColumnWidth(col, [{ txt: 'x'.repeat(300) }])
    expect(maxW).toBeGreaterThan(300)
  })
})

// ==================== 判图口径与单元格渲染统一（imageDomains 透传） ====================
describe('measureColumnWidth · imageDomains 口径', () => {
  const whitelistUrl = { v: 'https://internal.invalid/media/abc123' }

  it('无白名单：白名单型路径按文本量宽（与单元格渲染一致，渲染层也不判图）', () => {
    const { maxW } = measureColumnWidth({ key: 'v', title: '值' } as Column, [whitelistUrl])
    expect(maxW).toBeGreaterThan(300) // 37 字符 × 14px 估算
  })

  it('传白名单：同一路径按缩略图计宽（imageSize 40 + 20）', () => {
    const { maxW } = measureColumnWidth({ key: 'v', title: '值' } as Column, [whitelistUrl], ['internal.invalid'])
    expect(maxW).toBe(60)
  })

  it('autoFitColumn 透传 props.imageDomains：图片列按 maxW+20 直写而非文本宽', () => {
    const props = {
      columns: [{ key: 'v', title: '值' }] as Column[],
      autoFit: true,
      selectable: false,
      cardBreakpoint: 0,
      bordered: false,
      imageDomains: ['internal.invalid'],
    }
    const data = ref([whitelistUrl])
    const api = useTableColumns(
      props as never,
      { value: null } as never,
      computed(() => data.value) as never,
    )
    api.autoFitColumn({ key: 'v', title: '值' })
    const w = api.columnWidths.value['v'] as number
    expect(w).toBeLessThan(120) // 缩略图口径 40+20+20；文本口径会到 500+
  })
})

// ==================== 剩余宽分配 · 纯图列不摊派 ====================
// 回归：图片列虽按缩略图计宽，但仍按 ideal 占比分到大量富余（卡7 头像列 213px / 卡24 625px），
// 策略改为纯图列钉内容宽、富余全给文字列
describe('applyAutoFit 剩余宽分配 · 纯图列不摊派', () => {
  function makeWrap(width: number) {
    const el = document.createElement('div')
    el.getBoundingClientRect = () =>
      ({ width, height: 400, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 400, toJSON: () => ({}) }) as DOMRect
    return ref(el)
  }

  it('纯图列钉在内容宽，富余全给文字列', async () => {
    const cols: Column[] = [
      { key: 'img', title: '图', imageSize: 40 },
      { key: 'txt', title: '文本内容' },
    ]
    const data = ref([{ img: 'data:image/png;base64,AAAA', txt: 'ab' }])
    const props = { columns: cols, autoFit: true, selectable: false, cardBreakpoint: 0, bordered: false }
    const api = useTableColumns(
      props as never,
      makeWrap(1000) as never,
      computed(() => data.value) as never,
    )
    api.applyAutoFit() // 触发点在组件挂载层，单测里显式调
    await settleAutoFit()
    const wImg = api.columnWidths.value['img'] as number
    const wTxt = api.columnWidths.value['txt'] as number
    expect(wImg, '纯图列钉在内容宽（旧策略会摊到 ~590）').toBeLessThan(120)
    expect(wTxt, '文字列吸收几乎全部富余').toBeGreaterThan(600)
    expect(wImg + wTxt, '两列仍填满容器（usableW=1000-2-8=990）').toBeGreaterThanOrEqual(985)
  })

  it('图文混排列照常参与摊派（allImage=false）', async () => {
    const cols: Column[] = [
      { key: 'mix', title: '混合', imageSize: 40 },
      { key: 'txt', title: '文本内容' },
    ]
    const data = ref([
      { mix: 'data:image/png;base64,AAAA', txt: 'ab' },
      { mix: '一段普通文字', txt: 'cd' },
    ])
    const props = { columns: cols, autoFit: true, selectable: false, cardBreakpoint: 0, bordered: false }
    const api = useTableColumns(
      props as never,
      makeWrap(1000) as never,
      computed(() => data.value) as never,
    )
    api.applyAutoFit()
    await settleAutoFit()
    const wMix = api.columnWidths.value['mix'] as number
    expect(wMix, '混排列分到的富余应远多于钉住的纯图列').toBeGreaterThan(120)
  })
})

// ==================== 全局列宽下限 60 · 拖拽/双击与压缩口径统一 ====================
// 回归：拖拽与双击自适应此前没有 60 下限（只有逐列表头最小宽），关排序筛选 + 短标题的列
// 能被拖到 35px / 写到 21px，与 autoFit 压缩保底（max(hMin, 40%, 60)）口径分裂
describe('全局列宽下限 60 · 口径统一', () => {
  /** sortable/filterable 全关 + 1 字标题 → 表头最小宽仅 21（happy-dom 估算），低于全局 60 */
  function makeTightApi() {
    const tightCols: Column[] = [{ key: 'n', title: '窄', sortable: false, filterable: false }]
    const { api } = makeApi({ columns: tightCols })
    return api
  }

  function dragTo(api: ReturnType<typeof useTableColumns>, from: number, to: number) {
    const th = document.createElement('th')
    vi.spyOn(th, 'getBoundingClientRect').mockReturnValue({ width: 300 } as DOMRect)
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
    api.startResize({ key: 'n', title: '窄', sortable: false, filterable: false }, {
      clientX: from,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      target: cell,
    } as unknown as MouseEvent)
    ;(listeners.mousemove?.[0] as (e: { clientX: number }) => void)({ clientX: to })
    ;(listeners.mouseup?.[0] as () => void)()
    vi.restoreAllMocks()
  }

  it('拖拽：短标题列也钉在全局 60，不再随表头最小宽写到 21', () => {
    const api = makeTightApi()
    dragTo(api, 100, -900)
    expect(api.columnWidths.value.n).toBe(60)
  })

  it('双击自适应：空内容短标题列写入 60 而非 21', () => {
    const api = makeTightApi()
    api.autoFitColumn({ key: 'n', title: '窄', sortable: false, filterable: false })
    expect(api.columnWidths.value.n).toBe(60)
  })
})

// ==================== 拖拽防摊还 · 收窄量分摊给其余列 ====================
// 回归：table-layout:auto + width:100% 下，写入总宽小于容器时浏览器把差额等比摊回各列
// （实测 JS 写 131px 被渲染成 156px），拖窄被弹回 = 「拖拽不利索」根源。
// 对策：收窄量 δ 按占比分摊给其余列，写入总宽恒等。
describe('拖拽防摊还 · 收窄量分摊', () => {
  function makeFitWrap(width: number, overflow = false) {
    const el = document.createElement('div')
    el.getBoundingClientRect = () =>
      ({ width, height: 400, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 400, toJSON: () => ({}) }) as DOMRect
    const scroller = document.createElement('div')
    scroller.className = 'table-scroll'
    Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: overflow ? width + 300 : width })
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: width })
    el.appendChild(scroller)
    return ref(el)
  }

  function dragCol(
    api: ReturnType<typeof useTableColumns>,
    col: Column,
    startW: number,
    from: number,
    to: number,
  ) {
    const th = document.createElement('th')
    vi.spyOn(th, 'getBoundingClientRect').mockReturnValue({ width: startW } as DOMRect)
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
    api.startResize(col, { clientX: from, preventDefault: vi.fn(), stopPropagation: vi.fn(), target: cell } as unknown as MouseEvent)
    ;(listeners.mousemove?.[0] as (e: { clientX: number }) => void)({ clientX: to })
    ;(listeners.mouseup?.[0] as () => void)()
    vi.restoreAllMocks()
  }

  const twoCols: Column[] = [
    { key: 'a', title: '甲', sortable: false, filterable: false },
    { key: 'b', title: '乙', sortable: false, filterable: false },
  ]

  it('容器装得下时收窄 100：δ 全部给邻列，写入总宽恒等', () => {
    const props = { columns: twoCols, autoFit: true, selectable: false, cardBreakpoint: 0, bordered: false }
    const api = useTableColumns(
      props as never,
      makeFitWrap(1000) as never,
      computed(() => [{ a: 'x', b: 'y' }]) as never,
    )
    api.columnWidths.value = { a: 500, b: 500 }
    dragCol(api, twoCols[1], 500, 1000, 900) // 乙收窄 100
    expect(api.columnWidths.value.b).toBe(400)
    expect(api.columnWidths.value.a).toBe(600)
    expect(api.columnWidths.value.a + api.columnWidths.value.b).toBe(1000)
  })

  it('溢出态不介入：已横向滚动时收窄保持 1:1（浏览器尊重写入宽）', () => {
    const props = { columns: twoCols, autoFit: true, selectable: false, cardBreakpoint: 0, bordered: false }
    const api = useTableColumns(
      props as never,
      makeFitWrap(1000, true) as never,
      computed(() => [{ a: 'x', b: 'y' }]) as never,
    )
    api.columnWidths.value = { a: 600, b: 600 }
    dragCol(api, twoCols[1], 600, 1200, 1100) // 乙收窄 100
    expect(api.columnWidths.value.b).toBe(500)
    expect(api.columnWidths.value.a).toBe(600) // 邻列不动
  })
})
