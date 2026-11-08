/**
 * SegmentedControl · 契约
 *
 * 它和 Tabs 的分工是语义差异，不是外观差异：
 *   Tabs = `tablist`（切视图）；本组件 = `radiogroup`（切值）。
 * 所以这里钉的是「单选值 + 焦点即选中」这条 radiogroup 语义，而不是 tab 的「选中即切面板」。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SegmentedControl from '@/components/form/SegmentedControl.vue'

const options = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
]

function mountSeg(modelValue: string | number | boolean = 'day', extra: Record<string, unknown> = {}) {
  return mount(SegmentedControl, {
    props: { modelValue, options, ariaLabel: '粒度', ...extra } as never,
    attachTo: document.body,
  })
}

const radios = (w: ReturnType<typeof mountSeg>) => Array.from(w.element.querySelectorAll<HTMLElement>('[role="radio"]'))
const stops = (w: ReturnType<typeof mountSeg>) => radios(w).filter((r) => r.getAttribute('tabindex') === '0')

describe('SegmentedControl · 结构与无障碍', () => {
  it('容器是 radiogroup，每段是 radio，aria-checked 跟着 modelValue', () => {
    const w = mountSeg('week')
    expect(w.element.getAttribute('role')).toBe('radiogroup')
    expect(w.element.getAttribute('aria-label')).toBe('粒度')
    expect(radios(w).length).toBe(3)
    expect(radios(w).map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    w.unmount()
  })

  it('roving tabindex：三选一，只有选中项拿 tabindex=0', () => {
    const w = mountSeg('month')
    expect(stops(w).length).toBe(1)
    expect(stops(w)[0]!.textContent).toContain('月')
    w.unmount()
  })
})

describe('SegmentedControl · 选择行为', () => {
  it('点击未选中项 → 双向 emit（update:modelValue + change 带 option）', async () => {
    const w = mountSeg('day')
    await radios(w)[2]!.click()
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['month'])
    expect(w.emitted('change')?.[0]?.[0]).toBe('month')
    expect((w.emitted('change')?.[0]?.[1] as { label: string }).label).toBe('月')
    w.unmount()
  })

  it('点击已选中项 → 不重复 emit（幂等，避免父层无意义重渲染）', async () => {
    const w = mountSeg('week')
    await radios(w)[1]!.click()
    expect(w.emitted('update:modelValue')).toBeUndefined()
    expect(w.emitted('change')).toBeUndefined()
    w.unmount()
  })

  it('整组禁用：按钮带 disabled，点击不落值', async () => {
    const w = mountSeg('day', { disabled: true })
    expect(radios(w).every((r) => (r as HTMLButtonElement).disabled)).toBe(true)
    await radios(w)[2]!.click()
    expect(w.emitted('update:modelValue')).toBeUndefined()
    w.unmount()
  })

  it('单项禁用：该项 disabled 且点击不落值，其余项照常', async () => {
    const w = mountSeg('day', {
      options: [
        { value: 'day', label: '日' },
        { value: 'week', label: '周', disabled: true },
        { value: 'month', label: '月' },
      ],
    })
    expect((radios(w)[1] as HTMLButtonElement).disabled).toBe(true)
    await radios(w)[1]!.click()
    expect(w.emitted('update:modelValue')).toBeUndefined()
    await radios(w)[2]!.click()
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['month'])
    w.unmount()
  })
})

describe('SegmentedControl · 键盘 = radiogroup 语义（焦点即选中）', () => {
  it('ArrowRight 移动焦点并同步落值（原生 radio 的行为）', async () => {
    const w = mountSeg('day')
    await w.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['week'])
    expect(document.activeElement?.textContent).toContain('周')
    w.unmount()
  })

  it('ArrowLeft 到头循环到最后一项（与 useRovingTabindex 的 wrap 默认一致）', async () => {
    const w = mountSeg('day')
    await w.trigger('keydown', { key: 'ArrowLeft' })
    await nextTick()
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['month'])
    w.unmount()
  })

  it('End 跳到末项并落值', async () => {
    const w = mountSeg('day')
    await w.trigger('keydown', { key: 'End' })
    await nextTick()
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['month'])
    w.unmount()
  })

  it('禁用项不进入方向键序列（不会被选中，也不吃 Tab 停靠）', async () => {
    const w = mountSeg('day', {
      options: [
        { value: 'day', label: '日' },
        { value: 'week', label: '周', disabled: true },
        { value: 'month', label: '月' },
      ],
    })
    await w.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    // 跳过「周」，直接落到「月」
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['month'])
    w.unmount()
  })
})

describe('SegmentedControl · 排版开关', () => {
  it('size=sm 与 block 只是排版类，不改变语义', () => {
    const w = mountSeg('day', { size: 'sm', block: true })
    expect(w.element.classList.contains('seg-sm')).toBe(true)
    expect(w.element.classList.contains('seg-block')).toBe(true)
    expect(w.element.getAttribute('role')).toBe('radiogroup')
    w.unmount()
  })
})
