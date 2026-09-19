// #24(d) Loading fullscreen：补 aria-busy、无 text 时的无障碍文案（i18n common.loading）、body 滚动锁
//         不做焦点陷阱是有意的：这是非交互的加载遮罩，把键盘用户困在里面反而更糟
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Loading from '@/components/feedback/Loading.vue'

const mounted: Array<{ unmount: () => void }> = []

function track<T extends { unmount: () => void }>(w: T): T {
  mounted.push(w)
  return w
}

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
  document.body.style.overflow = ''
})

describe('Loading · fullscreen 无障碍与滚动锁', () => {
  it('无 text 时补无障碍文案，且容器标记 aria-busy', async () => {
    track(mount(Loading, { props: { fullscreen: true }, attachTo: document.body }))
    await nextTick()

    const overlay = document.querySelector('.loading-fullscreen')
    expect(overlay).not.toBeNull()
    expect(overlay!.getAttribute('aria-busy')).toBe('true')

    // 播报区必须在 aria-busy 子树之外：aria-busy=true 会让 AT 挂起该子树内 live region 的播报
    const live = document.querySelector('.loading-fullscreen__live') as HTMLElement | null
    expect(live).not.toBeNull()
    expect(live!.getAttribute('role')).toBe('status')
    expect(live!.textContent).toContain('加载中...')
    expect(overlay!.contains(live)).toBe(false)
  })

  it('有 text 时用调用方文案，不重复输出兜底文案', async () => {
    track(mount(Loading, { props: { fullscreen: true, text: '正在保存' }, attachTo: document.body }))
    await nextTick()

    const live = document.querySelector('.loading-fullscreen__live')!
    expect(live.textContent).toContain('正在保存')
    expect(live.textContent).not.toContain('加载中...')
  })

  it('fullscreen 打开锁 body 滚动，卸载后恢复', async () => {
    const w = track(mount(Loading, { props: { fullscreen: true } }))
    await nextTick()
    expect(document.body.style.overflow).toBe('hidden')

    w.unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('非 fullscreen 不锁 body', async () => {
    track(mount(Loading, { props: {} }))
    await nextTick()
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})
