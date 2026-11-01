/**
 * 面板的"出口"：Esc 关闭 + 焦点归还（#320）
 *
 * ## 缺陷
 *
 * #319 让焦点能进面板，但**出不来也回不去**：
 * · 面板内按 Esc 没有任何反应（Esc 只绑在输入框上）
 * · 选中日期 / 按 Esc 后，面板被 v-if 移除，**焦点掉到 body** ——
 *   键盘用户得从页面开头重新 Tab 回来
 *
 * ## 判据
 *
 * · 焦点在面板内按 Esc → 面板关闭
 * · 关闭后焦点回到触发器（**但点击外部关闭时不抢焦点**）
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Select from '@/components/form/Select.vue'

const options = [
  { label: '选项一', value: 'a' },
  { label: '选项二', value: 'b' },
]

async function openDate() {
  const w = mount(Select, {
    props: { options, type: 'date', modelValue: '2026-08-15', dateFormat: 'YYYY-MM-DD', label: '日期' } as never,
    attachTo: document.body,
  })
  await nextTick()
  await w.find('input.trigger-input').trigger('click')
  await nextTick()
  await nextTick()
  return w
}

const panel = () => document.body.querySelector('.dropdown-panel')

describe('Select · 面板出口（Esc + 焦点归还）', () => {
  it('**焦点在面板内按 Esc → 关闭面板**', async () => {
    const w = await openDate()
    expect(panel(), '面板应已打开').toBeTruthy()
    const cell = document.activeElement as HTMLElement
    expect(cell.classList.contains('dp-cell'), '前置：焦点应在日历格子上').toBe(true)
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await nextTick()
    await nextTick()
    expect(panel(), 'Esc 之后面板应关闭').toBeFalsy()
    w.unmount()
  })

  it('**关闭后焦点回到触发器**（否则用户要从页面开头重新 Tab）', async () => {
    const w = await openDate()
    const cell = document.activeElement as HTMLElement
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await nextTick()
    await nextTick()
    const active = document.activeElement as HTMLElement | null
    expect(active?.classList.contains('trigger-input'), `焦点应回到触发器，实际：${active?.className}`).toBe(true)
    w.unmount()
  })

  it('**选中日期后焦点也回到触发器**', async () => {
    const w = await openDate()
    const cell = document.activeElement as HTMLElement
    cell.click()
    await nextTick()
    await nextTick()
    const active = document.activeElement as HTMLElement | null
    expect(active?.classList.contains('trigger-input'), `焦点应回到触发器，实际：${active?.className}`).toBe(true)
    w.unmount()
  })
})
