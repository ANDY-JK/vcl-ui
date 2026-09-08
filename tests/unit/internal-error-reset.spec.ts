// 修复锁定：组件内部错误态无复位出口（红队 E）
// 背景：Button / Input / Upload 各自 onErrorCaptured 把错误存进内部 ref 并 return false 阻断冒泡，
//       之后永久渲染 ⚠ 降级提示且无任何恢复路径 —— 保存按钮、输入框、上传区一旦触发就彻底死掉。
// 修法：入参变化 = 内容已变 → 清错误态重渲染一次（仍坏会再次捕获，不成环）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, h, defineComponent, ref } from 'vue'
import Button from '@/components/basic/Button.vue'
import Input from '@/components/form/Input.vue'
import Upload from '@/components/form/Upload.vue'

function makeToggleChild(switchRef: { value: boolean }) {
  return defineComponent({
    name: 'ToggleChild',
    setup() {
      return () => {
        if (switchRef.value) throw new Error('boom')
        return h('span', { class: 'child-ok' }, 'ok')
      }
    },
  })
}

let errSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errSpy.mockRestore())

describe('Button · 内部错误态复位', () => {
  it('插槽子组件抛错 → ⚠ 降级；入参变化后恢复渲染按钮', async () => {
    const willThrow = ref(true)
    const Child = makeToggleChild(willThrow)
    const w = mount(Button, { props: { text: '保存' }, slots: { default: () => h(Child) } })
    await nextTick()
    expect(w.text()).toContain('⚠')

    willThrow.value = false
    await w.setProps({ text: '提交' })
    await nextTick()
    expect(w.text()).not.toContain('⚠')
    expect(w.find('button').exists()).toBe(true)
    expect(w.find('.child-ok').exists()).toBe(true)
  })

  it('子组件仍坏时再次捕获，不会静默恢复成可用按钮', async () => {
    const w = mount(Button, { props: { text: '保存' }, slots: { default: () => h(makeToggleChild(ref(true))) } })
    await nextTick()
    expect(w.text()).toContain('⚠')

    await w.setProps({ text: '提交' })
    await nextTick()
    expect(w.text()).toContain('⚠')
    expect(w.find('button').exists()).toBe(false)
  })
})

describe('Input / Upload · 内部错误态复位', () => {
  /** script setup 的 _error 在 dev 下可经实例代理写入，用于注入一次内部捕获 */
  function pokeError(w: ReturnType<typeof mount>) {
    ;(w.vm as unknown as Record<string, unknown>)._error = new Error('internal')
  }

  it('Input：入参（modelValue）变化后清掉 ⚠ 降级', async () => {
    const w = mount(Input, { props: { modelValue: '', label: '名称' } })
    pokeError(w)
    await nextTick()
    expect(w.text()).toContain('⚠')

    await w.setProps({ modelValue: 'abc' })
    await nextTick()
    expect(w.text()).not.toContain('⚠')
  })

  it('Upload：入参（modelValue）变化后清掉 ⚠ 降级', async () => {
    const w = mount(Upload, { props: { modelValue: [] as unknown[] } })
    pokeError(w)
    await nextTick()
    expect(w.text()).toContain('⚠')

    await w.setProps({ modelValue: [] })
    await nextTick()
    expect(w.text()).not.toContain('⚠')
  })
})
