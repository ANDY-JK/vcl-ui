/**
 * Select 面板内的 Tab 序列（#323）
 *
 * ## 缺陷
 *
 * `Select` 用的是 **aria-activedescendant** 模式：焦点留在触发器输入框，
 * 用 `aria-activedescendant` 指向当前高亮项。这种模式下**选项本身不该可聚焦**。
 * 但面板里的选项/树节点都是 `<button>`（默认 tabbable）：
 * 100 个选项 = 100 个 Tab 停靠点，用户按 Tab 想离开控件，却掉进选项堆里一路走下去。
 * 另外 menu 模式的面板挂着 `role="menu"`，子项**连 `menuitem` 都没有** ——
 * 读屏会说"菜单"，然后什么也读不出来。
 *
 * ## 判据
 *
 * listbox / menu / tree 三种模式下：面板内**可 Tab 的元素数为 0**，
 * 且 option/treeitem/menuitem 都在位。
 */
import { beforeEach, describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Select from '@/components/form/Select.vue'

const options = Array.from({ length: 12 }, (_, i) => ({ label: `选项${i + 1}`, value: `v${i + 1}` }))
const menuItems = [
  { label: '复制', action: () => {} },
  { label: '粘贴', action: () => {} },
]
// 注意：tree-select 的树源是 **cascaderOptions**（内部 useSelectTree 只接这个），不是 options
const treeOptions = [
  {
    label: '父级',
    value: 'p',
    children: [
      { label: '子一', value: 'c1' },
      { label: '子二', value: 'c2' },
    ],
  },
]

// 面板 Teleport 到 body：不清理会在用例之间串味（前一例的面板被后一例查到）
beforeEach(() => {
  document.body.innerHTML = ''
})

async function openSelect(props: Record<string, unknown>) {
  const w = mount(Select, { props: { label: '测试', ...props } as never, attachTo: document.body })
  await nextTick()
  await w.find('input.trigger-input').trigger('click')
  await nextTick()
  await nextTick()
  return w
}

/** 面板里能靠 Tab 进去的元素 */
function tabbables(): HTMLElement[] {
  const panel = document.body.querySelector('.dropdown-panel')
  if (!panel) return []
  return Array.from(panel.querySelectorAll<HTMLElement>('button:not([tabindex="-1"]), [href], input, [tabindex="0"]'))
}

describe('Select · 面板内的 Tab 序列', () => {
  it('**listbox：选项不可 Tab，整面板 0 个停靠点**', async () => {
    const w = await openSelect({ type: 'select', options, modelValue: '' })
    expect(document.body.querySelectorAll('[role="option"]').length, '前置：选项应已渲染').toBeGreaterThan(0)
    expect(tabbables().length, '选项可 Tab → 用户按 Tab 掉进 100 个选项里').toBe(0)
    w.unmount()
  })

  it('**tree：树节点不可 Tab**', async () => {
    const w = await openSelect({ type: 'tree-select', cascaderOptions: treeOptions, modelValue: '' })
    const nodes = Array.from(document.body.querySelectorAll<HTMLElement>('[role="treeitem"]'))
    expect(nodes.length).toBeGreaterThan(0)
    // 面板里有一个**应该**可 Tab 的元素：搜索框（tree-select 的过滤入口）。
    // 所以这里断言的是「树节点本身不可 Tab」，而不是「面板内 0 个停靠点」。
    expect(
      nodes.filter((n) => n.getAttribute('tabindex') !== '-1').length,
      '树节点自己进了 Tab 序列 → 用户按 Tab 会掉进树里',
    ).toBe(0)
    w.unmount()
  })

  it('**menu：子项要有 menuitem 角色，且不可 Tab**', async () => {
    const w = await openSelect({ type: 'menu', items: menuItems })
    const panel = document.body.querySelector('.dropdown-panel')!
    expect(panel.getAttribute('role')).toBe('menu')
    const items = panel.querySelectorAll('[role="menuitem"]')
    expect(items.length, 'role="menu" 里没有 menuitem → 读屏说"菜单"却读不到内容').toBe(menuItems.length)
    expect(tabbables().length).toBe(0)
    w.unmount()
  })
})
