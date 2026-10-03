// 修复锁定 #16：Popover 键盘链补齐
//   1. Esc 关闭（与其它弹层一致）
//   2. tooltip：role="tooltip" + 触发器 aria-describedby 指向浮层
//   3. dialog：标题元素有 id，浮层 aria-labelledby 指向它；无 title 不挂
import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import Popover from '@/components/feedback/Popover.vue'

const mounted: VueWrapper[] = []
function track<T extends VueWrapper>(w: T): T {
  mounted.push(w)
  return w
}
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
})

function mountTip(): VueWrapper {
  return track(
    mount(Popover, {
      props: { text: '提示文字' },
      slots: { default: '<button class="tip-target" type="button">T</button>' },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    }),
  )
}

function mountCard(props: Record<string, unknown> = {}): VueWrapper {
  return track(
    mount(Popover, {
      props: { variant: 'popover', title: '标题', ...props },
      slots: { default: '<p>内容</p>', trigger: '<button class="trg" type="button">T</button>' },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    }),
  )
}

function isOpen(w: VueWrapper, sel: string): boolean {
  const el = w.find(sel).element as HTMLElement
  return el.style.display !== 'none'
}

describe('Popover · tooltip 语义', () => {
  it('浮层 role="tooltip"，触发器 aria-describedby 指向它', async () => {
    const w = mountTip()
    await nextTick()

    const tip = w.find('.pop-floating')
    expect(tip.attributes('role')).toBe('tooltip')

    const id = tip.attributes('id')
    expect(id).toBeTruthy()
    expect(w.find('.tip-target').attributes('aria-describedby')).toBe(id)
  })

  it('触发器首个子元素不可聚焦时，aria-describedby 挂到首个可聚焦后代', async () => {
    const w = track(
      mount(Popover, {
        props: { text: '提示文字' },
        slots: { default: '<span class="icon">i</span><button class="tip-btn" type="button">T</button>' },
        global: { stubs: { teleport: true } },
        attachTo: document.body,
      }),
    )
    await nextTick()

    const id = w.find('.pop-floating').attributes('id')
    expect(id).toBeTruthy()
    expect(w.find('.tip-btn').attributes('aria-describedby')).toBe(id)
    // 不可聚焦的图标 span 挂上去了读屏也不会播报
    expect(w.find('.icon').attributes('aria-describedby')).toBeUndefined()
  })
})

describe('Popover · dialog 语义', () => {
  it('有 title：标题元素 id 与浮层 aria-labelledby 关联', () => {
    const w = mountCard()
    const card = w.find('.pop-floating')
    expect(card.attributes('role')).toBe('dialog')

    const labelledby = card.attributes('aria-labelledby')
    expect(labelledby).toBeTruthy()
    expect(w.find('.popover-title').attributes('id')).toBe(labelledby)
  })

  it('无 title：不挂 aria-labelledby，避免指向不存在的 id', () => {
    const w = mountCard({ title: '' })
    expect(w.find('.pop-floating').attributes('aria-labelledby')).toBeUndefined()
  })
})

describe('Popover · Esc 关闭', () => {
  it('打开后按 Escape 关闭', async () => {
    const w = mountCard()
    await w.find('.trg').trigger('click')
    await nextTick()
    expect(isOpen(w, '.pop-floating')).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(isOpen(w, '.pop-floating')).toBe(false)
  })
})
