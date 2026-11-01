/**
 * Select 的 Home / End 键位（#317）
 *
 * ## 缺陷
 *
 * `Select` 声明了 `role="combobox"` + `aria-activedescendant`，方向键/Enter/Esc 都支持，
 * 但**没有 Home / End** —— WAI-ARIA combobox 的标准键位。100 条选项里想跳到第一条
 * 或最后一条，只能一格一格按。
 *
 * ## 判据
 *
 * 打开面板后：Home → 高亮第 1 项；End → 高亮最后一项；面板未打开时不响应
 * （避免在触发器上按 Home 被"吃掉"——用户可能想滚页面）。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Select from '@/components/form/Select.vue'

const options = Array.from({ length: 20 }, (_, i) => ({ label: `选项${i + 1}`, value: `v${i + 1}` }))

/** 当前高亮项的 aria-activedescendant 指向的元素文本 */
function activeText(w: ReturnType<typeof mount>): string | null {
  const id = w.find('input.trigger-input').attributes('aria-activedescendant')
  if (!id) return null
  const el = document.getElementById(id)
  return el?.textContent?.trim() ?? null
}

async function openSelect() {
  const w = mount(Select, {
    props: { options, modelValue: '', label: '选择' } as never,
    attachTo: document.body,
  })
  await nextTick()
  await w.find('input.trigger-input').trigger('click')
  await nextTick()
  return w
}

describe('Select · Home / End 键位', () => {
  it('**End 跳到最后一个选项**', async () => {
    const w = await openSelect()
    const input = w.find('input.trigger-input')
    await input.trigger('keydown', { key: 'End' })
    await nextTick()
    expect(activeText(w), 'End 应把高亮移到最后一项').toBe('选项20')
    w.unmount()
  })

  it('**Home 跳回第一个选项**', async () => {
    const w = await openSelect()
    const input = w.find('input.trigger-input')
    await input.trigger('keydown', { key: 'End' })
    await nextTick()
    await input.trigger('keydown', { key: 'Home' })
    await nextTick()
    expect(activeText(w)).toBe('选项1')
    w.unmount()
  })

  it('**面板未打开时 Home/End 不拦截**（否则用户没法用 Home 滚页面）', async () => {
    const w = mount(Select, {
      props: { options, modelValue: '', label: '选择' } as never,
      attachTo: document.body,
    })
    await nextTick()
    const ev = new KeyboardEvent('keydown', { key: 'Home', cancelable: true, bubbles: true })
    w.find('input.trigger-input').element.dispatchEvent(ev)
    await nextTick()
    expect(ev.defaultPrevented, '未打开时不该 preventDefault').toBe(false)
    w.unmount()
  })
})
