// 修复锁定：焦点陷阱只应在"可见"的可聚焦元素之间循环
// 背景：FOCUSABLE_SELECTOR 把 display:none / 隐藏祖先内的元素也算进去，
//      首/末元素取到不可见节点 → 打开时焦点落到隐藏元素，Tab 循环跳进隐藏区
import { describe, it, expect, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'

const traps: Array<() => void> = []

afterEach(() => {
  traps.splice(0).forEach((d) => d())
  document.body.innerHTML = ''
})

function makeContainer(...children: HTMLElement[]) {
  const el = document.createElement('div')
  el.tabIndex = -1
  children.forEach((c) => el.appendChild(c))
  document.body.appendChild(el)
  return el
}

function btn(id: string, display?: string) {
  const b = document.createElement('button')
  b.id = id
  if (display) b.style.display = display
  return b
}

function hiddenWrap(...children: HTMLElement[]) {
  const wrap = document.createElement('div')
  wrap.style.display = 'none'
  children.forEach((c) => wrap.appendChild(c))
  return wrap
}

function activate(el: HTMLElement) {
  const trap = useFocusTrap({ visible: ref(false), getContainer: () => el })
  traps.push(() => {
    trap.deactivate()
    el.remove()
  })
  trap.activate()
  return trap
}

describe('useFocusTrap · 可见性过滤', () => {
  it('display:none 的元素不参与首焦点', async () => {
    const el = makeContainer(btn('h1', 'none'), btn('v1'))
    activate(el)

    await nextTick()
    await nextTick()
    expect(document.activeElement?.id).toBe('v1')
  })

  it('隐藏祖先内的元素不参与首焦点', async () => {
    const el = makeContainer(hiddenWrap(btn('h-in-wrap')), btn('v1'))
    activate(el)

    await nextTick()
    await nextTick()
    expect(document.activeElement?.id).toBe('v1')
  })

  it('Tab 循环用可见的首尾：末位可见元素 Tab 回首个可见元素', async () => {
    const el = makeContainer(btn('h1', 'none'), btn('v1'), btn('v2'))
    activate(el)
    const v2 = el.querySelector<HTMLElement>('#v2')!
    v2.focus()

    const evt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    window.dispatchEvent(evt)

    expect(evt.defaultPrevented).toBe(true)
    expect(document.activeElement?.id).toBe('v1')
  })

  it('全部不可见时回落到容器本身（不聚焦隐藏元素）', async () => {
    const el = makeContainer(btn('h1', 'none'), hiddenWrap(btn('h2')))
    activate(el)

    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(el)
  })
})
