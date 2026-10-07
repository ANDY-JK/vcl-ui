// DataTable 行级左边线（rowLine / rowLineKey+lineColors）护栏测试
// 锁定三件事：
//   1. 回调驱动：返回语义色名的行挂 row-line row-line-{色名}，undefined 的行不挂
//   2. 字段映射驱动：rowLineKey + lineColors 命中挂类，未命中/字段缺失不挂
//   3. 并存优先级：rowLine 与 rowLineKey 同设时回调接管（返回 undefined 不回落字段映射）
// 伪元素着色/几何是 CSS 层的事，scoped 样式单测加载不到，由 e2e table-row-line 取证。
import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import DataTable from '@/components/data/DataTable.vue'
import type { Column } from '@/components/data/composables/types'

const COLS: Column[] = [
  { key: 'name', title: '名称' },
  { key: 'type', title: '类型' },
]

const ROWS = [
  { id: 'r1', name: '行一', type: '重点' },
  { id: 'r2', name: '行二', type: '风险' },
  { id: 'r3', name: '行三', type: '未分类' },
]

type Row = (typeof ROWS)[number]

/** 最小合法 props：关掉虚拟滚动/列宽测量/持久化，避免无关分支干扰 */
const BASE = {
  columns: COLS,
  data: ROWS,
  rowKey: 'id',
  virtualScroll: false,
  autoFit: false,
  persistence: 'none' as const,
}

const wrappers: VueWrapper[] = []

function mountTable(props: Record<string, unknown>): VueWrapper {
  const w = mount(DataTable, { props: { ...BASE, ...props }, attachTo: document.body })
  wrappers.push(w)
  return w
}

const trs = (w: VueWrapper) => w.find('tbody').findAll('tr')

afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
})

describe('DataTable · 行级左边线', () => {
  it('rowLine 回调：命中色名挂 row-line row-line-{色名}，undefined 不挂', () => {
    const w = mountTable({
      rowLine: (row: Row) => (row.name === '行一' ? 'danger' : undefined),
    })
    const [r1, r2, r3] = trs(w)
    expect(r1.classes()).toContain('row-line')
    expect(r1.classes()).toContain('row-line-danger')
    expect(r2.classes()).not.toContain('row-line')
    expect(r3.classes()).not.toContain('row-line')
  })

  it('rowLineKey + lineColors：命中映射挂类，未命中与字段缺失不挂', () => {
    const w = mountTable({
      rowLineKey: 'type',
      lineColors: { 重点: 'primary', 风险: 'warning' } as Record<string, string>,
    })
    const [r1, r2, r3] = trs(w)
    expect(r1.classes()).toContain('row-line-primary')
    expect(r2.classes()).toContain('row-line-warning')
    expect(r3.classes()).not.toContain('row-line')
  })

  it('未设置任何行线 props：全表无 row-line 类（回到现状零影响）', () => {
    const w = mountTable({})
    for (const tr of trs(w)) expect(tr.classes()).not.toContain('row-line')
  })

  it('回调返回非法色名：类照挂、CSS 不命中即无线（不抛错）', () => {
    const w = mountTable({
      rowLine: () => 'no-such-color' as never,
    })
    expect(trs(w)[0]!.classes()).toContain('row-line-no-such-color')
  })

  it('并存优先级：rowLine 接管判定，返回 undefined 不回落字段映射', () => {
    const w = mountTable({
      rowLine: () => undefined,
      rowLineKey: 'type',
      lineColors: { 重点: 'primary' } as Record<string, string>,
    })
    const [r1, r2, r3] = trs(w)
    expect(r1.classes()).not.toContain('row-line')
    expect(r2.classes()).not.toContain('row-line')
    expect(r3.classes()).not.toContain('row-line')
  })
})
