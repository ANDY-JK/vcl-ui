/* eslint-disable vue/one-component-per-file -- 本文件为组合式函数的宿主壳：
   useScrollEdge 依赖组件生命周期（onMounted/onBeforeUnmount），不挂组件就测不到真实行为。
   每个用例现造一个最小壳组件是刻意的，不是"一文件多组件"的设计问题。 */
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useScrollEdge, type ScrollEdgeState } from '@/components/_internal/scroll-edge'

/**
 * 造一个带可控滚动度量的元素。
 * happy-dom 不做布局，`scrollTop/clientHeight/scrollHeight` 恒为 0，必须自己钉住。
 */
function makeScrollEl(metrics: { scrollTop?: number; clientHeight?: number; scrollHeight?: number }): HTMLElement {
  const el = document.createElement('div')
  const define = (key: string, value: number): void => {
    Object.defineProperty(el, key, { value, writable: true, configurable: true })
  }
  define('scrollTop', metrics.scrollTop ?? 0)
  define('clientHeight', metrics.clientHeight ?? 0)
  define('scrollHeight', metrics.scrollHeight ?? 0)
  return el
}

/** 在一个真实组件里跑 composable，拿到它返回的状态（生命周期钩子需要组件上下文） */
function harness(el: HTMLElement): { state: ScrollEdgeState; wrapper: ReturnType<typeof mount> } {
  const elRef: Ref<HTMLElement | null> = ref<HTMLElement | null>(el)
  let state: ScrollEdgeState | null = null
  const Comp = defineComponent({
    setup() {
      state = useScrollEdge(elRef)
      return () => null
    },
  })
  const wrapper = mount(Comp)
  if (!state) throw new Error('composable 未执行')
  return { state, wrapper }
}

describe('useScrollEdge — 滚动边缘遮罩的顶/底到达判定', () => {
  it('内容不溢出时：顶部与底部都成立（两条遮罩都不该出现）', () => {
    const el = makeScrollEl({ scrollTop: 0, clientHeight: 400, scrollHeight: 400 })
    const { state, wrapper } = harness(el)
    expect(state.atTop.value).toBe(true)
    expect(state.atBottom.value).toBe(true)
    wrapper.unmount()
  })

  it('内容溢出且停在顶部：atTop 真、atBottom 假（只在底部提示还有内容）', () => {
    const el = makeScrollEl({ scrollTop: 0, clientHeight: 400, scrollHeight: 1200 })
    const { state, wrapper } = harness(el)
    state.sync()
    expect(state.atTop.value).toBe(true)
    expect(state.atBottom.value).toBe(false)
    wrapper.unmount()
  })

  it('滚到中间：两侧遮罩都出现', () => {
    const el = makeScrollEl({ scrollTop: 300, clientHeight: 400, scrollHeight: 1200 })
    const { state, wrapper } = harness(el)
    state.sync()
    expect(state.atTop.value).toBe(false)
    expect(state.atBottom.value).toBe(false)
    wrapper.unmount()
  })

  it('滚到底：atBottom 真、atTop 假（顶部提示回看，底部收起）', () => {
    const el = makeScrollEl({ scrollTop: 800, clientHeight: 400, scrollHeight: 1200 })
    const { state, wrapper } = harness(el)
    state.sync()
    expect(state.atTop.value).toBe(false)
    expect(state.atBottom.value).toBe(true)
    wrapper.unmount()
  })

  it('子像素差仍算到底：差 0.5px 时不挂底部遮罩（等比缩放下常见）', () => {
    const el = makeScrollEl({ scrollTop: 799.5, clientHeight: 400, scrollHeight: 1200 })
    const { state, wrapper } = harness(el)
    state.sync()
    expect(state.atBottom.value).toBe(true)
    wrapper.unmount()
  })

  it('内容变短（未滚动、只变尺寸）时 sync 能重新判定', () => {
    const el = makeScrollEl({ scrollTop: 300, clientHeight: 400, scrollHeight: 1200 })
    const { state, wrapper } = harness(el)
    state.sync()
    expect(state.atBottom.value).toBe(false)
    // 内容被筛掉一半：scrollHeight 缩小、浏览器会把 scrollTop 夹回 0
    Object.defineProperty(el, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(el, 'scrollTop', { value: 100, configurable: true })
    state.sync()
    expect(state.atBottom.value).toBe(true)
    wrapper.unmount()
  })

  it('内容增删（不滚动、容器尺寸不变）也能自动重算 —— 筛选后列表变短不许还挂着底部遮罩', async () => {
    const el = makeScrollEl({ scrollTop: 300, clientHeight: 400, scrollHeight: 1200 })
    const { state, wrapper } = harness(el)
    state.sync()
    expect(state.atBottom.value).toBe(false)

    // 内容被筛掉：scrollHeight 变小、浏览器把 scrollTop 夹回；这一步既不 scroll 也不 resize
    Object.defineProperty(el, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(el, 'scrollTop', { value: 100, configurable: true })
    el.appendChild(document.createElement('div')) // 仅触发 childList 变更
    await new Promise((resolve) => setTimeout(resolve, 30)) // 等一帧 rAF

    expect(state.atBottom.value).toBe(true)
    wrapper.unmount()
  })

  it('卸载后摘掉 scroll 监听（不留常驻监听）', () => {
    const el = makeScrollEl({ scrollTop: 0, clientHeight: 400, scrollHeight: 1200 })
    const removeSpy = vi.spyOn(el, 'removeEventListener')
    const { wrapper } = harness(el)
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function))
  })

  it('没有 ResizeObserver 的环境不抛错（降级为只在 scroll 时算）', () => {
    const original = globalThis.ResizeObserver
    // @ts-expect-error 故意删掉，验证降级路径
    delete globalThis.ResizeObserver
    try {
      const el = makeScrollEl({ scrollTop: 0, clientHeight: 400, scrollHeight: 1200 })
      const { state, wrapper } = harness(el)
      state.sync()
      expect(state.atBottom.value).toBe(false)
      wrapper.unmount()
    } finally {
      globalThis.ResizeObserver = original
    }
  })
})

describe('useScrollEdge — 滚动体晚于挂载才出现（v-if 弹层）', () => {
  /** 挂载时 ref 还是 null 的宿主：模拟 Drawer 里 `v-if="visible"` 的滚动体 */
  function lateHarness(): {
    state: ScrollEdgeState | null
    setEl: (el: HTMLElement | null) => void
    wrapper: ReturnType<typeof mount>
  } {
    const elRef: Ref<HTMLElement | null> = ref<HTMLElement | null>(null)
    let state: ScrollEdgeState | null = null
    const Comp = defineComponent({
      setup() {
        state = useScrollEdge(elRef)
        return () => null
      },
    })
    const wrapper = mount(Comp)
    return {
      get state() {
        return state
      },
      setEl: (el) => {
        elRef.value = el
      },
      wrapper,
    } as never
  }

  it('**ref 一填上就立即接管**：不必等用户滚动，遮罩立刻算对', async () => {
    const h = lateHarness()
    expect(h.state!.atBottom.value, '还没元素时应停在初始态').toBe(true)

    h.setEl(makeScrollEl({ scrollTop: 0, clientHeight: 400, scrollHeight: 1200 }))
    await nextTick() // flush: 'post'
    await nextTick()

    expect(h.state!.atTop.value).toBe(true)
    expect(h.state!.atBottom.value, '溢出且停在顶部 → 底部遮罩该亮').toBe(false)
    h.wrapper.unmount()
  })

  it('ref 换成另一个元素时，监听要跟着换（旧元素不再驱动状态）', async () => {
    const h = lateHarness()
    const first = makeScrollEl({ scrollTop: 0, clientHeight: 400, scrollHeight: 1200 })
    h.setEl(first)
    await nextTick()
    await nextTick()
    expect(h.state!.atBottom.value).toBe(false)

    const removeSpy = vi.spyOn(first, 'removeEventListener')
    const second = makeScrollEl({ scrollTop: 0, clientHeight: 400, scrollHeight: 400 })
    h.setEl(second)
    await nextTick()
    await nextTick()

    expect(removeSpy, '旧元素的 scroll 监听必须摘掉，否则两份状态互相打架').toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
    )
    expect(h.state!.atBottom.value, '新元素无溢出 → 底部遮罩收起').toBe(true)
    h.wrapper.unmount()
  })

  it('ref 清空（弹层关闭）后不残留监听', async () => {
    const h = lateHarness()
    const el = makeScrollEl({ scrollTop: 0, clientHeight: 400, scrollHeight: 1200 })
    h.setEl(el)
    await nextTick()
    const removeSpy = vi.spyOn(el, 'removeEventListener')
    h.setEl(null)
    await nextTick()
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function))
    h.wrapper.unmount()
  })
})
