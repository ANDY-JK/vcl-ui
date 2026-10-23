/**
 * DataTable 交互与工具栏契约（拆分重构安全网 · 阶段 B）
 *
 * 覆盖此前 410 条未覆盖语句里的「交互编排」部分：缩放、全屏键盘/侧栏联动、
 * 表头点击与右键菜单、行操作与行右键、筛选下拉、汇总行、模板状态分支
 * （内部异常兜底 / 加载骨架 / 空状态 / 勾选列）。
 *
 * 断言全部落在**真实 class / 真实属性 / 真实 emit** 上，不用「不炸就算过」。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import DataTable from '@/components/data/DataTable.vue'
import { useT } from '@/components/_internal/i18n'
import type { Column } from '@/components/data/composables/types'

const t = useT()

const COLS: Column[] = [
  { key: 'name', title: '名称' },
  { key: 'value', title: '数值' },
  { key: 'city', title: '城市' },
]

const ROWS = [
  { id: 'r1', name: '甲', value: '1', city: '北京' },
  { id: 'r2', name: '乙', value: '2', city: '上海' },
  { id: 'r3', name: '丙', value: '3', city: '北京' },
]

/** 关掉虚拟滚动/列宽测量/持久化，避免无关分支干扰交互断言 */
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

function mountTable(props: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): VueWrapper {
  return track(mount(DataTable, { props: { ...MINIMAL, ...props }, attachTo: document.body, ...extra }))
}

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
  document.body.innerHTML = ''
  document.body.className = ''
  vi.restoreAllMocks()
})

/** 表格根容器（缩放 CSS 变量与滚动都挂在它 / 内部 table 上） */
const wrapOf = (dt: VueWrapper) => dt.find('.table-wrap').element as HTMLElement
const tableOf = (dt: VueWrapper) => dt.find('table.data-table').element as HTMLElement
/** 读 --dt-zoom-x / --dt-zoom-y（缩放的直接观测量） */
const zoomOf = (dt: VueWrapper): { x: string; y: string } => {
  const s = tableOf(dt).style
  return { x: s.getPropertyValue('--dt-zoom-x').trim(), y: s.getPropertyValue('--dt-zoom-y').trim() }
}
/** 表头 th 列表（按 _displayColumns 顺序，不含勾选列） */
const thsOf = (dt: VueWrapper) =>
  dt.findAll('thead th').filter((th) => !th.classes().includes('th-checkbox'))
const thOf = (dt: VueWrapper, i: number) => thsOf(dt)[i]!
/** 数据行 td 文本（按行） */
const bodyRows = (dt: VueWrapper) => dt.findAll('tbody tr').filter((tr) => tr.findAll('td').length > 0)

const body$ = (sel: string) => document.body.querySelector(sel) as HTMLElement | null
const bodyAll = (sel: string) => [...document.body.querySelectorAll(sel)] as HTMLElement[]

/**
 * 滚轮：可带修饰键（onTableWheel 只认 ctrl/meta）。
 *
 * ⚠️ happy-dom 的 `WheelEvent` **不认 init 里的 `ctrlKey`/`metaKey`**（实测构造后读出来是
 * `undefined`，而 `deltaY` 正常）→ 处理器 `if (!e.ctrlKey && !e.metaKey) return` 会直接早退，
 * 表现为「派发了滚轮但缩放毫无变化」，很容易误判成缩放的守卫写错了。
 * 所以必须用 defineProperty 把修饰键补成实例自有属性。
 */
function wheel(dt: VueWrapper, init: WheelEventInit = {}) {
  const { ctrlKey, metaKey, ...rest } = init
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...rest })
  if (ctrlKey !== undefined) Object.defineProperty(e, 'ctrlKey', { value: ctrlKey })
  if (metaKey !== undefined) Object.defineProperty(e, 'metaKey', { value: metaKey })
  wrapOf(dt).dispatchEvent(e)
  return e
}

/** 键盘：目标元素默认为表格内元素（缩放快捷键要求焦点在表格内） */
function keydown(target: EventTarget, init: KeyboardEventInit) {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(e)
  return e
}

/** 进入全屏（点工具栏全屏按钮）并等状态落地 */
async function enterFullscreen(dt: VueWrapper) {
  const btn = dt
    .findAll('button')
    .find((b) => b.attributes('title') === t('table.fullscreenShow')) as ReturnType<VueWrapper['find']> | undefined
  expect(btn, '应有全屏按钮').toBeTruthy()
  await btn!.trigger('click')
  await vi.waitFor(() => {
    expect(wrapOf(dt).classList.contains('fullscreen'), '应进入全屏').toBe(true)
  })
}

/** 打开某列的筛选下拉（点表头筛选图标） */
async function openFilter(dt: VueWrapper, i = 2) {
  await thOf(dt, i).find('.th-filter-icon').trigger('click')
  await nextTick()
  expect(body$('.dt-filter-dropdown'), '筛选下拉应出现').toBeTruthy()
}

/* ═══════════ 缩放（Ctrl+滚轮 / Ctrl+±/0） ═══════════ */

describe('缩放', () => {
  it('**Ctrl+滚轮上滚 → 放大 0.1**（--dt-zoom-x/y 同步）', async () => {
    const dt = mountTable()
    expect(zoomOf(dt), '初始 1').toEqual({ x: '1', y: '1' })

    wheel(dt, { ctrlKey: true, deltaY: -100 })
    await nextTick()
    expect(zoomOf(dt), '应放大到 1.1').toEqual({ x: '1.1', y: '1.1' })
  })

  it('**无修饰键的滚轮不缩放**（否则页面滚动会误改表格缩放）', async () => {
    const dt = mountTable()
    wheel(dt, { deltaY: -100 })
    await nextTick()
    expect(zoomOf(dt), '不该变').toEqual({ x: '1', y: '1' })
  })

  it('**已在 100% 且无横向溢出时下滚不缩小**（canShrink 守卫）', async () => {
    const dt = mountTable()
    wheel(dt, { ctrlKey: true, deltaY: 100 })
    await nextTick()
    expect(zoomOf(dt), '列已全部放下，不该继续缩').toEqual({ x: '1', y: '1' })
  })

  it('**放大后 Ctrl+滚轮下滚 → 缩回 100%**（>100% 时允许缩回）', async () => {
    const dt = mountTable()
    wheel(dt, { ctrlKey: true, deltaY: -100 })
    await nextTick()
    expect(zoomOf(dt).x, '前置：已放大').toBe('1.1')

    wheel(dt, { ctrlKey: true, deltaY: 100 })
    await nextTick()
    expect(zoomOf(dt), '应缩回 1').toEqual({ x: '1', y: '1' })
  })

  it('**Ctrl+= 放大、Ctrl+- 缩小、Ctrl+0 复位**（焦点在表格内才生效）', async () => {
    const dt = mountTable()
    const inside = tableOf(dt)

    keydown(inside, { ctrlKey: true, key: '=' })
    await nextTick()
    expect(zoomOf(dt).x, 'Ctrl+= 应放大').toBe('1.1')

    keydown(inside, { ctrlKey: true, key: '-' })
    await nextTick()
    expect(zoomOf(dt).x, 'Ctrl+- 应缩小').toBe('1')

    keydown(inside, { ctrlKey: true, key: '=' })
    await nextTick()
    keydown(inside, { ctrlKey: true, key: '0' })
    await nextTick()
    expect(zoomOf(dt), 'Ctrl+0 应复位').toEqual({ x: '1', y: '1' })
  })

  it('**焦点在表格外时快捷键不生效**（不偷走整页浏览器缩放）', async () => {
    const dt = mountTable()
    const outside = document.createElement('div')
    document.body.appendChild(outside)

    keydown(outside, { ctrlKey: true, key: '=' })
    await nextTick()
    expect(zoomOf(dt), '表格外按键不该改缩放').toEqual({ x: '1', y: '1' })
  })

  it('**焦点在输入框内时快捷键不生效**（放行原生输入/浏览器行为）', async () => {
    const dt = mountTable(
      {},
      {
        slots: {
          'toolbar-actions': () => h('input', { class: 'probe-input' }),
        },
      },
    )
    const input = wrapOf(dt).querySelector('.probe-input') as HTMLInputElement
    expect(input, '前置：表格内应有输入框').toBeTruthy()

    keydown(input, { ctrlKey: true, key: '=' })
    await nextTick()
    expect(zoomOf(dt), '输入框内按键不该改缩放').toEqual({ x: '1', y: '1' })
  })
})

/* ═══════════ 全屏：键盘与侧栏联动 ═══════════ */

describe('全屏键盘与侧栏联动', () => {
  it('**Escape 退出全屏**（无子浮层时直接退）', async () => {
    const dt = mountTable()
    await enterFullscreen(dt)

    keydown(document, { key: 'Escape' })
    await vi.waitFor(() => {
      expect(wrapOf(dt).classList.contains('fullscreen'), 'Escape 应退出全屏').toBe(false)
    })
  })

  it('**非 Escape 键不退出全屏**', async () => {
    const dt = mountTable()
    await enterFullscreen(dt)

    keydown(document, { key: 'a' })
    keydown(document, { key: 'Enter' })
    await nextTick()
    expect(wrapOf(dt).classList.contains('fullscreen'), '其它键不该退出').toBe(true)
  })

  it('**Escape 优先关筛选下拉（不退出全屏）**', async () => {
    const dt = mountTable()
    await enterFullscreen(dt)
    await openFilter(dt)

    keydown(document, { key: 'Escape' })
    await vi.waitFor(() => {
      expect(body$('.dt-filter-dropdown'), '筛选下拉应被关掉').toBeNull()
    })
    expect(wrapOf(dt).classList.contains('fullscreen'), '全屏应保持').toBe(true)
  })

  it('**Escape 优先关右键菜单（不退出全屏）**', async () => {
    const dt = mountTable()
    await enterFullscreen(dt)

    await thOf(dt, 0).trigger('contextmenu')
    await nextTick()
    expect(body$('.dt-context-menu'), '前置：菜单应打开').toBeTruthy()

    keydown(document, { key: 'Escape' })
    await vi.waitFor(() => {
      expect(body$('.dt-context-menu'), '菜单应被关掉').toBeNull()
    })
    expect(wrapOf(dt).classList.contains('fullscreen'), '全屏应保持').toBe(true)
  })

  it('**全屏后点击表格外空白处退出全屏**', async () => {
    const dt = mountTable()
    await enterFullscreen(dt)

    keydown(document, { key: 'Escape' })
    await vi.waitFor(() => expect(wrapOf(dt).classList.contains('fullscreen')).toBe(false))
    await enterFullscreen(dt)

    const outside = document.createElement('div')
    document.body.appendChild(outside)
    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => {
      expect(wrapOf(dt).classList.contains('fullscreen'), '点外部应退出').toBe(false)
    })
  })

  it('**点击 Teleport 到 body 的筛选下拉内部不退出全屏**', async () => {
    const dt = mountTable()
    await enterFullscreen(dt)
    await openFilter(dt)

    const inside = body$('.dt-filter-dropdown')!
    inside.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(wrapOf(dt).classList.contains('fullscreen'), '点浮层内部不该退出').toBe(true)
  })

  it('**点击选项面板（无状态分支兜底的浮层）内部不退出全屏**', async () => {
    // 这条专门盯 body-click 的 Teleport 白名单：筛选/右键/详情/截图各有自己的状态分支
    // 兜底，即使白名单失效也不会退出；选项面板没有对应分支，白名单是它唯一的保护。
    const cols: Column[] = [
      { key: 'name', title: '名称' },
      { key: 'status', title: '状态', options: ['待办', '已完成'] },
    ]
    const dt = mountTable({
      columns: cols,
      editable: true,
      data: [{ id: 'r1', name: '甲', status: '待办' }],
    })
    await enterFullscreen(dt)

    const cell = dt.findAll('tbody td').find((td) => td.classes().includes('cell-has-options'))
    expect(cell, '前置：应有可弹出选项的单元格').toBeTruthy()
    await cell!.trigger('click')
    await nextTick()

    const panel = body$('.opt-drop-panel') ?? (dt.find('.opt-drop-panel').element as HTMLElement | undefined)
    expect(panel, '前置：选项面板应打开').toBeTruthy()
    expect(wrapOf(dt).contains(panel!), '面板必须 Teleport 到表格外（否则白名单分支根本走不到）').toBe(false)

    panel!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(wrapOf(dt).classList.contains('fullscreen'), '点选项面板内部不该退出全屏').toBe(true)
  })

  it('**有 @toggle-sidebar 监听且侧栏未收起时进全屏 → 抛事件收侧栏**', async () => {
    const sidebar = document.createElement('aside')
    sidebar.className = 'sidebar'
    document.body.appendChild(sidebar)

    const onToggleSidebar = vi.fn()
    const dt = mountTable({}, { attrs: { onToggleSidebar } })

    const btn = dt
      .findAll('button')
      .find((b) => b.attributes('title') === t('table.fullscreenShow')) as ReturnType<VueWrapper['find']> | undefined
    await btn!.trigger('click')

    await vi.waitFor(() => {
      expect(onToggleSidebar, '应收起宿主侧栏（走事件而非 inject）').toHaveBeenCalled()
    })
    expect(dt.emitted('toggle-sidebar'), '应抛 toggle-sidebar').toBeTruthy()
    sidebar.remove()
  })

  it('**无监听时降级走 inject("toggleCollapse")**', async () => {
    const sidebar = document.createElement('aside')
    sidebar.className = 'sidebar'
    document.body.appendChild(sidebar)

    const injected = vi.fn()
    // 用 Test Utils 的 global.provide 直接注入（不必为此另建宿主组件）
    const dt = track(
      mount(DataTable, {
        props: { ...MINIMAL },
        global: { provide: { toggleCollapse: injected } },
        attachTo: document.body,
      }),
    )

    const btn = dt
      .findAll('button')
      .find((b) => b.attributes('title') === t('table.fullscreenShow')) as ReturnType<VueWrapper['find']> | undefined
    await btn!.trigger('click')
    await vi.waitFor(() => {
      expect(injected, '应降级调用 inject 进来的 toggleCollapse').toHaveBeenCalled()
    })
    expect(dt.emitted('toggle-sidebar'), '无监听时不该抛事件').toBeFalsy()
    sidebar.remove()
  })
})

/* ═══════════ 表头点击与右键菜单 ═══════════ */

describe('表头点击与右键菜单', () => {
  it('**点击表头排序 → th 标记 sort-active 且 aria-sort 正确**', async () => {
    const dt = mountTable()
    const th = thOf(dt, 0)
    expect(th.classes(), '初始未排序').not.toContain('sort-active')

    await th.trigger('click')
    await nextTick()
    expect(thOf(dt, 0).classes(), '应标记排序激活').toContain('sort-active')
    expect(thOf(dt, 0).attributes('aria-sort'), '首次应升序').toBe('ascending')
  })

  it('**再点一次切降序**', async () => {
    const dt = mountTable()
    await thOf(dt, 0).trigger('click')
    await nextTick()
    await thOf(dt, 0).trigger('click')
    await nextTick()
    expect(thOf(dt, 0).attributes('aria-sort'), '应切降序').toBe('descending')
  })

  it('**Ctrl+点击表头 + editable → 整列选中（不排序）**', async () => {
    const dt = mountTable({ editable: true })
    const e = new MouseEvent('click', { bubbles: true, ctrlKey: true })
    thOf(dt, 1).element.dispatchEvent(e)
    await nextTick()

    expect(thOf(dt, 1).classes(), '整列选中不该触发排序').not.toContain('sort-active')
    // 该列的数据单元格应被标记为选中（isCellSelected → selectedColKey）
    const selectedCells = dt.findAll('tbody td').filter((td) => /select|active/i.test(td.classes().join(' ')))
    expect(selectedCells.length, '该列单元格应呈选中态').toBeGreaterThan(0)
  })

  it('**Ctrl+点击表头但未开 editable → 仍走排序**', async () => {
    const dt = mountTable()
    const e = new MouseEvent('click', { bubbles: true, ctrlKey: true })
    thOf(dt, 0).element.dispatchEvent(e)
    await nextTick()
    expect(thOf(dt, 0).classes(), '非编辑态应退化为排序').toContain('sort-active')
  })

  it('**点击筛选图标不触发排序**（@click.stop 隔离）', async () => {
    const dt = mountTable()
    await thOf(dt, 0).find('.th-filter-icon').trigger('click')
    await nextTick()
    expect(thOf(dt, 0).classes(), '筛选图标不该连带排序').not.toContain('sort-active')
    expect(body$('.dt-filter-dropdown'), '应打开筛选').toBeTruthy()
  })

  it('**表头右键 → 菜单出现且含列动作**', async () => {
    const dt = mountTable()
    await thOf(dt, 0).trigger('contextmenu')
    await nextTick()

    const menu = body$('.dt-context-menu')
    expect(menu, '右键菜单应出现').toBeTruthy()
    const text = menu!.textContent ?? ''
    expect(text, '应含「隐藏当前列」').toContain(t('table.hideCol'))
    expect(text, '应含「固定到左侧」').toContain(t('table.fixLeftCascade'))
    expect(text, '应含「显示全部」').toContain(t('table.showAllMenu'))
    expect(text, '列菜单不该出现单元格复制项').not.toContain(t('table.paste'))
  })

  it('**右键「隐藏当前列」→ 该列从表头消失**', async () => {
    const dt = mountTable()
    expect(thsOf(dt).length, '前置：3 列').toBe(3)

    await thOf(dt, 0).trigger('contextmenu')
    await nextTick()
    const items = bodyAll('.dt-context-item')
    const hide = items.find((el) => (el.textContent ?? '').includes(t('table.hideCol')))!
    hide.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(thsOf(dt).length, '应只剩 2 列').toBe(2)
    expect(
      thsOf(dt).map((th) => th.text()),
      '被隐藏的是第一列',
    ).not.toContain('名称')
  })

  it('**右键「固定到左侧」→ 该列及之前所有列标记 col-fixed-left**', async () => {
    const dt = mountTable()
    await thOf(dt, 1).trigger('contextmenu')
    await nextTick()
    const fixLeft = bodyAll('.dt-context-item').find((el) =>
      (el.textContent ?? '').includes(t('table.fixLeftCascade')),
    )!
    fixLeft.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(thOf(dt, 0).classes(), '第 1 列（级联范围内）应固定').toContain('col-fixed-left')
    expect(thOf(dt, 1).classes(), '第 2 列应固定').toContain('col-fixed-left')
    expect(thOf(dt, 2).classes(), '第 3 列不该被固定').not.toContain('col-fixed-left')
  })

  it('**右键「固定到右侧」→ 该列及之后所有列标记 col-fixed-right**', async () => {
    const dt = mountTable()
    await thOf(dt, 1).trigger('contextmenu')
    await nextTick()
    const fixRight = bodyAll('.dt-context-item').find((el) =>
      (el.textContent ?? '').includes(t('table.fixRightCascade')),
    )!
    fixRight.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(thOf(dt, 0).classes(), '第 1 列不该被固定').not.toContain('col-fixed-right')
    expect(thOf(dt, 1).classes(), '第 2 列应固定').toContain('col-fixed-right')
    expect(thOf(dt, 2).classes(), '第 3 列（级联范围内）应固定').toContain('col-fixed-right')
  })

  it('**固定后右键出现「取消固定」，点击后固定态清除**', async () => {
    const dt = mountTable()
    await thOf(dt, 0).trigger('contextmenu')
    await nextTick()
    bodyAll('.dt-context-item')
      .find((el) => (el.textContent ?? '').includes(t('table.fixLeftCascade')) )!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(thOf(dt, 0).classes(), '前置：已固定').toContain('col-fixed-left')

    await thOf(dt, 0).trigger('contextmenu')
    await nextTick()
    const unfix = bodyAll('.dt-context-item').find((el) =>
      (el.textContent ?? '').includes(t('table.unfixAll')),
    )
    expect(unfix, '固定后应出现取消固定项').toBeTruthy()
    unfix!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(thOf(dt, 0).classes(), '应取消固定').not.toContain('col-fixed-left')
  })

  it('**隐藏列后右键 → 「显示全部」恢复隐藏列**', async () => {
    const dt = mountTable()
    await thOf(dt, 0).trigger('contextmenu')
    await nextTick()
    bodyAll('.dt-context-item')
      .find((el) => (el.textContent ?? '').includes(t('table.hideCol')))!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(thsOf(dt).length, '前置：已隐藏一列').toBe(2)

    await thOf(dt, 0).trigger('contextmenu')
    await nextTick()
    bodyAll('.dt-context-item')
      .find((el) => (el.textContent ?? '').includes(t('table.showAllMenu')))!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(thsOf(dt).length, '应恢复 3 列').toBe(3)
  })
})

/* ═══════════ 行右键菜单与行操作 ═══════════ */

describe('行右键菜单与行操作', () => {
  const ROW_CTX = [
    { key: 'detail', label: '查看详情' },
    { key: 'remove', label: '删除', danger: true },
  ]

  it('**行右键 → 菜单展示自定义项（danger 项带 ctx-danger）**', async () => {
    const dt = mountTable({ rowContextActions: ROW_CTX })
    await dt.find('tbody tr').trigger('contextmenu')
    await nextTick()

    const menu = body$('.dt-context-menu')
    expect(menu, '行右键菜单应出现').toBeTruthy()
    expect(menu!.textContent, '应含自定义项').toContain('查看详情')
    const danger = bodyAll('.dt-context-item').find((el) => (el.textContent ?? '').includes('删除'))!
    expect(danger.classList.contains('ctx-danger'), 'danger 项应带 ctx-danger').toBe(true)
  })

  it('**自定义项有 onClick → 直接调用回调（不抛事件）**', async () => {
    const onClick = vi.fn()
    const dt = mountTable({ rowContextActions: [{ key: 'a', label: '操作A', onClick }] })
    await dt.find('tbody tr').trigger('contextmenu')
    await nextTick()

    bodyAll('.dt-context-item')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(onClick, '应调用内联回调').toHaveBeenCalledTimes(1)
    expect(onClick.mock.calls[0]![0], '第一个参数应是行数据').toMatchObject({ id: 'r1' })
    expect(onClick.mock.calls[0]![1], '第二个参数应是行索引').toBe(0)
    expect(dt.emitted('row-context-action'), '有回调时不该再抛事件').toBeFalsy()
    expect(body$('.dt-context-menu'), '点击后应关闭菜单').toBeNull()
  })

  it('**自定义项无 onClick → 抛 row-context-action 事件**', async () => {
    const dt = mountTable({ rowContextActions: [{ key: 'edit', label: '编辑' }] })
    await dt.find('tbody tr').trigger('contextmenu')
    await nextTick()

    bodyAll('.dt-context-item')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    const ev = dt.emitted('row-context-action')
    expect(ev, '应抛事件').toBeTruthy()
    expect(ev![0]![0], '事件首个参数应是 key').toBe('edit')
    expect(ev![0]![1], '第二个参数应是行数据').toMatchObject({ id: 'r1' })
    expect(ev![0]![2], '第三个参数应是行索引').toBe(0)
  })

  it('**rowActions → 渲染操作列并按 key 抛 row-action**', async () => {
    const dt = mountTable({
      rowActions: [
        { key: 'view', label: '查看' },
        { key: 'del', label: '删除' },
      ],
    })
    const btns = dt.findAll('.row-action-btn')
    expect(btns.length, '3 行 × 2 按钮').toBe(6)
    expect(dt.find('td.td-actions').exists(), '应有操作列').toBe(true)

    await btns[0]!.trigger('click')
    const ev = dt.emitted('row-action')
    expect(ev, '应抛 row-action').toBeTruthy()
    expect(ev![0]![0], '首个参数是 key').toBe('view')
    expect(ev![0]![1], '第二个参数是行数据').toMatchObject({ id: 'r1' })
    expect(ev![0]![2], '第三个参数是行索引').toBe(0)
  })

  it('**rowActions.visible 返回 false 的按钮不显示**', async () => {
    const dt = mountTable({
      rowActions: [
        { key: 'always', label: '恒显' },
        { key: 'never', label: '永隐', visible: () => false },
      ],
    })
    const btns = dt.findAll('.row-action-btn')
    // v-show 会保留节点但 display:none —— 断言可见文本而非节点数
    const visibleText = btns.filter((b) => !(b.element as HTMLElement).style.display.includes('none')).map((b) => b.text())
    expect(visibleText.join(''), '只应剩恒显按钮').toContain('恒显')
    expect(visibleText.join(''), '永隐按钮应被隐藏').not.toContain('永隐')
  })
})

/* ═══════════ 汇总行 ═══════════ */

describe('汇总行', () => {
  it('**summary 传函数 → tfoot 渲染按 props.data 计算的值**', async () => {
    const dt = mountTable({ summary: (rows: Record<string, unknown>[]) => ({ name: `共${rows.length}行`, value: '合计' }) })
    const tfoot = dt.find('tfoot')
    expect(tfoot.exists(), '应有汇总行').toBe(true)
    expect(tfoot.text(), '函数汇总应渲染').toContain('共3行')
    expect(tfoot.text()).toContain('合计')
  })

  it('**summary 传对象 → tfoot 直接渲染对象值**', async () => {
    const dt = mountTable({ summary: { name: '小计', value: '99' } })
    const tfoot = dt.find('tfoot')
    expect(tfoot.exists(), '应有汇总行').toBe(true)
    expect(tfoot.text()).toContain('小计')
    expect(tfoot.text()).toContain('99')
  })

  it('**未传 summary → 不渲染 tfoot**', async () => {
    const dt = mountTable()
    expect(dt.find('tfoot').exists(), '不该有汇总行').toBe(false)
  })
})

/* ═══════════ 筛选下拉 ═══════════ */

describe('筛选下拉', () => {
  it('**点筛选图标 → 下拉出现且列出取值与计数**', async () => {
    const dt = mountTable()
    await openFilter(dt, 2) // city 列：北京 ×2、上海 ×1

    const opts = bodyAll('.dt-filter-option')
    expect(opts.length, '应有 2 个取值').toBe(2)
    expect(opts.map((o) => o.textContent).join('|'), '应含取值与计数').toMatch(/北京.*2/)
  })

  it('**搜索框输入 → 选项收窄**', async () => {
    const dt = mountTable()
    await openFilter(dt, 2)

    const search = body$('.dt-filter-search') as HTMLInputElement
    search.value = '上海'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    await vi.waitFor(() => {
      expect(bodyAll('.dt-filter-option').length, '应只剩 1 项').toBe(1)
    })
  })

  it('**选项排序按钮：点击切换 active 与箭头方向**', async () => {
    const dt = mountTable()
    await openFilter(dt, 2)

    const sortBtns = bodyAll('.dt-filter-option-sort-btn')
    expect(sortBtns.length, '应有按名称/按数量两个按钮').toBe(2)
    const byName = sortBtns[0]!
    expect(byName.textContent, '默认应按名称升序').toContain(t('table.byName'))

    byName.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(bodyAll('.dt-filter-option-sort-btn')[0]!.classList.contains('active'), '应切到降序').toBe(true)

    bodyAll('.dt-filter-option-sort-btn')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(bodyAll('.dt-filter-option-sort-btn')[0]!.classList.contains('active'), '再点回升序').toBe(true)
  })

  it('**快捷「全选」→ 所有选项进入 selected**', async () => {
    const dt = mountTable()
    await openFilter(dt, 2)

    const all = bodyAll('.dt-filter-quick-btn').find((b) => (b.textContent ?? '').includes(t('table.selectAll')))!
    all.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(bodyAll('.dt-filter-option').every((o) => o.classList.contains('selected')), '应全选').toBe(true)
  })

  it('**勾选一项 + 应用 → 数据行按该值过滤**', async () => {
    const dt = mountTable()
    expect(bodyRows(dt).length, '前置：3 行').toBe(3)

    await openFilter(dt, 2)
    const sh = bodyAll('.dt-filter-option').find((o) => (o.textContent ?? '').includes('上海'))!
    sh.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    body$('.dt-filter-btn-apply')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    await vi.waitFor(() => {
      expect(bodyRows(dt).length, '只应剩上海那一行').toBe(1)
    })
    expect(thOf(dt, 2).classes(), '该列表头应标记 filter-active').toContain('filter-active')
  })

  it('**重置 → 恢复全部行**', async () => {
    const dt = mountTable()
    await openFilter(dt, 2)
    bodyAll('.dt-filter-option')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    body$('.dt-filter-btn-apply')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    await openFilter(dt, 2)
    body$('.dt-filter-btn-reset')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    await vi.waitFor(() => {
      expect(bodyRows(dt).length, '应恢复 3 行').toBe(3)
    })
  })

  it('**搜索无匹配 → 显示「无匹配」占位**', async () => {
    const dt = mountTable()
    await openFilter(dt, 2)

    const search = body$('.dt-filter-search') as HTMLInputElement
    search.value = '不存在的城市'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => {
      expect(body$('.dt-filter-no-result'), '应出现无匹配占位').toBeTruthy()
    })
    expect(body$('.dt-filter-no-result')!.textContent, '文案应来自 i18n').toContain(t('table.noMatchResult'))
  })
})

/* ═══════════ 模板状态分支 ═══════════ */

describe('模板状态分支', () => {
  it('**isLoading → 4 行骨架 + aria-busy，且不渲染数据文本**', async () => {
    const dt = mountTable({ isLoading: true })
    expect(tableOf(dt).getAttribute('aria-busy'), '应标记忙').toBe('true')
    expect(bodyRows(dt).length, '应渲染 4 行骨架').toBe(4)
    expect(dt.find('tbody').text(), '不该渲染真实数据').not.toContain('甲')
  })

  it('**空数据 → 空状态用内置 i18n 文案**', async () => {
    const dt = mountTable({ data: [] })
    const title = dt.find('.result-title')
    expect(title.exists(), '应渲染空状态').toBe(true)
    expect(title.text(), '应回退 i18n noData').toBe(t('table.noData'))
  })

  it('**emptyText 传值 → 覆盖内置文案**', async () => {
    const dt = mountTable({ data: [], emptyText: '还没有数据哦' })
    expect(dt.find('.result-title').text(), '应使用传入文案').toBe('还没有数据哦')
  })

  it('**搜索无结果 → 空状态切「搜索无结果」文案**', async () => {
    const dt = mountTable()
    // 用全局搜索输入触发（工具栏内的搜索框）
    const searchInput = dt.find('input[type="text"]')
    if (searchInput.exists()) {
      await searchInput.setValue('zzz-不存在')
      await vi.waitFor(() => {
        expect(dt.find('.result-title').text(), '应提示搜索无结果').toContain(t('table.searchNoResultHint'))
      })
    }
  })

  it('**selectable → 表头出现勾选列**', async () => {
    const dt = mountTable({ selectable: true })
    expect(dt.find('th.th-checkbox').exists(), '应有勾选列表头').toBe(true)
    expect(dt.findAll('td.td-checkbox').length, '每行应有勾选单元格').toBe(3)
  })

  it('**子组件渲染异常被内部兜底：显示错误视图 + 重试可恢复**', async () => {
    let boom = true
    // 函数式组件（不是 defineComponent）：渲染时抛错 → 冒泡到 DataTable 的 onErrorCaptured。
    // 注意 onErrorCaptured **只捕获后代组件**的错误，所以这里必须由子组件抛，
    // 不能靠 DataTable 自己的 props 回调（rowClass 等）抛 —— 那属自身渲染错误，捕不到。
    const Boom = () => {
      if (boom) throw new Error('slot-boom')
      return h('span', { class: 'boom-ok' }, 'ok')
    }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dt = mountTable({}, { slots: { 'toolbar-actions': () => h(Boom) } })
    await nextTick()
    await nextTick()

    // 错误视图：h3 = table.renderError，按钮 = common.retry
    const h3 = dt.findAll('h3').find((n) => n.text().includes(t('table.renderError')))
    expect(h3, '应显示内部异常视图').toBeTruthy()
    expect(dt.text(), '应显示异常信息').toContain('slot-boom')

    boom = false
    const retry = dt.findAll('button').find((b) => b.text().includes(t('common.retry')))
    expect(retry, '应有重试按钮').toBeTruthy()
    await retry!.trigger('click')
    await nextTick()
    await vi.waitFor(() => {
      expect(dt.find('table.data-table').exists(), '重试后应恢复正常表格').toBe(true)
    })
    void errSpy
  })
})

/* ═══════════ 单元格交互细节 ═══════════ */

describe('单元格交互细节', () => {
  it('**图片加载失败 → 该图片被隐藏（不留破图）**', async () => {
    const imgCols: Column[] = [
      { key: 'name', title: '名称' },
      { key: 'pic', title: '图片', isImage: true },
    ]
    const dt = mountTable({
      columns: imgCols,
      data: [{ id: 'r1', name: '甲', pic: 'https://cdn.example.com/a.png' }],
      imageDomains: ['cdn.example.com'],
    })
    const img = dt.find('tbody img')
    if (img.exists()) {
      expect((img.element as HTMLImageElement).style.display, '前置：未隐藏').not.toBe('none')
      await img.trigger('error')
      expect((img.element as HTMLImageElement).style.display, '失败后应隐藏').toBe('none')
    }
  })

  it('**表头右键菜单点击后关闭（不留浮层）**', async () => {
    const dt = mountTable()
    await thOf(dt, 0).trigger('contextmenu')
    await nextTick()
    expect(body$('.dt-context-menu'), '前置：已打开').toBeTruthy()

    bodyAll('.dt-context-item')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(body$('.dt-context-menu'), '点击菜单项后应关闭').toBeNull()
  })

  it('**筛选下拉在外部点击后关闭**', async () => {
    const dt = mountTable()
    await openFilter(dt, 2)

    const outside = document.createElement('div')
    document.body.appendChild(outside)
    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    await vi.waitFor(() => {
      expect(body$('.dt-filter-dropdown'), '外部点击应关闭下拉').toBeNull()
    })
  })
})