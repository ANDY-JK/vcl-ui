// Menu 行为锁定（Q4 后半·nav 域）——悬停延时开合、手风琴展开、选中回传、键盘导航。
// Menu.vue 430 行此前零单测（nav 域 41.6/29.5/36.5 洼地的主要缺口），交互全押 e2e。
// 改悬停节流/展开语义/键盘导航/事件面时必须过本组。
//
// DOM 事实（写断言前先认结构）：子菜单是 v-show 常驻 DOM（收起只是 display:none），
// 且子菜单内是递归 <Menu>（子项也是 [role=menuitem]）——所以：
//   · 顶层行按 label 文本定位（fixture 里顶层 label 唯一）；
//   · 展开态判据用行上的 menu-item--expanded 类，不用 exists()/text()。
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Menu from '@/components/nav/Menu.vue'

const items = [
  { key: 'home', label: '首页' },
  {
    key: 'sys',
    label: '系统管理',
    children: [
      { key: 'user', label: '用户管理' },
      { key: 'role', label: '角色管理', disabled: true },
    ],
  },
  { key: 'about', label: '关于' },
]

const mountMenu = (props = {}) => mount(Menu, { props: { items, ...props } })

/** 按 label 找顶层行（.menu-item 内含同名 .menu-item-label） */
const rowByLabel = (w: ReturnType<typeof mountMenu>, label: string) =>
  w.findAll('.menu-item').find((el) => el.find('.menu-item-label').text() === label)!

/** 按 label 找顶层 li.menu-item-wrap——mouseenter 监听在它上面（mouseenter 不冒泡，
 *  trigger 内层 .menu-item 到不了监听器） */
const wrapByLabel = (w: ReturnType<typeof mountMenu>, label: string) =>
  w.findAll('.menu-item-wrap').find((el) => el.find('.menu-item-label').text() === label)!

/** 行的展开信号：menu-item--expanded 类 */
const isRowExpanded = (w: ReturnType<typeof mountMenu>, label: string) =>
  rowByLabel(w, label).classes().includes('menu-item--expanded')

describe('Menu · 选中回传', () => {
  it('点叶子项：emit select + update:selected-key，payload 为整项', async () => {
    const w = mountMenu()
    await rowByLabel(w, '首页').trigger('click')
    expect(w.emitted('select')).toHaveLength(1)
    expect(w.emitted('select')![0]![0]).toMatchObject({ key: 'home', label: '首页' })
    expect(w.emitted('update:selected-key')).toEqual([['home']])
  })

  it('disabled 子项不可选中（无 emit）', async () => {
    const w = mountMenu()
    await rowByLabel(w, '系统管理').trigger('click') // 先展开
    await w.vm.$nextTick()
    const roleRow = w.findAll('.menu-item').find((el) => el.find('.menu-item-label').text() === '角色管理')!
    await roleRow.trigger('click')
    expect(w.emitted('select')).toBeUndefined()
  })
})

describe('Menu · 展开语义（vertical 点击模式）', () => {
  it('点击父项展开子菜单，再点收起', async () => {
    const w = mountMenu()
    expect(isRowExpanded(w, '系统管理')).toBe(false)
    await rowByLabel(w, '系统管理').trigger('click')
    await w.vm.$nextTick()
    expect(isRowExpanded(w, '系统管理')).toBe(true)
    await rowByLabel(w, '系统管理').trigger('click')
    await w.vm.$nextTick()
    expect(isRowExpanded(w, '系统管理')).toBe(false)
  })

  it('multiple=false：展开一个父项自动收起其他（手风琴）', async () => {
    const w = mountMenu({
      items: [
        { key: 'a', label: 'A', children: [{ key: 'a1', label: 'A1' }] },
        { key: 'b', label: 'B', children: [{ key: 'b1', label: 'B1' }] },
      ],
    })
    await rowByLabel(w, 'A').trigger('click')
    await rowByLabel(w, 'B').trigger('click')
    await w.vm.$nextTick()
    expect(isRowExpanded(w, 'A')).toBe(false)
    expect(isRowExpanded(w, 'B')).toBe(true)
  })

  it('multiple=true：多个父项可同时展开', async () => {
    const w = mountMenu({
      multiple: true,
      items: [
        { key: 'a', label: 'A', children: [{ key: 'a1', label: 'A1' }] },
        { key: 'b', label: 'B', children: [{ key: 'b1', label: 'B1' }] },
      ],
    })
    await rowByLabel(w, 'A').trigger('click')
    await rowByLabel(w, 'B').trigger('click')
    await w.vm.$nextTick()
    expect(isRowExpanded(w, 'A')).toBe(true)
    expect(isRowExpanded(w, 'B')).toBe(true)
  })
})

describe('Menu · hover 模式延时开合（horizontal）', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('mouseenter 后 150ms 才展开（节流窗口内不闪现）', async () => {
    const w = mountMenu({ mode: 'horizontal' })
    await wrapByLabel(w, '系统管理').trigger('mouseenter')
    vi.advanceTimersByTime(100)
    await w.vm.$nextTick()
    expect(isRowExpanded(w, '系统管理')).toBe(false)
    vi.advanceTimersByTime(60)
    await w.vm.$nextTick()
    expect(isRowExpanded(w, '系统管理')).toBe(true)
  })

  it('快速移入移出：定时器互斥，不闪现子菜单', async () => {
    const w = mountMenu({ mode: 'horizontal' })
    await rowByLabel(w, '系统管理').trigger('mouseenter')
    vi.advanceTimersByTime(100)
    await wrapByLabel(w, '系统管理').trigger('mouseleave') // enter 尚未触发就离开
    vi.advanceTimersByTime(300)
    await w.vm.$nextTick()
    expect(isRowExpanded(w, '系统管理')).toBe(false)
  })

  it('hover 模式下点击父项也能开合（触屏/键盘可达）', async () => {
    const w = mountMenu({ mode: 'horizontal' })
    await rowByLabel(w, '系统管理').trigger('click')
    await w.vm.$nextTick()
    expect(isRowExpanded(w, '系统管理')).toBe(true)
    await rowByLabel(w, '系统管理').trigger('click')
    await w.vm.$nextTick()
    expect(isRowExpanded(w, '系统管理')).toBe(false)
  })

  // ── 收起方向（#476）：上面三条只锁了"进入"，**离开**一直是漏的 ──────────────
  //
  // 实测缺陷：`menu-hover.ts` 的 `scheduleLeave()` 定时器回调是空操作
  // （`/* M3: no-op */`），而同一文件头 JSDoc 写的是"150ms 后 hoverKey = null"。
  // 表现：鼠标移开后子菜单**永远挂在屏幕上**，只能点一次父项或按 Esc 才收。
  // 抽离前 Menu.vue 里那行是 `hoverKey.value = null`（`git show 5651845^`），
  // 说明这是抽离时丢的，不是设计如此 —— 所以此处按"文档即契约"锁死。

  it('**展开后移开 150ms → 收起**（鼠标离开后子菜单必须自己关）', async () => {
    const w = mountMenu({ mode: 'horizontal' })
    await wrapByLabel(w, '系统管理').trigger('mouseenter')
    vi.advanceTimersByTime(160)
    await w.vm.$nextTick()
    expect(isRowExpanded(w, '系统管理'), '先确认已展开').toBe(true)

    await wrapByLabel(w, '系统管理').trigger('mouseleave')
    vi.advanceTimersByTime(160)
    await w.vm.$nextTick()
    expect(isRowExpanded(w, '系统管理'), '移开后必须收起，否则子菜单一直挡在页面上').toBe(false)
  })

  it('移出后 150ms 内移回 → 不收起（进出窗口给用户改主意的余地）', async () => {
    const w = mountMenu({ mode: 'horizontal' })
    await wrapByLabel(w, '系统管理').trigger('mouseenter')
    vi.advanceTimersByTime(160)
    await w.vm.$nextTick()

    await wrapByLabel(w, '系统管理').trigger('mouseleave')
    vi.advanceTimersByTime(100) // 还在窗口内
    await w.findAll('.menu-submenu')[0].trigger('mouseenter') // 移回子菜单 → cancelLeave
    vi.advanceTimersByTime(200) // 越过窗口
    await w.vm.$nextTick()
    expect(isRowExpanded(w, '系统管理'), '移回子菜单后不该被收起').toBe(true)
  })

  it('卸载时清掉 pending 定时器（不留回调写已卸载组件的 ref）', async () => {
    const w = mountMenu({ mode: 'horizontal' })
    await wrapByLabel(w, '系统管理').trigger('mouseenter')
    expect(vi.getTimerCount(), 'enter 定时器已挂').toBeGreaterThan(0)
    w.unmount()
    expect(vi.getTimerCount(), '卸载后不该还有菜单定时器在跑').toBe(0)
  })

  it('从 A 移到 B：A 的收起定时器被取消，只有 B 展开（否则 A 会在 B 展开后被自己收起）', async () => {
    const w = mountMenu({
      mode: 'horizontal',
      items: [
        { key: 'a', label: '甲', children: [{ key: 'a1', label: '甲一' }] },
        { key: 'b', label: '乙', children: [{ key: 'b1', label: '乙一' }] },
      ],
    })
    await wrapByLabel(w, '甲').trigger('mouseenter')
    vi.advanceTimersByTime(160)
    await w.vm.$nextTick()
    expect(isRowExpanded(w, '甲'), '甲先展开').toBe(true)

    await wrapByLabel(w, '甲').trigger('mouseleave') // 排入"甲收起"
    await wrapByLabel(w, '乙').trigger('mouseenter') // 立刻进乙 → 必须清掉"甲收起"
    vi.advanceTimersByTime(160)
    await w.vm.$nextTick()
    expect(isRowExpanded(w, '乙'), '乙展开').toBe(true)
    expect(isRowExpanded(w, '甲'), '甲已不悬停 → 收起').toBe(false)
  })
})

describe('Menu · 键盘导航', () => {
  it('Enter 触发与 click 相同的选中回传', async () => {
    const w = mountMenu()
    await rowByLabel(w, '首页').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:selected-key')).toEqual([['home']])
  })

  it('Escape 清空展开态', async () => {
    const w = mountMenu()
    await rowByLabel(w, '系统管理').trigger('click')
    await w.vm.$nextTick()
    expect(isRowExpanded(w, '系统管理')).toBe(true)
    await rowByLabel(w, '系统管理').trigger('keydown', { key: 'Escape' })
    await w.vm.$nextTick()
    expect(isRowExpanded(w, '系统管理')).toBe(false)
  })

  it('方向键在顶层 menuitem 间移动焦点（vertical：Down/Up）', async () => {
    // 挂到 body：focus() 只对文档内元素更新 document.activeElement
    const w = mount(Menu, { props: { items }, attachTo: document.body })
    const home = rowByLabel(w, '首页')
    const sys = rowByLabel(w, '系统管理')
    await home.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(sys.element)
    await sys.trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(home.element)
  })
})
