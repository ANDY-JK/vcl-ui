/**
 * 表单错误的可访问性关联（#316）
 *
 * ## 缺陷
 *
 * `Select` 早就有 `aria-invalid` 和 `role="alert"`，但**没有 `aria-describedby`**：
 * `role="alert"` 只保证"错误刚出现那一刻"被播报；用户之后把焦点移回控件时，
 * 读屏读不到错误内容 —— 而 `Input` 是做了关联的（`aria-describedby` + 错误元素 id）。
 * 同一个库、两种做法，用户拿到的是两种体验。
 *
 * ## 判据
 *
 * 错误态下：`aria-invalid` 为真、`aria-describedby` 指向**存在的**错误元素、
 * 错误元素带 `role="alert"`（即时播报）与 `id`（后续可重读）。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import Select from '@/components/form/Select.vue'

const options = [
  { label: '选项一', value: 'a' },
  { label: '选项二', value: 'b' },
]

function mountSelect(props: Record<string, unknown> = {}) {
  return mount(Select, {
    props: { options, modelValue: '', label: '城市', ...props } as never,
    attachTo: document.body,
  })
}

describe('Select · 错误提示与控件的可访问性关联', () => {
  it('**有错误时 aria-describedby 指向错误元素，且 id 真的存在**', async () => {
    const w = mountSelect({ error: '请选择城市' })
    const input = w.find('input.trigger-input')
    const describedBy = input.attributes('aria-describedby')
    expect(describedBy, '没有 aria-describedby：焦点移回时读不到错误').toBeTruthy()
    const errEl = document.getElementById(describedBy!)
    expect(errEl, 'aria-describedby 指向的元素必须存在').toBeTruthy()
    expect(errEl!.textContent).toContain('请选择城市')
    w.unmount()
  })

  it('**错误元素带 role=alert**（错误出现的瞬间也要播报）', () => {
    const w = mountSelect({ error: '请选择城市' })
    expect(w.find('.select-error').attributes('role')).toBe('alert')
    w.unmount()
  })

  it('**无错误时不挂 aria-invalid / aria-describedby**（避免读屏读到空关联）', () => {
    const w = mountSelect()
    const input = w.find('input.trigger-input')
    expect(input.attributes('aria-invalid')).toBeUndefined()
    expect(input.attributes('aria-describedby')).toBeUndefined()
    w.unmount()
  })

  it('**同一页面多个 Select 的错误 id 互不重复**（否则关联会串到别的实例）', () => {
    // ⚠️ 必须在**同一个 app 实例**里渲染两个：Vue 的 useId 计数是按 app 走的，
    //    两次 mount() 是两个 app，各自从 v-1 开始 —— 那样测出来"重复"是测试假象。
    const Host = defineComponent({
      // 别名避免 vue/no-reserved-component-names（Select 与原生标签同名）
      components: { VSelect: Select },
      setup: () => ({ options }),
      template: `
        <div>
          <VSelect :options="options" model-value="" error="第一个错" />
          <VSelect :options="options" model-value="" error="第二个错" />
        </div>
      `,
    })
    const w = mount(Host, { attachTo: document.body })
    const inputs = w.findAll('input.trigger-input')
    expect(inputs.length).toBe(2)
    const idA = inputs[0]!.attributes('aria-describedby')
    const idB = inputs[1]!.attributes('aria-describedby')
    expect(idA).toBeTruthy()
    expect(idB).toBeTruthy()
    expect(idA).not.toBe(idB)
    expect(document.getElementById(idA!)!.textContent).toContain('第一个错')
    expect(document.getElementById(idB!)!.textContent).toContain('第二个错')
    w.unmount()
  })
})
