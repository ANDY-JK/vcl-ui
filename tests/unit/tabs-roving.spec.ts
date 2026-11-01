/**
 * Tabs 的 roving tabindex（#324）
 *
 * ## 缺陷
 *
 * `role="tablist"` 里每个 `<button role="tab">` 都是 tabbable —— 8 个 Tab 页签
 * 就是 8 个 Tab 停靠点。APG 要求 tablist 用 **roving tabindex**：
 * 同一时刻只有当前页签 `tabindex=0`，方向键在页签间移动并切换。
 *
 * 本轮把这条规矩抽成公共组合式函数 `_internal/useRovingTabindex.ts`，
 * 并新增 `check:tab-sequence` 闸门（扫所有 .vue 的交互角色）。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Tabs from '@/components/nav/Tabs.vue'

const items = Array.from({ length: 8 }, (_, i) => ({ label: `页签${i + 1}`, value: `v${i + 1}` }))

function mountTabs(modelValue = 'v1') {
  return mount(Tabs, { props: { items, modelValue } as never, attachTo: document.body })
}

const tabs = (w: ReturnType<typeof mountTabs>) =>
  Array.from(w.element.querySelectorAll<HTMLElement>('[role="tab"]'))
const stops = (w: ReturnType<typeof mountTabs>) => tabs(w).filter((t) => t.getAttribute('tabindex') === '0')

describe('Tabs · roving tabindex', () => {
  it('**8 个页签只有 1 个 Tab 停靠点**', () => {
    const w = mountTabs()
    expect(tabs(w).length).toBe(8)
    expect(stops(w).length, '每个页签都 tabbable → 键盘用户要按 8 次 Tab').toBe(1)
    w.unmount()
  })

  it('**停靠点跟着当前选中页签走**', async () => {
    const w = mountTabs('v5')
    await nextTick()
    expect(stops(w).length).toBe(1)
    expect(stops(w)[0]!.textContent).toContain('页签5')
    w.unmount()
  })

  it('**方向键切换并移动焦点**（只留一个停靠点，还得能用键盘换页）', async () => {
    const w = mountTabs('v1')
    await nextTick()
    const first = tabs(w)[0]!
    first.focus()
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    await nextTick()
    await nextTick()
    expect(w.emitted('update:modelValue'), '方向键应切换页签').toBeTruthy()
    expect((w.emitted('update:modelValue')!.at(-1) as string[])[0]).toBe('v2')
    w.unmount()
  })

  it('**Home / End 跳首尾**', async () => {
    const w = mountTabs('v4')
    await nextTick()
    const active = stops(w)[0]!
    active.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
    await nextTick()
    await nextTick()
    expect((w.emitted('update:modelValue')!.at(-1) as string[])[0]).toBe('v8')
    w.unmount()
  })
})
