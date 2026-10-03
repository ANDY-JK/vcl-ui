// Popover 交互路径护栏（C10）：
//   1. hover 路径：指针从触发器移入浮层（中间有 offset 间隙）不能被立刻关闭
//   2. focus 路径：焦点从触发器移入浮层内容不能关闭，移出两者才关闭
//   3. 触屏路径：tap 能打开 hover 触发的气泡，且不被触摸后合成的 mouseleave 立刻关闭
//   4. 定位：left/right 放置时按触发器「高度」垂直居中（此前误用宽度）
import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import Popover from '@/components/feedback/Popover.vue'
import { computeFloatingPosition } from '@/components/_internal/useFloating'

const mounted: VueWrapper[] = []
function track<T extends VueWrapper>(w: T): T {
  mounted.push(w)
  return w
}
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
})

function mountPopover(props: Record<string, unknown>, defaultSlot: string): VueWrapper {
  return track(
    mount(Popover, {
      props,
      slots: { default: defaultSlot, trigger: '<button class="trg" type="button">T</button>' },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    }),
  )
}

/** v-show 打开判定：display 非 none 即视为可见 */
function isOpen(w: VueWrapper): boolean {
  const el = w.find('.pop-floating').element as HTMLElement
  return el.style.display !== 'none'
}

/** 触发器包裹层（mouseenter/mouseleave 不冒泡，必须打在它身上） */
function triggerHost(w: VueWrapper) {
  return w.find('.popover-host > span')
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe('computeFloatingPosition · left/right 垂直居中', () => {
  it('按触发器高度 rect.height 居中，而非宽度', () => {
    const rect = {
      top: 100,
      left: 500,
      right: 600,
      bottom: 140,
      width: 100,
      height: 40,
      x: 500,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect
    const r = computeFloatingPosition({
      rect,
      floatingW: 80,
      floatingH: 20,
      offset: 8,
      defaultDirection: 'right',
    })
    expect(r.direction).toBe('right')
    expect(r.left).toBe(608)
    // 100 + (40 - 20) / 2 = 110；若误用 width(100) 则为 140
    expect(r.top).toBe(110)
  })
})

describe('Popover · hover 路径', () => {
  it('指针从触发器移入浮层时保持打开，离开浮层后才关闭', async () => {
    const w = mountPopover({ variant: 'popover', trigger: 'hover' }, '<p>内容</p>')
    const host = triggerHost(w)

    await host.trigger('mouseenter')
    expect(isOpen(w)).toBe(true)

    // 离开触发器后不能立刻关闭，否则指针还在间隙里浮层已 display:none、无法命中
    await host.trigger('mouseleave')
    expect(isOpen(w)).toBe(true)

    // 指针进入浮层，取消关闭
    await w.find('.pop-floating').trigger('mouseenter')
    await wait(200)
    expect(isOpen(w)).toBe(true)

    // 真正离开浮层后关闭
    await w.find('.pop-floating').trigger('mouseleave')
    await wait(200)
    expect(isOpen(w)).toBe(false)
  })
})

describe('Popover · focus 路径', () => {
  it('焦点移入浮层内容不关闭，移出两者才关闭', async () => {
    const w = mountPopover(
      { variant: 'popover', trigger: 'focus' },
      '<button class="inside" type="button">点我</button>',
    )
    const trg = w.find('.trg')

    await trg.trigger('focusin')
    expect(isOpen(w)).toBe(true)

    const inside = w.find('.inside').element
    trg.element.dispatchEvent(new FocusEvent('focusout', { relatedTarget: inside, bubbles: true }))
    await nextTick()
    expect(isOpen(w)).toBe(true)

    w.find('.pop-floating').element.dispatchEvent(new FocusEvent('focusout', { relatedTarget: null, bubbles: true }))
    await nextTick()
    expect(isOpen(w)).toBe(false)
  })
})

describe('Popover · 触屏路径', () => {
  it('tap 打开气泡，且触摸后合成的 mouseleave 不立即关闭', async () => {
    const w = mountPopover({ variant: 'popover', trigger: 'hover' }, '<p>内容</p>')
    const host = triggerHost(w)

    await host.trigger('touchstart')
    expect(isOpen(w)).toBe(true)

    // 移动端 tap 后浏览器会补发 mouseleave，不能据此关闭
    await host.trigger('mouseleave')
    await wait(200)
    expect(isOpen(w)).toBe(true)
  })
})
