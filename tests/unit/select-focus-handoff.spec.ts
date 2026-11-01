/**
 * 面板焦点交接（#319）
 *
 * ## 缺陷
 *
 * 非输入型面板（日期/时间/菜单）打开后**焦点一直留在触发器上**，而触发器是 readonly
 * input —— 方向键对它无效。结果：#318 刚给日历网格补的键盘漫游**根本进不去**
 * （面板里 42 个格子只能靠 Tab 撞进去，且 Tab 会跑出面板）。
 *
 * ## 判据
 *
 * 打开日期面板 → 焦点落在网格里 `tabindex=0` 的那一格（roving 停靠点）；
 * 打开菜单面板 → 焦点落在第一个菜单项。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Select from '@/components/form/Select.vue'

const options = [
  { label: '选项一', value: 'a' },
  { label: '选项二', value: 'b' },
]

async function openWith(props: Record<string, unknown>) {
  const w = mount(Select, {
    props: { options, modelValue: '', label: '测试', ...props } as never,
    attachTo: document.body,
  })
  await nextTick()
  await w.find('input.trigger-input').trigger('click')
  await nextTick()
  await nextTick()
  return w
}

describe('Select · 打开面板后的焦点交接', () => {
  it('**日期面板：焦点落到网格的 roving 停靠点**（否则方向键漫游进不去）', async () => {
    const w = await openWith({ type: 'date', modelValue: '2026-08-15', dateFormat: 'YYYY-MM-DD' })
    const active = document.activeElement as HTMLElement | null
    expect(active?.classList.contains('dp-cell'), `焦点应落在日历格子上，实际：${active?.className}`).toBe(true)
    expect(active?.getAttribute('tabindex')).toBe('0')
    w.unmount()
  })

  it('**日期面板拿到焦点后方向键可用**（#318 的漫游真的能用上）', async () => {
    const w = await openWith({ type: 'date', modelValue: '2026-08-15', dateFormat: 'YYYY-MM-DD' })
    const before = (document.activeElement as HTMLElement | null)?.getAttribute('data-iso')
    expect(before).toBeTruthy()
    ;(document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    )
    await nextTick()
    await nextTick()
    const after = (document.activeElement as HTMLElement | null)?.getAttribute('data-iso')
    expect(after, '方向键应把焦点移到相邻日期').not.toBe(before)
    w.unmount()
  })

  it('**输入型（combobox）仍然聚焦输入框**（不要抢走打字焦点）', async () => {
    const w = await openWith({ type: 'combobox', searchable: true })
    const active = document.activeElement as HTMLElement | null
    expect(active?.classList.contains('trigger-input')).toBe(true)
    w.unmount()
  })
})
