/**
 * DataTable · 列头筛选触发器的**浮层语义**（#505）
 *
 * 现状：列头的筛选图标是 `role="button" tabindex="0"` 的自绘控件，点击**弹出一个筛选面板**，
 * 但它既没有 `aria-expanded`（读屏念不出"面板开着"），也没有 `aria-haspopup`
 * （读屏不知道按下去会弹什么），更没有 `aria-controls`。
 *
 * 库里其余同类触发器把这三件都写全了：
 *   · `Select`   → `:aria-expanded` + `:aria-haspopup`（按类型 menu/tree/listbox/dialog）+ `:aria-controls`
 *   · `Popover`  → `:aria-expanded` + `aria-haspopup` + `aria-controls`
 *   · `Tree` / `Menu` / `NavItem` → `:aria-expanded`
 * 只有 DataTable 的筛选触发器漏了 —— **同族里少一格**。
 *
 * 面板侧（Teleport 到 body 的 `.dt-filter-dropdown`）也没有 id / role，
 * 所以触发器就算想 `aria-controls` 也无处可指。
 *
 * 面板打开后焦点会移到搜索框（`toggleFilter` 里的 nextTick focus），
 * 所以按 dialog 语义声明 role 与实际行为是对得上的。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import DataTable from '@/components/data/DataTable.vue'
import type { Column } from '@/components/data/composables/types'
import type { TableRow } from '@/components/_internal/api-any'

const COLS: Column[] = [
  { key: 'name', title: '名称', filterable: true },
  { key: 'value', title: '数值', filterable: false },
]

const ROWS: TableRow[] = [
  { id: 'r1', name: '行1', value: '1' },
  { id: 'r2', name: '行2', value: '2' },
]

const mounted: VueWrapper[] = []
function mountTable(): VueWrapper {
  const w = mount(DataTable, {
    props: {
      columns: COLS,
      data: ROWS,
      rowKey: 'id',
      virtualScroll: false,
      autoFit: false,
      persistence: 'none' as const,
    },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
  mounted.push(w)
  return w
}

/** 列头里的筛选触发器（第 0 列） */
const trigger = (w: VueWrapper) => w.find('.th-filter-icon')

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
})

describe('DataTable · 筛选触发器的浮层语义（#505）', () => {
  it('面板关着 → aria-expanded=false，且不指向任何面板', () => {
    const w = mountTable()
    const t = trigger(w)
    expect(t.exists(), '可筛选列才有筛选触发器').toBe(true)
    expect(t.attributes('aria-expanded')).toBe('false')
    expect(t.attributes('aria-controls'), '没打开就不该指向面板').toBeUndefined()
  })

  it('**aria-haspopup 声明按下去会弹什么**（读屏需要这个提示）', () => {
    const w = mountTable()
    expect(trigger(w).attributes('aria-haspopup')).toBe('dialog')
  })

  it('**打开面板 → aria-expanded=true 且 aria-controls 指向真实的面板元素**', async () => {
    const w = mountTable()
    await trigger(w).trigger('click')
    await nextTick()

    expect(trigger(w).attributes('aria-expanded')).toBe('true')
    const id = trigger(w).attributes('aria-controls')
    expect(id, '打开后必须指向面板 id').toBeTruthy()

    const panel = w.find(`#${id}`)
    expect(panel.exists(), 'aria-controls 指向的元素必须真实存在').toBe(true)
    expect(panel.attributes('role')).toBe('dialog')
    expect(panel.attributes('aria-label'), 'dialog 必须有可访问名').toBeTruthy()
  })

  it('再点一次收起 → aria-expanded 回到 false', async () => {
    const w = mountTable()
    await trigger(w).trigger('click')
    await nextTick()
    await trigger(w).trigger('click')
    await nextTick()
    expect(trigger(w).attributes('aria-expanded')).toBe('false')
  })

  it('不可筛选的列不渲染触发器（别给不存在的入口写 aria）', () => {
    const w = mountTable()
    // 第二列显式 filterable: false → 只有第一列有筛选入口
    expect(w.findAll('.th-filter-icon')).toHaveLength(1)
  })
})
