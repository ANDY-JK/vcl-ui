/* eslint-disable vue/one-component-per-file -- 测试夹具：宿主组件只为挂载 useFloating（本仓既有约定，见 collect-reentry-guard.spec.ts） */
/**
 * useFloating · 全局监听的生命周期（TD-95，#387）
 *
 * ## 缺陷
 *
 * 原实现是**每个 useFloating 实例在 onMounted 常驻 4 个全局监听**
 * （window.resize / document.scroll[capture] / visualViewport.resize / visualViewport.scroll）。
 * 回调里只有 `if (!floatingRef.value) return` 的空转保护 ——
 * **保护的是"重算"，不是"回调本身"**：一次页面滚动仍会命中 N 个 handler（N = 浮层实例数）。
 *
 * 一页几十个 Select / DatePicker / Popover 时，滚动一次就是几十次空函数调用。
 *
 * ## 修法
 *
 * 改成"浮层打开时才挂、关闭即摘"。但"开没开"**useFloating 自己不知道**：
 * - v-if 型（Select）：面板关闭时不在 DOM → 看 `floatingRef` 就够；
 * - v-show 型（Popover / IconPicker）：面板**常驻 DOM**，只是 display 切换
 *   → 必须由宿主通过 `options.active()` 显式告知。
 *
 * ## 为什么必须真挂组件
 *
 * 判据是"监听有没有被 addEventListener / removeEventListener"，
 * 纯函数测不到。这里用极小宿主组件直接调 `useFloating`，spy 全局的 add/remove。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useFloating } from '@/components/_internal/useFloating'

/** 统计 window/document 上 add/remove 的净次数 */
function trackListeners() {
  const added: string[] = []
  const removed: string[] = []
  const wAdd = vi.spyOn(window, 'addEventListener')
  const wRemove = vi.spyOn(window, 'removeEventListener')
  const dAdd = vi.spyOn(document, 'addEventListener')
  const dRemove = vi.spyOn(document, 'removeEventListener')
  wAdd.mockImplementation(((type: string, ...rest: unknown[]) => {
    added.push(`window:${type}`)
    return void rest
  }) as never)
  wRemove.mockImplementation(((type: string, ...rest: unknown[]) => {
    removed.push(`window:${type}`)
    return void rest
  }) as never)
  dAdd.mockImplementation(((type: string, ...rest: unknown[]) => {
    added.push(`document:${type}`)
    return void rest
  }) as never)
  dRemove.mockImplementation(((type: string, ...rest: unknown[]) => {
    removed.push(`document:${type}`)
    return void rest
  }) as never)
  return {
    added,
    removed,
    restore: () => {
      wAdd.mockRestore()
      wRemove.mockRestore()
      dAdd.mockRestore()
      dRemove.mockRestore()
    },
  }
}

/**
 * v-show 型宿主：面板**常驻 DOM**，开没开由 active() 决定。
 * （Popover / IconPicker 就是这种形态）
 */
function makeVShowHost(initialOpen = false) {
  const open = ref(initialOpen)
  const Host = defineComponent({
    setup() {
      const { triggerRef, floatingRef } = useFloating({
        offset: 4,
        active: () => open.value,
      })
      return () =>
        h('div', [
          h('button', { ref: triggerRef }, 'trigger'),
          h('div', { ref: floatingRef }, 'panel'),
        ])
    },
  })
  const w = mount(Host, { attachTo: document.body })
  return { w, open }
}

/**
 * v-if 型宿主：面板**只在打开时**进 DOM（Select 就是这种形态）。
 */
function makeVIfHost() {
  const open = ref(false)
  const Host = defineComponent({
    setup() {
      const { triggerRef, floatingRef } = useFloating({ offset: 4 })
      return () =>
        h('div', [
          h('button', { ref: triggerRef }, 'trigger'),
          open.value ? h('div', { ref: floatingRef }, 'panel') : null,
        ])
    },
  })
  const w = mount(Host, { attachTo: document.body })
  return { w, open }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useFloating · 监听按需挂载（TD-95）', () => {
  it('**v-show 型：关闭时一个全局监听都不挂**（这是 TD-95 的正主）', () => {
    const t = trackListeners()
    const { w } = makeVShowHost(false)
    expect(t.added, `关闭状态不该挂监听，实际挂了：${t.added.join(', ')}`).toEqual([])
    t.restore()
    w.unmount()
  })

  it('**v-show 型：打开 → 挂上 resize + scroll；关闭 → 摘掉**', async () => {
    const t = trackListeners()
    const { w, open } = makeVShowHost(false)

    open.value = true
    await nextTick()
    await nextTick()
    expect(t.added, '打开后应挂 resize 与 scroll').toEqual(
      expect.arrayContaining(['window:resize', 'document:scroll']),
    )

    open.value = false
    await nextTick()
    await nextTick()
    expect(t.removed, '关闭后应摘掉 resize 与 scroll').toEqual(
      expect.arrayContaining(['window:resize', 'document:scroll']),
    )
    t.restore()
    w.unmount()
  })

  it('**v-if 型：面板不在 DOM 时不挂监听，渲染出来才挂**', async () => {
    const t = trackListeners()
    const { w, open } = makeVIfHost()
    expect(t.added, 'v-if 面板没渲染时不该挂监听').toEqual([])

    open.value = true
    await nextTick()
    await nextTick()
    expect(t.added, '面板渲染后应挂监听').toEqual(
      expect.arrayContaining(['window:resize', 'document:scroll']),
    )

    open.value = false
    await nextTick()
    await nextTick()
    expect(t.removed, '面板卸载后应摘掉监听').toEqual(
      expect.arrayContaining(['window:resize', 'document:scroll']),
    )
    t.restore()
    w.unmount()
  })

  it('**卸载时一定摘干净**（不能把监听留给已销毁的组件）', () => {
    const t = trackListeners()
    const { w } = makeVShowHost(true)
    const w2 = makeVShowHost(true)
    void w2
    w.unmount()
    expect(t.removed.length, '卸载必须成对移除').toBeGreaterThan(0)
    t.restore()
  })

  it('**打开状态下滚动仍会重算**（改生命周期不能改行为）', async () => {
    // 不打桩 addEventListener，用真实监听验证"打开后滚动仍生效"
    const rectTop = ref(100)
    const Host = defineComponent({
      setup() {
        const { triggerRef, floatingRef, floatingStyle, updatePosition, direction } = useFloating({
          offset: 4,
          active: () => true,
        })
        return () =>
          h('div', [
            h('button', {
              ref: (el: unknown) => {
                triggerRef.value = el as HTMLElement
                if (el) {
                  ;(el as HTMLElement).getBoundingClientRect = () =>
                    ({ top: rectTop.value, bottom: rectTop.value + 32, left: 20, width: 200 }) as DOMRect
                }
              },
            }, 'trigger'),
            h('div', {
              ref: (el: unknown) => {
                floatingRef.value = el as HTMLElement
                if (el) {
                  Object.defineProperty(el, 'offsetHeight', { value: 120, configurable: true })
                  Object.defineProperty(el, 'offsetWidth', { value: 200, configurable: true })
                }
              },
              style: floatingStyle.value,
            }, 'panel'),
            h('button', { class: 'recalc', onClick: () => updatePosition() }, 'recalc'),
            h('span', { class: 'dir' }, direction.value),
          ])
      },
    })
    const w = mount(Host, { attachTo: document.body })
    const panel = w.findAll('div')[1]!
    w.find('.recalc').trigger('click')
    await nextTick()
    const before = parseFloat((panel.element as HTMLElement).style.top)

    rectTop.value = -100
    document.dispatchEvent(new Event('scroll'))
    await new Promise((r) => setTimeout(r, 80))
    await nextTick()

    const after = parseFloat((panel.element as HTMLElement).style.top)
    expect(after, `打开状态下滚动应重算（before=${before}, after=${after}）`).not.toBe(before)
    w.unmount()
  })
})
