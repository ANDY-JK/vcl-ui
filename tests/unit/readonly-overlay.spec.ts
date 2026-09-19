// 修复锁定：只读遮罩必须真的挡住键盘，而不是只挡鼠标
// 背景：遮罩只声明 aria-modal 但既不收拢焦点也不拦键盘，Tab 聚焦背景输入框后回车即可绕过只读提交
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReadOnlyOverlay from '@/components/feedback/ReadOnlyOverlay.vue'

const mounted: Array<{ unmount: () => void }> = []

function mountOverlay(props: { visible: boolean; reason?: string }) {
  const w = mount(ReadOnlyOverlay, { props, attachTo: document.body })
  mounted.push(w)
  return w
}

/** VTU 默认 stub 掉 <Transition>，根节点是 stub，遮罩本体要按类名取 */
function overlayEl(w: ReturnType<typeof mountOverlay>): HTMLElement {
  return w.find('.readonly-overlay').element as HTMLElement
}

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
})

function keydown(key: string, target: EventTarget = document) {
  const e = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true })
  target.dispatchEvent(e)
  return e
}

function addBackgroundButton() {
  const bg = document.createElement('button')
  bg.textContent = '提交'
  document.body.appendChild(bg)
  return bg
}

describe('ReadOnlyOverlay · 键盘不可绕过', () => {
  it('显示时遮罩可聚焦并立即获得焦点（aria-modal 语义落地）', async () => {
    const w = mountOverlay({ visible: true })
    await nextTick()
    const el = overlayEl(w)

    expect(el.getAttribute('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(el)
  })

  it('Tab 被拦截，焦点留在遮罩上（不会逃到背景控件）', async () => {
    const w = mountOverlay({ visible: true })
    await nextTick()
    const el = overlayEl(w)

    const e = keydown('Tab')
    expect(e.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(el)
  })

  it('背景元素拿到焦点时立即被弹回遮罩', async () => {
    const w = mountOverlay({ visible: true })
    await nextTick()
    const el = overlayEl(w)

    const bg = addBackgroundButton()
    bg.focus()
    await nextTick()

    expect(document.activeElement).toBe(el)
  })

  it('焦点逃到背景控件上时 Enter/Space 被拦截，无法触发提交', async () => {
    mountOverlay({ visible: true })
    await nextTick()
    const bg = addBackgroundButton()

    expect(keydown('Enter', bg).defaultPrevented).toBe(true)
    expect(keydown(' ', bg).defaultPrevented).toBe(true)
  })

  it('遮罩自身上的 Enter/Space 不拦截（保留 Space 滚动），滚动键也不拦', async () => {
    const w = mountOverlay({ visible: true })
    await nextTick()
    const el = overlayEl(w)

    expect(keydown('Enter', el).defaultPrevented).toBe(false)
    expect(keydown(' ', el).defaultPrevented).toBe(false)
    expect(keydown('ArrowDown', el).defaultPrevented).toBe(false)
    expect(keydown('PageDown', el).defaultPrevented).toBe(false)
  })

  it('隐藏状态不拦截键盘、不移焦', async () => {
    mountOverlay({ visible: false })
    await nextTick()

    expect(keydown('Tab').defaultPrevented).toBe(false)
  })

  it('visible 由 false 变 true 后才接管焦点', async () => {
    const w = mountOverlay({ visible: false })
    await nextTick()
    expect(keydown('Tab').defaultPrevented).toBe(false)

    await w.setProps({ visible: true })
    await nextTick()

    expect(document.activeElement).toBe(overlayEl(w))
    expect(keydown('Tab').defaultPrevented).toBe(true)
  })
})
