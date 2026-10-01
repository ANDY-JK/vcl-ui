// 页面滚动虚拟化 · 组件层护栏（happy-dom 无真实布局，故只断言"该保守"的场景）
// 正向窗口行为（滚到哪渲染哪几行）在 tests 环境里测不了：scrollHeight/clientHeight 恒为 0，
// useTableWindowScroll 判不出可滚源 → 按设计退回全量渲染。那条链路靠
// 此前的真浏览器取证已覆盖该链路；判定逻辑本身另有 use-table-window-scroll.spec.ts。
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import DataTable from '@/components/data/DataTable.vue'
import type { Column } from '@/components/data/composables/types'

const COLS: Column[] = [
  { key: 'name', title: '名称' },
  { key: 'value', title: '数值' },
]
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `行${i}`, value: String(i) }))

const wrappers: VueWrapper[] = []
function mountTable(n: number, props: Record<string, unknown> = {}) {
  const w = mount(DataTable, {
    props: { columns: COLS, data: rows(n), rowKey: 'id', autoFit: false, ...props },
    attachTo: document.body,
  })
  wrappers.push(w)
  return w
}
const bodyRows = (w: VueWrapper) => w.findAll('tbody tr').length

afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('DataTable · 虚拟化的保守边界', () => {
  it('行数未超过阈值：渲染全部行（旧行为零变化）', () => {
    expect(bodyRows(mountTable(200))).toBe(200)
  })

  it('显式关掉 virtualScroll：任何行数都全量渲染', () => {
    expect(bodyRows(mountTable(1000, { virtualScroll: false }))).toBe(1000)
  })

  it('带分页时不受页面虚拟化影响（每页照常全渲染）', () => {
    expect(bodyRows(mountTable(2000, { pageSize: 100 }))).toBe(100)
  })

  it('测不出可滚源时退回全量渲染，绝不只渲染十行让人滚不到', () => {
    // happy-dom 下 scrollHeight===clientHeight===0 正是"无可滚源"的形态
    const w = mountTable(1200)
    expect(bodyRows(w)).toBe(1200)
  })

  it('不再刷「virtualScroll 需配合 maxHeight」告警', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mountTable(50, { pageSize: 10 })
    mountTable(50, { maxHeight: '240px' })
    mountTable(50)
    await new Promise((r) => setTimeout(r, 30))
    const hits = spy.mock.calls.filter((c) => String(c[0]).includes('virtualScroll'))
    expect(hits, hits.map((c) => String(c[0])).join(' | ')).toHaveLength(0)
  })
})
