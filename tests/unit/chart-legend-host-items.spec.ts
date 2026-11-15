/**
 * ChartLegend · **宿主自带 items** 时的身份一致性（#492）
 *
 * 上一轮（#489）给库内 `legendItems` 加了唯一 `key`，但 `ChartLegend` 是对外组件：
 * 宿主可以直接传 `items`，而 `key` 是可选的。现状有两个不一致：
 *
 *   ① 模板里 `:key="keyOf(item) || i"`（DOM 身份），`onClick` 里 `emit('toggle', keyOf(item))`
 *      （事件身份）—— **`key` 是空串/纯空白时前者用下标、后者发空串**，两条身份对不上：
 *      宿主收到一个空字符串，找不到要切换的项，点了没反应。
 *   ② 不传 `key` 的同名项：DOM `:key` 都是同一个名字（truthy，走不到 `|| i`），
 *      v-for 的 key 不唯一 —— Vue 对无状态 DOM 只会重渲染 props，happy-dom 下看不出错，
 *      但这是硬规则（将来插入带状态的子组件就会串状态），必须钉住。
 *
 * 修法：**事件身份**用 `key`（非空）→ `name`；**DOM key** 在其后补「第几个同名」保证唯一，
 * 且不把这段合成尾巴泄漏给宿主。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChartLegend from '@/components/chart/ChartLegend.vue'

type Item = { key?: string; name: string; color: string; visible: boolean }

const dup: Item[] = [
  { name: '销售', color: '#a', visible: true },
  { name: '销售', color: '#b', visible: false },
]

const offIndexes = (w: ReturnType<typeof mount>) =>
  w.findAll('.cl-item').flatMap((b, i) => (b.classes().includes('off') ? [i] : []))

/**
 * 从 Vue 内部 vnode 树里取 `.cl-item` 按钮的 key。
 * DOM key 是否唯一**只能**这样直接验：真实 DOM 上不留 key，靠"换顺序看 class"在
 * 无状态元素上观测不到（Vue 会重渲染 props，实测撞 key 也不串位）。
 */
function domKeysOf(w: ReturnType<typeof mount>): unknown[] {
  type VNode = { type?: unknown; props?: { class?: string }; key?: unknown; children?: unknown }
  const out: unknown[] = []
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object') return
    const node = v as VNode
    if (node.type === 'button' && (node.props?.class ?? '').includes('cl-item')) out.push(node.key)
    if (Array.isArray(node.children)) node.children.forEach(walk)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Vue 内部实例没有公开类型；只读 vnode key
  walk((w.vm as any).$.subTree)
  return out
}

describe('ChartLegend · 宿主 items 的同名/空 key（#492）', () => {
  it('同名项换顺序后，off 类要跟着正确的项走', async () => {
    const w = mount(ChartLegend, { props: { items: dup } })
    expect(offIndexes(w)).toEqual([1])
    await w.setProps({ items: [...dup].reverse() })
    expect(offIndexes(w), '隐藏项换到前面后，第 0 个才该是 off').toEqual([0])
    w.unmount()
  })

  it('**同名项的 DOM key 必须唯一**（v-for 硬规则）', () => {
    const w = mount(ChartLegend, { props: { items: dup } })
    const keys = domKeysOf(w)
    expect(keys).toHaveLength(2)
    expect(new Set(keys).size, '两个同名项不能共用一个 key').toBe(2)
    w.unmount()
  })

  it('**两枚 key 完全相同时 DOM key 也必须唯一**', () => {
    const items: Item[] = [
      { key: 'same', name: '甲', color: '#a', visible: true },
      { key: 'same', name: '乙', color: '#b', visible: false },
    ]
    const w = mount(ChartLegend, { props: { items } })
    const keys = domKeysOf(w)
    expect(keys).toHaveLength(2)
    expect(new Set(keys).size).toBe(2)
    w.unmount()
  })

  it('`key: ""` 不能当成有效身份：toggle 不该发出空串', async () => {
    const items: Item[] = [
      { key: '', name: '甲', color: '#a', visible: true },
      { key: '', name: '乙', color: '#b', visible: true },
    ]
    const w = mount(ChartLegend, { props: { items } })
    await w.findAll('.cl-item')[0].trigger('click')
    expect(w.emitted('toggle')?.[0]?.[0], '空 key 应退化为展示名，不是空串').toBe('甲')
    await w.findAll('.cl-item')[1].trigger('click')
    expect(w.emitted('toggle')?.[1]?.[0]).toBe('乙')
    w.unmount()
  })

  it('`key` 只有空白时也按"没给"处理（不能把空格当身份发出去）', async () => {
    const items: Item[] = [{ key: '   ', name: '甲', color: '#a', visible: true }]
    const w = mount(ChartLegend, { props: { items } })
    await w.find('.cl-item').trigger('click')
    expect(w.emitted('toggle')?.[0]?.[0]).toBe('甲')
    w.unmount()
  })

  it('不传 key 时 toggle 发展示名（既有宿主契约不能破）', async () => {
    const w = mount(ChartLegend, { props: { items: dup } })
    await w.findAll('.cl-item')[0].trigger('click')
    expect(w.emitted('toggle')?.[0]).toEqual(['销售'])
    w.unmount()
  })

  it('传了 key 时 toggle 发 key（#489 的库内契约继续成立）', async () => {
    const items = [
      { key: 'k1', name: '销售', color: '#a', visible: true },
      { key: 'k2', name: '销售', color: '#b', visible: true },
    ]
    const w = mount(ChartLegend, { props: { items } })
    await w.findAll('.cl-item')[1].trigger('click')
    expect(w.emitted('toggle')?.[0]).toEqual(['k2'])
    w.unmount()
  })

  it('两枚 key 相同 → 换顺序后 off 类也不能贴错', async () => {
    const items: Item[] = [
      { key: 'same', name: '甲', color: '#a', visible: true },
      { key: 'same', name: '乙', color: '#b', visible: false },
    ]
    const w = mount(ChartLegend, { props: { items } })
    expect(offIndexes(w)).toEqual([1])
    await w.setProps({ items: [...items].reverse() })
    expect(offIndexes(w)).toEqual([0])
    w.unmount()
  })

  it('同名项列表中间插入一项 → off 类不串位', async () => {
    const items: Item[] = [
      { name: '销售', color: '#a', visible: true },
      { name: '销售', color: '#b', visible: false },
      { name: '成本', color: '#c', visible: true },
    ]
    const w = mount(ChartLegend, { props: { items } })
    expect(offIndexes(w)).toEqual([1])
    await w.setProps({
      items: [
        { name: '销售', color: '#a', visible: true },
        { name: '新增', color: '#d', visible: true },
        { name: '销售', color: '#b', visible: false },
        { name: '成本', color: '#c', visible: true },
      ],
    })
    expect(offIndexes(w), '隐藏项现在在第 2 位，off 不该留在第 1 位').toEqual([2])
    w.unmount()
  })

  it('全部可见/部分可见的按钮布尔方向不变', async () => {
    const allOn = mount(ChartLegend, { props: { items: dup.map((i) => ({ ...i, visible: true })) } })
    await allOn.find('.cl-toggle-all').trigger('click')
    expect(allOn.emitted('toggle-all')?.[0]).toEqual([false])
    allOn.unmount()

    const w = mount(ChartLegend, { props: { items: dup } })
    await w.find('.cl-toggle-all').trigger('click')
    expect(w.emitted('toggle-all')?.[0]).toEqual([true])
    w.unmount()
  })
})
