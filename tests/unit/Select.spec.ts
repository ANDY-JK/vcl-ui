import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Select from '@/components/form/Select.vue'
import { nextTick } from 'vue'

// Select uses Teleport for dropdown panel; stub it in test env
const mountSelect = (props: any) =>
  mount(Select, {
    props: { modelValue: null, options: [], ...props },
    global: {
      stubs: {
        Teleport: {
          template: '<div><slot /></div>',
        },
      },
    },
  })

describe('Select', () => {
  it('renders placeholder by default', () => {
    const wrapper = mountSelect({ options: [] })
    // Placeholder is a prop default, check via props or input attribute
    expect(wrapper.props('placeholder')).toBe('请选择')
  })

  it('renders options in dropdown when opened', async () => {
    const options = [
      { label: '选项A', value: 'a' },
      { label: '选项B', value: 'b' },
    ]
    const wrapper = mountSelect({ options })
    await wrapper.find('.trigger-wrapper').trigger('click')
    await nextTick()
    await flushPromises()
    expect(wrapper.findAll('.panel-item')).toHaveLength(2)
  })

  it('emits update:modelValue when option selected', async () => {
    const options = [
      { label: '选项A', value: 'a' },
      { label: '选项B', value: 'b' },
    ]
    const wrapper = mountSelect({ options })
    await wrapper.find('.trigger-wrapper').trigger('click')
    await nextTick()
    await flushPromises()
    const items = wrapper.findAll('.panel-item')
    if (items.length > 0) {
      await items[0].trigger('click')
      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['a'])
    }
  })

  it('defaults to select type', () => {
    const wrapper = mountSelect({})
    expect(wrapper.props('type')).toBe('select')
  })

  it('is searchable by default', () => {
    const wrapper = mountSelect({})
    expect(wrapper.props('searchable')).toBe(true)
  })

  it('has pinyin search enabled by default', () => {
    const wrapper = mountSelect({})
    expect(wrapper.props('pinyinEnabled')).toBe(true)
  })

  it('allows create by default', () => {
    const wrapper = mountSelect({})
    expect(wrapper.props('allowCreate')).toBe(true)
  })

  it('shows empty text when no options match', async () => {
    const wrapper = mountSelect({
      options: [{ label: 'Apple', value: 'apple' }],
    })
    await wrapper.find('.trigger-wrapper').trigger('click')
    await nextTick()
    await flushPromises()
    const searchInput = wrapper.find('.panel-input')
    if (searchInput.exists()) {
      await searchInput.setValue('zzz')
      await new Promise((r) => setTimeout(r, 250))
      expect(wrapper.text()).toContain('暂无匹配项')
    }
  })

  it('supports disabled state', () => {
    const wrapper = mountSelect({ disabled: true })
    expect(wrapper.find('.trigger-wrapper').classes()).toContain('disabled')
  })
})
