/**
 * Menu 的 roving tabindex 与 Home/End（#322）
 *
 * ## 缺陷
 *
 * `role="menu"` 里 APG 要求 menuitem 用 **roving tabindex**：整菜单只有一项
 * `tabindex=0`。此前每项都是 `tabindex=0` —— 30 项的菜单就是 30 次 Tab。
 * 另外方向键有了，但缺 Home/End（长菜单只能一格一格按）。
 *
 * ## 判据
 *
 * · 整菜单只有 1 个 tabindex=0（禁用项永远是 -1）
 * · 焦点移到别的项后，停靠点跟着走
 * · Home/End 一步跳到同级首/末项
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Menu from '@/components/nav/Menu.vue'

const items = [
  { key: 'a', label: '菜单一' },
  { key: 'b', label: '菜单二' },
  { key: 'c', label: '菜单三', disabled: true },
  { key: 'd', label: '菜单四' },
  { key: 'e', label: '菜单五' },
]

function mountMenu() {
  return mount(Menu, { props: { items } as never, attachTo: document.body })
}

const stops = (w: ReturnType<typeof mountMenu>) =>
  Array.from(w.element.querySelectorAll<HTMLElement>('[role="menuitem"][tabindex="0"]'))

describe('Menu · roving tabindex 与 Home/End', () => {
  it('**整菜单只有一个 Tab 停靠点**（不是每项都 0）', () => {
    const w = mountMenu()
    expect(stops(w).length, '多项 tabindex=0 → 菜单里全是 Tab 停靠点').toBe(1)
    expect(stops(w)[0]!.textContent).toContain('菜单一')
    w.unmount()
  })

  it('**禁用项永远不在 Tab 序列里**', () => {
    const w = mountMenu()
    const disabled = Array.from(w.element.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) =>
      el.textContent?.includes('菜单三'),
    )!
    expect(disabled.getAttribute('tabindex')).toBe('-1')
    w.unmount()
  })

  it('**焦点移动后停靠点跟着走**（roving 的核心）', async () => {
    const w = mountMenu()
    const target = Array.from(w.element.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) =>
      el.textContent?.includes('菜单二'),
    )!
    target.focus()
    await nextTick()
    const s = stops(w)
    expect(s.length).toBe(1)
    expect(s[0]!.textContent).toContain('菜单二')
    w.unmount()
  })

  it('**End 跳到最后一个可用项，Home 跳回第一个**', async () => {
    const w = mountMenu()
    const first = w.element.querySelector<HTMLElement>('[role="menuitem"]')!
    first.focus()
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
    await nextTick()
    expect(document.activeElement?.textContent).toContain('菜单五')

    ;(document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }),
    )
    await nextTick()
    expect(document.activeElement?.textContent).toContain('菜单一')
    w.unmount()
  })
})
