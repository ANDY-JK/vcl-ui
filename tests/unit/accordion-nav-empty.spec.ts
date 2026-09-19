// C14 护栏：AccordionNav 不再把库内置演示导航树 navTree 当默认数据。
// 背景：下游不传 items 时，侧栏会渲染一整套指向宿主不存在路由的死链菜单；
// 现在无 items（或空数组）时渲染空态，navTree 仍作为公开示例数据导出。
import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AccordionNav from '@/components/layout/AccordionNav.vue'
import { navTree, type NavNode } from '@/components/layout/utils/navData'

const mounted: VueWrapper[] = []
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

function mountNav(props: Record<string, unknown> = {}): VueWrapper {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: {} },
      { path: '/a', component: {} },
    ],
  })
  const w = mount(AccordionNav, { props, global: { plugins: [router] }, attachTo: document.body })
  mounted.push(w)
  return w
}

describe('AccordionNav · 去 navTree 兜底', () => {
  it('不传 items 时渲染空态，不渲染任何演示导航项', () => {
    const w = mountNav()
    expect(w.find('.nav-empty').exists()).toBe(true)
    expect(w.findAll('.nav-leaf-root').length).toBe(0)
    expect(w.findAll('.nav-level').length).toBe(0)
  })

  it('显式传空数组同样走空态（不被 navTree 顶替）', () => {
    const w = mountNav({ items: [] })
    expect(w.find('.nav-empty').exists()).toBe(true)
    expect(w.findAll('.nav-level').length).toBe(0)
  })

  it('传入 items 时正常渲染', () => {
    const items: NavNode[] = [{ label: 'grp', icon: 'square', children: [{ label: 'leaf', route: '/a' }] }]
    const w = mountNav({ items })
    expect(w.find('.nav-empty').exists()).toBe(false)
    expect(w.findAll('.nav-level').length).toBeGreaterThan(0)
  })

  it('navTree 仍作为公开示例数据导出', () => {
    expect(Array.isArray(navTree)).toBe(true)
    expect(navTree.length).toBeGreaterThan(0)
  })
})
