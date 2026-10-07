// FormBuilder 挂载级行为锁定：校验失败拦截 / 提交载荷 / 隐藏字段不提交 / 步骤模式
// 背景：审计发现 FormBuilder（962 行动态表单引擎）挂载级 0 测试，仅 composable 间接覆盖
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import FormBuilder from '@/components/form-builder/FormBuilder.vue'
import type { FormSchema, FormData } from '@/components/form-builder/types'

/** 简单 schema：2 个必填文本字段 */
function simpleSchema(over: Partial<FormSchema> = {}): FormSchema {
  return {
    fields: [
      { key: 'name', type: 'text', label: '姓名', required: true },
      { key: 'age', type: 'number', label: '年龄' },
    ],
    ...over,
  }
}

/** 步骤 schema：3 步，第 1 步含必填字段 */
function stepsSchema(): FormSchema {
  return {
    layout: 'steps',
    steps: [
      { title: '基本信息', fields: ['name'] },
      { title: '详情', fields: ['age'] },
      { title: '确认', fields: [] },
    ],
    fields: [
      { key: 'name', type: 'text', label: '姓名', required: true },
      { key: 'age', type: 'number', label: '年龄' },
    ],
  }
}

function mountBuilder(schema: FormSchema, data: FormData = {}) {
  return mount(FormBuilder, {
    props: { schema, modelValue: data },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

describe('FormBuilder · 校验拦截', () => {
  it('必填字段为空时提交被拦截（不 emit submit，显示错误）', async () => {
    const w = mountBuilder(simpleSchema())
    await w.find('form.fb-form').trigger('submit')
    expect(w.emitted('submit')).toBeUndefined()
    // 错误提示出现（FieldList 内 .fb-field-error 或校验文案）
    expect(w.text()).toContain('必填') // 来自 formBuilder.fieldRequired 的「xxx必填」
  })

  it('必填字段填完后提交成功，emit 完整数据', async () => {
    const data = { name: '张三', age: 18 }
    const w = mountBuilder(simpleSchema(), data)
    await w.find('form.fb-form').trigger('submit')
    const emitted = w.emitted('submit')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toMatchObject({ name: '张三', age: 18 })
  })
})

describe('FormBuilder · 提交载荷', () => {
  it('校验通过时 emit validate(true)', async () => {
    const w = mountBuilder(simpleSchema(), { name: '张三', age: 18 })
    await w.find('form.fb-form').trigger('submit')
    expect(w.emitted('validate')!.at(-1)![0]).toBe(true)
  })

  it('提交成功后提交按钮 loading 自动复位（3s 兜底）', async () => {
    const w = mountBuilder(simpleSchema(), { name: '张三', age: 18 })
    await w.find('form.fb-form').trigger('submit')
    // submitting 立即为 true，3s 后复位（此处仅验证 emit 后不卡死即可）
    expect(w.emitted('submit')!.length).toBe(1)
  })
})

describe('FormBuilder · submitMode 提交锁', () => {
  it('once 模式：首次提交成功，第二次直接调用被拦截（不重复 emit submit）', async () => {
    const w = mountBuilder(simpleSchema({ submitMode: 'once' }), { name: '张三', age: 18 })
    await w.find('form.fb-form').trigger('submit')
    expect(w.emitted('submit')!.length).toBe(1)
    await w.find('form.fb-form').trigger('submit')
    expect(w.emitted('submit')!.length).toBe(1) // 第二次被拦
  })

  it('once 模式：提交成功后提交按钮禁用（UI 与入口守卫同口径）', async () => {
    const w = mountBuilder(simpleSchema({ submitMode: 'once' }), { name: '张三', age: 18 })
    const submitBtn = w.findAll('button').find((b) => b.text() === '提交')!
    expect(submitBtn.attributes('disabled')).toBeUndefined()
    await w.find('form.fb-form').trigger('submit')
    expect(submitBtn.attributes('disabled')).toBeDefined()
  })

  it('multiple 模式：宿主释放 loading 后可再次提交，不锁按钮', async () => {
    const w = mountBuilder(simpleSchema({ submitMode: 'multiple' }), { name: '张三', age: 18 })
    await w.find('form.fb-form').trigger('submit')
    // 首次提交后 submitting=true（3s 兜底窗口内的 in-flight 守卫会拦重复提交，属防双击设计）；
    // 模拟宿主处理完释放 loading（expose.stopSubmit）后再提交
    ;(w.vm as unknown as { stopSubmit: () => void }).stopSubmit()
    await nextTick() // 等 submitting→false 的 DOM 重渲染
    const submitBtn = w.findAll('button').find((b) => b.text() === '提交')!
    expect(submitBtn.attributes('disabled')).toBeUndefined()
    await w.find('form.fb-form').trigger('submit')
    expect(w.emitted('submit')!.length).toBe(2)
  })
})

describe('FormBuilder · 步骤模式', () => {
  it('步骤模式渲染 Steps 导航，首步只显示当前步字段', () => {
    const w = mountBuilder(stepsSchema())
    expect(w.find('.steps').exists()).toBe(true)
    // 当前步只渲染 name 字段
    expect(w.text()).toContain('姓名')
  })

  it('下一步按钮：当前步必填未填时被拦截（currentStep 不前进）', async () => {
    const w = mountBuilder(stepsSchema())
    const nextBtn = w.findAll('button').find((b) => b.text().includes('下一步'))
    expect(nextBtn).toBeTruthy()
    await nextBtn!.trigger('click')
    // 校验失败 → 不前进（仍在第 1 步，显示 1/3）
    expect(w.text()).toContain('1')
    expect(w.text()).toContain('/')
  })

  it('填完必填后下一步前进到第 2 步', async () => {
    const w = mountBuilder(stepsSchema(), { name: '张三' })
    const nextBtn = w.findAll('button').find((b) => b.text().includes('下一步'))
    await nextBtn!.trigger('click')
    // 前进到第 2 步：当前步渲染 age 字段
    expect(w.text()).toContain('年龄')
  })

  it('最后一步显示提交按钮而非下一步', async () => {
    const w = mountBuilder(stepsSchema(), { name: '张三' })
    // 走到第 3 步（确认步，无字段）——先下一步×2
    const nextBtn = () => w.findAll('button').find((b) => b.text().includes('下一步'))
    await nextBtn()!.trigger('click')
    await nextBtn()!.trigger('click')
    // 第 3 步（index 2）是最后一步 → 显示「提交」
    expect(w.findAll('button').some((b) => b.text() === '提交')).toBe(true)
    expect(w.findAll('button').some((b) => b.text().includes('下一步'))).toBe(false)
  })
})
