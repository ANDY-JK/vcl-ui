// AccordionNav 即时搜索 + aria 语义行为锁定（2026-09-21 导航优化）
// 覆盖：三路匹配（文案/i18n key/路由）、分组名命中整组保留、过滤期强制展开、
//       无匹配空态、Esc/清空按钮、跳转后自动清搜索词、aria-expanded/aria-current。
import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AccordionNav from '@/components/layout/AccordionNav.vue'
import type { NavNode } from '@/components/layout/utils/navData'

const mounted: VueWrapper[] = []
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

const ITEMS: NavNode[] = [
  {
    label: '数据展示',
    icon: 'database',
    children: [
      { label: 'DataTable 数据表格', icon: 'database', route: '/data-table' },
      { label: 'Tree 树形', icon: 'list', route: '/tree' },
    ],
  },
  {
    label: '表单输入',
    icon: 'square-pen',
    children: [{ label: 'Input 输入', icon: 'square-pen', route: '/input' }],
  },
]

function mountNav(props: Record<string, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: {} },
      { path: '/data-table', component: {} },
      { path: '/tree', component: {} },
      { path: '/input', component: {} },
    ],
  })
  const w = mount(AccordionNav, {
    props: { items: ITEMS, ...props },
    global: { plugins: [router] },
    attachTo: document.body,
  })
  mounted.push(w)
  return { w, router }
}

/** 当前可见的导航按钮文案（分组按钮 + 叶子按钮，折叠隐藏的也算可见性由 v-show 管） */
function visibleLabels(w: VueWrapper): string[] {
  return w.findAll('button').map((b) => b.text().trim())
}

describe('AccordionNav · 即时搜索', () => {
  it('默认渲染全部分组标题；无活跃路由时分组收起（叶子不渲染）', () => {
    const { w } = mountNav()
    expect(w.find('.nav-search').exists()).toBe(true)
    expect(w.find('.nav-empty').exists()).toBe(false)
    const labels = visibleLabels(w)
    expect(labels).toEqual(['数据展示▾', '表单输入▾'])
    // 收起分组的叶子不在 DOM 里（NavItem 按 expanded 条件渲染子孙）
    expect(labels).not.toContain('Tree 树形')
  })

  it('输入关键词：只留命中叶子及其所在分组，其它分组消失', async () => {
    const { w } = mountNav()
    await w.find('.nav-search-input').setValue('树形')
    const labels = visibleLabels(w)
    expect(labels).toContain('Tree 树形')
    expect(labels).toContain('数据展示▾')
    expect(labels).not.toContain('Input 输入')
    expect(labels).not.toContain('表单输入▾')
  })

  it('分组名命中：整组保留（所有子孙都显示）', async () => {
    const { w } = mountNav()
    await w.find('.nav-search-input').setValue('表单')
    const labels = visibleLabels(w)
    expect(labels).toContain('表单输入▾')
    expect(labels).toContain('Input 输入')
    expect(labels).not.toContain('Tree 树形')
  })

  it('路由路径也可命中（输入 /tree）', async () => {
    const { w } = mountNav()
    await w.find('.nav-search-input').setValue('/tree')
    expect(visibleLabels(w)).toContain('Tree 树形')
  })

  it('无匹配：显示搜索空态文案（不是普通空态）', async () => {
    const { w } = mountNav()
    await w.find('.nav-search-input').setValue('不存在的条目')
    expect(w.find('.nav-empty').exists()).toBe(true)
    expect(w.find('.nav-empty').text()).toBe('无匹配的导航项')
  })

  it('过滤期命中分组强制展开，无需手点分组', async () => {
    const { w } = mountNav()
    // 初始（路由 /）：没有任何分组活跃 → 全部收起
    expect(w.find('.nav-level.is-group.expanded').exists()).toBe(false)
    await w.find('.nav-search-input').setValue('树形')
    const groupBtn = w.findAll('button').find((b) => b.text().includes('数据展示'))!
    expect(groupBtn.classes()).toContain('expanded')
    expect(groupBtn.attributes('aria-expanded')).toBe('true')
  })

  it('Esc 清空搜索词，恢复分组标题全量', async () => {
    const { w } = mountNav()
    const input = w.find('.nav-search-input')
    await input.setValue('树形')
    expect(visibleLabels(w)).not.toContain('表单输入▾')
    await input.trigger('keydown', { key: 'Escape' })
    expect((input.element as HTMLInputElement).value).toBe('')
    // 恢复后两个分组标题都在；命中过的叶子随所在分组重新收起
    const labels = visibleLabels(w)
    expect(labels).toEqual(['数据展示▾', '表单输入▾'])
  })

  it('清空按钮存在且可点（有搜索词时才出现）', async () => {
    const { w } = mountNav()
    expect(w.find('.nav-search-clear').exists()).toBe(false)
    await w.find('.nav-search-input').setValue('树形')
    const clearBtn = w.find('.nav-search-clear')
    expect(clearBtn.exists()).toBe(true)
    expect(clearBtn.attributes('aria-label')).toBe('清空搜索')
    await clearBtn.trigger('click')
    expect((w.find('.nav-search-input').element as HTMLInputElement).value).toBe('')
  })

  it('跳转后自动清掉搜索词（不停留在过滤态）', async () => {
    const { w, router } = mountNav()
    await router.push('/tree')
    await w.find('.nav-search-input').setValue('输入')
    await w.find('.nav-search-input').trigger('keydown', { key: 'Escape' })
    // 直接推另一个路由，模拟点击命中叶子后的跳转
    await router.push('/input')
    await w.vm.$nextTick()
    expect((w.find('.nav-search-input').element as HTMLInputElement).value).toBe('')
  })

  it('折叠态不渲染搜索框', () => {
    const { w } = mountNav({ collapsed: true })
    expect(w.find('.nav-search').exists()).toBe(false)
  })
})

describe('AccordionNav · aria 语义', () => {
  it('分组按钮带 aria-expanded，随展开/折叠变化', async () => {
    const { w } = mountNav()
    const groupBtn = w.findAll('button').find((b) => b.text().includes('数据展示'))!
    expect(groupBtn.attributes('aria-expanded')).toBe('false')
    await groupBtn.trigger('click')
    expect(groupBtn.attributes('aria-expanded')).toBe('true')
    await groupBtn.trigger('click')
    expect(groupBtn.attributes('aria-expanded')).toBe('false')
  })

  it('活跃叶子带 aria-current="page"，非活跃不带', async () => {
    const { w, router } = mountNav()
    await router.push('/tree')
    await w.vm.$nextTick()
    const leaves = w.findAll('button').filter((b) => !b.classes().includes('is-group'))
    const active = leaves.find((b) => b.text().includes('Tree'))!
    const idle = leaves.find((b) => b.text().includes('DataTable'))!
    expect(active.attributes('aria-current')).toBe('page')
    expect(idle.attributes('aria-current')).toBeUndefined()
  })
})
