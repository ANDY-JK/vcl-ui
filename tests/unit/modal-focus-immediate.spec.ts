// 修复锁定：弹层"挂载即 visible=true"时焦点陷阱/互斥注册必须立即生效
// 背景：useFocusTrap、ModalBox/Drawer 的 registerModal 都用 watch(visible) 且无 immediate，
//      初始就为 true 的弹层永远不激活 → 焦点留在页面、同域互斥失效、Drawer 面板甚至不渲染
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'
import ModalBox from '@/components/layout/ModalBox.vue'
import Drawer from '@/components/feedback/Drawer.vue'

const mounted: Array<{ unmount: () => void }> = []

function track<T extends { unmount: () => void }>(w: T): T {
  mounted.push(w)
  return w
}

function cleanup() {
  mounted.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
}

afterEach(cleanup)

describe('useFocusTrap · 初始可见即激活', () => {
  it('初始 visible=true 时同步激活并聚焦容器内首个可聚焦元素', async () => {
    const el = document.createElement('div')
    el.tabIndex = -1
    const btn = document.createElement('button')
    el.appendChild(btn)
    document.body.appendChild(el)

    const visible = ref(true)
    const trap = useFocusTrap({ visible, getContainer: () => el })

    expect(trap.isActive()).toBe(true)

    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(btn)

    trap.deactivate()
    el.remove()
  })
})

describe('ModalBox · 初始可见即接管', () => {
  it('初始 visible=true 时按 autofocus 聚焦 footer 末位按钮', async () => {
    track(
      mount(ModalBox, {
        props: { visible: true },
        slots: { footer: '<button id="f1">取消</button><button id="f2">确定</button>' },
        attachTo: document.body,
      }),
    )
    await nextTick()
    await nextTick()

    expect(document.activeElement?.id).toBe('f2')
  })

  it('初始 visible=true 参与互斥：后挂载者关闭先挂载者', async () => {
    const scope = 'c6-modal'
    const a = track(mount(ModalBox, { props: { visible: true, mutexScope: scope }, attachTo: document.body }))
    track(mount(ModalBox, { props: { visible: true, mutexScope: scope }, attachTo: document.body }))
    await nextTick()

    expect(a.emitted('update:visible')).toEqual([[false]])
  })
})

describe('Drawer · 初始可见即接管', () => {
  it('destroyOnClose=false 且初始 visible=true 时面板直接渲染', async () => {
    track(
      mount(Drawer, {
        props: { visible: true, destroyOnClose: false },
        attachTo: document.body,
      }),
    )
    await nextTick()

    expect(document.querySelector('.drawer-panel')).not.toBeNull()
  })

  it('初始 visible=true 参与互斥：后挂载者关闭先挂载者', async () => {
    const scope = 'c6-drawer'
    const a = track(mount(Drawer, { props: { visible: true, mutexScope: scope }, attachTo: document.body }))
    track(mount(Drawer, { props: { visible: true, mutexScope: scope }, attachTo: document.body }))
    await nextTick()

    expect(a.emitted('update:visible')).toEqual([[false]])
  })
})
