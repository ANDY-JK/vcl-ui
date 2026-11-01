/**
 * 日历网格的键盘漫游（#318）
 *
 * ## 缺陷
 *
 * `DatePanel` 的注释写着"grid 语义 + 方向键漫游"，但**方向键从来没实现过**；
 * 而且 42 个格子全是 `<button>`（全部 tabbable）—— 键盘用户要按 42 次 Tab 才能穿过日历。
 *
 * ## 判据（APG 日历网格）
 *
 * · roving tabindex：整个网格只有 1 个 Tab 停靠点
 * · ← → 前后一天 ／ ↑ ↓ 前后一周 ／ Home/End 本周首尾 ／ PageUp/PageDown 前后一月
 * · 跨月时先翻月，焦点落到目标日
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import DatePanel from '@/components/form/date-panel/DatePanel.vue'

// ⚠️ DatePanel 的 format 是**大写**约定（默认 'YYYY-MM-DD'），与 form-builder 导出的小写 yyyy 不同
const FORMAT = 'YYYY-MM-DD'

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(DatePanel, {
    props: {
      modelMonth: { year: 2026, month: 8 },
      selected: '2026-08-15',
      format: FORMAT,
      ...props,
    } as never,
    attachTo: document.body,
  })
}

/** 网格里 tabindex=0 的格子（唯一 Tab 停靠点） */
function tabbable(w: ReturnType<typeof mountPanel>): HTMLElement[] {
  return Array.from(w.element.querySelectorAll<HTMLElement>('.dp-cell[tabindex="0"]'))
}

async function press(w: ReturnType<typeof mountPanel>, iso: string, key: string) {
  const cell = w.element.querySelector<HTMLElement>(`[data-iso="${iso}"]`)!
  cell.focus()
  cell.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  await nextTick()
  await nextTick()
}

describe('日历网格 · 键盘漫游', () => {
  it('**整个网格只有一个 Tab 停靠点**（42 个 button 不该全是 tabbable）', () => {
    const w = mountPanel()
    expect(tabbable(w).length, '多于 1 个 → 键盘用户要按 42 次 Tab').toBe(1)
    w.unmount()
  })

  it('**Tab 停靠点落在已选日期上**', () => {
    const w = mountPanel()
    expect(tabbable(w)[0]!.getAttribute('data-iso')).toBe('2026-08-15')
    w.unmount()
  })

  it('**← / → 前后一天**', async () => {
    const w = mountPanel()
    await press(w, '2026-08-15', 'ArrowRight')
    expect(document.activeElement?.getAttribute('data-iso')).toBe('2026-08-16')
    await press(w, '2026-08-16', 'ArrowLeft')
    expect(document.activeElement?.getAttribute('data-iso')).toBe('2026-08-15')
    w.unmount()
  })

  it('**↑ / ↓ 前后一周**', async () => {
    const w = mountPanel()
    await press(w, '2026-08-15', 'ArrowDown')
    expect(document.activeElement?.getAttribute('data-iso')).toBe('2026-08-22')
    await press(w, '2026-08-22', 'ArrowUp')
    expect(document.activeElement?.getAttribute('data-iso')).toBe('2026-08-15')
    w.unmount()
  })

  it('**Home / End 到本周首尾**', async () => {
    const w = mountPanel()
    await press(w, '2026-08-15', 'Home')
    const home = document.activeElement?.getAttribute('data-iso')
    expect(home, 'Home 应落在同一行的第一格（周日）').toBe('2026-08-09')
    await press(w, '2026-08-15', 'End')
    expect(document.activeElement?.getAttribute('data-iso')).toBe('2026-08-15')
    w.unmount()
  })

  it('**PageUp / PageDown 前后一月并翻月**', async () => {
    const w = mountPanel()
    await press(w, '2026-08-15', 'PageDown')
    expect(w.emitted('update:modelMonth'), '跨月要请求翻月').toBeTruthy()
    expect((w.emitted('update:modelMonth')!.at(-1) as [{ month: number }])[0].month).toBe(9)
    w.unmount()
  })

  it('**月末夹紧**：1 月 31 日 PageDown 后焦点落在 2 月 28 日（2026 非闰年）', async () => {
    // 需要父级真的跟着翻月，才能观察到"夹紧后的那一天" —— 静态 props 下目标格子不存在
    const Host = defineComponent({
      components: { DatePanel },
      setup() {
        const month = ref({ year: 2026, month: 1 })
        return { month }
      },
      template: `<DatePanel v-model:modelMonth="month" selected="2026-01-31" :format="'YYYY-MM-DD'" />`,
    })
    const w = mount(Host, { attachTo: document.body })
    await nextTick()
    const cell = w.element.querySelector<HTMLElement>('[data-iso="2026-01-31"]')!
    cell.focus()
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }))
    await nextTick()
    await nextTick()
    expect(document.activeElement?.getAttribute('data-iso'), '1/31 的下个月同日不存在，应夹到 2/28').toBe('2026-02-28')
    w.unmount()
  })
})
