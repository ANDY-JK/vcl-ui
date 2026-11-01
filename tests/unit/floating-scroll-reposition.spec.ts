/**
 * useFloating · 滚动重定位（#307）
 *
 * ## 缺陷
 *
 * 浮层是 `position: fixed`（**视口**坐标），触发器等在文档流里。页面一滚，
 * 触发器走了、浮层原地不动 —— 用户看到「下拉面板飘在半空」。
 * 内部滚动容器（弹窗里的长列表）同理。
 *
 * 原来只监听 `resize` 与尺寸变化（ResizeObserver），**完全没有滚动**这条路径。
 *
 * ## 为什么测试要真挂组件
 *
 * `scroll` 的监听在 `onMounted` 里注册、`updatePosition` 依赖真实 DOM 的
 * `getBoundingClientRect`／`offsetHeight`，纯函数测不到"事件有没有接上"。
 * 这里用一个极小宿主组件直接调 `useFloating`，把 `getBoundingClientRect` 换掉，
 * 就能断言"滚一下，浮层的 top 跟着变"。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useFloating } from '@/components/_internal/useFloating'

/** 造一个"会随滚动移动"的触发器 */
function makeHost() {
  const rectTop = ref(100)
  const Host = defineComponent({
    setup() {
      const { triggerRef, floatingRef, floatingStyle, updatePosition } = useFloating({ offset: 4 })
      return () =>
        h('div', [
          h('button', {
            ref: (el: unknown) => {
              triggerRef.value = el as HTMLElement
              // 每次重算都读一次，模拟"页面滚了，触发器的视口坐标变了"
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
        ])
    },
  })
  const w = mount(Host, { attachTo: document.body })
  return { w, rectTop }
}

/** 合并窗口是 50ms，等它过去 */
const flushCoalesce = async () => {
  await new Promise((r) => setTimeout(r, 80))
  await nextTick()
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useFloating · 滚动重定位', () => {
  it('**滚动后浮层 top 跟着触发器走**（否则 fixed 浮层停在原地）', async () => {
    const { w, rectTop } = makeHost()
    const panel = w.findAll('div')[1]!
    w.find('.recalc').trigger('click')
    await nextTick()
    const before = parseFloat((panel.element as HTMLElement).style.top)
    expect(before, `初始 top 应约等于 100+32+4，实际 ${before}`).toBeGreaterThan(130)

    // 页面往下滚 200px → 触发器的视口坐标变小
    rectTop.value = -100
    document.dispatchEvent(new Event('scroll'))
    await flushCoalesce()

    const after = parseFloat((panel.element as HTMLElement).style.top)
    expect(after, `滚动后应重算（before=${before}, after=${after}）`).not.toBe(before)
  })

  it('**滚动监听挂在捕获阶段**（内部容器滚动也要收到）', async () => {
    const spy = vi.spyOn(document, 'addEventListener')
    const { w } = makeHost()
    const scrollCalls = spy.mock.calls.filter(([type]) => type === 'scroll')
    expect(scrollCalls.length, '应注册 scroll 监听').toBeGreaterThan(0)
    const opts = scrollCalls[0]![2] as AddEventListenerOptions
    expect(opts?.capture, 'scroll 不冒泡，必须 capture').toBe(true)
    expect(opts?.passive, '滚动监听要 passive').toBe(true)
    w.unmount()
  })
})
