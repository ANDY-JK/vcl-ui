/**
 * DataTableToolbar · 装配路径锁定（#498）
 *
 * 两块内容：
 *
 * ## 一、筛选 chip 的「关闭单个筛选」必须是真控件（#498 修的缺陷）
 *
 * 现状（修前）：chip 上的 × 是一个**裸 `<svg>`**
 *
 * ```html
 * <IconSvg type="x" class="filter-chip-close" :aria-label="…" @click="removeFilter(key)" />
 * ```
 *
 * `IconSvg` 渲染出的 svg 带 `aria-hidden="true"`，且没有 `role` / `tabindex`：
 *   · **键盘用户无法移除单个 chip** —— Tab 走不到它，Enter/Space 没反应，
 *     唯一的键盘出路是点「清除筛选」把**全部**筛选清掉（粒度丢失）；
 *   · `aria-label` 挂在 `aria-hidden` 元素上等于没写，读屏根本不念这个按钮。
 * CSS 里 `.filter-chip-close { cursor: pointer }` + hover 变不透明，
 * 视觉上完全是一个可点控件 —— 「看起来能点、键盘点不到」。
 *
 * ## 二、工具栏按钮排的接线
 *
 * 该组件此前只被 `data-table-mount.spec.ts` 间接碰到（搜索展开那一条），
 * 其余按钮（密度/缩放/全屏/截图/复制/视图切换/列设置/批量修改/清排序/滚动进度条）
 * 没有组件级断言。这里用**真实的** `provideDataTableContext` 注入最小上下文
 * （Symbol 是模块私有的，自己 new 一个注入不进去），把接线逐条钉住。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, nextTick, ref } from 'vue'
import { provideDataTableContext, type DataTableContext } from '@/components/data/composables/context'

const COLS = [
  { key: 'city', title: '城市' },
  { key: 'status', title: '状态' },
]

interface Opts {
  filters?: Record<string, { searchText: string; selectedValues: string[] }>
  sortKey?: string
  selectable?: boolean
  selected?: string[]
  exportable?: boolean
  excelExportable?: boolean
  colSettings?: boolean
  editable?: boolean
  canUndo?: boolean
  canRedo?: boolean
  cardView?: boolean
  fullscreen?: boolean
  scrollable?: boolean
  scrollProgress?: number
  pinned?: { key: string; pct: number }[]
  zoomY?: number
}

/** 挂载工具栏：注入最小上下文，返回 wrapper、调用记录与可改写的状态 ref */
async function mountToolbar(o: Opts = {}) {
  const { default: DataTableToolbar } = await import('@/components/data/DataTableToolbar.vue')
  const calls: string[] = []
  const hit = (n: string) => () => calls.push(n)

  const st = {
    activeFilters: computed(
      () => Object.entries(o.filters ?? {}) as [string, { searchText: string; selectedValues: string[] }][],
    ),
    sortState: ref({ key: o.sortKey ?? '', order: 'asc' as const }),
    globalSearch: ref(''),
    showGlobalSearch: ref(false),
    dense: ref(false),
    zoomX: ref(1),
    zoomY: ref(o.zoomY ?? 1),
    isFullscreen: ref(o.fullscreen ?? false),
    isCardViewEffective: ref(o.cardView ?? false),
    canUndo: ref(o.canUndo ?? false),
    canRedo: ref(o.canRedo ?? false),
    selectedKeys: ref(o.selected ?? []),
    scrollable: ref(o.scrollable ?? false),
    scrollProgress: ref(o.scrollProgress ?? 0),
    cardViewHeight: ref(0),
    pinnedRowPcts: computed(() => o.pinned ?? []),
  }

  const w = mount(
    {
      components: { DataTableToolbar },
      props: [
        'columns',
        'exportable',
        'excelExportable',
        'colSettings',
        'selectable',
        'maxHeight',
        'autoHeight',
        'editable',
      ],
      setup() {
        provideDataTableContext({
          activeFilters: st.activeFilters,
          sortState: st.sortState,
          globalSearch: st.globalSearch,
          showGlobalSearch: st.showGlobalSearch,
          removeFilter: (k: string) => calls.push(`removeFilter:${k}`),
          clearPersisted: (k: string) => calls.push(`clearPersisted:${k}`),
          clearAllFilters: hit('clearAllFilters'),
          clearSort: hit('clearSort'),
          dense: st.dense,
          zoomX: st.zoomX,
          zoomY: st.zoomY,
          resetZoom: hit('resetZoom'),
          exportCSV: hit('exportCSV'),
          exportExcel: hit('exportExcel'),
          isFullscreen: st.isFullscreen,
          toggleFullscreen: hit('toggleFullscreen'),
          captureScreenshot: hit('captureScreenshot'),
          copyTableData: hit('copyTableData'),
          isCardViewEffective: st.isCardViewEffective,
          toggleCardMode: hit('toggleCardMode'),
          canUndo: st.canUndo,
          canRedo: st.canRedo,
          undoFromToolbar: hit('undo'),
          redoFromToolbar: hit('redo'),
          displayData: ref([1, 2, 3]),
          displayTotal: ref(3),
          selectedKeys: st.selectedKeys,
          colSettingsPanel: { show: false, toggle: hit('colSettings') },
          batchDialog: { open: hit('batchOpen') },
          scrollable: st.scrollable,
          scrollProgress: st.scrollProgress,
          cardViewHeight: st.cardViewHeight,
          onProgressMouseDown: hit('progressDown'),
          pinnedRowPcts: st.pinnedRowPcts,
          scrollToPinnedRow: (k: string) => calls.push(`scrollTo:${k}`),
        } as unknown as DataTableContext)
      },
      template: `<DataTableToolbar
        :columns="columns"
        :exportable="exportable"
        :excel-exportable="excelExportable"
        :col-settings="colSettings"
        :selectable="selectable"
        :max-height="maxHeight"
        :auto-height="autoHeight"
        :editable="editable" />`,
    },
    {
      props: {
        columns: COLS,
        exportable: o.exportable ?? false,
        excelExportable: o.excelExportable ?? false,
        colSettings: o.colSettings ?? false,
        selectable: o.selectable ?? false,
        maxHeight: o.scrollable ? '300px' : '',
        autoHeight: false,
        editable: o.editable ?? false,
      },
    },
  )
  return { w, calls, st }
}

const oneFilter = { city: { searchText: '', selectedValues: ['北京', '上海'] } }

describe('DataTableToolbar · 筛选 chip（#498）', () => {
  it('chip 显示列标题 + 已选值个数', async () => {
    const { w } = await mountToolbar({ filters: oneFilter })
    const chip = w.find('.filter-chip')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('城市')
    expect(chip.find('.filter-chip-count').text()).toBe('(2)')
    w.unmount()
  })

  it('列已被移除（持久化残留）→ chip 回退显示 key，不崩', async () => {
    const { w } = await mountToolbar({ filters: { gone: { searchText: '', selectedValues: ['x'] } } })
    expect(w.find('.filter-chip').text()).toContain('gone')
    w.unmount()
  })

  it('**关闭单个筛选必须是真按钮（可聚焦、有可访问名）**', async () => {
    const { w } = await mountToolbar({ filters: oneFilter })
    const close = w.find('.filter-chip-close')
    expect(close.exists(), 'chip 上要有关闭控件').toBe(true)
    expect(close.element.tagName, '裸 svg 键盘到不了、读屏也念不到').toBe('BUTTON')
    expect(close.attributes('type')).toBe('button')
    expect(close.attributes('aria-label'), '可访问名要有').toContain('城市')
    w.unmount()
  })

  it('**点关闭 → 只移除那一列**（不动其它列的筛选）', async () => {
    const { w, calls } = await mountToolbar({ filters: oneFilter })
    await w.find('.filter-chip-close').trigger('click')
    expect(calls).toEqual(['removeFilter:city'])
    w.unmount()
  })

  it('**键盘 Enter 也能移除**（真按钮由浏览器合成 click，这里验 keydown 不吞事件）', async () => {
    const { w, calls } = await mountToolbar({ filters: oneFilter })
    const close = w.find('.filter-chip-close')
    await close.trigger('keydown', { key: 'Enter' })
    await close.trigger('click')
    await nextTick()
    expect(calls).toContain('removeFilter:city')
    w.unmount()
  })

  it('多列筛选 → 多个 chip，各自移除各自那一列', async () => {
    const { w, calls } = await mountToolbar({
      filters: {
        city: { searchText: '', selectedValues: ['北京'] },
        status: { searchText: '', selectedValues: ['active'] },
      },
    })
    const closes = w.findAll('.filter-chip-close')
    expect(closes).toHaveLength(2)
    await closes[1].trigger('click')
    expect(calls).toEqual(['removeFilter:status'])
    w.unmount()
  })

  it('无筛选 → 不渲染 chip；「清除筛选」按钮也不在', async () => {
    const { w } = await mountToolbar({})
    expect(w.find('.filter-chip').exists()).toBe(false)
    expect(w.find('.toolbar-clear').exists()).toBe(false)
    w.unmount()
  })

  it('「清除筛选」按钮清全部（与单个移除区分开）', async () => {
    const { w, calls } = await mountToolbar({ filters: oneFilter })
    await w.find('.toolbar-clear').trigger('click')
    expect(calls).toContain('clearAllFilters')
    w.unmount()
  })

  it('行数统计：有筛选 → 「已筛选 / 总数」；无筛选 → 只显示总数', async () => {
    const withFilter = await mountToolbar({ filters: oneFilter })
    expect(withFilter.w.find('.toolbar-count').text()).toMatch(/\//)
    withFilter.w.unmount()

    const without = await mountToolbar({})
    expect(without.w.find('.toolbar-count').text()).not.toMatch(/\//)
    without.w.unmount()
  })
})

describe('DataTableToolbar · 按钮排接线（#498）', () => {
  /** 按 title 找按钮：按钮排顺序会随 props 变化，用顺序取下标太脆 */
  const byTitle = (w: ReturnType<typeof mount>, part: string) =>
    w.findAll('.toolbar-export-btn').find((b) => (b.attributes('title') ?? '').includes(part))

  it('密度按钮：点一下翻转 dense（标题随状态在「紧凑模式 / 默认密度」之间切换）', async () => {
    const { w, st } = await mountToolbar({})
    const dense = byTitle(w, '紧凑模式')
    expect(dense, '应有密度切换按钮').toBeTruthy()
    await dense!.trigger('click')
    expect(st.dense.value).toBe(true)
    await nextTick()
    expect(byTitle(w, '默认密度'), '切到紧凑后标题应变成「默认密度」').toBeTruthy()
    w.unmount()
  })

  it('缩放按钮：显示百分比、点了复位', async () => {
    const { w, calls } = await mountToolbar({ zoomY: 1.25 })
    const zoom = w.find('.toolbar-zoom-btn')
    expect(zoom.text()).toBe('125%')
    await zoom.trigger('click')
    expect(calls).toContain('resetZoom')
    w.unmount()
  })

  it('「清除排序」只在有排序键时出现', async () => {
    const none = await mountToolbar({})
    expect(none.w.find('.toolbar-clear').exists()).toBe(false)
    none.w.unmount()

    const sorted = await mountToolbar({ sortKey: 'city' })
    const clearSort = sorted.w.findAll('.toolbar-clear')
    expect(clearSort.length).toBeGreaterThan(0)
    await clearSort[0].trigger('click')
    expect(sorted.calls).toContain('clearSort')
    sorted.w.unmount()
  })

  it('CSV / Excel 按钮受 exportable 开关控制', async () => {
    const off = await mountToolbar({})
    expect(byTitle(off.w, 'CSV'), '未开导出时不该有 CSV 按钮').toBeUndefined()
    expect(byTitle(off.w, 'Excel')).toBeUndefined()
    off.w.unmount()

    const on = await mountToolbar({ exportable: true, excelExportable: true })
    await byTitle(on.w, 'CSV')!.trigger('click')
    expect(on.calls).toEqual(['exportCSV'])
    await byTitle(on.w, 'Excel')!.trigger('click')
    expect(on.calls).toEqual(['exportCSV', 'exportExcel'])
    on.w.unmount()
  })

  it('全屏 / 截图 / 复制 / 视图切换：各自触发对应动作（互不串台）', async () => {
    const { w, calls } = await mountToolbar({})
    // 逐个点、逐个清点，避免"点一圈看集合"掩盖按钮错接（接错了也能凑出同样的集合）
    await byTitle(w, '全屏')!.trigger('click')
    expect(calls).toEqual(['toggleFullscreen'])
    await byTitle(w, '截图')!.trigger('click')
    expect(calls).toEqual(['toggleFullscreen', 'captureScreenshot'])
    await byTitle(w, '复制')!.trigger('click')
    expect(calls).toEqual(['toggleFullscreen', 'captureScreenshot', 'copyTableData'])
    await byTitle(w, '卡片')!.trigger('click')
    expect(calls.at(-1)).toBe('toggleCardMode')
    w.unmount()
  })

  it('编辑模式：撤销/重做两个按钮按 canUndo/canRedo 启用与禁用', async () => {
    const { w, calls } = await mountToolbar({ editable: true, canUndo: true, canRedo: false })
    const undo = byTitle(w, '撤销')
    const redo = byTitle(w, '重做')
    expect(undo, '编辑模式应有撤销').toBeTruthy()
    expect(redo, '编辑模式应有重做').toBeTruthy()
    expect(undo!.attributes('disabled'), 'canUndo=true → 可点').toBeUndefined()
    expect(redo!.attributes('disabled'), 'canRedo=false → 禁用').toBeDefined()
    await redo!.trigger('click')
    expect(calls, '禁用按钮点了不能触发').toEqual([])
    await undo!.trigger('click')
    expect(calls).toEqual(['undo'])
    w.unmount()
  })

  it('非编辑模式 → 不渲染撤销/重做', async () => {
    const { w } = await mountToolbar({ editable: false, canUndo: true })
    expect(byTitle(w, '撤销')).toBeUndefined()
    expect(byTitle(w, '重做')).toBeUndefined()
    w.unmount()
  })

  it('列设置按钮：点击把事件透传给 colSettingsPanel.toggle', async () => {
    const { w, calls } = await mountToolbar({ colSettings: true })
    await w.find('.col-settings-btn').trigger('click')
    expect(calls).toContain('colSettings')
    w.unmount()
  })

  it('勾选行后出现「批量修改」按钮，点击开弹窗', async () => {
    const { w, calls } = await mountToolbar({ selectable: true, selected: ['a', 'b'] })
    const batch = w.findAll('.toolbar-clear').find((b) => b.text().includes('批量'))
    expect(batch, '选中行后应有批量修改入口').toBeTruthy()
    await batch!.trigger('click')
    expect(calls).toContain('batchOpen')
    w.unmount()
  })

  it('未勾选任何行 → 不显示批量修改入口', async () => {
    const { w } = await mountToolbar({ selectable: true, selected: [] })
    expect(w.findAll('.toolbar-clear').some((b) => b.text().includes('批量'))).toBe(false)
    w.unmount()
  })

  it('滚动进度条：scrollable + maxHeight 时出现，宽度跟 scrollProgress', async () => {
    const { w, calls } = await mountToolbar({ scrollable: true, scrollProgress: 42 })
    const track = w.find('.table-progress-track')
    expect(track.exists()).toBe(true)
    expect(w.find('.table-progress').attributes('style')).toContain('width: 42%')
    await track.trigger('mousedown')
    expect(calls).toContain('progressDown')
    w.unmount()
  })

  it('滚动进度条：固定行锚点按 pct 定位，点击跳回该行', async () => {
    const { w, calls } = await mountToolbar({ scrollable: true, pinned: [{ key: 'r2', pct: 30 }] })
    const anchor = w.find('.table-progress-anchor')
    expect(anchor.exists()).toBe(true)
    expect(anchor.attributes('style')).toContain('left: 30%')
    await anchor.trigger('click')
    expect(calls).toContain('scrollTo:r2')
    w.unmount()
  })

  it('非滚动容器 → 不渲染进度条', async () => {
    const { w } = await mountToolbar({ scrollable: false, scrollProgress: 42 })
    expect(w.find('.table-progress-track').exists()).toBe(false)
    w.unmount()
  })

  it('全局搜索：展开输入框 → Escape 收起并清空关键词', async () => {
    const { w, st } = await mountToolbar({})
    await w.find('.global-search-toggle').trigger('click')
    expect(st.showGlobalSearch.value).toBe(true)
    await nextTick()
    const input = w.find('input.global-search-input')
    expect(input.exists()).toBe(true)
    st.globalSearch.value = 'abc'
    await input.trigger('keydown', { key: 'Escape' })
    expect(st.showGlobalSearch.value, 'Escape 收起搜索').toBe(false)
    expect(st.globalSearch.value, '收起时清空关键词').toBe('')
    w.unmount()
  })
})
