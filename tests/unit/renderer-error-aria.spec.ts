/**
 * 表单渲染器：提交期校验错误要挂到输入框上（#338）
 *
 * ## 缺陷
 *
 * `FormRenderer` 把父级传进来的 `error` 渲染成自己的 `<FieldError>`（既有契约，17 处分支都靠它），
 * 但**输入框本身什么都不知道**：没有 `aria-invalid`，也没有 `aria-describedby` 指向那条说明。
 * 后果：读屏用户听到「字段」却听不到「它无效」，焦点回到输入框后也回查不到「为什么无效」。
 * 这与 #316（Select）、#337（DataTable）是同一族的第三个域。
 *
 * ## 判据
 *
 * · 有 error：输入框 `aria-invalid="true"`，且 `aria-describedby` 指向**真实存在**的元素，
 *   该元素里就是那句错误文案
 * · 无 error：两个属性都不挂（不能指向不存在的 id）
 * · 既有契约不变：FieldError 仍然渲染（17 处分支的约定）
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import FormRenderer from '@/components/form-builder/FormRenderer.vue'

const FIELD = { id: 'f1', type: 'text', label: '姓名', key: 'name', required: true }

async function mountRenderer(error?: string) {
  const w = mount(FormRenderer, {
    props: { field: FIELD, modelValue: '', error } as never,
    attachTo: document.body,
  })
  await nextTick()
  await nextTick()
  return w
}

describe('FormRenderer · 提交期校验错误与输入框关联', () => {
  it('**有 error 时输入框标记无效并指向错误文案**', async () => {
    const w = await mountRenderer('姓名必填')
    const input = w.find('input')
    expect(input.exists(), '前置：应渲染输入框').toBe(true)
    expect(input.attributes('aria-invalid'), '输入框没标记无效 → 读屏不知道这个字段错了').toBe('true')

    const describedby = input.attributes('aria-describedby')
    expect(describedby, '没有 aria-describedby → 回查不到「为什么无效」').toBeTruthy()
    const target = document.querySelector(`#${CSS.escape(describedby!)}`)
    expect(target, 'aria-describedby 指向了不存在的 id（悬空引用）').toBeTruthy()
    expect(target!.textContent, '指向的元素里不是那句错误文案').toContain('姓名必填')
    w.unmount()
  })

  it('**无 error 时两个属性都不挂**', async () => {
    const w = await mountRenderer(undefined)
    const input = w.find('input')
    expect(input.attributes('aria-invalid')).toBeUndefined()
    expect(input.attributes('aria-describedby')).toBeUndefined()
    w.unmount()
  })

  it('**select 字段同样要挂上无效状态与说明位置**（#338 的第二条分支）', async () => {
    const w = mount(FormRenderer, {
      props: { field: { ...FIELD, type: 'select', options: [{ label: '甲', value: 'a' }] }, modelValue: '', error: '请选择姓名' } as never,
      attachTo: document.body,
    })
    await nextTick()
    await nextTick()
    const combo = w.find('[role="combobox"], input')
    expect(combo.exists(), '前置：select 应渲染出 combobox').toBe(true)
    expect(combo.attributes('aria-invalid'), 'select 没标记无效').toBe('true')
    const describedby = combo.attributes('aria-describedby')
    expect(describedby, 'select 没有指向错误说明').toBeTruthy()
    const target = document.querySelector(`#${CSS.escape(describedby!)}`)
    expect(target, 'select 的 aria-describedby 悬空').toBeTruthy()
    expect(target!.textContent).toContain('请选择姓名')
    w.unmount()
  })

  it('**既有契约不变：FieldError 仍然渲染**（17 处分支都靠它）', async () => {
    const w = await mountRenderer('姓名必填')
    const err = w.find('.fb-field-error')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('姓名必填')
    w.unmount()
  })
})
