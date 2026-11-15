/**
 * CaptureFallbackSheet · 键盘收口与忙碌态的**可操作性**（#507）
 *
 * 采集「最后兜底」底部弹层（页面内相机与系统相机都不可用时弹出）。
 *
 * ## 缺陷一：全库唯一一个不响应 Esc 的弹层
 *
 * 它声明的是 `role="dialog" aria-modal="true"` —— 对话框语义。ARIA APG 对 dialog 的
 * 键盘契约第一条就是 **Escape 关闭**；库里 `ModalShell` / `Drawer` / `Popover` /
 * `NotificationCenter` 四个弹层**全部**走共享 `useEscClose`（含"内层已消费 Esc 就让行"
 * 的叠放语义），只有这一个既没 import 也没挂监听。
 *
 * 后果：键盘用户的唯一出路是 Tab 到右上角 ✕（还得多按几下穿过上传按钮/输入框）。
 * 在"相机不可用 → 弹兜底"这种**本来就是失败态**的场景里，用户第一反应就是 Esc 退出，
 * 而 Esc 什么都不会发生 —— 弹层像是卡死了。
 *
 * ## 缺陷二：busy 时 ✕ 看着能点、点了没反应
 *
 * `close()` 第一行是 `if (props.busy) return`（识别中不许关，语义对），
 * 但按钮既没 `disabled` 也没 `aria-disabled`：焦点能到、读屏念"取消，按钮"、
 * 鼠标悬停有手型光标 —— 按下去**静默无事**。（同族：§9.80 的 chip 关闭按钮）
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { nextTick } from 'vue'
import CaptureFallbackSheet from '@/components/form/CaptureFallbackSheet.vue'
import { setLocale } from '@/components/_internal/i18n'

const mounted: VueWrapper[] = []
function mountSheet(props: Record<string, unknown> = {}): VueWrapper {
  const w = mount(CaptureFallbackSheet, {
    props: { modelValue: true, ...props },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
  mounted.push(w)
  return w
}

/** 向 window 派发一次 Esc（useEscClose 挂的就是 window keydown） */
async function pressEsc() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
  await nextTick()
}

const closeBtn = (w: VueWrapper) => w.find('.capfb-x')

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
  setLocale('zh-CN')
})

describe('CaptureFallbackSheet · Esc 收口（#507）', () => {
  it('**打开着按 Esc → 关窗并抛 close**（与 ModalShell/Drawer/Popover 同口径）', async () => {
    const w = mountSheet()
    await pressEsc()
    expect(w.emitted('update:modelValue')?.at(-1), 'Esc 必须能关掉兜底弹层').toEqual([false])
    expect(w.emitted('close'), '关闭要通知宿主（可能是"用户放弃采集"）').toHaveLength(1)
  })

  it('忙碌中按 Esc → 不关（识别中的结果不能丢）', async () => {
    const w = mountSheet({ busy: true })
    await pressEsc()
    expect(w.emitted('update:modelValue'), 'busy 时 Esc 应被自身守卫吞掉').toBeUndefined()
    expect(w.emitted('close')).toBeUndefined()
  })

  it('已关闭时不响应 Esc（不往外乱抛事件）', async () => {
    const w = mountSheet({ modelValue: false })
    await pressEsc()
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })
})

describe('CaptureFallbackSheet · 忙碌态的关闭控件（#507）', () => {
  it('**busy 时 ✕ 必须真的 disabled**（不能"看着能点、点了没反应"）', () => {
    const w = mountSheet({ busy: true })
    const btn = closeBtn(w)
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('disabled'), 'busy 时应禁用，而不是靠 handler 早退').toBeDefined()
  })

  it('非 busy 时 ✕ 可用，点了关窗 + 抛 close', async () => {
    const w = mountSheet()
    const btn = closeBtn(w)
    expect(btn.attributes('disabled')).toBeUndefined()
    await btn.trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('disabled（整面板禁用）时点 ✕ 仍能关（禁用是禁"改内容"，不是禁"退出"）', async () => {
    const w = mountSheet({ disabled: true })
    await closeBtn(w).trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})

describe('CaptureFallbackSheet · 子面板事件转发（#507）', () => {
  it('**files / submit / retry 三条要原样转发给宿主**（漏一条宿主就收不到）', async () => {
    const w = mountSheet()
    const panel = w.findComponent({ name: 'CaptureFallbackPanel' })
    expect(panel.exists(), '内层应挂载 CaptureFallbackPanel').toBe(true)

    const f = new File(['x'], 'a.png', { type: 'image/png' })
    panel.vm.$emit('files', [f])
    panel.vm.$emit('submit', 'CODE-1')
    panel.vm.$emit('retry')
    await nextTick()

    expect(w.emitted('files')?.[0]?.[0]).toEqual([f])
    expect(w.emitted('submit')?.[0]).toEqual(['CODE-1'])
    expect(w.emitted('retry')).toHaveLength(1)
  })

  it('关闭时重置子面板（下次打开不残留上次的报错/已选文件）', async () => {
    // 用桩替掉内层面板：`defineExpose` 出来的 exposed 对象不是实例本身，
    // 对 `panel.vm.reset` 做 spy 捕不到父组件的调用（Vue 的 proxy/getter 会绕开）。
    // 这里只验"外层在关窗时调了 reset"这条契约，内层 reset 的具体行为归它自己的用例。
    const resets: Array<ReturnType<typeof vi.fn>> = []
    const PanelStub = defineComponent({
      name: 'CaptureFallbackPanel',
      setup(_, { expose }) {
        const reset = vi.fn()
        resets.push(reset)
        expose({ reset })
        return () => h('div', { class: 'capfb-panel' })
      },
    })
    const w = mount(CaptureFallbackSheet, {
      props: { modelValue: true },
      global: { stubs: { teleport: true, CaptureFallbackPanel: PanelStub } },
      attachTo: document.body,
    })
    mounted.push(w)

    await w.setProps({ modelValue: false })
    await nextTick()
    expect(resets.at(-1), '关窗必须 reset，否则再打开是"上次失败"的样子').toHaveBeenCalled()
    expect(w.find('.capfb-mask').exists(), 'v-if=false 时不应留在 DOM').toBe(false)
  })
})

describe('CaptureFallbackSheet · 遮罩与面板（回归护栏）', () => {
  it('点遮罩关，点面板不关（@click.self + @click.stop）', async () => {
    const w = mountSheet()
    await w.find('.capfb-sheet').trigger('click')
    expect(w.emitted('update:modelValue'), '点面板内容不该关').toBeUndefined()

    await w.find('.capfb-mask').trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('dialog 语义：role/aria-modal/可访问名齐全', () => {
    const w = mountSheet({ title: '采集兜底' })
    const sheet = w.find('.capfb-sheet')
    expect(sheet.attributes('role')).toBe('dialog')
    expect(sheet.attributes('aria-modal')).toBe('true')
    expect(sheet.attributes('aria-label')).toBe('采集兜底')
  })

  it('title 空串 → 用内置 i18n 文案（不是空可访问名）', () => {
    const w = mountSheet({ title: '' })
    expect(w.find('.capfb-sheet').attributes('aria-label')).toBeTruthy()
  })
})
