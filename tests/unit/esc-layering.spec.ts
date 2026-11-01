// ESC 分层契约（2026-11-01 #280）
//
// ## 背景缺陷
//
// 弹窗里放一个 Select / 表格单元格编辑 / 右键菜单时，用户按 Esc 想收起**那一层**。
// 内层组件在自己的 keydown 里处理了 Esc，但事件继续冒泡到 window ——
// `useEscClose` 也响应，于是「收起下拉」和「关闭弹窗」同时发生：
// **用户丢失整屏已填内容**。
//
// 修前的探针实测：在弹窗内部元素上派发 Esc，ModalShell 立即 emit `update:visible: false`。
//
// ## 契约
//
// **谁真正消费了 Esc，谁调 `e.preventDefault()`**；`useEscClose` 见 `defaultPrevented`
// 就让行。这样"内层关一层、外层不跟着关"，且不需要内层知道外层是谁。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ModalShell from '@/components/_internal/ModalShell.vue'
import Select from '@/components/form/Select.vue'

function mountModal() {
  return mount(ModalShell, {
    props: { visible: true, title: 'T', closable: true },
    slots: { default: '<div class="body">x</div>' },
    attachTo: document.body,
  })
}

describe('ESC 分层：内层消费后外层不跟着关', () => {
  it('**内层已 preventDefault 的 Esc → 弹窗不关**（修前会 emit update:visible:false）', async () => {
    const w = mountModal()
    try {
      await nextTick()
      const inner = document.createElement('input')
      w.element.appendChild(inner)
      const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      // 模拟内层组件（Select / 单元格编辑 / 右键菜单）消费掉 Esc
      inner.addEventListener('keydown', (ev) => ev.preventDefault())
      inner.dispatchEvent(e)
      await nextTick()
      expect(e.defaultPrevented, '内层应已消费').toBe(true)
      expect(w.emitted('update:visible'), '外层不得再关').toBeFalsy()
    } finally {
      w.unmount()
    }
  })

  it('未被消费的 Esc → 弹窗照常关闭（守卫不能把正常路径堵死）', async () => {
    const w = mountModal()
    try {
      await nextTick()
      const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      document.body.dispatchEvent(e)
      await nextTick()
      expect(w.emitted('update:visible'), '普通 Esc 应关闭弹窗').toEqual([[false]])
    } finally {
      w.unmount()
    }
  })

  it('不可关闭的弹窗：Esc 不关闭（closable=false 语义不变）', async () => {
    const w = mount(ModalShell, {
      props: { visible: true, title: 'T', closable: false },
      slots: { default: 'x' },
      attachTo: document.body,
    })
    try {
      await nextTick()
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await nextTick()
      expect(w.emitted('update:visible')).toBeFalsy()
    } finally {
      w.unmount()
    }
  })
})

describe('Select 消费自己的 Esc', () => {
  it('**Select 收起面板时 preventDefault**（否则同一击 Esc 会连外层弹窗一起关）', async () => {
    const w = mount(Select, {
      props: { modelValue: '', options: [{ label: '甲', value: 'a' }], filterable: true },
      attachTo: document.body,
    })
    try {
      await nextTick()
      const input = w.find('input')
      await input.trigger('focus')
      const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      input.element.dispatchEvent(e)
      await nextTick()
      expect(e.defaultPrevented, 'Select 必须消费 Esc').toBe(true)
    } finally {
      w.unmount()
    }
  })
})
