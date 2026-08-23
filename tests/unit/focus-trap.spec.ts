import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'

describe('useFocusTrap', () => {
  function makeContainer() {
    const el = document.createElement('div')
    el.tabIndex = -1
    const btn = document.createElement('button')
    el.appendChild(btn)
    document.body.appendChild(el)
    return el
  }

  it('activate 后 isActive 为 true，deactivate 后为 false', async () => {
    const visible = ref(false)
    const el = makeContainer()
    const trap = useFocusTrap({ visible, getContainer: () => el })

    expect(trap.isActive()).toBe(false)
    visible.value = true
    await nextTick()
    expect(trap.isActive()).toBe(true)

    visible.value = false
    await nextTick()
    expect(trap.isActive()).toBe(false)
    el.remove()
  })

  it('activate 聚焦容器内第一个可聚焦元素', async () => {
    const visible = ref(false)
    const el = makeContainer()
    const btn = el.querySelector('button')!
    useFocusTrap({ visible, getContainer: () => el })

    visible.value = true
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(btn)
    visible.value = false
    el.remove()
  })

  it('Tab 在最后一个元素时循环到第一个', async () => {
    const visible = ref(false)
    const el = makeContainer()
    const trap = useFocusTrap({ visible, getContainer: () => el })
    const btn = el.querySelector('button')!

    trap.activate()
    btn.focus()
    const evt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    const preventDefault = vi.spyOn(evt, 'preventDefault')
    // 手动触发：只有最后一个元素聚焦时 Tab 才 preventDefault + 循环
    window.dispatchEvent(evt)
    // 单元素容器：first===last，Tab 应循环（preventDefault 被调用）
    expect(preventDefault).toHaveBeenCalled()
    trap.deactivate()
    el.remove()
  })

  it('deactivate 恢复之前的焦点', async () => {
    const visible = ref(false)
    const el = makeContainer()
    const prevBtn = document.createElement('button')
    document.body.appendChild(prevBtn)
    prevBtn.focus()

    const trap = useFocusTrap({ visible, getContainer: () => el })
    trap.activate()
    await nextTick()
    trap.deactivate()
    expect(document.activeElement).toBe(prevBtn)

    prevBtn.remove()
    el.remove()
  })
})
