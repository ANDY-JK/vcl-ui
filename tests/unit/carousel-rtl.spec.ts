/**
 * Carousel · RTL 方向语义（#485）
 *
 * 真实浏览器取证（Chrome DevTools，`direction: rtl` 的 flex + scroll-snap 轨道）：
 *   `offsetLeft` = [0, -300, -600]，`scrollIntoView(第 n 页)` 的 scrollLeft = [0, -300, -600]。
 * 也就是说 **第 0 页在右边、下一页在左边**，而且 `goTo` 里
 * `target.offsetLeft - track.offsetLeft` 在 RTL 下**本来就是对的**（offsetLeft 自带负号），
 * 不要去"修"它。
 *
 * 真正没跟着方向走的是**方向键**：`ArrowRight` 恒调 `next()`（索引 +1），
 * 而 RTL 下索引 +1 是往左走 —— 按右键内容却往左翻，正好与浏览器原生滚动、
 * 以及视觉箭头相反。`ArrowLeft` 同理。本文件先把当前行为钉成红，再改。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import Carousel from '@/components/data/Carousel.vue'

function mountIn(dir: 'ltr' | 'rtl', props: Record<string, unknown> = {}) {
  return mount(Carousel, {
    props: { count: 3, modelValue: 1, ...props } as never,
    attrs: { dir },
    slots: { default: '<div class="s">一</div><div class="s">二</div><div class="s">三</div>' },
  })
}

beforeEach(() => {
  HTMLElement.prototype.scrollTo = vi.fn() as unknown as typeof HTMLElement.prototype.scrollTo
})
afterEach(() => vi.restoreAllMocks())

describe('Carousel · RTL 方向键镜像（#485）', () => {
  it('LTR：右→下一页、左→上一页（既有语义不许变）', async () => {
    const w = mountIn('ltr')
    const track = w.find('.carousel-track')
    await track.trigger('keydown', { key: 'ArrowRight' })
    expect(w.emitted('update:modelValue')?.[0]).toEqual([2])
    await w.setProps({ modelValue: 1 } as never)
    await track.trigger('keydown', { key: 'ArrowLeft' })
    expect(w.emitted('update:modelValue')?.[1]).toEqual([0])
    w.unmount()
  })

  it('RTL：右键 → 上一页（索引 -1）', async () => {
    const w = mountIn('rtl')
    await w.find('.carousel-track').trigger('keydown', { key: 'ArrowRight' })
    expect(w.emitted('update:modelValue')?.[0], 'RTL 下右键应往右（起始方向）翻').toEqual([0])
    w.unmount()
  })

  it('RTL：左键 → 下一页（索引 +1）', async () => {
    const w = mountIn('rtl')
    await w.find('.carousel-track').trigger('keydown', { key: 'ArrowLeft' })
    expect(w.emitted('update:modelValue')?.[0], 'RTL 下左键应往左（下一页）翻').toEqual([2])
    w.unmount()
  })

  it('方向是运行时读的：挂载后改 dir 立即生效（宿主切换语言不必重建组件）', async () => {
    const w = mountIn('ltr')
    w.element.setAttribute('dir', 'rtl')
    await w.find('.carousel-track').trigger('keydown', { key: 'ArrowRight' })
    expect(w.emitted('update:modelValue')?.[0]).toEqual([0])
    w.unmount()
  })

  it('两个方向键都 preventDefault（不让浏览器再滚一遍）', async () => {
    const w = mountIn('rtl')
    const e = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })
    w.find('.carousel-track').element.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    w.unmount()
  })
})

describe('Carousel · RTL 箭头字形', () => {
  it('CSS 里有 rtl 下把 ‹/› 镜像的规则（按钮位置用 inset-inline 换了边，字形也要换）', () => {
    const css = readFileSync(resolve('src/components/data/carousel-scoped.css'), 'utf8')
    expect(css).toMatch(/\[dir=["']?rtl["']?\][^{]*\{[^}]*scaleX\(-1\)/s)
  })
})