// C13 护栏：Toast / Loading(fullscreen) 的 Teleport 目标可配置
// 背景：Web Components 模式下组件渲染在 Shadow DOM 内，固定 Teleport 到 body 会逃出
// 宿主根（样式/焦点隔离），宿主需要能指向自己的容器。默认仍是 body（H5 行为不变）。
import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import Toast from '@/components/feedback/Toast.vue'
import Loading from '@/components/feedback/Loading.vue'

const mounted: VueWrapper[] = []
const hosts: HTMLElement[] = []

function makeHost(id: string): HTMLElement {
  const el = document.createElement('div')
  el.id = id
  document.body.appendChild(el)
  hosts.push(el)
  return el
}

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  hosts.splice(0).forEach((el) => el.remove())
})

describe('Toast · teleport 目标可配', () => {
  it('默认 Teleport 到 body（H5 行为不变）', async () => {
    const w = mount(Toast, { attachTo: document.body })
    mounted.push(w)
    ;(w.vm as unknown as { show: (m: string, t?: string, d?: number) => number }).show('hi', 'info', 0)
    await nextTick()
    expect(document.body.querySelector('.toast-container')).toBeTruthy()
    expect(w.find('.toast-container').exists()).toBe(false)
  })

  it('传 teleportTo 时渲染进指定容器（Shadow DOM 宿主场景）', async () => {
    const host = makeHost('toast-target')
    const w = mount(Toast, { props: { teleportTo: '#toast-target' }, attachTo: document.body })
    mounted.push(w)
    ;(w.vm as unknown as { show: (m: string, t?: string, d?: number) => number }).show('hi', 'info', 0)
    await nextTick()
    expect(host.querySelector('.toast-container')).toBeTruthy()
  })
})

describe('Loading · fullscreen teleport 目标可配', () => {
  it('默认 Teleport 到 body', () => {
    const w = mount(Loading, { props: { fullscreen: true }, attachTo: document.body })
    mounted.push(w)
    expect(document.body.querySelector('.loading-fullscreen')).toBeTruthy()
    expect(w.find('.loading-fullscreen').exists()).toBe(false)
  })

  it('传 teleportTo 时渲染进指定容器', () => {
    const host = makeHost('loading-target')
    const w = mount(Loading, { props: { fullscreen: true, teleportTo: '#loading-target' }, attachTo: document.body })
    mounted.push(w)
    expect(host.querySelector('.loading-fullscreen')).toBeTruthy()
  })
})
