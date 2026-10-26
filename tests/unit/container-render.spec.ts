/**
 * 容器渲染辅助纯函数（第 132 轮从 FormBuilder 抽出）。
 *
 * 抽出来的原因有两个：① `FormBuilder.vue` 顶到 810 行止涨线（加一行就被闸口挡）；
 * ② 这三个函数是**纯的**，不碰响应式，本来就不该长在 800 行的组件里。
 *
 * `resolveActiveTab` 是修 bug 时加的：原实现直接用记住的页签名，不校验它是否还在列表里，
 * 失效后整个 tabs 容器正文渲染成空白（端到端表现见 form-builder-tabs-stale-active.spec.ts）。
 */
import { describe, it, expect } from 'vitest'
import { resolveActiveTab, resolveCollapsed, fieldsInSlot } from '@/components/form-builder/container-render'
import type { FormField } from '@/components/form-builder/types'

const TABS = [{ name: 't1' }, { name: 't2' }, { name: 't3' }]
const field = (key: string, slot?: number) =>
  ({ key, type: 'text', label: key, container: slot === undefined ? undefined : { slot } }) as FormField

describe('resolveActiveTab：记住的页签名必须校验还在不在', () => {
  it('记住的名字仍然存在 → 用它（用户的选择不能被抢走）', () => {
    expect(resolveActiveTab(TABS, 't2')).toBe('t2')
  })

  it('没记住过 → 第一个', () => {
    expect(resolveActiveTab(TABS, undefined)).toBe('t1')
  })

  it('**记住的名字已不存在 → 回落第一个**（此前返回失效名，正文整块空白）', () => {
    expect(resolveActiveTab(TABS, 't9'), '删掉页签后不能返回失效名').toBe('t1')
  })

  it('页签整体换名（重新导入模板）→ 回落第一个', () => {
    expect(resolveActiveTab([{ name: 'x1' }, { name: 'x2' }], 't2')).toBe('x1')
  })

  it('页签为空数组 → 空串（不抛错，也不返回 undefined）', () => {
    expect(resolveActiveTab([], 't1')).toBe('')
    expect(resolveActiveTab([], undefined)).toBe('')
  })

  it('记住的名字是空串且列表里恰好有 name 为空串的页签 → 照用（不做"空即未设置"的误判）', () => {
    expect(resolveActiveTab([{ name: '' }, { name: 'b' }], '')).toBe('')
  })

  it('顺序变了但名字都在 → 保持原选择（不能因为换位置就跳页）', () => {
    expect(resolveActiveTab([{ name: 't3' }, { name: 't1' }, { name: 't2' }], 't2')).toBe('t2')
  })
})

describe('resolveCollapsed：用户手动状态优先于定义默认值', () => {
  const items = [{ expanded: true }, { expanded: false }, {}]

  it('用户碰过 → 用用户的状态（即使与默认相反）', () => {
    expect(resolveCollapsed(items, 0, false), '默认展开但用户收起了').toBe(false)
    expect(resolveCollapsed(items, 1, true), '默认收起但用户展开了').toBe(true)
  })

  it('用户没碰过 → 用定义里的默认值', () => {
    expect(resolveCollapsed(items, 0, undefined)).toBe(true)
    expect(resolveCollapsed(items, 1, undefined)).toBe(false)
  })

  it('定义里没写 expanded → 默认收起', () => {
    expect(resolveCollapsed(items, 2, undefined)).toBe(false)
  })

  it('下标越界 → 收起（不抛错）', () => {
    expect(resolveCollapsed(items, 99, undefined)).toBe(false)
    expect(resolveCollapsed([], 0, undefined)).toBe(false)
  })

  it('**存的是 false 也要生效**（用 `!== undefined` 判，不能用 `||` 兜默认）', () => {
    expect(resolveCollapsed(items, 0, false), '`||` 写法会把 false 当未设置').toBe(false)
  })
})

describe('fieldsInSlot：按容器槽位裁剪字段', () => {
  const fields = [field('a', 0), field('b', 1), field('c', 0), field('d', undefined)]

  it('取指定槽位的字段，保持原顺序', () => {
    // d 没写 slot → 按既有语义算 0 号槽位，所以也在这里（下面单列一条说明）
    expect(fieldsInSlot(fields, 0).map((f) => f.key)).toEqual(['a', 'c', 'd'])
    expect(fieldsInSlot(fields, 1).map((f) => f.key)).toEqual(['b'])
  })

  it('没写 slot 的字段算第 0 个槽位（与容器未分组时的默认一致）', () => {
    expect(fieldsInSlot(fields, 0).map((f) => f.key), 'd 没写 slot，应归到 0').toContain('d')
  })

  it('**槽位 -1（页签名失效时 findIndex 的结果）取不到任何字段**', () => {
    // 这正是"激活页失效 → 正文空白"的机制；上游已用 resolveActiveTab 保证不会传进来
    expect(fieldsInSlot(fields, -1)).toEqual([])
  })

  it('越界槽位返回空数组（不抛错）', () => {
    expect(fieldsInSlot(fields, 99)).toEqual([])
    expect(fieldsInSlot([], 0)).toEqual([])
  })
})
