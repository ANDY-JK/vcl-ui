// Select 挂载级交互行为锁定：开关/单选/多选/搜索/键盘/combobox
// 背景：审计发现 Select（8 模式 1419 行）挂载级仅 1 个标签关联测试，交互回归风险全库最高
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Select from '@/components/form/Select.vue'
import { setLocale } from '@/components/_internal/i18n'

const options = [
  { label: '北京', value: 'bj' },
  { label: '上海', value: 'sh' },
  { label: '广州', value: 'gz' },
  { label: '深圳', value: 'sz' },
]

function mountSelect(props: Record<string, unknown> = {}) {
  return mount(Select, {
    props: { modelValue: '', type: 'select', options, ...props },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

describe('Select · 开关', () => {
  it('点击触发器打开面板；打开状态再点不关闭（防输入中误收起），Escape 收起', async () => {
    const w = mountSelect()
    const input = w.find('input.trigger-input')
    expect(w.find('.dropdown-panel').exists()).toBe(false)
    await input.trigger('click')
    expect(w.find('.dropdown-panel').exists()).toBe(true)
    await input.trigger('click')
    expect(w.find('.dropdown-panel').exists()).toBe(true)
    await input.trigger('keydown', { key: 'Escape' })
    expect(w.find('.dropdown-panel').exists()).toBe(false)
  })

  it('disabled 时点击不打开', async () => {
    const w = mountSelect({ disabled: true })
    await w.find('input.trigger-input').trigger('click')
    expect(w.find('.dropdown-panel').exists()).toBe(false)
  })
})

describe('Select · 单选与多选', () => {
  it('点击选项 → update:modelValue 单选值并关闭面板', async () => {
    const w = mountSelect({ label: '城市' })
    await w.find('input.trigger-input').trigger('click')
    const items = w.findAll('.panel-item')
    await items[1].trigger('click') // 上海
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toBe('sh')
    expect(w.find('.dropdown-panel').exists()).toBe(false)
  })

  it('multiple 模式：点击选项 toggle 进数组，再次点击移除（v-model 受控）', async () => {
    const Wrapper = {
      components: { Select },
      data: () => ({ val: [] as (string | number | boolean)[] }),
      template: `<Select v-model="val" type="select" :options="options" multiple />`,
      computed: { options: () => options },
    }
    const w = mount(Wrapper, { global: { stubs: { teleport: true } }, attachTo: document.body })
    const vm = w.vm as unknown as { val: (string | number | boolean)[] }

    await w.find('input.trigger-input').trigger('click')
    await w.findAll('.panel-item')[0].trigger('click')
    await w.findAll('.panel-item')[1].trigger('click')
    expect(vm.val).toEqual(['bj', 'sh'])
    // 再点第一个 → 移除 bj
    await w.findAll('.panel-item')[0].trigger('click')
    expect(vm.val).toEqual(['sh'])
  })

  it('disabled 选项点击不触发', async () => {
    const opts = [
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b', disabled: true },
    ]
    const w = mountSelect({ options: opts })
    await w.find('input.trigger-input').trigger('click')
    await w.findAll('.panel-item')[1].trigger('click')
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })
})

describe('Select · 搜索过滤', () => {
  // 统一格式后 select 无面板内搜索框：trigger 输入即过滤（与 combobox 同一交互）
  // 搜索关键词有 200ms debounce（防 1000+ 选项卡顿），断言前需等待
  const waitSearch = () => new Promise((r) => setTimeout(r, 260))

  it('trigger 输入关键词过滤选项（label 匹配）', async () => {
    const w = mountSelect()
    const input = w.find('input.trigger-input')
    await input.trigger('click')
    await input.setValue('上')
    await waitSearch()
    const labels = w.findAll('.panel-item .item-label').map((n) => n.text())
    expect(labels).toEqual(['上海'])
  })

  it('搜索无匹配 → 显示空状态（提示可直接输入采用）', async () => {
    const w = mountSelect()
    const input = w.find('input.trigger-input')
    await input.trigger('click')
    await input.setValue('不存在的城市')
    await waitSearch()
    expect(w.find('.panel-status').exists()).toBe(true)
    expect(w.find('.panel-status').text()).toContain('不存在的城市')
  })
})

describe('Select · 键盘导航', () => {
  it('ArrowDown 高亮 + Enter 选择', async () => {
    const w = mountSelect()
    const input = w.find('input.trigger-input')
    await input.trigger('keydown', { key: 'ArrowDown' }) // 打开
    await input.trigger('keydown', { key: 'ArrowDown' }) // 高亮第 1 项
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')![0][0]).toBe('bj')
  })

  it('Escape 关闭面板', async () => {
    const w = mountSelect()
    const input = w.find('input.trigger-input')
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(w.find('.dropdown-panel').exists()).toBe(true)
    await input.trigger('keydown', { key: 'Escape' })
    expect(w.find('.dropdown-panel').exists()).toBe(false)
  })
})

describe('Select · combobox 自由输入', () => {
  it('allowCreate：输入新值 + Enter 提交自定义值', async () => {
    const w = mountSelect({ type: 'combobox', allowCreate: true, options: [] })
    const input = w.find('input.trigger-input')
    await input.trigger('click')
    await input.setValue('自定义城市')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')).toBeTruthy()
    expect(w.emitted('update:modelValue')![0][0]).toBe('自定义城市')
  })
})

describe('Select · 清除与校验', () => {
  it('clearable：清除按钮 → update:modelValue null（清空哨兵已统一为 null）', async () => {
    const w = mountSelect({ clearable: true, modelValue: 'bj' })
    await w.find('.select-clear').trigger('click')
    expect(w.emitted('update:modelValue')![0][0]).toBe(null)
  })

  it('rules 校验：blur 时触发校验并显示错误', async () => {
    const w = mountSelect({
      label: '城市',
      rules: [(v: string) => (v ? undefined : '请选择城市')],
    })
    const input = w.find('input.trigger-input')
    await input.trigger('click')
    // 打开即 blur（点击外部逻辑被防抖跳过），手动触发 blur
    await input.trigger('blur')
    expect(w.find('.select-error').text()).toContain('请选择城市')
  })

  it('error prop 直接显示外部错误', () => {
    const w = mountSelect({ error: '服务端校验失败' })
    expect(w.find('.select-error').text()).toBe('服务端校验失败')
  })
})

describe('Select · i18n 默认文案', () => {
  it('placeholder 默认用 t(form.placeholder) 语义（未传时显示请选择）', async () => {
    setLocale('zh-CN')
    const w = mountSelect()
    const input = w.find('input.trigger-input')
    expect(input.attributes('placeholder')).toBe('请选择')
    setLocale('zh-CN')
  })
})
/* ════════════════════════════════════════
 * 输入法合成期（#276）：中文上屏不能被当成"确认选中"
 * ════════════════════════════════════════ */
describe('IME 合成期', () => {
  it('**合成中按 Enter → 不提交、不阻止上屏**（否则拼音被当成选项）', async () => {
    const w = mount(Select, {
      props: { modelValue: '', options: [...options], allowCreate: true, filterable: true },
      attachTo: document.body,
    })
    try {
      await nextTick()
      const input = w.find('input')
      await input.trigger('focus')
      await input.setValue('bei')
      await nextTick()
      const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true })
      input.element.dispatchEvent(e)
      await nextTick()
      expect(e.defaultPrevented, '合成期必须放行上屏').toBe(false)
      expect((w.props('modelValue') as string) || '', '不能把拼音提交成值').not.toBe('beijing')
    } finally {
      w.unmount()
    }
  })

  it('合成结束后按 Enter 正常确认（守卫不能堵死正常路径）', async () => {
    const w = mount(Select, {
      props: { modelValue: '', options: [...options], allowCreate: true, filterable: true },
      attachTo: document.body,
    })
    try {
      await nextTick()
      const input = w.find('input')
      await input.trigger('focus')
      await input.setValue('北京')
      await nextTick()
      const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      input.element.dispatchEvent(e)
      await nextTick()
      expect(w.emitted('update:modelValue'), '正常 Enter 应确认选中').toBeTruthy()
    } finally {
      w.unmount()
    }
  })
})
/* ════════════════════════════════════════
 * 清空按钮不得突破禁用（#286）
 *
 * 探针实测：disabled 的 Select 上 `.select-clear` 仍渲染，点击后真的 emit `update:modelValue: null`。
 * ════════════════════════════════════════ */
describe('清空按钮：禁用语义', () => {
  it('**disabled：不渲染清空按钮**', async () => {
    const w = mount(Select, {
      props: { modelValue: 'bj', options: [...options], clearable: true, disabled: true },
      attachTo: document.body,
    })
    try {
      await nextTick()
      expect(w.find('.select-clear').exists(), '禁用态不该有清空入口').toBe(false)
    } finally {
      w.unmount()
    }
  })

  it('**正常路径不受影响**：可清空且 emit null', async () => {
    const w = mount(Select, {
      props: { modelValue: 'bj', options: [...options], clearable: true },
      attachTo: document.body,
    })
    try {
      await nextTick()
      const btn = w.find('.select-clear')
      expect(btn.exists()).toBe(true)
      await btn.trigger('click')
      await nextTick()
      expect(w.emitted('update:modelValue')).toEqual([[null]])
      expect(w.emitted('change')).toEqual([[null]])
    } finally {
      w.unmount()
    }
  })
})
/* ════════════════════════════════════════
 * 第二条清空路径：tag 上的 ×（#287）
 *
 * #286 只守了 `.select-clear`，而多选的 tag 上还有一个 × —— 同样能把值删掉。
 * 探针实测：disabled 下点 .tag-close 会 emit ['sh']（值被真删）。
 * ════════════════════════════════════════ */
describe('tag 删除按钮：禁用语义', () => {
  const multiOptions = [
    { label: '北京', value: 'bj' },
    { label: '上海', value: 'sh' },
  ]

  it('**disabled：不渲染 tag 上的 ×**', async () => {
    const w = mount(Select, {
      props: { modelValue: ['bj', 'sh'], options: multiOptions, multiple: true, disabled: true },
      attachTo: document.body,
    })
    try {
      await nextTick()
      expect(w.find('.tag-close').exists(), '禁用态不该有删除入口').toBe(false)
    } finally {
      w.unmount()
    }
  })

  it('正常路径不受影响：可删一项且 emit 剩余值', async () => {
    const w = mount(Select, {
      props: { modelValue: ['bj', 'sh'], options: multiOptions, multiple: true },
      attachTo: document.body,
    })
    try {
      await nextTick()
      const btn = w.find('.tag-close')
      expect(btn.exists()).toBe(true)
      await btn.trigger('click')
      await nextTick()
      expect(w.emitted('update:modelValue')).toEqual([[['sh']]])
    } finally {
      w.unmount()
    }
  })
})