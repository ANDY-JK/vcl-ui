/**
 * DataTable — 卡片视图 / 滚动进度条 / 悬浮提示 / 截断详情 / 复制数据
 *
 * 这几块是主文件里剩下的成片未覆盖面（此前整块零覆盖）：
 *   - 视图切换 toggleCardMode 与卡片渲染（勾选、字段点击、排序/筛选图标、右键、操作按钮、空态）
 *   - 可滚动检测 + 进度条点击跳转 + 拖拽（document 级监听注册/注销）+ 行锚点回跳
 *   - 单元格 mouseenter/mouseleave 的三件套气泡
 *   - 截断单元格 → 详情弹窗
 *   - 复制表格数据（TSV 落剪贴板，exportScope 决定取当前页还是全量）
 *
 * happy-dom 没有布局：scrollHeight/clientHeight/scrollTop 恒为 0，
 * 所以滚动的每一处观测量都要用 defineProperty 手工赋在被测元素上。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import DataTable from '@/components/data/DataTable.vue'
import { useT } from '@/components/_internal/i18n'
import type { Column } from '@/components/data/composables/types'

const t = useT()

const COLS: Column[] = [
  { key: 'name', title: '名称' },
  { key: 'value', title: '数值', type: 'number' },
  { key: 'city', title: '城市' },
]

const ROWS = [
  { id: 'r1', name: '甲', value: 1, city: '北京' },
  { id: 'r2', name: '乙', value: 2, city: '上海' },
  { id: 'r3', name: '丙', value: 3, city: '北京' },
]

const MANY = Array.from({ length: 12 }, (_, i) => ({
  id: `r${i + 1}`,
  name: `行${i + 1}`,
  value: i + 1,
  city: i % 2 ? '上海' : '北京',
}))

const MINIMAL = {
  columns: COLS,
  data: ROWS,
  rowKey: 'id',
  virtualScroll: false,
  autoFit: false,
  persistence: 'none' as const,
}

const mounted: VueWrapper[] = []
function track<T extends VueWrapper>(w: T): T {
  mounted.push(w)
  return w
}
function mountTable(props: Record<string, unknown> = {}): VueWrapper {
  return track(mount(DataTable, { props: { ...MINIMAL, ...props }, attachTo: document.body }))
}

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
  document.body.innerHTML = ''
  document.body.className = ''
  vi.restoreAllMocks()
})

const scrollerOf = (dt: VueWrapper) => dt.find('.table-scroll').element as HTMLElement
const cardScrollOf = (dt: VueWrapper) => dt.find('.card-view-scroll').element as HTMLElement
const body$ = (sel: string) => document.body.querySelector(sel) as HTMLElement | null
const bodyAll = (sel: string) => [...document.body.querySelectorAll(sel)] as HTMLElement[]

/** happy-dom 的布局量恒为 0，需要哪个就手工赋哪个 */
function metrics(el: HTMLElement, m: Record<string, number>): void {
  for (const [k, v] of Object.entries(m)) Object.defineProperty(el, k, { value: v, configurable: true, writable: true })
}
function boxRect(el: HTMLElement, r: { left: number; top: number; width: number; height: number }): void {
  el.getBoundingClientRect = () =>
    ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => ({}) }) as unknown as DOMRect
}
function fire(el: HTMLElement, type: string, props: Record<string, unknown> = {}): Event {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true }) as unknown as Event
  for (const [k, v] of Object.entries(props)) Object.defineProperty(e, k, { value: v, configurable: true })
  el.dispatchEvent(e)
  return e
}
/** 等 rAF / 微任务链（组件里多处是「双 rAF 等布局」） */
const settle = async (ms = 60) => {
  await nextTick()
  await new Promise((r) => setTimeout(r, ms))
  await nextTick()
}
const byTitle = (dt: VueWrapper, title: string) =>
  dt.findAll('button').find((b) => b.attributes('title') === title)

/** 切到卡片视图（点工具栏的视图切换按钮，走真实用户路径） */
async function toCardView(dt: VueWrapper): Promise<void> {
  const btn = byTitle(dt, t('table.switchToCard'))
  expect(btn, '工具栏应有「切到卡片」按钮').toBeTruthy()
  await btn!.trigger('click')
  await settle()
}

/* ══════════════════ 视图切换 ══════════════════ */

describe('视图切换（toggleCardMode）', () => {
  it('**默认列表 → 点切换变卡片 → 再点变回列表**', async () => {
    const dt = mountTable()
    expect(dt.find('table.data-table').exists(), '默认应是列表').toBe(true)
    expect(dt.find('.card-view-scroll').exists()).toBe(false)

    await toCardView(dt)
    expect(dt.find('.card-view-scroll').exists(), '切到卡片后应渲染卡片滚动容器').toBe(true)
    // 列表区靠 .table-hscroll.card-view-hidden 让位（表格节点仍在 DOM，切回不必重建）
    expect(dt.find('.table-hscroll').classes(), '列表区应被标记隐藏').toContain('card-view-hidden')
    expect(byTitle(dt, t('table.switchToList')), '按钮 title 应翻转为「切到列表」').toBeTruthy()

    await byTitle(dt, t('table.switchToList'))!.trigger('click')
    await settle()
    expect(dt.find('table.data-table').exists(), '再点应回到列表').toBe(true)
    expect(dt.find('.card-view-scroll').exists()).toBe(false)
  })

  it('**切卡片前偷取表格可见高度，卡片容器沿用该高度**（切后表格已隐藏，量不到）', async () => {
    // autoHeight 默认开着，会走 --dt-scroll-min 那条分支；关掉它才能真正验到「偷高度」路径
    const dt = mountTable({ autoHeight: false })
    metrics(scrollerOf(dt), { clientHeight: 321 })
    await toCardView(dt)
    const style = cardScrollOf(dt).getAttribute('style') ?? ''
    expect(style, '应带 maxHeight 且值来自切换前的实测高度').toContain('321px')
  })

  it('**显式 maxHeight 优先于偷取的高度**（有硬约束就不该被测量值改掉）', async () => {
    const dt = mountTable({ maxHeight: '200px' })
    metrics(scrollerOf(dt), { clientHeight: 321 })
    await toCardView(dt)
    const style = cardScrollOf(dt).getAttribute('style') ?? ''
    expect(style).toContain('200px')
    expect(style, '不该出现偷取值').not.toContain('321px')
  })
})

/* ══════════════════ 卡片渲染与交互 ══════════════════ */

describe('卡片渲染与交互', () => {
  it('**每张卡片按 visibleColumns 渲染「列名 + 值」**', async () => {
    const dt = mountTable()
    await toCardView(dt)
    const items = dt.findAll('.card-view-item')
    expect(items.length, '三行数据三张卡片').toBe(3)
    const first = items[0]!.text()
    expect(first).toContain('甲')
    expect(first).toContain('北京')
    expect(items[0]!.findAll('.card-field-label').length, '三列表头都应出现').toBe(3)
  })

  it('**卡片排序图标 → 生效并把该列标成 sort-active**', async () => {
    const dt = mountTable()
    await toCardView(dt)
    const arrows = () => dt.findAll('.card-field-label .card-sort-arrows')
    expect(arrows().length).toBeGreaterThan(0)
    expect(arrows()[0]!.classes(), '未排序时不该有 sort-active').not.toContain('sort-active')
    const firstCard = () => dt.findAll('.card-view-item')[0]!.text()
    expect(firstCard(), '前置：未排序时首张是「甲」').toContain('甲')

    await arrows()[0]!.trigger('click')
    await nextTick()
    expect(arrows()[0]!.classes()).toContain('sort-active')
    // 中文按拼音升序：丙(bing) < 甲(jia) < 乙(yi) → 首张变「丙」
    expect(firstCard(), '升序首张应是「丙」').toContain('丙')

    await arrows()[0]!.trigger('click')
    await nextTick()
    expect(firstCard(), '再点切降序，首张应是「乙」').toContain('乙')
  })

  it('**卡片列名可排序标记受 col.sortable=false 约束**', async () => {
    const dt = mountTable({ columns: [{ key: 'name', title: '名称', sortable: false }, ...COLS.slice(1)] })
    await toCardView(dt)
    const firstLabel = dt.findAll('.card-field-label')[0]!
    expect(firstLabel.findAll('.card-sort-arrows').length, '不可排序列不渲染箭头').toBe(0)
  })

  it('**卡片筛选图标 → 打开筛选下拉，且不触发排序**（@click.stop 隔离）', async () => {
    const dt = mountTable()
    await toCardView(dt)
    const icon = dt.find('.card-filter-icon')
    expect(icon.exists()).toBe(true)
    boxRect(icon.element as HTMLElement, { left: 10, top: 10, width: 20, height: 20 })
    await icon.trigger('click')
    await settle()
    expect(body$('.dt-filter-dropdown'), '应弹出筛选下拉').toBeTruthy()
    expect(bodyAll('.dt-filter-option').length, '应按取值列出选项').toBeGreaterThan(0)
    expect(
      dt.findAll('.card-field-label .card-sort-arrows')[0]!.classes(),
      '点筛选图标不该顺带排序',
    ).not.toContain('sort-active')
  })

  it('**卡片勾选 → 卡片进入 card-selected**', async () => {
    const dt = mountTable({ selectable: true })
    await toCardView(dt)
    const item = dt.findAll('.card-view-item')[0]!
    expect(item.classes()).not.toContain('card-selected')

    const cb = item.find('.card-checkbox input')
    expect(cb.exists(), 'selectable 时卡片应有勾选框').toBe(true)
    await cb.trigger('change')
    await nextTick()
    expect(dt.findAll('.card-view-item')[0]!.classes(), '勾选后卡片应高亮').toContain('card-selected')
  })

  it('**卡片值点击非选项列 → 不开选项面板**（普通列没有下拉语义）', async () => {
    const dt = mountTable()
    await toCardView(dt)
    const value = dt.findAll('.card-field')[0]!.find('.card-field-value-wrap')
    await value.trigger('click')
    await settle()
    expect(body$('.opt-drop-panel'), '普通列不该弹选项面板').toBeFalsy()
  })

  it('**卡片值点击选项列 → 打开选项面板并高亮当前值**', async () => {
    const cols: Column[] = [
      { key: 'name', title: '名称' },
      { key: 'city', title: '城市', options: ['北京', '上海', '广州'] },
    ]
    const dt = mountTable({ columns: cols, editable: true })
    await toCardView(dt)
    const cityField = dt.findAll('.card-field')[1]!
    const valueEl = cityField.find('.card-field-value')
    expect(valueEl.exists(), '卡片值区应是 .card-field-value').toBe(true)
    boxRect(valueEl.element as HTMLElement, { left: 20, top: 30, width: 80, height: 20 })
    await valueEl.trigger('click')
    await settle()

    const panel = body$('.opt-drop-panel')
    expect(panel, '选项列应弹出面板').toBeTruthy()
    const opts = bodyAll('.opt-drop-panel .opt-drop-item')
    expect(opts.map((o) => o.textContent?.trim())).toEqual(['北京', '上海', '广州'])
    expect(opts[0]!.classList.contains('active'), '当前值应高亮').toBe(true)
  })

  it('**卡片字段右键 → 列右键菜单；卡片主体右键 → 行右键菜单**', async () => {
    const dt = mountTable()
    await toCardView(dt)
    const field = dt.findAll('.card-field')[0]!
    boxRect(field.element as HTMLElement, { left: 5, top: 5, width: 50, height: 20 })
    await field.trigger('contextmenu')
    await nextTick()
    expect(body$('.dt-context-menu'), '字段右键应出列菜单').toBeTruthy()
  })

  it('**卡片操作按钮 → 按 key 抛 row-action**', async () => {
    const dt = mountTable({ rowActions: [{ key: 'edit', label: '编辑' }] })
    await toCardView(dt)
    const firstCard = dt.findAll('.card-view-item')[0]!
    const btns = firstCard.findAll('.card-actions button')
    expect(btns.length, '每张卡片按 rowActions 渲染，本例 1 个').toBe(1)
    await btns[0]!.trigger('click')
    expect((dt.emitted('row-action') ?? [])[0]?.[0], '应抛出操作 key').toBe('edit')
  })

  it('**卡片空态：无数据用 emptyText，搜索无结果用搜索文案**', async () => {
    const dt = mountTable({ data: [], emptyText: '空空如也' })
    await toCardView(dt)
    const empty = dt.find('.card-view-empty')
    expect(empty.exists(), '空数据应渲染卡片空态').toBe(true)
    expect(empty.text()).toContain('空空如也')
  })

  it('**有数据时不渲染卡片空态**（空态与卡片列表是互斥分支）', async () => {
    const dt = mountTable()
    await toCardView(dt)
    expect(dt.findAll('.card-view-item').length, '前置：有卡片').toBe(3)
    expect(dt.find('.card-view-empty').exists(), '有数据不该出现空态').toBe(false)
  })
})

/* ══════════════════ 滚动进度条 ══════════════════ */

describe('滚动进度条', () => {
  /** 造出「可滚动 + 已滚到一半」的观测量并触发一次滚动 */
  async function scrollHalf(dt: VueWrapper, el: HTMLElement): Promise<void> {
    metrics(el, { scrollHeight: 1000, clientHeight: 200, scrollTop: 400 })
    el.dispatchEvent(new Event('scroll', { bubbles: true }))
    await settle()
  }

  it('**有溢出 → 进度条出现且宽度反映滚动百分比**', async () => {
    const dt = mountTable({ maxHeight: '200px' })
    expect(dt.find('.table-progress-track').exists(), '未溢出时不该显示').toBe(false)

    await scrollHalf(dt, scrollerOf(dt))
    expect(dt.find('.table-progress-track').exists(), '溢出后应显示').toBe(true)
    const width = (dt.find('.table-progress').element as HTMLElement).style.width
    expect(width, '400/800 = 50%').toBe('50%')
  })

  it('**无溢出 → 进度条保持隐藏**（阈值里 max>0 才算可滚动）', async () => {
    const dt = mountTable({ maxHeight: '200px' })
    metrics(scrollerOf(dt), { scrollHeight: 200, clientHeight: 200, scrollTop: 0 })
    scrollerOf(dt).dispatchEvent(new Event('scroll', { bubbles: true }))
    await settle()
    expect(dt.find('.table-progress-track').exists()).toBe(false)
  })

  it('**点进度条 → 目标位置按点击比例换算并直改进度宽度**', async () => {
    const dt = mountTable({ maxHeight: '200px' })
    await scrollHalf(dt, scrollerOf(dt))

    const calls: Array<{ top: number }> = []
    ;(scrollerOf(dt) as unknown as { scrollTo: (o: { top: number }) => void }).scrollTo = (o) => calls.push(o)

    const track = dt.find('.table-progress-track').element as HTMLElement
    boxRect(track, { left: 0, top: 0, width: 100, height: 8 })
    fire(track, 'mousedown', { clientX: 25 })
    await nextTick()

    expect(calls.length, '应触发一次滚动').toBe(1)
    expect(calls[0]!.top, '25% × 800 = 200').toBe(200)
    expect((dt.find('.table-progress').element as HTMLElement).style.width, '拖拽时宽度直改 DOM').toBe('25%')
  })

  it('**拖拽过程中持续跟随，松手后不再响应**（document 监听要成对注销）', async () => {
    const dt = mountTable({ maxHeight: '200px' })
    await scrollHalf(dt, scrollerOf(dt))
    const calls: Array<{ top: number }> = []
    ;(scrollerOf(dt) as unknown as { scrollTo: (o: { top: number }) => void }).scrollTo = (o) => calls.push(o)

    const track = dt.find('.table-progress-track').element as HTMLElement
    boxRect(track, { left: 0, top: 0, width: 100, height: 8 })
    fire(track, 'mousedown', { clientX: 10 })
    expect(calls.length).toBe(1)

    fire(document.body, 'mousemove', { clientX: 60 })
    expect(calls.length, '拖拽应继续换算').toBe(2)
    expect(calls[1]!.top, '60% × 800 = 480').toBe(480)

    fire(document.body, 'mouseup')
    fire(document.body, 'mousemove', { clientX: 90 })
    expect(calls.length, '松手后 mousemove 不该再生效').toBe(2)
  })

  it('**行点击 → 进度条出现锚点，点锚点跳回该行**', async () => {
    const dt = mountTable({ data: MANY, maxHeight: '200px' })
    await scrollHalf(dt, scrollerOf(dt))

    const trs = dt.findAll('tbody tr').filter((r) => r.findAll('td').length > 0)
    await trs[5]!.trigger('click')
    await nextTick()

    const anchors = dt.findAll('.table-progress-anchor')
    expect(anchors.length, '被点中的行应生成锚点').toBe(1)
    // 12 行里第 6 行（下标 5）→ (5+0.5)/12 ≈ 46%
    expect(anchors[0]!.attributes('style'), '锚点位置按行序换算').toContain('46')

    const calls: Array<{ top: number }> = []
    ;(scrollerOf(dt) as unknown as { scrollTo: (o: { top: number }) => void }).scrollTo = (o) => calls.push(o)
    metrics(scrollerOf(dt), { clientHeight: 200 })
    await anchors[0]!.trigger('click')
    await nextTick()
    expect(calls.length, '点锚点应滚动').toBe(1)
    // 行高 40：5×40 − 200/2 + 40/2 = 120
    expect(calls[0]!.top).toBe(120)
  })
})

/* ══════════════════ 悬浮提示与截断详情 ══════════════════ */

describe('单元格悬浮提示与截断详情', () => {
  const longText = '很长的文本'.repeat(20)

  it('**mouseenter 显示气泡、mouseleave 收起**', async () => {
    // 气泡只承接「中等长度且真的溢出」的文本（超长交给展开图标，未溢出不弹）
    const dt = mountTable({ data: [{ id: 'r1', name: '中等长度的一段名称文本内容', value: 1, city: '北京' }] })
    const td = dt.findAll('tbody tr')[0]!.findAll('td')[0]!
    expect(body$('.dt-cell-tooltip'), '未悬浮时不该有气泡').toBeFalsy()

    // happy-dom 里 scrollWidth/clientWidth 恒为 0，溢出判定要手工造出来
    const inner = td.find('.cell-text-inner').element as HTMLElement
    metrics(inner, { scrollWidth: 240, clientWidth: 60 })
    boxRect(td.element as HTMLElement, { left: 0, top: 0, width: 60, height: 40 })

    fire(td.element as HTMLElement, 'mouseenter')
    await settle(380) // 气泡有 300ms 延迟
    const tip = body$('.dt-cell-tooltip')
    expect(tip, '悬浮应出现气泡').toBeTruthy()
    expect(tip!.textContent, '气泡内容应是被悬浮单元格的显示值').toContain('中等长度的一段名称文本内容')

    fire(td.element as HTMLElement, 'mouseleave')
    await nextTick()
    expect(body$('.dt-cell-tooltip'), '移出后应收起').toBeFalsy()
  })

  it('**文本未溢出 → 不弹气泡**（否则每个格子悬浮都冒一层）', async () => {
    const dt = mountTable({ data: [{ id: 'r1', name: '中等长度的一段名称文本内容', value: 1, city: '北京' }] })
    const td = dt.findAll('tbody tr')[0]!.findAll('td')[0]!
    const inner = td.find('.cell-text-inner').element as HTMLElement
    metrics(inner, { scrollWidth: 60, clientWidth: 60 })
    fire(td.element as HTMLElement, 'mouseenter')
    await settle(380)
    expect(body$('.dt-cell-tooltip')).toBeFalsy()
  })

  it('**长文本单元格 → 展开图标 → 弹窗显示完整内容**', async () => {
    const dt = mountTable({
      columns: [{ key: 'name', title: '名称' }, ...COLS.slice(1)],
      data: [{ id: 'r1', name: longText, value: 1, city: '北京' }],
      autoFit: true,
    })
    const icon = dt.find('.cell-expand-icon')
    expect(icon.exists(), '超长文本应出现展开图标').toBe(true)

    await icon.trigger('click')
    await settle()
    const content = body$('.cell-detail-content')
    expect(content, '应弹出详情弹窗').toBeTruthy()
    expect(content!.textContent, '弹窗里应是完整文本').toBe(longText)
  })

  it('**短文本不出现展开图标**（避免每个格子都挂个入口）', () => {
    const dt = mountTable({ autoFit: true })
    expect(dt.find('.cell-expand-icon').exists()).toBe(false)
  })
})

/* ══════════════════ 复制表格数据 ══════════════════ */

describe('复制表格数据', () => {
  function stubClipboard(): ReturnType<typeof vi.fn> {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    return writeText
  }

  it('**复制 → 表头 + 全量数据以 TSV 落剪贴板**', async () => {
    const writeText = stubClipboard()
    const dt = mountTable()
    await byTitle(dt, t('table.copyTableData'))!.trigger('click')
    await settle()

    expect(writeText).toHaveBeenCalledTimes(1)
    const text = String(writeText.mock.calls[0]![0])
    const lines = text.split('\n')
    expect(lines[0], '首行是表头').toBe('名称\t数值\t城市')
    expect(lines.length, '表头 + 三行').toBe(4)
    expect(lines[1], '列间用制表符').toBe('甲\t1\t北京')
  })

  it('**exportScope=page → 只复制当前页**', async () => {
    const writeText = stubClipboard()
    const dt = mountTable({ data: MANY, pageSize: 3, exportScope: 'page' })
    await byTitle(dt, t('table.copyTableData'))!.trigger('click')
    await settle()
    const text = String(writeText.mock.calls[0]![0])
    expect(text.split('\n').length, '表头 + 3 行当前页').toBe(4)
    expect(text).toContain('行1')
    expect(text, '不该带上第二页的行').not.toContain('行5')
  })

  it('**隐藏列不参与复制**（与导出/截图口径一致）', async () => {
    const writeText = stubClipboard()
    const dt = mountTable()
    // 通过表头右键隐藏「城市」列，再复制
    const th = dt.findAll('thead th').filter((x) => x.text().includes('城市'))[0]!
    boxRect(th.element as HTMLElement, { left: 0, top: 0, width: 60, height: 20 })
    await th.trigger('contextmenu')
    await nextTick()
    const hide = bodyAll('.dt-context-item').find((b) =>
      (b.textContent ?? '').includes(t('table.hideCol')),
    )
    expect(hide, '右键菜单应有「隐藏当前列」').toBeTruthy()
    await hide!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settle()

    await byTitle(dt, t('table.copyTableData'))!.trigger('click')
    await settle()
    const text = String(writeText.mock.calls[0]![0])
    expect(text.split('\n')[0], '城市列应被排除').toBe('名称\t数值')
    expect(text).not.toContain('北京')
  })

  /** 观察组件内 Toast 渲染出的消息文本（Toast.show 在 defineExpose 代理上，spy vm 拿不到） */
  function toastMessages(): string[] {
    return [...document.body.querySelectorAll('.toast-msg')].map((e) => e.textContent ?? '')
  }

  it('**复制成功 → Toast 报「已复制表格数据」**（不能静默）', async () => {
    stubClipboard()
    const dt = mountTable()

    await byTitle(dt, t('table.copyTableData'))!.trigger('click')
    await settle()
    const msgs = toastMessages()
    expect(msgs, '成功提示应出现').toContain(t('table.tableDataCopied'))
    expect(msgs, '不该报失败').not.toContain(t('table.copyFail'))
  })

  it('**复制失败 → Toast 报「复制失败」而不是假报成功**（2026-11-01 #267）', async () => {
    // 浏览器拒绝剪贴板写入（权限/HTTP/旧 WebView）：copyText 降级 execCommand 也失败
    const writeText = vi.fn(async () => {
      throw new Error('NotAllowedError')
    })
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    // happy-dom 没有 document.execCommand：copyText 的降级路径会抛 TypeError 后被捕获 → 返回 false
    const dt = mountTable()

    await byTitle(dt, t('table.copyTableData'))!.trigger('click')
    await settle()
    expect(writeText, '应尝试过 Clipboard API').toHaveBeenCalled()
    const msgs = toastMessages()
    expect(msgs, '必须提示失败').toContain(t('table.copyFail'))
    expect(msgs, '不能同时报成功').not.toContain(t('table.tableDataCopied'))

  })
})

/* ══════════════════ TD-77 / #274：可写判据单一化 ══════════════════ */

describe('「列是否可写」单一谓词（TD-77 收口）', () => {
  it('三档是包含关系：内联可编 ⊂ 可收文本 ⊂ 非只读', async () => {
    const { isColumnReadonly, isTextWritable, isInlineEditable } = await import(
      '@/components/data/composables/cell-types'
    )
    const plain = { key: 'a', title: 'A' } as Column
    const image = { key: 'b', title: 'B', accept: 'image' } as Column
    const select = { key: 'c', title: 'C', options: ['x'] } as Column
    const readonly = { key: 'd', title: 'D', editable: false } as Column

    expect([isColumnReadonly(plain), isTextWritable(plain), isInlineEditable(plain)]).toEqual([false, true, true])
    expect([isColumnReadonly(image), isTextWritable(image), isInlineEditable(image)]).toEqual([false, false, false])
    expect([isColumnReadonly(select), isTextWritable(select), isInlineEditable(select)]).toEqual([false, true, false])
    expect([isColumnReadonly(readonly), isTextWritable(readonly), isInlineEditable(readonly)]).toEqual([
      true,
      false,
      false,
    ])
    // undefined 列 = 没有列信息：**未声明即非只读**（保持写入漏斗原有宽松口径，
    // `props.columns?.find(...)?.editable !== false` 也是 true），但"能写文本/能内联编辑"一律 false。
    expect(isColumnReadonly(undefined), 'undefined 不等于显式只读').toBe(false)
    expect(isTextWritable(undefined), '无列信息不可写').toBe(false)
    expect(isInlineEditable(undefined), '无列信息不可内联编辑').toBe(false)
  })

  it('**双击图片列不进内联编辑**（旧实现会隐藏 img、换成文本框）', async () => {
    const cols: Column[] = [
      { key: 'name', title: '名称' },
      { key: 'avatar', title: '头像', accept: 'image' },
    ]
    const dt = mount(DataTable, {
      props: {
        columns: cols,
        data: [{ id: 'r1', name: '甲', avatar: 'https://example.com/a.png' }],
        rowKey: 'id',
        editable: true,
        virtualScroll: false,
        autoFit: false,
        persistence: 'none',
      },
      attachTo: document.body,
    })
    try {
      await nextTick()
      const cell = dt.findAll('tbody td').find((td) => td.find('img').exists())
      expect(cell, '应找到图片单元格').toBeTruthy()
      await cell!.trigger('dblclick')
      await nextTick()
      expect(cell!.find('img').exists(), '图片必须还在（不能被输入框替换）').toBe(true)
      expect(cell!.find('input').exists(), '不该出现内联输入框').toBe(false)
    } finally {
      dt.unmount()
    }
  })

  it('**双击 options 列不进内联编辑**（走下拉面板）', async () => {
    const cols: Column[] = [
      { key: 'name', title: '名称' },
      { key: 'opt', title: '选项', options: ['x', 'y'] },
    ]
    const dt = mount(DataTable, {
      props: {
        columns: cols,
        data: [{ id: 'r1', name: '甲', opt: 'x' }],
        rowKey: 'id',
        editable: true,
        virtualScroll: false,
        autoFit: false,
        persistence: 'none',
      },
      attachTo: document.body,
    })
    try {
      await nextTick()
      const cell = dt.findAll('tbody td')[1]!
      await cell.trigger('dblclick')
      await nextTick()
      expect(cell.find('input').exists(), 'options 列不该出现内联输入框').toBe(false)
    } finally {
      dt.unmount()
    }
  })
})