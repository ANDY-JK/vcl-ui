// 修复锁定：Tree 勾选级联 —— 点父节点复选框，子孙勾选框的 DOM 状态必须同步选中
// 背景（2026-09-21 实测发现）：活页面上点「内容管理」父复选框，check-change 汇总里
// b/b1/b2/b3 都在（state 正确），但子节点的 <input> DOM checked 不同步——
// 展开后看到子勾选框仍是未选中态。半选态同理需联动。
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Tree from '@/components/data/Tree.vue'

const data = [
  {
    key: 'p',
    label: '父',
    children: [
      { key: 'c1', label: '子一' },
      { key: 'c2', label: '子二' },
    ],
  },
]

const mounted: Array<{ unmount: () => void }> = []
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
})

function mountTree(props: Record<string, unknown> = {}) {
  const w = mount(Tree, { props: { data, ...props }, attachTo: document.body })
  mounted.push(w)
  return w
}

/** 展开指定 label 的节点（点箭头） */
async function expand(w: ReturnType<typeof mountTree>, label: string) {
  const wrapper = w.findAll('.tree-node-wrapper').find((n) => n.attributes('aria-label') === label)!
  await wrapper.find('.tree-arrow:not(.tree-arrow--spacer)').trigger('click')
  await nextTick()
}

/** 勾选指定 label 的节点（点视觉盒子，走 label→input 的真实激活路径） */
async function check(w: ReturnType<typeof mountTree>, label: string) {
  const wrapper = w.findAll('.tree-node-wrapper').find((n) => n.attributes('aria-label') === label)!
  await wrapper.find('.tree-check-box').trigger('click')
  await nextTick()
}

function inputsOf(w: ReturnType<typeof mountTree>, label: string) {
  const wrapper = w.findAll('.tree-node-wrapper').find((n) => n.attributes('aria-label') === label)!
  return wrapper.find('input.tree-check-input').element as HTMLInputElement
}

describe('Tree · 勾选级联', () => {
  it('勾父节点：父子勾选框 DOM 全部选中，check-change 带齐子孙', async () => {
    const w = mountTree({ checkable: true })
    await expand(w, '父')
    await check(w, '父')

    expect(inputsOf(w, '父').checked).toBe(true)
    expect(inputsOf(w, '子一').checked).toBe(true)
    expect(inputsOf(w, '子二').checked).toBe(true)

    const events = w.emitted('check-change')
    expect(events?.[0]?.[0]).toEqual(['p', 'c1', 'c2'])
  })

  it('取消父节点：子孙勾选框 DOM 全部清空', async () => {
    const w = mountTree({ checkable: true })
    await expand(w, '父')
    await check(w, '父')
    await check(w, '父')

    expect(inputsOf(w, '父').checked).toBe(false)
    expect(inputsOf(w, '子一').checked).toBe(false)
    expect(inputsOf(w, '子二').checked).toBe(false)
  })

  it('预置 checked 的叶子：父与祖父半选态在 DOM 上联动', async () => {
    const nested = [
      {
        key: 'g',
        label: '祖父',
        children: [
          {
            key: 'p',
            label: '父',
            children: [
              { key: 'c1', label: '子一', checked: true },
              { key: 'c2', label: '子二' },
            ],
          },
        ],
      },
    ]
    const w = mount(Tree, { props: { data: nested, checkable: true }, attachTo: document.body })
    mounted.push(w)
    await expand(w, '祖父')
    await expand(w, '父')

    expect(inputsOf(w, '子一').checked).toBe(true)
    expect(inputsOf(w, '子二').checked).toBe(false)
    // 父：一半 → 半选；祖父：含半选子孙 → 半选
    expect(inputsOf(w, '父').indeterminate).toBe(true)
    expect(inputsOf(w, '祖父').indeterminate).toBe(true)
  })
})

// 同一根因（嵌套实例拿不到共享 state）的另外三个表现，一起锁
describe('Tree · 共享 state 跨层级', () => {
  it('深层节点勾选：check-change 从根实例发出（父组件能收到）', async () => {
    const w = mountTree({ checkable: true })
    await expand(w, '父')
    await check(w, '子一')
    const events = w.emitted('check-change')
    expect(events).toHaveLength(1)
    expect(events?.[0]?.[0]).toEqual(['c1'])
  })

  it('expandAll：所有层级都展开（不只第一层）', async () => {
    const deep = [
      {
        key: 'g',
        label: '祖父',
        children: [{ key: 'p', label: '父', children: [{ key: 'c1', label: '子一' }] }],
      },
    ]
    const w = mount(Tree, { props: { data: deep, expandAll: true }, attachTo: document.body })
    mounted.push(w)
    await nextTick()
    const labels = w.findAll('.tree-node-wrapper').map((n) => n.attributes('aria-label'))
    expect(labels).toEqual(['祖父', '父', '子一'])
  })

  it('selectable：深层节点点击也高亮并 emit update:selected-key', async () => {
    const w = mountTree({ selectable: true })
    await expand(w, '父')
    const leaf = w.findAll('.tree-node-wrapper').find((n) => n.attributes('aria-label') === '子一')!
    await leaf.find('.tree-node-label').trigger('click')
    // 选中是全受控：emit 出去，父组件写回 selectedKey 才高亮（与 demo 用法一致）
    const events = w.emitted('update:selected-key')
    expect(events?.[0]?.[0]).toBe('c1')
    await w.setProps({ selectedKey: 'c1' })
    expect(leaf.find('.tree-node--selected').exists()).toBe(true)
    expect(leaf.attributes('aria-selected')).toBe('true')
  })

  it('defaultExpandedKeys 传深层 key：对应层级直接展开', async () => {
    const w = mountTree({ defaultExpandedKeys: ['p'] })
    await nextTick()
    const labels = w.findAll('.tree-node-wrapper').map((n) => n.attributes('aria-label'))
    expect(labels).toContain('子一')
  })
})
