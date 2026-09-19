// 修复锁定 #17：浮层内容/配置变化后重算定位
//   1. ResizeObserver 必须同时观察触发器与浮层（此前只观察触发器，内容撑高不重算）
//   2. useFloating 配置项在调用时读取（此前 setup 一次性求值，Popover 动态改 text/position 后不生效）
// happy-dom 无布局引擎，ResizeObserver 不会因尺寸变化自动触发 —— 用假 RO 捕获回调后手动触发，
// 验证「尺寸变化 → updatePosition → 按当前配置重算」这条链路真实存在
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, onMounted, nextTick } from 'vue'
import Popover from '@/components/feedback/Popover.vue'
import { useFloating, type FlipDirection } from '@/components/_internal/useFloating'

const mounted: VueWrapper[] = []
function track<T extends VueWrapper>(w: T): T {
  mounted.push(w)
  return w
}

let roCallback: ResizeObserverCallback | null = null
let observed: Element[] = []

class FakeResizeObserver {
  constructor(cb: ResizeObserverCallback) {
    roCallback = cb
  }
  observe(el: Element) {
    observed.push(el)
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  roCallback = null
  observed = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
  mounted.splice(0).forEach((w) => w.unmount())
})

/** 最小 useFloating 宿主：配置用 getter 从 props 读，验证「调用时读取」 */
const Host = defineComponent({
  name: 'FloatingHost',
  props: {
    offset: { type: Number, default: 8 },
    direction: { type: String, default: 'down' },
  },
  setup(props) {
    const { triggerRef, floatingRef, floatingStyle, updatePosition } = useFloating({
      get offset() {
        return props.offset
      },
      get defaultDirection() {
        return props.direction as FlipDirection
      },
      get minSize() {
        return 40
      },
      matchWidth: false,
    })
    onMounted(() => {
      // happy-dom 无布局：给触发器一个视口内的 rect，否则 top 会被 8px 边界钳制掩盖 offset 差异
      triggerRef.value!.getBoundingClientRect = () =>
        ({
          top: 100,
          bottom: 120,
          left: 10,
          right: 110,
          width: 100,
          height: 20,
          x: 10,
          y: 100,
          toJSON: () => ({}),
        }) as DOMRect
      updatePosition()
    })
    return () =>
      h('div', { class: 'host' }, [
        h('button', { ref: triggerRef, class: 'trg' }, 'T'),
        h('div', { ref: floatingRef, class: 'flo', style: floatingStyle.value }, 'F'),
      ])
  },
})

function mountHost(offset: number): VueWrapper {
  return track(mount(Host, { props: { offset }, attachTo: document.body }))
}

describe('useFloating · 尺寸观察', () => {
  it('ResizeObserver 同时观察触发器与浮层', async () => {
    const w = track(
      mount(Popover, {
        props: { variant: 'popover' },
        slots: { default: '<p>内容</p>', trigger: '<button class="trg" type="button">T</button>' },
        global: { stubs: { teleport: true } },
        attachTo: document.body,
      }),
    )
    await nextTick()

    expect(observed).toContain(w.find('.popover-host > span').element)
    expect(observed).toContain(w.find('.popover-card').element)
  })
})

describe('useFloating · 配置惰性读取', () => {
  it('浮层尺寸变化后按当前 offset 重算', async () => {
    const w = mountHost(8)
    await nextTick()
    const flo = w.find('.flo').element as HTMLElement
    expect(flo.style.top).toBe('128px')

    await w.setProps({ offset: 6 })
    expect(roCallback).toBeTruthy()
    roCallback!([], {} as ResizeObserver)
    await nextTick()

    expect(flo.style.top).toBe('126px')
  })
})
