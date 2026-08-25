// 修复锁定：Select 下拉面板 aria-controls 必须指向真实存在的唯一面板 id
// 背景：原实现 aria-controls 与面板 id 均硬编码为 'select-dropdown-list'，
// 同页多个 Select 时 id 重复 → aria 关联错乱（审计 P0 级 a11y 问题）
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Select from '@/components/form/Select.vue'

const options = [
  { label: '北京', value: 'bj' },
  { label: '上海', value: 'sh' },
]

function mountSelect(props: Record<string, unknown> = {}) {
  return mount(Select, {
    props: { modelValue: '', type: 'select', options, ...props },
    // Teleport 内容内联渲染，便于断言面板 DOM
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

describe('Select · 下拉面板 aria-controls 唯一 id', () => {
  it('打开面板：aria-controls 指向面板真实 id，且 id 非空', async () => {
    const w = mountSelect({ label: '城市' })
    const input = w.find('input.trigger-input')
    await input.trigger('click')
    await w.vm.$nextTick()

    const panel = w.find('.dropdown-panel')
    expect(panel.exists()).toBe(true)
    const panelId = panel.attributes('id')
    expect(panelId).toBeTruthy()
    expect(input.attributes('aria-controls')).toBe(panelId)
  })

  it('同页两个 Select（同一应用根）：面板 id 互不相同，各自 aria-controls 指向各自面板', async () => {
    // useId 在独立 mount() 的应用根各自从 v-1 计数，须用同一应用根模拟真实同页场景
    const Wrapper = {
      components: { Select },
      data: () => ({ v1: '', v2: '', options }),
      template: `
        <div>
          <Select v-model="v1" label="城市A" :options="options" />
          <Select v-model="v2" label="城市B" :options="options" />
        </div>
      `,
    }
    const w = mount(Wrapper, { global: { stubs: { teleport: true } }, attachTo: document.body })

    const inputs = w.findAll('input.trigger-input')
    expect(inputs.length).toBe(2)
    await inputs[0].trigger('click')
    await w.vm.$nextTick()
    await inputs[1].trigger('click')
    await w.vm.$nextTick()

    const panels = w.findAll('.dropdown-panel')
    expect(panels.length).toBe(2)
    const id1 = panels[0].attributes('id')
    const id2 = panels[1].attributes('id')
    // 两个 id 均非空且互不相同
    expect(id1).toBeTruthy()
    expect(id2).toBeTruthy()
    expect(id1).not.toBe(id2)
    // 各自 aria-controls 与各自面板对应（不串指）
    expect(inputs[0].attributes('aria-controls')).toBe(id1)
    expect(inputs[1].attributes('aria-controls')).toBe(id2)
  })
})
