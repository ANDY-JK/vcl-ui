// 统一格式锁定：下拉组件单选/多选、select/combobox 三能力一致
// 规则（用户明确要求）：① 已选值 tag 展示（单选 1 个/多选 N 个格式相同）
// ② trigger 可直接输入（allowCreate 自定义值）③ 选中内容后再开下拉仍展示全部选项
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Select from '@/components/form/Select.vue'

const options = [
  { label: '北京', value: 'bj' },
  { label: '上海', value: 'sh' },
  { label: '广州', value: 'gz' },
]

function mountSelect(props: Record<string, unknown> = {}) {
  return mount(Select, {
    props: { type: 'select', options, ...props },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

describe('Select · 统一格式：tag 展示', () => {
  it('select 多选：选中值渲染为 tag（不再是逗号拼接文本）', () => {
    const w = mountSelect({ multiple: true, modelValue: ['bj', 'sh'] })
    const tags = w.findAll('.combobox-tag')
    expect(tags.length).toBe(2)
    expect(tags[0].text()).toContain('北京')
    expect(tags[1].text()).toContain('上海')
  })

  it('select 单选：选中值渲染为 1 个 tag，格式与多选一致', () => {
    const w = mountSelect({ modelValue: 'bj' })
    const tags = w.findAll('.combobox-tag')
    expect(tags.length).toBe(1)
    expect(tags[0].text()).toContain('北京')
  })

  it('combobox 单选：选中值同样渲染为 tag（与 combobox 多选一致）', () => {
    const w = mountSelect({ type: 'combobox', modelValue: 'sh' })
    const tags = w.findAll('.combobox-tag')
    expect(tags.length).toBe(1)
    expect(tags[0].text()).toContain('上海')
  })

  it('select 单选：点击选项后 input 清空、值由 tag 展示', async () => {
    const w = mountSelect({ modelValue: '' })
    await w.find('input.trigger-input').trigger('click')
    await w.vm.$nextTick()
    await w.find('.panel-item').trigger('click')
    expect(w.emitted('update:modelValue')![0][0]).toBe('bj')
  })

  it('tag × 移除：单选 emit 标量空串，多选 emit 剩余数组', async () => {
    const single = mountSelect({ modelValue: 'bj' })
    await single.find('.tag-close').trigger('click')
    expect(single.emitted('update:modelValue')![0][0]).toBe('')

    const multi = mountSelect({ multiple: true, modelValue: ['bj', 'sh'] })
    await multi.findAll('.tag-close')[0].trigger('click')
    expect(multi.emitted('update:modelValue')![0][0]).toEqual(['sh'])
  })
})

describe('Select · 面板互斥收起（stopPropagation 拦截回归锁）', () => {
  // 背景：触发 input 带 @click.stop，useClickOutside 若在冒泡阶段监听 document，
  // 点击另一个下拉时事件半路被拦 → 已打开的面板收不起来（多选面板常开时必现）
  const TwoSelects = {
    components: { Select },
    data: () => ({ v1: [] as (string | number | boolean)[], v2: '', options }),
    template: `
      <div>
        <Select v-model="v1" type="select" :options="options" multiple data-idx="first" />
        <Select v-model="v2" type="select" :options="options" data-idx="second" />
      </div>
    `,
  }

  async function mountTwo() {
    const w = mount(TwoSelects, { global: { stubs: { teleport: true } }, attachTo: document.body })
    await w.findAll('input.trigger-input')[0].trigger('click')
    await w.vm.$nextTick()
    return w
  }

  it('多选面板开着 → 点击另一个下拉的 trigger，第一个面板关闭', async () => {
    const w = await mountTwo()
    await w.findAll('.panel-item')[0].trigger('click') // 多选选中，面板保持打开
    expect(w.findAll('.dropdown-panel').length).toBe(1)
    await new Promise((r) => setTimeout(r, 170)) // 越过 openedAt 150ms 开启防抖（真实用户点选后早已超过）
    await w.findAll('input.trigger-input')[1].trigger('click') // 带 @click.stop
    await w.vm.$nextTick()
    expect(w.findAll('.dropdown-panel').length).toBe(1) // 只剩第二个的面板
    w.unmount()
  })

  it('单选面板开着（未选中）→ 点击另一个下拉的 trigger，同样关闭', async () => {
    const w = await mountTwo()
    expect(w.findAll('.dropdown-panel').length).toBe(1)
    await new Promise((r) => setTimeout(r, 170))
    await w.findAll('input.trigger-input')[1].trigger('click')
    await w.vm.$nextTick()
    expect(w.findAll('.dropdown-panel').length).toBe(1)
    w.unmount()
  })

  it('多选面板开着 → 焦点真离开（blur 到外部）→ 面板收起', async () => {
    const w = await mountTwo()
    await w.findAll('.panel-item')[0].trigger('click')
    expect(w.findAll('.dropdown-panel').length).toBe(1)
    // 模拟 Tab/点击外部输入框：原生 blur 使 activeElement 离开触发器
    ;(w.findAll('input.trigger-input')[0].element as HTMLInputElement).blur()
    await new Promise((r) => setTimeout(r, 220)) // blur 定时器 150ms
    expect(w.findAll('.dropdown-panel').length).toBe(0)
    w.unmount()
  })
})

describe('Select · 统一格式：直接输入', () => {
  it('select 单选：输入自定义文本 + Enter → 直接采用该值（allowCreate 默认开）', async () => {
    const w = mountSelect({ modelValue: '' })
    const input = w.find('input.trigger-input')
    await input.trigger('click')
    await input.setValue('自定义值')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')![0][0]).toBe('自定义值')
  })

  it('select 单选：输入命中选项 label + Enter → 取选项 value', async () => {
    const w = mountSelect({ modelValue: '' })
    const input = w.find('input.trigger-input')
    await input.trigger('click')
    await input.setValue('上海')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')![0][0]).toBe('sh')
  })

  it('select 多选：输入 + Enter → 追加一个值，与 combobox 多选一致', async () => {
    const w = mountSelect({ multiple: true, modelValue: ['bj'] })
    const input = w.find('input.trigger-input')
    await input.trigger('click')
    await input.setValue('广州')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')![0][0]).toEqual(['bj', 'gz'])
  })
})

describe('Select · 统一格式：选中后下拉仍展示全部', () => {
  it('select 单选已有值：打开面板列出全部选项，且选中项高亮', async () => {
    const w = mountSelect({ modelValue: 'sh' })
    await w.find('input.trigger-input').trigger('click')
    await w.vm.$nextTick()
    const items = w.findAll('.panel-item')
    expect(items.length).toBe(3)
    expect(items[1].classes()).toContain('selected')
  })

  it('select 多选已有值：打开面板列出全部选项（不因已选而过滤）', async () => {
    const w = mountSelect({ multiple: true, modelValue: ['bj', 'sh'] })
    await w.find('input.trigger-input').trigger('click')
    await w.vm.$nextTick()
    expect(w.findAll('.panel-item').length).toBe(3)
  })

  it('combobox 单选已有值：打开面板同样列出全部选项', async () => {
    const w = mountSelect({ type: 'combobox', modelValue: 'bj' })
    await w.find('input.trigger-input').trigger('click')
    await w.vm.$nextTick()
    expect(w.findAll('.panel-item').length).toBe(3)
  })

  it('select 输入后可过滤，清空输入恢复全量', async () => {
    const w = mountSelect({ modelValue: '' })
    const input = w.find('input.trigger-input')
    await input.trigger('click')
    await input.setValue('上海')
    await new Promise((r) => setTimeout(r, 250)) // 过滤有 200ms 防抖
    await w.vm.$nextTick()
    expect(w.findAll('.panel-item').length).toBe(1)
    await input.setValue('')
    await w.vm.$nextTick()
    expect(w.findAll('.panel-item').length).toBe(3)
  })
})
