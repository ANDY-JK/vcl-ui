// DataTable 挂载级护栏测试（拆分重构前置 · 阶段 A）
// 锁定三处薄弱点的「组件装配路径」（composable 级行为另有 table-*.spec.ts 覆盖）：
//   1. 全屏 DOM 还原：退出后表格容器回到原父容器原位置（nextSibling 快照有效 / 失效走 append 回退）
//   2. 虚拟滚动切片：scrollTop 变化后仅渲染可视窗口行，总高由撑高占位元素保证
//   3. 行编辑闭环：双击进入编辑 → 改值 → 提交，显示更新且 emit cellChange
// 拆分前后都必须全绿（行为零变化安全网）。
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, type VueWrapper, type DOMWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import DataTable from '@/components/data/DataTable.vue'
import DataTableBatchDialog from '@/components/data/DataTableBatchDialog.vue'
import { useT } from '@/components/_internal/i18n'
import type { Column } from '@/components/data/composables/types'

const t = useT()

const COLS: Column[] = [
  { key: 'name', title: '名称' },
  { key: 'value', title: '数值' },
]

function genRows(n: number): Record<string, any>[] {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `行${i}`, value: String(i) }))
}

/** 最小合法 props：关掉虚拟滚动/列宽测量/持久化，避免无关分支干扰薄弱点锁定 */
const MINIMAL = {
  columns: COLS,
  data: genRows(3),
  rowKey: 'id',
  virtualScroll: false,
  autoFit: false,
  persistence: 'none' as const,
}

/** 挂载到带前后兄弟节点的宿主容器（全屏还原测试用） */
function mountInHost(tableProps: Record<string, unknown> = MINIMAL): VueWrapper {
  return mount(
    defineComponent({
      setup() {
        // 静态 props 对象：测试内不再变更，无需响应式
        return () =>
          h('div', { class: 'host-wrap' }, [
            h('span', { class: 'before' }, 'B'),
            h(DataTable, tableProps),
            h('span', { class: 'after' }, 'A'),
          ])
      },
    }),
    { attachTo: document.body },
  )
}

/** 等待 DataTable 发出第 n 次 fullscreenChange（全屏 watch 异步收尾后才会 emit） */
async function waitFullscreenChange(dt: VueWrapper, n: number): Promise<void> {
  await vi.waitFor(() => {
    expect((dt.emitted('fullscreenChange') ?? []).length).toBeGreaterThanOrEqual(n)
  })
}

function fullscreenButton(scope: VueWrapper): DOMWrapper<HTMLButtonElement> | undefined {
  return scope
    .findAll('button')
    .find(
      (b) => b.attributes('title') === t('table.fullscreenShow') || b.attributes('title') === t('table.exitFullscreen'),
    ) as DOMWrapper<HTMLButtonElement> | undefined
}

const mounted: VueWrapper[] = []
function track<T extends VueWrapper>(w: T): T {
  mounted.push(w)
  return w
}

afterEach(() => {
  while (mounted.length) {
    const w = mounted.pop()!
    w.unmount()
  }
  document.body.innerHTML = ''
})

describe('DataTable 挂载级护栏 — 全屏 DOM 还原', () => {
  it('退出全屏：表格容器回到原父容器原位置（before/after 之间）', async () => {
    const w = track(mountInHost())
    const dt = w.findComponent(DataTable)
    const hostWrap = w.find('.host-wrap').element as HTMLElement
    const tableWrap = hostWrap.querySelector('.table-wrap') as HTMLElement
    expect(tableWrap).toBeTruthy()
    expect(tableWrap.parentElement).toBe(hostWrap)

    // 进入全屏（无 .sidebar → 无 250ms 导航收起延迟）
    const enterBtn = fullscreenButton(dt)
    expect(enterBtn).toBeTruthy()
    await enterBtn!.trigger('click')
    await waitFullscreenChange(dt, 1)
    expect((dt.emitted('fullscreenChange')![0] as unknown[])[0]).toBe(true)
    // 全屏态：容器移到 body 下
    expect(tableWrap.parentElement).toBe(document.body)
    expect(document.body.classList.contains('dt-fullscreen-active')).toBe(true)

    // 退出全屏
    const exitBtn = fullscreenButton(dt)
    await exitBtn!.trigger('click')
    await waitFullscreenChange(dt, 2)
    expect((dt.emitted('fullscreenChange')![1] as unknown[])[0]).toBe(false)
    // 还原：原父容器 + 原位置（nextSibling 快照有效 → insertBefore 分支）
    expect(tableWrap.parentElement).toBe(hostWrap)
    expect(tableWrap.previousElementSibling?.classList.contains('before')).toBe(true)
    expect(tableWrap.nextElementSibling?.classList.contains('after')).toBe(true)
    // 清理：fullscreen class / inline 定位样式
    expect(document.body.classList.contains('dt-fullscreen-active')).toBe(false)
    expect(tableWrap.style.top).toBe('')
    expect(tableWrap.style.height).toBe('')
  })

  it('退出全屏且原 nextSibling 快照已失效：走 append 回退分支（仍回原父容器，不丢节点）', async () => {
    const w = track(mountInHost())
    const dt = w.findComponent(DataTable)
    const hostWrap = w.find('.host-wrap').element as HTMLElement
    const tableWrap = hostWrap.querySelector('.table-wrap') as HTMLElement
    // 进入前快照 nextSibling：组件根为 fragment（Toast + .table-wrap），
    // 快照节点是其尾部锚点（注释节点或元素），组件全屏还原用的正是这个原始节点
    const snap = tableWrap.nextSibling
    expect(snap).toBeTruthy()

    await fullscreenButton(dt)!.trigger('click')
    await waitFullscreenChange(dt, 1)
    expect(tableWrap.parentElement).toBe(document.body)

    // 模拟全屏期间父容器 DOM 变动（路由切换等）：快照节点被移出原父容器 → 快照失效
    snap!.parentNode?.removeChild(snap!)

    await fullscreenButton(dt)!.trigger('click')
    await waitFullscreenChange(dt, 2)
    // 回退分支：appendChild 回原父容器末尾，节点不丢失
    expect(tableWrap.parentElement).toBe(hostWrap)
    expect(hostWrap.lastElementChild).toBe(tableWrap)
  })
})

describe('DataTable 挂载级护栏 — 虚拟滚动切片', () => {
  // 约定（useTableCore 虚拟窗口输出）：rowH=40（默认行高×缩放1）、overscan=10、
  // happy-dom 无真实布局 → containerHeight=0（可视行数 0），
  // 窗口 = [floor(scrollTop/40)-10, ceil(scrollTop/40)+10)
  it('500 行初始仅渲染窗口切片，底部撑高元素保证总高', async () => {
    const data = genRows(500)
    const w = track(
      mount(DataTable, {
        attachTo: document.body,
        props: { ...MINIMAL, data, maxHeight: '200px', virtualScroll: true },
      }),
    )
    const dt = w.findComponent(DataTable)
    expect(w.find('.table-scroll').exists()).toBe(true)

    // 初始 scrollTop=0：渲染行 = [0, 10) = 10 行 ≪ 500
    const dataRows = () => w.findAll('tbody tr').filter((r) => r.attributes('aria-hidden') !== 'true')
    expect(dataRows().length).toBe(10)
    // 底部撑高（占位样式在内部 td 上）：总高 = 500 × 40 = 20000px
    const placeholders = () => w.findAll('tbody tr[aria-hidden="true"]')
    expect(placeholders().length).toBe(1)
    expect(placeholders()[0].find('td').element.style.height).toBe('19600px')
    expect(w.find('table.data-table').exists()).toBe(true)
    void dt
  })

  it('scrollTop=1000 后窗口平移：顶部/底部占位与渲染行数锁定（offset 输出约定）', async () => {
    const data = genRows(500)
    const w = track(
      mount(DataTable, {
        attachTo: document.body,
        props: { ...MINIMAL, data, maxHeight: '200px', virtualScroll: true },
      }),
    )
    const sc = w.find('.table-scroll')
    sc.element.scrollTop = 1000
    await sc.trigger('scroll')
    // onTableScroll 经 rAF 更新 scrollTop（happy-dom rAF 走定时器）
    await vi.waitFor(() => {
      const rows = w.findAll('tbody tr').filter((r) => r.attributes('aria-hidden') !== 'true')
      expect(rows.length).toBe(20)
    })
    // 窗口 [15, 35)：顶部占位 15×40=600px，底部 (500-15-20)×40=18600px（占位样式在内部 td 上）
    const placeholders = w.findAll('tbody tr[aria-hidden="true"]')
    expect(placeholders.length).toBe(2)
    expect(placeholders[0].find('td').element.style.height).toBe('600px')
    expect(placeholders[1].find('td').element.style.height).toBe('18600px')
    // 总高守恒：顶部 + 渲染行 + 底部 = 500 × 40
    const rendered = w.findAll('tbody tr').filter((r) => r.attributes('aria-hidden') !== 'true').length
    expect(600 + rendered * 40 + 18600).toBe(500 * 40)
    // 首行显示索引 = virtualStartIndex（td 的 data-row-idx 与真实行号对齐）
    const firstRow = w.findAll('tbody tr').find((r) => r.attributes('aria-hidden') !== 'true')
    expect(firstRow!.find('td[data-col-idx="0"]').attributes('data-row-idx')).toBe('15')
  })
})

describe('DataTable 挂载级护栏 — 列设置面板区块（主子装配路径）', () => {
  it('工具栏按钮打开面板；面板隐藏列后主表格表头同步更新', async () => {
    const w = track(mountInHost())
    // 面板组件常驻挂载（Teleport 内 v-if），初始不渲染
    expect(document.querySelector('.dt-col-settings')).toBeNull()

    // 工具栏列设置按钮 → 打开面板
    const btn = w.find('.col-settings-btn')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await nextTick()
    const panel = document.querySelector('.dt-col-settings')
    expect(panel).toBeTruthy()
    // 列列表渲染全部列
    expect(panel!.querySelectorAll('.dt-col-item').length).toBe(2)

    // 取消勾选第一列 → 主表格表头只剩一列（共享 hiddenColumns 引用生效）
    const checkbox = panel!.querySelector('.dt-col-item input[type="checkbox"]') as HTMLInputElement
    checkbox.click()
    await nextTick()
    const ths = w.findAll('thead th').filter((th) => !th.classes().includes('th-actions-col'))
    expect(ths.length).toBe(1)
    expect(ths[0].text()).toContain('数值')
  })
})

describe('DataTable 挂载级护栏 — 批量编辑弹窗区块（主子装配路径）', () => {
  it('勾选行 → 工具栏批量按钮 → 弹窗提交：emit batchChange（rowKeys 为选中键）', async () => {
    const w = track(
      mount(DataTable, {
        attachTo: document.body,
        props: { ...MINIMAL, selectable: true },
      }),
    )
    // 勾选第一行（内部选中键由 useTableExtras 维护）
    await w.find('tbody td.td-checkbox input').setValue(true)
    await nextTick()
    // 批量按钮出现（无筛选/排序时唯一的 toolbar-clear 按钮）
    const batchBtn = w.find('button.toolbar-clear')
    expect(batchBtn.exists()).toBe(true)
    await batchBtn.trigger('click')

    // 弹窗（Teleport 到 body，从区块组件内查询）
    const dlg = w.findComponent(DataTableBatchDialog)
    expect(dlg.exists()).toBe(true)
    expect(dlg.find('.note-editor').exists()).toBe(true)
    // 列下拉默认第一可见列 name
    expect((dlg.find('select.note-editor-input').element as HTMLSelectElement).value).toBe('name')
    await dlg.find('input.note-editor-input').setValue('批量值')
    await dlg.find('input.note-editor-input').trigger('keydown', { key: 'Enter' })

    expect(w.emitted('batchChange')?.[0]).toEqual(['name', '批量值', ['r0']])
    // 提交后弹窗关闭
    expect(dlg.find('.note-editor').exists()).toBe(false)
  })
})

describe('DataTable 挂载级护栏 — 分页脚注区块（主子装配路径）', () => {
  it('pageSize=2 × 5 行 → 3 页脚注；翻页 emit pageChange 且行数据切换', async () => {
    const data = genRows(5)
    const w = track(
      mount(DataTable, {
        attachTo: document.body,
        props: { ...MINIMAL, data, pageSize: 2, virtualScroll: false },
      }),
    )
    const pager = w.find('.table-pagination')
    expect(pager.exists()).toBe(true)
    // 3 个页码按钮 + 2 个前后翻页按钮
    const pageBtns = pager.findAll('.page-btn')
    expect(pageBtns.length).toBe(5)
    // 第 1 页数据
    expect(w.findAll('tbody tr')[0].text()).toContain('行0')
    expect(w.findAll('tbody tr').length).toBe(2)
    // 下一页
    await pageBtns[4].trigger('click')
    expect(w.emitted('pageChange')?.[0]).toEqual([2, 2])
    expect(w.emitted('update:currentPage')?.[0]).toEqual([2])
    await nextTick()
    // 第 2 页数据
    expect(w.findAll('tbody tr')[0].text()).toContain('行2')
    // 激活态页码为 2
    expect(pager.find('.page-btn.active').text()).toBe('2')
  })
})

describe('DataTable 挂载级护栏 — 工具栏区块（主子装配路径）', () => {
  it('全局搜索：展开输入框 → 防抖过滤数据行 → 收起恢复并清空关键词', async () => {
    vi.useFakeTimers()
    try {
      const w = track(mountInHost())
      const toolbar = w.find('.table-top-bar')
      expect(toolbar.exists()).toBe(true)
      // 展开搜索输入框
      await toolbar.find('.global-search-toggle').trigger('click')
      const input = toolbar.find('input.global-search-input')
      expect(input.exists()).toBe(true)
      // 输入关键词（v-model 直写主文件 globalSearch ref → 防抖过滤）
      await input.setValue('行1')
      await vi.advanceTimersByTimeAsync(250)
      await nextTick()
      // 只剩 1 行，计数显示过滤态
      expect(w.findAll('tbody tr').length).toBe(1)
      expect(toolbar.find('.toolbar-count').text()).toContain('1')
      // 收起（Escape）→ 清空关键词，数据恢复
      await input.trigger('keydown', { key: 'Escape' })
      await vi.advanceTimersByTimeAsync(250)
      await nextTick()
      expect(toolbar.find('input.global-search-input').exists()).toBe(false)
      expect(w.findAll('tbody tr').length).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('DataTable 挂载级护栏 — 行编辑闭环', () => {
  it('双击进入编辑 → 改值 → blur 提交：显示更新且 emit cellChange', async () => {
    const data = [{ id: 'r1', name: '旧值' }]
    const w = track(
      mount(DataTable, {
        attachTo: document.body,
        props: { ...MINIMAL, data, editable: true },
      }),
    )
    const td = w.find('td[data-row-idx="0"][data-col-idx="0"]')
    expect(td.exists()).toBe(true)
    await td.trigger('dblclick')

    const input = w.find('input.cell-edit-input')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('旧值')

    const inputEl = input.element as HTMLInputElement
    inputEl.value = '新值'
    await input.trigger('input')
    await input.trigger('blur') // commitEdit

    // emit 装配路径：cellChange(rowKey, colKey, newValue)
    expect(w.emitted('cellChange')?.[0]).toEqual(['r1', 'name', '新值'])
    // 提交后退出编辑态，显示值经本地 override 更新
    expect(w.find('input.cell-edit-input').exists()).toBe(false)
    expect(w.find('td[data-row-idx="0"][data-col-idx="0"]').text()).toContain('新值')
  })

  it('编辑中 Enter 提交：同样 emit cellChange 并退出编辑态', async () => {
    const data = [{ id: 'r1', name: 'a' }]
    const w = track(
      mount(DataTable, {
        attachTo: document.body,
        props: { ...MINIMAL, data, editable: true },
      }),
    )
    await w.find('td[data-row-idx="0"][data-col-idx="0"]').trigger('dblclick')
    const input = w.find('input.cell-edit-input')
    const inputEl = input.element as HTMLInputElement
    inputEl.value = 'b'
    await input.trigger('input')
    await input.trigger('keydown', { key: 'Enter' })

    expect(w.emitted('cellChange')?.[0]).toEqual(['r1', 'name', 'b'])
    expect(w.find('input.cell-edit-input').exists()).toBe(false)
    expect(w.find('td[data-row-idx="0"][data-col-idx="0"]').text()).toContain('b')
  })
})
