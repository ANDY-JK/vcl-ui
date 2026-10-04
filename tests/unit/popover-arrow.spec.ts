// Popover 指向三角（arrow）回归守护 —— 默认关不破坏「气泡无箭头」定案（2026-10-02）；
// arrowOffset 纯函数按触发器中心投影 + clamp 计算；浮层分层（.pop-floating 外壳 + .pop-skin 皮肤）。
import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
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

function mountPop(props: Record<string, unknown> = {}) {
  return track(
    mount(Popover, {
      props: { variant: 'popover', title: '标题', ...props },
      slots: { default: '<p>内容</p>', trigger: '<button class="trg" type="button">T</button>' },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    }),
  )
}

describe('Popover arrow（指向三角）', () => {
  it('默认不传 arrow：浮层无 .pop-arrow（无箭头定案不被默认值破坏）', () => {
    const w = mountPop()
    expect(w.find('.pop-arrow').exists()).toBe(false)
  })

  it('arrow=true：.pop-arrow 渲染且 aria-hidden（装饰性三角对读屏不可见）', () => {
    const w = mountPop({ arrow: true })
    const a = w.find('.pop-arrow')
    expect(a.exists()).toBe(true)
    expect(a.attributes('aria-hidden')).toBe('true')
  })

  it('tooltip 变体也可开 arrow，flip 方向类挂在 .pop-floating 外壳', () => {
    const w = mountPop({ variant: 'tooltip', arrow: true, text: '提示' })
    expect(w.find('.pop-arrow').exists()).toBe(true)
    const floating = w.find('.pop-floating')
    expect(floating.exists()).toBe(true)
    expect(floating.classes().filter((c) => c.startsWith('flip-')).length).toBe(1)
  })
})

describe('computeFloatingPosition.arrowOffset（纯函数）', () => {
  it('down 方向：触发器中心在浮层内 → 中心投影值', () => {
    const r = computeFloatingPosition({
      rect: { left: 100, top: 200, right: 140, bottom: 210, width: 40, height: 10 } as DOMRect,
      floatingW: 200,
      floatingH: 100,
      offset: 4,
      defaultDirection: 'down',
    })
    expect(r.arrowOffset).toBe(20) // 中心 x=120，浮层 left=100 → 20
  })

  it('down 方向：触发器贴浮层左缘 → clamp 到 ARROW_PAD(14)', () => {
    const r = computeFloatingPosition({
      rect: { left: 100, top: 200, right: 108, bottom: 210, width: 8, height: 10 } as DOMRect,
      floatingW: 200,
      floatingH: 100,
      offset: 4,
      defaultDirection: 'down',
    })
    expect(r.arrowOffset).toBe(14) // 中心 x=104 → 4，低于 14 被 clamp
  })

  it('right 方向：垂直居中后箭头对准触发器中心', () => {
    const r = computeFloatingPosition({
      rect: { left: 100, top: 200, right: 110, bottom: 230, width: 10, height: 30 } as DOMRect,
      floatingW: 200,
      floatingH: 100,
      offset: 4,
      defaultDirection: 'right',
    })
    expect(r.direction).toBe('right')
    expect(r.arrowOffset).toBe(50) // 浮层高 100，触发器中心垂直投影 = fh/2
  })
})
