// 修复锁定 #20 + #18：
//   #20 Drawer 遮罩改用 mousedown/mouseup 双判（与 ModalBox 一致）——
//      面板内按下、拖到遮罩松开时浏览器补发的 click 目标是最外层 overlay，
//      旧的 click.self 会命中并误关抽屉。
//   #18 Drawer zIndex 默认不再内联硬编 1000，交给 .drawer-overlay 的 var(--vcl-z-modal, 1000)；
//      Popover 暴露 zIndex，useFloating 默认走 --vcl-z-dropdown 变量。
import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import Drawer from '@/components/feedback/Drawer.vue'
import Popover from '@/components/feedback/Popover.vue'
import ModalBox from '@/components/layout/ModalBox.vue'

const mounted: VueWrapper[] = []
function track<T extends VueWrapper>(w: T): T {
  mounted.push(w)
  return w
}
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
})

function mountDrawer(props: Record<string, unknown> = {}): VueWrapper {
  return track(
    mount(Drawer, {
      props: { visible: true, title: '抽屉', ...props },
      slots: { default: '<p>内容</p>' },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    }),
  )
}

function mountPopover(props: Record<string, unknown> = {}): VueWrapper {
  return track(
    mount(Popover, {
      props: { variant: 'popover', ...props },
      slots: { default: '<p>内容</p>', trigger: '<button class="trg" type="button">T</button>' },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    }),
  )
}

function mountModal(props: Record<string, unknown> = {}): VueWrapper {
  return track(
    mount(ModalBox, {
      props: { visible: true, title: '弹窗', ...props },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    }),
  )
}

describe('Drawer · 遮罩误关', () => {
  it('面板内按下、拖到遮罩松开（含浏览器补发的 click）：不关闭', async () => {
    const w = mountDrawer()
    const overlay = w.find('.drawer-overlay')
    await w.find('.drawer-panel').trigger('mousedown')
    await overlay.trigger('mouseup')
    // 真实浏览器在 mousedown/mouseup 目标不同时补发 click，target 是共同祖先 overlay
    await overlay.trigger('click')
    expect(w.emitted('update:visible')).toBeUndefined()
  })

  it('遮罩上按下并松开：关闭', async () => {
    const w = mountDrawer()
    const overlay = w.find('.drawer-overlay')
    await overlay.trigger('mousedown')
    await overlay.trigger('mouseup')
    expect(w.emitted('update:visible')).toEqual([[false]])
  })

  it('遮罩按下后移出再松开：不关闭', async () => {
    const w = mountDrawer()
    const overlay = w.find('.drawer-overlay')
    await overlay.trigger('mousedown')
    await overlay.trigger('mouseleave')
    await overlay.trigger('mouseup')
    expect(w.emitted('update:visible')).toBeUndefined()
  })

  it('遮罩按下 → 面板内再按下 → 松开在遮罩：不关闭（按下标记不残留）', async () => {
    const w = mountDrawer()
    const overlay = w.find('.drawer-overlay')
    await overlay.trigger('mousedown')
    // 面板 mousedown 被 .stop 拦下，必须在面板侧复位，否则上一次落在遮罩的按下会残留到这次 mouseup
    await w.find('.drawer-panel').trigger('mousedown')
    await overlay.trigger('mouseup')
    expect(w.emitted('update:visible')).toBeUndefined()
  })

  it('maskClosable=false：遮罩按下松开也不关闭', async () => {
    const w = mountDrawer({ maskClosable: false })
    const overlay = w.find('.drawer-overlay')
    await overlay.trigger('mousedown')
    await overlay.trigger('mouseup')
    expect(w.emitted('update:visible')).toBeUndefined()
  })
})

describe('Drawer · zIndex 交给 CSS 变量', () => {
  it('不传 zIndex：不写内联 z-index，由 var(--vcl-z-modal, 1000) 决定', () => {
    const w = mountDrawer()
    expect((w.find('.drawer-overlay').element as HTMLElement).style.zIndex).toBe('')
  })

  it('传 zIndex：内联生效', () => {
    const w = mountDrawer({ zIndex: 3000 })
    expect((w.find('.drawer-overlay').element as HTMLElement).style.zIndex).toBe('3000')
  })
})

describe('Popover · zIndex 可配', () => {
  it('默认走 --vcl-z-dropdown 变量（等价 2000）', async () => {
    const w = mountPopover()
    await w.find('.trg').trigger('click')
    expect((w.find('.pop-floating').element as HTMLElement).style.zIndex).toBe('var(--vcl-z-dropdown, 2000)')
  })

  it('传 zIndex 覆盖默认', async () => {
    const w = mountPopover({ zIndex: 3000 })
    await w.find('.trg').trigger('click')
    expect((w.find('.pop-floating').element as HTMLElement).style.zIndex).toBe('3000')
  })
})

describe('ModalBox · 遮罩误关', () => {
  it('遮罩上按下并松开：关闭', async () => {
    const w = mountModal()
    const overlay = w.find('.modal-overlay')
    await overlay.trigger('mousedown')
    await overlay.trigger('mouseup')
    expect(w.emitted('update:visible')).toEqual([[false]])
  })

  it('遮罩按下 → 弹窗内再按下 → 松开在遮罩：不关闭（与 Drawer 同套判定）', async () => {
    const w = mountModal()
    const overlay = w.find('.modal-overlay')
    await overlay.trigger('mousedown')
    await w.find('.modal-box').trigger('mousedown')
    await overlay.trigger('mouseup')
    expect(w.emitted('update:visible')).toBeUndefined()
  })
})
