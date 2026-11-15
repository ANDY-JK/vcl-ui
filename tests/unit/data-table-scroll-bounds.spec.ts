/**
 * useDataTableScroll · 进度条的**数值边界**（#486）
 *
 * 进度条是"用百分比当 CSS 宽度"的典型写法，于是数字一旦跑出 [0,100] 或变成 NaN，
 * 症状不是报错而是**进度条静默消失**（`width: NaN%` / `width: -12%` 都是无效声明，
 * 浏览器整条丢掉）。三条真实路径：
 *
 *  1. `rect.width === 0`（容器隐藏、flex 塌陷、首帧未布局）且点击点正好在 left 上 →
 *     `0/0 = NaN`，`Math.max(0, Math.min(1, NaN))` 仍然是 NaN；
 *  2. macOS 橡皮筋回弹 → `scrollTop < 0` → 百分比为负；
 *  3. 回弹到底 → `scrollTop > max` → 百分比 > 100。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { useDataTableScroll } from '@/components/data/useDataTableScroll'

function makeHost() {
  return {
    isCardViewEffective: ref(false),
    tableWrapRef: ref<HTMLElement | null>(null),
    scrollContainerRef: ref<HTMLElement | null>(null),
    displayData: ref<Record<string, unknown>[]>([]),
    zoomX: ref(1),
    zoomY: ref(1),
    pagedData: ref<Record<string, unknown>[]>([]),
    isFullscreen: ref(false),
    pageSize: ref<number | undefined>(10),
  }
}

function fakeScrollEl({ scrollHeight = 1000, clientHeight = 200, scrollTop = 0 } = {}) {
  return { scrollHeight, clientHeight, scrollTop, scrollTo: vi.fn() } as unknown as HTMLElement
}

/** 造一根进度条：width 可设 0 来模拟"还没布局出来" */
function fakeBar(clientX: number, width: number, inner: HTMLElement, left = 0) {
  const progress = { style: { width: '' } } as unknown as HTMLElement
  const bar = {
    closest: () => ({ querySelector: () => inner }),
    getBoundingClientRect: () => ({ left, width }),
    querySelector: () => progress,
  } as unknown as HTMLElement
  return { bar, progress, down: { clientX, currentTarget: bar } as unknown as MouseEvent }
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

describe('useDataTableScroll · 进度条数值边界（#486）', () => {
  it('bar 宽度为 0 且点在 left 上（0/0）→ 不 scrollTo(NaN)、不写 NaN%', () => {
    const s = useDataTableScroll(makeHost())
    const inner = fakeScrollEl()
    const { bar, progress, down } = fakeBar(0, 0, inner)
    s.onProgressMouseDown(down)
    expect(inner.scrollTo, '没有可量宽度时没有"点在哪"可言').not.toHaveBeenCalled()
    expect(progress.style.width).not.toContain('NaN')
    void bar
  })

  it('bar 宽度为 0 但点在其他位置（除零得 Infinity）→ 也不该跳到尽头', () => {
    const s = useDataTableScroll(makeHost())
    const inner = fakeScrollEl()
    const { down } = fakeBar(120, 0, inner)
    s.onProgressMouseDown(down)
    expect(inner.scrollTo).not.toHaveBeenCalled()
  })

  it('回弹到头（scrollTop < 0）→ 进度钳到 0，不出负百分比', async () => {
    const s = useDataTableScroll(makeHost())
    s.onScrollProgress({ target: fakeScrollEl({ scrollTop: -80 }) } as unknown as Event)
    await nextFrame()
    expect(s.scrollProgress.value).toBe(0)
  })

  it('回弹到底（scrollTop > max）→ 进度钳到 100，不出超界百分比', async () => {
    const s = useDataTableScroll(makeHost())
    s.onScrollProgress({ target: fakeScrollEl({ scrollTop: 1100 }) } as unknown as Event)
    await nextFrame()
    expect(s.scrollProgress.value).toBe(100)
  })
})

describe('useDataTableScroll · 拖拽真的在拖 + 卸载要收尾', () => {
  it('按住后 document mousemove 持续 seekScroll（不只是注册了监听器）', () => {
    const s = useDataTableScroll(makeHost())
    const inner = fakeScrollEl()
    const { down } = fakeBar(50, 200, inner)
    s.onProgressMouseDown(down)
    expect(inner.scrollTo).toHaveBeenLastCalledWith({ top: 200, behavior: 'instant' })

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150 }))
    expect(inner.scrollTo, '拖到 75% 处 → 0.75 × (1000-200)').toHaveBeenLastCalledWith({ top: 600, behavior: 'instant' })
    document.dispatchEvent(new MouseEvent('mouseup'))
  })

  it('卸载时取消挂起的 RAF（卸载后不该再更新进度）', () => {
    const host = makeHost()
    let api!: ReturnType<typeof useDataTableScroll>
    const w = mount(
      defineComponent({
        setup() {
          api = useDataTableScroll(host as never)
          return () => null
        },
      }),
    )
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame')
    api.onScrollProgress({ target: fakeScrollEl({ scrollTop: 300 }) } as unknown as Event)
    w.unmount()
    expect(cancel).toHaveBeenCalled()
    cancel.mockRestore()
  })
})