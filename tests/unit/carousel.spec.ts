/**
 * Carousel · 轮播
 *
 * 组件本体只做三件事：箭头、圆点、键盘。**吸附与滚动交给 CSS scroll-snap**，
 * 所以用例也不去断言"transform 位移多少"，而是断言：
 *   1. 页数 = 宿主子元素个数（count 与 DOM 一致）
 *   2. 圆点数量/选中态跟着 modelValue 走
 *   3. 箭头与方向键触发翻页（受控时 emit 正确索引；loop 首尾相接）
 *   4. 最后一页 → 下一页回到 0（loop），非 loop 时停在末页
 *   5. 减弱动效下不启动自动播放（全局令牌压不掉"自己会动"）
 *
 * happy-dom 没有布局：`scrollTo` 与 `offsetLeft` 都是桩，所以这里断言的是
 * **决策结果**（要跳到第几页），不是真实滚动位置。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Carousel from '@/components/data/Carousel.vue'

const slides = (w: ReturnType<typeof mount>) => w.findAll('.carousel-track > *')
const dots = (w: ReturnType<typeof mount>) => w.findAll('.carousel-dot')

function mountC(props: Record<string, unknown> = {}) {
  return mount(Carousel, {
    props: { count: 3, ...props } as never,
    slots: { default: '<div class="s">一</div><div class="s">二</div><div class="s">三</div>' },
  })
}

beforeEach(() => {
  // happy-dom 的 scrollTo 是空实现；给个可断言的桩
  HTMLElement.prototype.scrollTo = vi.fn() as unknown as typeof HTMLElement.prototype.scrollTo
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Carousel · 结构', () => {
  it('宿主几个子元素就是几页', () => {
    const w = mountC()
    expect(slides(w).length).toBe(3)
    w.unmount()
  })

  it('圆点数量 = count，选中态跟 modelValue 走', async () => {
    const w = mountC({ modelValue: 1 })
    expect(dots(w).length).toBe(3)
    expect(dots(w)[0]!.attributes('aria-selected')).toBe('false')
    expect(dots(w)[1]!.attributes('aria-selected')).toBe('true')
    w.unmount()
  })

  it('count <= 1 时不渲染箭头与圆点（单页没有可翻的）', () => {
    const w = mount(Carousel, { props: { count: 1 } as never, slots: { default: '<div>只有一页</div>' } })
    expect(w.findAll('.carousel-arrow').length).toBe(0)
    expect(dots(w).length).toBe(0)
    w.unmount()
  })

  it('箭头/圆点可分别关掉', () => {
    const w = mountC({ arrows: false, dots: false })
    expect(w.findAll('.carousel-arrow').length).toBe(0)
    expect(dots(w).length).toBe(0)
    w.unmount()
  })
})

describe('Carousel · 翻页决策', () => {
  it('点「下一页」emit 下一索引', async () => {
    const w = mountC({ modelValue: 0 })
    await w.find('.carousel-arrow--next').trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual([1])
    w.unmount()
  })

  it('**末页点下一页：loop 回到 0**', async () => {
    const w = mountC({ modelValue: 2 })
    await w.find('.carousel-arrow--next').trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual([0])
    w.unmount()
  })

  it('**末页点下一页：非 loop 停在末页（不 emit）**', async () => {
    const w = mountC({ modelValue: 2, loop: false })
    await w.find('.carousel-arrow--next').trigger('click')
    expect(w.emitted('update:modelValue')).toBeUndefined()
    w.unmount()
  })

  it('首页点上一页：loop 回到末页', async () => {
    const w = mountC({ modelValue: 0 })
    await w.find('.carousel-arrow--prev').trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual([2])
    w.unmount()
  })

  it('方向键左/右翻页（受控：宿主回写后接着翻）', async () => {
    const w = mountC({ modelValue: 1 })
    const track = w.find('.carousel-track')
    await track.trigger('keydown', { key: 'ArrowRight' })
    expect(w.emitted('update:modelValue')?.[0]).toEqual([2])

    // 受控语义：宿主不把新值写回来，组件下一次仍从 props 的 1 起算。
    // 这里模拟真实宿主（v-model）把 2 写回，再按左键 → 应回到 1。
    await w.setProps({ modelValue: 2 } as never)
    await track.trigger('keydown', { key: 'ArrowLeft' })
    expect(w.emitted('update:modelValue')?.[1]).toEqual([1])
    w.unmount()
  })

  it('点圆点跳到对应页', async () => {
    const w = mountC({ modelValue: 0 })
    await dots(w)[2]!.trigger('click')
    // 受控组件：圆点只驱动"滚到哪"，索引回写由滚动停稳后 emit；此处断言没抛错且滚动被调用
    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalled()
    w.unmount()
  })
})

describe('Carousel · 圆点的 roving tabindex（#509）', () => {
  /**
   * 圆点是 `role="tablist"` + `role="tab"` 的顺序容器，用共享的 `useRovingTabindex`。
   *
   * 这个 composable 的契约（看 `Tabs` / `SegmentedControl` / `NotificationCenter`
   * 三处调用即知）有两条，缺一条焦点就跟不上：
   *   ① keydown 挂在**容器**上 —— 它内部靠 `e.currentTarget.querySelector(...)` 找目标，
   *      `currentTarget` 必须是能搜到所有项的容器，不能是其中某一项；
   *   ② 每个项上要有 `data-roving-key="<key>"` —— 它就是被 querySelector 找的那个标记。
   *
   * Carousel 以前两条都没做（keydown 挂在下每个圆点按钮上、且完全没有 data-roving-key）：
   * 于是方向键只推进了**内部停靠点**，`el?.focus()` 查到 null → **真实焦点一动不动**。
   * 用户按右键看不到任何反应，而 Tab 的落点已经悄悄挪走。
   */
  function mountAttached(props: Record<string, unknown> = {}) {
    return mount(Carousel, {
      props: { count: 3, autoplay: 0, ...props } as never,
      slots: { default: '<div class="s">一</div><div class="s">二</div><div class="s">三</div>' },
      attachTo: document.body,
    })
  }

  it('每个圆点都带 data-roving-key（composable 靠它找焦点目标）', () => {
    const w = mountAttached()
    const keys = dots(w).map((d) => d.attributes('data-roving-key'))
    expect(keys).toEqual(['0', '1', '2'])
    w.unmount()
  })

  it('**方向键必须移动真实焦点**（不只是内部停靠点）', async () => {
    const w = mountAttached()
    const all = dots(w)
    ;(all[0]!.element as HTMLElement).focus()
    expect(document.activeElement).toBe(all[0]!.element)

    await all[0]!.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement, '焦点必须跟到第 2 个圆点，而不是留在原地').toBe(all[1]!.element)
    expect(dots(w)[1]!.attributes('tabindex'), '停靠点也要跟过去').toBe('0')
    expect(dots(w)[0]!.attributes('tabindex')).toBe('-1')

    await dots(w)[1]!.trigger('keydown', { key: 'End' })
    expect(document.activeElement, 'End 应落到最后一个圆点').toBe(dots(w)[2]!.element)
    w.unmount()
  })

  it('焦点与停靠点始终同进同出（不会出现"焦点在 A、Tab 落点在 B"）', async () => {
    const w = mountAttached()
    const all = dots(w)
    ;(all[2]!.element as HTMLElement).focus()
    await all[2]!.trigger('keydown', { key: 'ArrowLeft' })
    const focusedIdx = dots(w).findIndex((d) => d.element === document.activeElement)
    const stopIdx = dots(w).findIndex((d) => d.attributes('tabindex') === '0')
    expect(focusedIdx).toBeGreaterThanOrEqual(0)
    expect(focusedIdx, '获得焦点的那个必须就是唯一的 Tab 停靠点').toBe(stopIdx)
    w.unmount()
  })
})

describe('Carousel · 自动播放', () => {
  it('autoplay=0 不起定时器', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval')
    const w = mountC({ autoplay: 0 })
    await nextTick()
    expect(spy).not.toHaveBeenCalled()
    w.unmount()
  })

  it('**减弱动效下即使配了 autoplay 也不启动**', async () => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
    const spy = vi.spyOn(globalThis, 'setInterval')
    const w = mountC({ autoplay: 1000 })
    await nextTick()
    expect(spy).not.toHaveBeenCalled()
    window.matchMedia = original
    w.unmount()
  })
})
