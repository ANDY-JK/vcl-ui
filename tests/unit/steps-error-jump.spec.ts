// steps 跨步骤错误定位 · 行为锁定（真实使用审查余项 ⑤）
// 场景：分步表单在最后一步提交，若校验错误在前面步骤（如联动产生的必填），此前只能逐页找。
// 修复后：提交失败自动跳到首个错误字段所在步骤，错误字段就地可见。
import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import FormBuilder from '@/components/form-builder/FormBuilder.vue'
import type { FormSchema } from '@/components/form-builder/types'

const schema: FormSchema = {
  meta: { title: '' },
  layout: 'steps',
  steps: [
    { title: '第一步', fields: ['r'] },
    { title: '第二步', fields: ['b'] },
  ],
  fields: [
    { key: 'r', label: '必填项', type: 'text', required: true },
    { key: 'b', label: '任意项', type: 'text' },
  ],
}

function mountSteps(modelValue: Record<string, unknown> = {}) {
  return mount(FormBuilder, {
    props: { schema, modelValue },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

describe('steps 布局 · 提交失败跳转到错误步骤', () => {
  it('初始渲染第一步字段', async () => {
    const w = mountSteps()
    await nextTick()
    // 第一步的 r 字段在 DOM，第二步的 b 不在
    expect(w.findAll('.fb-field input').length).toBe(1)
    w.unmount()
  })

  it('填完第一步推进到第二步后提交失败 → 自动跳回第一步并显示错误', async () => {
    const w = mountSteps({ r: '已填' })
    await nextTick()
    // 推进到第二步
    const nextBtn = w.findAll('button').find((b) => b.text().includes('下一步'))
    await nextBtn!.trigger('click')
    await nextTick()
    // 此刻 r 已不在 DOM（当前步骤=1）
    const atStep2 = w.findAll('.fb-field input').length
    // 模拟联动/外部改值使 r 变空（父组件 modelValue 回写）
    await w.setProps({ modelValue: { r: '' } })
    await nextTick()
    // 提交（在第二步）
    await w.find('form.fb-form').trigger('submit')
    await flushPromises()
    await nextTick()
    // 自动跳回第一步：r 字段重新可见且带错误提示
    const inputs = w.findAll('.fb-field input')
    expect(inputs.length).toBe(1)
    expect(w.find('.fb-field-error').exists()).toBe(true)
    expect(atStep2).toBe(1)
    w.unmount()
  })
})
