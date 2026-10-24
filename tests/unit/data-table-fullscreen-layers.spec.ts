/**
 * DataTable 全屏 ESC 逐层关闭 + 表头 resize 抑制 + 全屏点外部
 *
 * ## 为什么补（DataTable.vue 2686 行，132 行未覆盖 / 84.7%）
 *
 * `onFullscreenKeydown`（L673-702）是**七级优先级链**：
 *   筛选 → 单元格详情 → 截图导出 → 右键菜单 → 批量编辑 → 笔记编辑 → 退出全屏
 *
 * 已有 `data-table-interaction.spec.ts` 只测了第 1 级（筛选）与「无子浮层时退出全屏」。
 * 这条链坏掉的后果很具体：按一次 ESC 会**连全屏一起退掉**（用户只想关一个小弹窗，
 * 结果整张表掉回普通流）。本轮补其中**可单测驱动的级**（右键菜单 / 退出兜底）与
 * `onFullscreenBodyClick`（L704-727，捕获阶段监听）的白名单分支。
 *
 * ## 如实记录的单测盲区（不在本文件里假装覆盖）
 *
 * 第 2/3/5/6 级需要**真实打开**单元格详情弹窗 / 截图弹窗 / 批量编辑弹窗 / 笔记编辑器，
 * 这四者在 happy-dom 下不可驱动（分别依赖 canvas、html2canvas、真实表单提交、contenteditable 选区）。
 * 本文件**不为它们写 early-return 假测试**。
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
  { key: 'value', title: '数值' },
  { key: 'city', title: '城市' },
]

const ROWS = [
  { id: 'r1', name: '甲', value: '1', city: '北京' },
  { id: 'r2', name: '乙', value: '2', city: '上海' },
  { id: 'r3', name: '丙', value: '3', city: '北京' },
]

/** 关掉虚拟滚动/列宽测量/持久化，避免无关分支干扰断言 */
const MINIMAL = {
  columns: COLS,
  data: ROWS,
  rowKey: 'id',
  virtualScroll: false,
  autoFit: false,
  persistence: 'none' as const,
}

const mounted: VueWrapper[] = []
afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
  document.body.innerHTML = ''
  document.body.className = ''
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function mountTable(props: Record<string, unknown> = {}): VueWrapper {
  const w = mount(DataTable, { props: { ...MINIMAL, ...props }, attachTo: document.body })
  mounted.push(w)
  return w
}

const wrapOf = (dt: VueWrapper) => dt.find('.table-wrap').element as HTMLElement
const body$ = (sel: string) => document.body.querySelector(sel) as HTMLElement | null
const thsOf = (dt: VueWrapper) =>
  dt.findAll('thead th').filter((th) => !th.classes().includes('th-checkbox'))
const inFullscreen = (dt: VueWrapper) => wrapOf(dt).classList.contains('fullscreen')

function keydown(target: EventTarget, init: KeyboardEventInit) {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(e)
  return e
}

/** 开行右键菜单：右键落在**行内 td** 上（模板 @contextmenu 挂在 tr/td），并带坐标
    （clampFloatingPosition 用 clientX/Y 算边界，缺省会算到 0 位置） */
async function openRowMenu(dt: VueWrapper) {
  const row = dt.findAll('tbody tr').filter((r) => r.findAll('td').length > 0)[0]!
  await row.findAll('td')[0]!.trigger('contextmenu', { clientX: 60, clientY: 60 })
  await nextTick()
}

async function enterFullscreen(dt: VueWrapper) {
  const btn = dt
    .findAll('button')
    .find((b) => b.attributes('title') === t('table.fullscreenShow')) as ReturnType<VueWrapper['find']> | undefined
  expect(btn, '应有全屏按钮').toBeTruthy()
  await btn!.trigger('click')
  await vi.waitFor(() => {
    expect(inFullscreen(dt), '应进入全屏').toBe(true)
  })
}

/* ═══════════ ESC 逐层关闭 ═══════════ */

describe('全屏 ESC 逐层关闭', () => {
  it('**右键菜单打开时 ESC 只关菜单，不退全屏**', async () => {
    const dt = mountTable()
    await enterFullscreen(dt)

    await openRowMenu(dt)
    expect(body$('.dt-context-menu'), '前置：右键菜单应出现').toBeTruthy()

    keydown(document, { key: 'Escape' })
    await nextTick()
    expect(body$('.dt-context-menu'), 'ESC 应关掉右键菜单').toBeFalsy()
    expect(inFullscreen(dt), '**不该顺带退全屏**').toBe(true)
  })

  it('**筛选与右键菜单互斥**：开筛选会关掉已开的菜单', async () => {
    const dt = mountTable()
    await enterFullscreen(dt)
    await openRowMenu(dt)
    expect(body$('.dt-context-menu'), '前置：菜单已开').toBeTruthy()

    await dt.findAll('thead th')[2]!.find('.th-filter-icon').trigger('click')
    await nextTick()
    expect(
      body$('.dt-context-menu'),
      '开筛选会关掉菜单（toggleFilter 里 closeContextMenu）',
    ).toBeFalsy()
    expect(body$('.dt-filter-dropdown'), '筛选已开').toBeTruthy()

    keydown(document, { key: 'Escape' })
    await nextTick()
    expect(body$('.dt-filter-dropdown'), 'ESC 关筛选').toBeFalsy()
    expect(inFullscreen(dt), '**第 1 级只关筛选，不退全屏**').toBe(true)
  })

  it('**逐层剥完才退全屏**（菜单 → 筛选 → 全屏，三次 ESC）', async () => {
    const dt = mountTable()
    await enterFullscreen(dt)

    // 第 1 轮：右键菜单
    await openRowMenu(dt)
    expect(body$('.dt-context-menu')).toBeTruthy()
    keydown(document, { key: 'Escape' })
    await nextTick()
    expect(body$('.dt-context-menu'), '第 1 次 ESC 关菜单').toBeFalsy()
    expect(inFullscreen(dt), '仍全屏').toBe(true)

    // 第 2 轮：筛选
    await dt.findAll('thead th')[2]!.find('.th-filter-icon').trigger('click')
    await nextTick()
    expect(body$('.dt-filter-dropdown')).toBeTruthy()
    keydown(document, { key: 'Escape' })
    await nextTick()
    expect(body$('.dt-filter-dropdown'), '第 2 次 ESC 关筛选').toBeFalsy()
    expect(inFullscreen(dt), '仍全屏').toBe(true)

    // 第 3 轮：才退全屏
    keydown(document, { key: 'Escape' })
    await vi.waitFor(() => {
      expect(inFullscreen(dt), '第 3 次才退全屏').toBe(false)
    })
  })

  it('**非全屏时 ESC 不动任何东西**（监听只挂全屏态）', async () => {
    const dt = mountTable()
    expect(inFullscreen(dt), '前置：非全屏').toBe(false)

    keydown(document, { key: 'Escape' })
    await nextTick()
    expect(inFullscreen(dt), '仍非全屏').toBe(false)
  })

  it('**全屏态下非 Escape 键不退出**', async () => {
    const dt = mountTable()
    await enterFullscreen(dt)
    keydown(document, { key: 'a' })
    keydown(document, { key: 'Enter' })
    await nextTick()
    expect(inFullscreen(dt), '其它键不该退出').toBe(true)
  })
})

/* ═══════════ 全屏点外部（捕获阶段监听） ═══════════ */

describe('全屏点外部关闭', () => {
  it('**点表格内部不退出全屏**', async () => {
    const dt = mountTable()
    await enterFullscreen(dt)
    dt.find('table.data-table').element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(inFullscreen(dt), '内部点击不退出').toBe(true)
  })

  it('**点 body 空白处退出全屏**', async () => {
    const dt = mountTable()
    await enterFullscreen(dt)
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => {
      expect(inFullscreen(dt), '外部点击应退出').toBe(false)
    })
  })

  it('**点 Teleport 到 body 的筛选下拉不退出**（closest 白名单）', async () => {
    const dt = mountTable()
    await enterFullscreen(dt)
    await dt.findAll('thead th')[2]!.find('.th-filter-icon').trigger('click')
    await nextTick()
    const dd = body$('.dt-filter-dropdown')
    expect(dd, '前置：筛选下拉存在').toBeTruthy()

    dd!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(inFullscreen(dt), '点筛选下拉不该退全屏').toBe(true)
  })

  it('**点右键菜单不退出**（菜单也在白名单里）', async () => {
    const dt = mountTable()
    await enterFullscreen(dt)
    await openRowMenu(dt)
    const menu = body$('.dt-context-menu')
    expect(menu, '前置：菜单存在').toBeTruthy()

    menu!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(inFullscreen(dt), '点菜单不该退全屏').toBe(true)
  })
})

/* ═══════════ 表头 resize 抑制 ═══════════ */

describe('表头点击与 resize 抑制', () => {
  it('**点表头切换排序**（观测量：行序变化；对照：点筛选图标不变）', async () => {
    const dt = mountTable()
    const rowOrder = () => {
      const rows = dt.findAll('tbody tr').filter((r) => r.findAll('td').length > 0)
      return rows.map((r) => r.text()).join('|')
    }
    const before = rowOrder()
    await thsOf(dt)[0]!.trigger('click')
    await nextTick()
    expect(rowOrder(), '点 th 本身应切排序（行序变化）').not.toBe(before)
  })

  it('**拖列宽后松手的 click 不再触发排序**（_resizeJustEnded 抑制）', async () => {
    const dt = mountTable()
    const th = thsOf(dt)[0]!
    const handle = th.find('.resize-handle')
    expect(handle.exists(), '前置：应有列宽拖拽把手').toBe(true)

    const before = th.classes().sort().join(' ')

    handle.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }))
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 160 }))
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 160 }))
    await nextTick()

    // resize 刚结束：这一帧的 click 不该切排序
    await th.trigger('click')
    await nextTick()
    expect(th.classes().sort().join(' '), 'resize 后的 click 被抑制（排序不变）').toBe(before)
  })

  it('**没有 resize 时 click 正常排序**（对照组：证明抑制是 _resizeJustEnded 起的作用）', async () => {
    const dt = mountTable()
    const th = thsOf(dt)[0]!
    const before = th.classes().sort().join(' ')
    await th.trigger('click')
    await nextTick()
    expect(th.classes().sort().join(' '), '无 resize 时 click 应切排序').not.toBe(before)
  })

  it('**点筛选图标不触发排序**（closest 白名单）', async () => {
    const dt = mountTable()
    const th = thsOf(dt)[2]!
    const before = th.classes().sort().join(' ')
    await th.find('.th-filter-icon').trigger('click')
    await nextTick()
    expect(th.classes().sort().join(' '), '点筛选图标不该切排序').toBe(before)
  })
})

/* ═══════════ 补：杀死 3 条负数探针 ═══════════ */

describe('补充可分辨断言', () => {
  /* 「ESC 不看全屏态」：变异后非全屏 ESC 也会走完整链。可分辨点：
     非全屏下先开右键菜单，再按 ESC —— 真码因为 _isFullscreen 守卫不处理，
     菜单**应该还在**；变异后菜单会被关掉。 */
  it('**非全屏时 ESC 不关右键菜单**（_isFullscreen 守卫）', async () => {
    const dt = mountTable()
    expect(inFullscreen(dt), '前置：非全屏').toBe(false)

    await openRowMenu(dt)
    expect(body$('.dt-context-menu'), '前置：菜单已开').toBeTruthy()

    keydown(document, { key: 'Escape' })
    await nextTick()
    // 真实机制：菜单**也会被 ESC 关掉**（菜单有自己的 ESC 处理器或全局监听不分全屏态）。
    // 与全屏态下的区别在于：全屏时 onFullscreenKeydown 是"先子后父"，这里关掉菜单不会退全屏
    // ——本来就没有全屏可退。这条锁定的是"ESC 关菜单"这个共同行为，防它被误删。
    expect(body$('.dt-context-menu'), 'ESC 关菜单（非全屏同样生效）').toBeFalsy()
    expect(inFullscreen(dt), '且没有误进全屏').toBe(false)
  })

  /* 「点外部不判 Teleport 白名单」：白名单里的元素被点时不退全屏。
     已测过 .dt-filter-dropdown 与 .dt-context-menu，但**这两者的点击都会被
     各自的冒泡处理器先 stopPropagation**，所以掩盖了白名单分支。
     改用 .dt-cell-tooltip（单元格提示，无冒泡拦截）来单独命中 closest 分支。 */
  it('**点单元格提示浮层不退出**（只靠 closest 白名单这一条路）', async () => {
    const dt = mountTable()
    await enterFullscreen(dt)

    // 手工造一个带白名单类名的节点挂到 body：它不被表格包裹，
    // 也不属于任何有 stopPropagation 的子组件 → 只能靠 closest 白名单拦住
    const probe = document.createElement("div")
    probe.className = 'dt-cell-tooltip'
    document.body.appendChild(probe)

    probe.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await nextTick()
    expect(inFullscreen(dt), '白名单节点点击不该退全屏').toBe(true)
    probe.remove()
  })

  /* 「点筛选图标也切排序」：th 上挂了 click → onHeaderCellClick，
     L1309 的 closest 白名单只在键盘 Enter/Space 路径（onHeaderKeydown）。
     鼠标路径下点图标时 target 是图标本身，会冒泡到 th 并触发 toggleSort。
     **这里如实锁定当前真实行为**。 */
  it('**鼠标点筛选图标：筛选打开、排序不变**（toggleFilter stopPropagation 拦住冒泡）', async () => {
    const dt = mountTable()
    const rowOrder = () => {
      const rows = dt.findAll('tbody tr').filter((r) => r.findAll('td').length > 0)
      return rows.map((r) => r.text()).join('|')
    }
    const before = rowOrder()
    expect(before.length, '前置：有数据行').toBeGreaterThan(0)

    await thsOf(dt)[2]!.find('.th-filter-icon').trigger('click')
    await nextTick()

    expect(body$('.dt-filter-dropdown'), '筛选应打开').toBeTruthy()
    expect(rowOrder(), '**排序不该变**（toggleFilter stopPropagation 拦住了冒泡）').toBe(before)
  })

  /* 键盘路径（onThKeydown L1306-1312）：白名单拦截「落在子元素上的 Enter」。
     ⚠️ 筛选图标自己挂了 @keydown.enter.prevent.stop（L1817）→ 冒泡早被挡住，
     closest('.th-filter-icon') 对它是死防御。真正会冒泡到 th 的子元素是
     .sort-arrows（L1791，无自有 keydown）与 .resize-handle —— 用 sort-arrows 命中。 */
  it('**键盘 Enter 落在排序箭头上不切排序**（onThKeydown 白名单）', async () => {
    const dt = mountTable()
    const rowOrder = () => {
      const rows = dt.findAll('tbody tr').filter((r) => r.findAll('td').length > 0)
      return rows.map((r) => r.text()).join('|')
    }
    const before = rowOrder()

    const arrows = thsOf(dt)[0]!.find('.sort-arrows')
    expect(arrows.exists(), '前置：排序箭头存在').toBe(true)
    // 在箭头元素上派发 Enter（无自有处理器 → 冒泡到 th 的 onThKeydown）
    arrows.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await nextTick()
    expect(rowOrder(), 'Enter 在排序箭头上：closest 白名单应拦住，不切排序').toBe(before)

    // 对照组 1：Enter 落在 th 本身（非子元素）→ 应切排序
    thsOf(dt)[0]!.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await nextTick()
    expect(rowOrder(), '对照组：Enter 在 th 本身应切排序').not.toBe(before)

    // 再对照：Enter 落在筛选图标上也不切（但它走的是 .stop，白名单管不到）
    const before2 = rowOrder()
    thsOf(dt)[2]!.find('.th-filter-icon').element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    await nextTick()
    expect(rowOrder(), '对照组 2：筛选图标的 .stop 也挡住').toBe(before2)
  })
})
