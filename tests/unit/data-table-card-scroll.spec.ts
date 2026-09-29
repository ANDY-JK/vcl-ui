// 卡片视图增量渲染的触发判据 —— 提前量按容器实测高度算（还剩一屏就补下一批），
// 而不是写死一个像素数：同一批数据放进高容器/矮容器，触发时机应当不同。
// happy-dom 没有真实布局，故这里直接给滚动元素打尺寸桩，只验算这段算术。
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import DataTable from '@/components/data/DataTable.vue'
import type { Column } from '@/components/data/composables/types'

const COLS: Column[] = [{ key: 'name', title: '名称' }]
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `门店 ${i}` }))

const wrappers: VueWrapper[] = []

function mountCard(n: number) {
  // cardBreakpoint 给到比测试环境视口大得多 → 走卡片视图（与"窄屏自动切卡片"同一条判定）
  const w = mount(DataTable, {
    props: { columns: COLS, data: rows(n), rowKey: 'id', autoFit: false, cardBreakpoint: 9999 },
    attachTo: document.body,
  })
  wrappers.push(w)
  return w
}

function stubScroller(w: VueWrapper, scrollHeight: number, clientHeight: number) {
  const el = w.find('.card-view-scroll').element as HTMLElement
  expect(el, '卡片视图容器未渲染').toBeTruthy()
  for (const [k, v] of Object.entries({ scrollHeight, clientHeight }))
    Object.defineProperty(el, k, { configurable: true, writable: true, value: v })
  return el
}

const cards = (w: VueWrapper) => w.findAll('.card-view-item').length

function scrollToRemaining(el: HTMLElement, remaining: number, scrollHeight: number) {
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    writable: true,
    value: scrollHeight - el.clientHeight - remaining,
  })
  el.dispatchEvent(new Event('scroll'))
}

afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('DataTable · 卡片视图补批', () => {
  it('初始只渲染一批', () => {
    expect(cards(mountCard(120))).toBe(50)
  })

  it('剩余不足一屏即补批（写死 200px 时这种高容器场景要滚到贴底才补）', async () => {
    const w = mountCard(120)
    const el = stubScroller(w, 12000, 600)
    scrollToRemaining(el, 400, 12000)
    await w.vm.$nextTick()
    expect(cards(w)).toBe(100)
  })

  it('剩余超过一屏不补（高容器里不再提前把整表拉进 DOM）', async () => {
    const w = mountCard(120)
    const el = stubScroller(w, 12000, 600)
    scrollToRemaining(el, 700, 12000)
    await w.vm.$nextTick()
    expect(cards(w)).toBe(50)
  })

  it('同一剩余量在矮容器里不触发（300 高的容器不算"还剩一屏"）—— 与上一条对照，判据跟着容器高度走', async () => {
    const w = mountCard(120)
    const el = stubScroller(w, 12000, 300)
    scrollToRemaining(el, 400, 12000)
    await w.vm.$nextTick()
    expect(cards(w)).toBe(50)
    scrollToRemaining(el, 250, 12000)
    await w.vm.$nextTick()
    expect(cards(w)).toBe(100)
  })
})

// —— 批大小由卡片实测间距换算（固定 50 张的问题：矮卡片一次补七八屏、高卡片不到一屏）——

function stubCardPitch(w: VueWrapper, pitch: number) {
  const items = w.findAll('.card-view-item')
  Object.defineProperty(items[0].element, 'offsetTop', { configurable: true, writable: true, value: 0 })
  Object.defineProperty(items[1].element, 'offsetTop', { configurable: true, writable: true, value: pitch })
}

describe('DataTable · 卡片补批的批大小跟着实测走', () => {
  it('卡片间距 50px × 容器 600 高 → 一批补 ceil(2 屏 / 间距) = 24 张', async () => {
    const w = mountCard(120)
    const el = stubScroller(w, 12000, 600)
    stubCardPitch(w, 50)
    scrollToRemaining(el, 400, 12000)
    await w.vm.$nextTick()
    expect(cards(w)).toBe(74)
  })

  it('卡片高到换算不足兜底批时按 10 张推进（不是按 50 张，也不是 1 张）', async () => {
    const w = mountCard(120)
    const el = stubScroller(w, 12000, 600)
    stubCardPitch(w, 500)
    scrollToRemaining(el, 400, 12000)
    await w.vm.$nextTick()
    expect(cards(w)).toBe(60)
  })

  it('量不出布局时沿用上一批大小（0 当成 1 会把整表一次拉进 DOM，正是渐进加载要防的）', async () => {
    const w = mountCard(120)
    const el = stubScroller(w, 12000, 600)
    stubCardPitch(w, 0)
    scrollToRemaining(el, 400, 12000)
    await w.vm.$nextTick()
    expect(cards(w)).toBe(100)
  })
})
