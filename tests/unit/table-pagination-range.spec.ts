/**
 * DataTable 页脚分页 · 页码越界不得留在界面/状态里（第 162 轮）
 *
 * 与第 161 轮同源的缺陷：`nav/Pagination.vue` 越界不归位已修，但**表格页脚是另一份实现**
 * （`data/DataTablePagination.vue` + `useTableCore` 的分页状态），它同样不做夹紧：
 * `setPage(p)` 直接 `_currentPage.value = p`，`watch(() => props.currentPage)` 也直接写入。
 *
 * 后果（用户可见）：
 *   ① 状态行渲染出**「第 5 / 2 页」**这种不存在的页码组合（`pageInfo` 模板把两者直接拼）；
 *   ② 页码列表里**没有任何页码带 active**；
 *   ③ "上一页"可点，但点完还是越界（5→4），表格仍空 —— 死按钮 + 空表。
 * 触发场景很常见：宿主把页码存进 URL/localStorage 再恢复、或筛选后总数变小。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { ref, computed } from 'vue'
import DataTable from '@/components/data/DataTable.vue'
import { useTableCore } from '@/components/data/composables/useTableCore'

const COLUMNS = [{ key: 'name', label: '名称', title: '名称' }]
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 'r' + i, name: '行' + i }))

function mountTable(props: Record<string, unknown> = {}) {
  return mount(DataTable, {
    props: {
      columns: COLUMNS,
      rowKey: 'id',
      virtualScroll: false,
      data: rows(12),
      pageSize: 10,
      ...props,
    },
  })
}

const statusText = (w: ReturnType<typeof mountTable>) => w.find('.pagination-status').text()
const activePages = (w: ReturnType<typeof mountTable>) =>
  w.findAll('.table-pagination .page-btn.active').map((b) => b.text())

describe('DataTable 分页 · 受控页码越界（总数 12 / 每页 10 = 2 页）', () => {
  it('currentPage 传入越界值 5 → 状态行不得出现「第 5 / 2 页」', async () => {
    const w = mountTable({ currentPage: 5 })
    await nextTick()
    const txt = statusText(w)
    expect(txt, `状态行内容：${txt}`).not.toContain('5 / 2')
    expect(txt).toContain('2 / 2')
    w.unmount()
  })

  it('越界时页码列表必须有且仅有一个 active（不能"没有当前页"）', async () => {
    const w = mountTable({ currentPage: 5 })
    await nextTick()
    expect(activePages(w)).toEqual(['2'])
    w.unmount()
  })

  it('越界时表格不能是空表（切片要用夹紧后的页码）', async () => {
    const w = mountTable({ currentPage: 5 }) // 12 行 / 每页 10 → 第 2 页应有 2 行
    await nextTick()
    const bodyRows = w.findAll('.table-scroll tbody tr, tbody tr')
    expect(bodyRows.length, '越界页码切片会切出空数组 → 用户看到空表').toBe(2)
    w.unmount()
  })

  it('越界时自动 emit 纠正值（宿主据此同步自己的页码/URL）', async () => {
    const w = mountTable({ currentPage: 5 })
    await nextTick()
    const emitted = (w.emitted('update:current-page') as [number][] | undefined) ?? []
    expect(emitted.at(-1)?.[0], '必须把纠偏后的页码回传宿主').toBe(2)
    w.unmount()
  })

  it('越界时"上一页"点了要真的翻页（不能 5→4 还是空表）', async () => {
    const w = mountTable({ currentPage: 5 })
    await nextTick()
    const prev = w.findAll('.table-pagination .page-btn')[0]!
    await prev.trigger('click')
    await nextTick()
    const emitted = (w.emitted('currentPage') ?? []).concat(w.emitted('update:current-page') ?? [])
    // 只要发出的是合法页码就说明没在原地打转
    const vals = emitted.flat() as number[]
    expect(vals.length, '点上一页必须发出页码事件').toBeGreaterThan(0)
    expect(Math.min(...vals), '发出的页码必须落在 [1,2]').toBeGreaterThanOrEqual(1)
    expect(Math.max(...vals)).toBeLessThanOrEqual(2)
    w.unmount()
  })

  it('总数变小（12 页 → 2 页）时，停在第 5 页的用户被拉回第 2 页', async () => {
    const w = mountTable({ data: rows(120), pageSize: 10, currentPage: 5 }) // 12 页，合法
    await nextTick()
    expect(statusText(w)).toContain('5 / 12')

    await w.setProps({ data: rows(12) }) // 只剩 2 页
    await nextTick()
    expect(statusText(w)).toContain('2 / 2')
    expect(activePages(w)).toEqual(['2'])
    w.unmount()
  })

  it('合法页码不做任何纠正（不打扰宿主）', async () => {
    const w = mountTable({ currentPage: 2 })
    await nextTick()
    expect(activePages(w)).toEqual(['2'])
    expect(w.emitted('update:current-page'), '合法状态不该 emit').toBeUndefined()
    w.unmount()
  })

  it('currentPage 传 0 / 负数 → 拉回第 1 页', async () => {
    for (const bad of [0, -3]) {
      const w = mountTable({ currentPage: bad })
      await nextTick()
      expect(activePages(w), `currentPage=${bad}`).toEqual(['1'])
      w.unmount()
    }
  })

  it('**异步加载首帧不误纠正**：data 还空时不要把宿主从 URL 恢复的页码冲掉', async () => {
    // 宿主把页码存进 URL，刷新后先渲染空表、再拉数据 —— 首帧 totalPages=1
    const w = mountTable({ data: [], currentPage: 5 })
    await nextTick()
    expect(w.emitted('update:current-page'), '数据没到就纠正会把"第 5 页"永久清掉').toBeUndefined()

    await w.setProps({ data: rows(120) }) // 12 页，第 5 页合法
    await nextTick()
    expect(statusText(w), '数据到位后应回到宿主原本要的第 5 页').toContain('5 / 12')
    expect(activePages(w)).toEqual(['5'])
    expect(w.emitted('update:current-page'), '合法意图不该被纠正').toBeUndefined()
    w.unmount()
  })

  it('服务端分页（传 total）同理：页码不得超出 total 算出的页数', async () => {
    // 服务端模式：data 是当前页那 10 行，total=25 → 3 页
    const w = mountTable({ total: 25, currentPage: 9 })
    await nextTick()
    const txt = statusText(w)
    expect(txt).toContain('3 / 3')
    expect(activePages(w)).toEqual(['3'])
    w.unmount()
  })
})

describe('useTableCore.setPage · 入口夹紧（宿主/键盘直接调用）', () => {
  /** 造一个能捕获 emit 的 core（与 table-core.spec 的 makeCore 同构） */
  function makeCore(props: Record<string, unknown> = {}) {
    const emitted: { name: string; args: unknown[] }[] = []
    const emit = (name: string, ...args: unknown[]) => emitted.push({ name, args })
    const core = useTableCore(
      { data: [], ...props } as never,
      emit as never,
      ref({}),
      ref(new Set<string>()),
      computed(() => COLUMNS as never),
      ref(''),
    )
    return { core, emitted }
  }

  it('数据还没到时 setPage(99) 也必须夹到第 1 页（watch 此刻不会纠正）', async () => {
    const { core, emitted } = makeCore({ data: [], pageSize: 10 })
    await nextTick()
    core.setPage(99)
    await nextTick()
    expect(core.safePage.value, '越界写入必须被入口夹住').toBe(1)
    const vals = emitted.filter((e) => e.name === 'update:current-page').map((e) => e.args[0])
    expect(vals.every((v) => v === 1), `绝不能把 99 之类的页码回传给宿主，实际：${JSON.stringify(vals)}`).toBe(true)
  })

  it('数据就绪后 setPage(99) 夹到最后一页', async () => {
    const { core } = makeCore({ data: rows(12), pageSize: 10 })
    await nextTick()
    core.setPage(99)
    await nextTick()
    expect(core.safePage.value).toBe(2)
  })

  it('setPage 到当前页不发多余事件（避免无谓重取）', async () => {
    const { core, emitted } = makeCore({ data: rows(12), pageSize: 10 })
    await nextTick()
    const before = emitted.length
    core.setPage(1)
    await nextTick()
    expect(emitted.length, '页码没变就不该 emit').toBe(before)
  })
})
