/**
 * DataTable · 表体底部渐隐
 *
 * 表格是唯一一处「顶边被吸顶表头占住」的滚动区，所以只做**底部一条**遮罩
 * （顶部再加一条会把 sticky 表头一起虚化）。这里钉三件事：
 *   1. 遮罩是 `.table-hscroll` 的绝对定位子节点 —— 该层不是滚动容器，遮罩不随横向滚动跑
 *   2. 无溢出时不显示（首屏不该虚化）
 *   3. 溢出且未到底时显示、到底后收起
 *
 * happy-dom 不做布局，滚动度量必须自己钉住再派发 scroll 事件。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DataTable from '@/components/data/DataTable.vue'

const rows = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `行${i + 1}` }))
const columns = [
  { key: 'id', title: 'ID' },
  { key: 'name', title: '名称' },
]

function mountTable() {
  return mount(DataTable, {
    props: { columns, data: rows, maxHeight: '200px' } as never,
    attachTo: document.body,
  })
}

function scrollerOf(w: ReturnType<typeof mountTable>): HTMLElement | null {
  return w.element.querySelector<HTMLElement>('.table-scroll')
}

function veilOf(w: ReturnType<typeof mountTable>): HTMLElement | null {
  return w.element.querySelector<HTMLElement>('.dt-edge-veil')
}

/** 钉住滚动度量（happy-dom 无布局） */
function setMetrics(el: HTMLElement, m: { scrollTop: number; clientHeight: number; scrollHeight: number }) {
  Object.defineProperty(el, 'scrollTop', { value: m.scrollTop, writable: true, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: m.clientHeight, configurable: true })
  Object.defineProperty(el, 'scrollHeight', { value: m.scrollHeight, configurable: true })
}

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms))

describe('DataTable · 表体底部渐隐', () => {
  it('遮罩挂在 .table-hscroll 下（不是滚动容器 .table-scroll 里，否则会随横向滚动跑）', () => {
    const w = mountTable()
    const veil = veilOf(w)
    expect(veil, '没有渲染渐隐遮罩').not.toBeNull()
    expect(veil!.parentElement?.className).toContain('table-hscroll')
    expect(veil!.classList.contains('vcl-scroll-edge__veil--bottom')).toBe(true)
    w.unmount()
  })

  it('**无溢出时不显示**（首屏不该虚化内容）', async () => {
    const w = mountTable()
    const el = scrollerOf(w)!
    setMetrics(el, { scrollTop: 0, clientHeight: 400, scrollHeight: 400 })
    el.dispatchEvent(new Event('scroll'))
    await tick()
    expect(veilOf(w)!.style.opacity).toBe('0')
    w.unmount()
  })

  it('**有溢出且停在顶部 → 显示**（提示下面还有行）', async () => {
    const w = mountTable()
    const el = scrollerOf(w)!
    setMetrics(el, { scrollTop: 0, clientHeight: 200, scrollHeight: 900 })
    el.dispatchEvent(new Event('scroll'))
    await tick()
    expect(veilOf(w)!.style.opacity).toBe('1')
    w.unmount()
  })

  it('**滚到底 → 收起**', async () => {
    const w = mountTable()
    const el = scrollerOf(w)!
    setMetrics(el, { scrollTop: 700, clientHeight: 200, scrollHeight: 900 })
    el.dispatchEvent(new Event('scroll'))
    await tick()
    expect(veilOf(w)!.style.opacity).toBe('0')
    w.unmount()
  })

  it('只有一条遮罩（表头吸顶在顶部，不能再虚化它）', () => {
    const w = mountTable()
    expect(w.element.querySelectorAll('.vcl-scroll-edge__veil').length).toBe(1)
    expect(w.element.querySelector('.vcl-scroll-edge__veil--top')).toBeNull()
    w.unmount()
  })
})

describe('DataTable · 卡片视图底部渐隐', () => {
  /** cardBreakpoint 给到超大 → 走卡片视图（与「窄屏自动切卡片」同一条判定） */
  function mountCard() {
    return mount(DataTable, {
      props: { columns, data: rows, cardBreakpoint: 9999 } as never,
      attachTo: document.body,
    })
  }

  it('遮罩挂在 .card-edge-wrap 下（不是滚动体 .card-view-scroll 里）', () => {
    const w = mountCard()
    // 卡片模式下表格视图仍渲染（只是 .card-view-hidden 隐藏），所以必须限定到卡片外层
    const veil = w.element.querySelector<HTMLElement>('.card-edge-wrap > .dt-edge-veil')
    expect(veil, '卡片视图没渲染渐隐遮罩').not.toBeNull()
    expect(veil!.parentElement?.className).toContain('card-edge-wrap')
    w.unmount()
  })

  it('无溢出不显示 / 溢出显示 / 到底收起', async () => {
    const w = mountCard()
    const el = w.element.querySelector<HTMLElement>('.card-view-scroll')!
    const veil = w.element.querySelector<HTMLElement>('.card-edge-wrap > .dt-edge-veil')!

    setMetrics(el, { scrollTop: 0, clientHeight: 400, scrollHeight: 400 })
    el.dispatchEvent(new Event('scroll'))
    await tick()
    expect(veil.style.opacity, '无溢出时不该虚化').toBe('0')

    setMetrics(el, { scrollTop: 0, clientHeight: 400, scrollHeight: 1200 })
    el.dispatchEvent(new Event('scroll'))
    await tick()
    expect(veil.style.opacity).toBe('1')

    setMetrics(el, { scrollTop: 800, clientHeight: 400, scrollHeight: 1200 })
    el.dispatchEvent(new Event('scroll'))
    await tick()
    expect(veil.style.opacity).toBe('0')

    w.unmount()
  })
})
