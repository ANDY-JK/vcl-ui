// Tabs + TabPanel 配对护栏：
//   1. 面板注册后对应 tab 才发 aria-controls（指向真实 id，不悬空）；lazy 未激活不注册
//   2. 面板 id / aria-labelledby 与 tab id 同源互指
//   3. 激活切换：hidden 属性同步
//   4. lazy：未激活前不渲染，激活后切走保留 DOM（keepAlive）
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Tabs from '@/components/nav/Tabs.vue'
import TabPanel from '@/components/nav/TabPanel.vue'

const items = [
  { label: 'A', value: 'a' },
  { label: 'B', value: 'b' },
]

function mountPair() {
  return mount({
    components: { Tabs, TabPanel },
    data: () => ({ active: 'a', items }),
    template: `
      <div>
        <Tabs v-model="active" :items="items" />
        <TabPanel value="a">面板A</TabPanel>
        <TabPanel value="b" lazy>面板B</TabPanel>
      </div>
    `,
  })
}

describe('Tabs + TabPanel', () => {
  it('面板注册后 tab 才有 aria-controls，且指向真实面板 id；lazy 未激活不注册', async () => {
    const w = mountPair()
    await nextTick() // 注册发生在 TabPanel onMounted，Tabs 重渲染是异步 patch
    const tabA = w.findAll('[role="tab"]')[0]!
    const tabB = w.findAll('[role="tab"]')[1]!
    // A 面板已挂载注册 → tab A 有 controls 且指向真实元素
    const controlsA = tabA.attributes('aria-controls')!
    expect(controlsA).toMatch(/^tabpanel-/)
    const panelA = w.find(`#${controlsA}`)
    expect(panelA.exists()).toBe(true)
    // id / aria-labelledby 与 tab 互指
    expect(panelA.attributes('aria-labelledby')).toBe(tabA.attributes('id'))
    // B 是 lazy 面板：未激活未渲染未注册 → tab B 无 controls（不悬空）
    expect(tabB.attributes('aria-controls')).toBeUndefined()
  })

  it('激活切换：激活面板无 hidden，非激活面板带 hidden', async () => {
    const w = mountPair()
    await nextTick()
    let panels = w.findAll('[role="tabpanel"]')
    // B lazy 未激活：DOM 不存在（而非 hidden）
    expect(panels.length).toBe(1)
    expect(panels[0]!.attributes('hidden')).toBeUndefined()
    await w.findAll('[role="tab"]')[1]!.trigger('click')
    await nextTick()
    panels = w.findAll('[role="tabpanel"]')
    expect(panels.length).toBe(2)
    expect(panels[0]!.attributes('hidden')).toBeDefined()
    expect(panels[1]!.attributes('hidden')).toBeUndefined()
  })

  it('lazy 面板未激活不渲染内容，激活后切走保留 DOM（keepAlive）', async () => {
    const w = mountPair()
    await nextTick()
    expect(w.text()).not.toContain('面板B')
    await w.findAll('[role="tab"]')[1]!.trigger('click')
    await nextTick()
    expect(w.text()).toContain('面板B')
    await w.findAll('[role="tab"]')[0]!.trigger('click')
    await nextTick()
    const panels = w.findAll('[role="tabpanel"]')
    expect(panels.length).toBe(2)
    expect(panels[1]!.attributes('hidden')).toBeDefined()
  })

  it('TabPanel 单独使用（未配对 Tabs）不隐藏内容', () => {
    const w = mount(TabPanel, {
      props: { value: 'a' },
      slots: { default: '孤儿面板' },
    })
    expect(w.text()).toContain('孤儿面板')
    expect(w.find('[role="tabpanel"]').attributes('hidden')).toBeUndefined()
  })
})
