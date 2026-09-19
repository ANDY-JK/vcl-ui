// 前缀图标 + 后缀文字行为锁定：DesignerNode → toFormSchema 透传 → Input 渲染
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { toFormSchema } from '@/components/form-builder/designer/types'
import Input from '@/components/form/Input.vue'
import type { DesignerNode } from '@/components/form-builder/designer/types'

describe('toFormSchema · 前缀图标/后缀文字透传', () => {
  it('icon → field.props.icon；suffixText → field.props.suffix', () => {
    const node: DesignerNode = {
      id: 'n1',
      type: 'text',
      label: '金额',
      key: 'amount',
      icon: 'yen',
      suffixText: '元',
    }
    const schema = toFormSchema([node])
    const f = schema.fields.find((x) => x.key === 'amount')!
    expect(f.props?.icon).toBe('yen')
    expect(f.props?.suffix).toBe('元')
  })

  it('未配置时 props 不含 icon/suffix', () => {
    const node: DesignerNode = { id: 'n2', type: 'text', label: '姓名', key: 'name' }
    const schema = toFormSchema([node])
    const f = schema.fields.find((x) => x.key === 'name')!
    expect(f.props?.icon).toBeUndefined()
    expect(f.props?.suffix).toBeUndefined()
  })
})

describe('Input · 后缀文字渲染', () => {
  it('suffix 渲染为输入框内右侧固定文字', () => {
    const w = mount(Input, {
      props: { modelValue: '', label: '金额', suffix: '元' },
    })
    const suffix = w.find('.fl-suffix')
    expect(suffix.exists()).toBe(true)
    expect(suffix.text()).toBe('元')
  })

  it('未传 suffix 时不渲染后缀元素', () => {
    const w = mount(Input, { props: { modelValue: '', label: '姓名' } })
    expect(w.find('.fl-suffix').exists()).toBe(false)
  })
})
