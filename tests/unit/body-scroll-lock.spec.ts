// 修复锁定 #19：Drawer/ModalBox 打开期间锁 body 滚动（引用计数）
// 背景：全屏遮罩下滚轮直穿背景，模态语境被破坏；多层弹窗叠放时任意一层先关都不能解锁
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import Drawer from '@/components/feedback/Drawer.vue'
import ModalBox from '@/components/layout/ModalBox.vue'

const mounted: VueWrapper[] = []
function track<T extends VueWrapper>(w: T): T {
  mounted.push(w)
  return w
}

function mountDrawer(visible: boolean): VueWrapper {
  return track(
    mount(Drawer, {
      props: { visible, title: '抽屉' },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    }),
  )
}

function mountModal(visible: boolean): VueWrapper {
  return track(
    mount(ModalBox, {
      props: { visible, title: '弹窗' },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    }),
  )
}

beforeEach(() => {
  document.body.style.overflow = ''
})

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  document.body.style.overflow = ''
})

describe('body 滚动锁 · 单层弹窗', () => {
  it('Drawer 打开锁 body、关闭恢复', async () => {
    const w = mountDrawer(true)
    await nextTick()
    expect(document.body.style.overflow).toBe('hidden')

    await w.setProps({ visible: false })
    expect(document.body.style.overflow).toBe('')
  })

  it('ModalBox 打开锁 body、关闭恢复', async () => {
    const w = mountModal(true)
    await nextTick()
    expect(document.body.style.overflow).toBe('hidden')

    await w.setProps({ visible: false })
    expect(document.body.style.overflow).toBe('')
  })

  it('恢复时写回打开前的内联值，不覆盖宿主设置', async () => {
    document.body.style.overflow = 'scroll'
    const w = mountDrawer(true)
    await nextTick()
    expect(document.body.style.overflow).toBe('hidden')

    await w.setProps({ visible: false })
    expect(document.body.style.overflow).toBe('scroll')
  })
})

describe('body 滚动锁 · 引用计数', () => {
  it('两层叠放：关掉一层仍锁定，全部关闭才恢复', async () => {
    const drawer = mountDrawer(true)
    const modal = mountModal(true)
    await nextTick()
    expect(document.body.style.overflow).toBe('hidden')

    await drawer.setProps({ visible: false })
    expect(document.body.style.overflow).toBe('hidden')

    await modal.setProps({ visible: false })
    expect(document.body.style.overflow).toBe('')
  })

  it('未关闭就卸载的弹窗也释放锁，不残留永久锁死', async () => {
    const w = mountDrawer(true)
    await nextTick()
    expect(document.body.style.overflow).toBe('hidden')

    w.unmount()
    mounted.splice(mounted.indexOf(w), 1)
    expect(document.body.style.overflow).toBe('')
  })
})
