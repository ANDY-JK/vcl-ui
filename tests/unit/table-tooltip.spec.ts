// useTableTooltip 行为锁定测试（截断文本气泡：溢出判定/转义/方向/取消/键盘关闭）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { useTableTooltip } from '@/components/data/composables/useTableTooltip'
import type { TableTooltipReturn } from '@/components/data/composables/useTableTooltip'

let api: TableTooltipReturn

beforeEach(() => {
  vi.useFakeTimers()
  api = useTableTooltip({ truncateMode: ref('ellipsis') })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/** 造一个「文本溢出」的 td（happy-dom 下 scrollWidth/clientWidth 都是 0，需手动覆盖） */
function makeOverflowTd() {
  const td = document.createElement('td')
  const span = document.createElement('span')
  span.className = 'cell-text-inner'
  span.textContent = '内容'
  td.appendChild(span)
  document.body.appendChild(td)
  Object.defineProperty(span, 'scrollWidth', { value: 300, configurable: true })
  Object.defineProperty(span, 'clientWidth', { value: 80, configurable: true })
  vi.spyOn(td, 'getBoundingClientRect').mockReturnValue({
    top: 100,
    left: 120,
    right: 300,
    bottom: 130,
    width: 180,
    height: 30,
    x: 120,
    y: 100,
    toJSON: () => ({}),
  } as DOMRect)
  return { td, span }
}

function fire(td: HTMLElement, span: HTMLElement, text: string) {
  const e = { target: span, clientX: 0, clientY: 0 } as unknown as MouseEvent
  api.showTooltip(e, text)
}

describe('useTableTooltip 触发门禁', () => {
  it('非 ellipsis 截断模式不触发', () => {
    const api2 = useTableTooltip({ truncateMode: ref('wrap') })
    const { span } = makeOverflowTd()
    const e = { target: span } as unknown as MouseEvent
    api2.showTooltip(e, '甲')
    vi.advanceTimersByTime(400)
    expect(api2._tooltipVisible.value).toBe(false)
  })

  it('空文本不触发；超过 50 字（交给展开图标）不触发', () => {
    const { td, span } = makeOverflowTd()
    fire(td, span, '')
    fire(td, span, 'x'.repeat(51)) // 阈值 EXPAND_ICON_TEXT_MIN=50：>50 才让位给展开图标
    vi.advanceTimersByTime(400)
    expect(api._tooltipVisible.value).toBe(false)
  })

  it('恰好 50 字仍走 tooltip（边界：判定是 > 50）', () => {
    const { td, span } = makeOverflowTd()
    fire(td, span, 'x'.repeat(50))
    vi.advanceTimersByTime(400)
    expect(api._tooltipVisible.value).toBe(true)
  })

  it('49 字仍可触发（阈值边界：49 字 < 50）', () => {
    const { td, span } = makeOverflowTd()
    fire(td, span, 'x'.repeat(49))
    vi.advanceTimersByTime(400)
    expect(api._tooltipVisible.value).toBe(true)
  })

  it('单元格未溢出（scrollWidth ≤ clientWidth+2）不触发', () => {
    const td = document.createElement('td')
    const span = document.createElement('span')
    span.className = 'cell-text-inner'
    td.appendChild(span)
    document.body.appendChild(td)
    Object.defineProperty(span, 'scrollWidth', { value: 80, configurable: true })
    Object.defineProperty(span, 'clientWidth', { value: 80, configurable: true })
    fire(td, span, '短文本')
    vi.advanceTimersByTime(400)
    expect(api._tooltipVisible.value).toBe(false)
  })

  it('目标不在 td 内 / 无 .cell-text-inner 时不触发', () => {
    const td = document.createElement('div') // 不是 td
    document.body.appendChild(td)
    const e = { target: td } as unknown as MouseEvent
    api.showTooltip(e, '文本')
    vi.advanceTimersByTime(400)
    expect(api._tooltipVisible.value).toBe(false)

    const td2 = document.createElement('td')
    document.body.appendChild(td2) // 没有内部 span
    const e2 = { target: td2 } as unknown as MouseEvent
    api.showTooltip(e2, '文本')
    vi.advanceTimersByTime(400)
    expect(api._tooltipVisible.value).toBe(false)
  })
})

describe('useTableTooltip 展示与样式', () => {
  it('hover 300ms 后展示，文本做 HTML 转义 + 换行转 <br>', () => {
    const { td, span } = makeOverflowTd()
    fire(td, span, 'a & b < c > "d"\ne')
    vi.advanceTimersByTime(300)
    expect(api._tooltipVisible.value).toBe(true)
    expect(api._tooltipText.value).toBe('a &amp; b &lt; c &gt; &quot;d&quot;<br>e')
  })

  it('下方空间足：top 定位，含固定坐标/zIndex/滚动约束', () => {
    const { td, span } = makeOverflowTd()
    fire(td, span, '甲')
    vi.advanceTimersByTime(300)
    const s = api._tooltipStyle.value
    expect(s.position).toBe('fixed')
    expect(s.left).toBe('120px')
    expect(s.top).toBe('134px') // anchorBottom(130) + offset(4)
    expect(s.top).not.toBe('auto')
    expect(s.zIndex).toContain('var(--z-tooltip')
    expect(s.maxHeight).toBe('200px')
  })

  it('靠近视口底部：翻转为 above，改用 bottom 定位贴单元格顶部', () => {
    const { td, span } = makeOverflowTd()
    vi.spyOn(td, 'getBoundingClientRect').mockReturnValue({
      top: 700,
      left: 120,
      right: 300,
      bottom: 730,
      width: 180,
      height: 30,
      x: 120,
      y: 700,
      toJSON: () => ({}),
    } as DOMRect)
    fire(td, span, '乙')
    vi.advanceTimersByTime(300)
    const s = api._tooltipStyle.value
    expect(s.top).toBe('auto')
    expect(s.bottom).toBe(`${window.innerHeight - 700 + 4}px`)
  })
})

describe('useTableTooltip 取消与键盘', () => {
  it('300ms 内 hideTooltip 撤掉待展示的 timer（事后不弹出）', () => {
    const { td, span } = makeOverflowTd()
    fire(td, span, '丙')
    api.hideTooltip()
    vi.advanceTimersByTime(400)
    expect(api._tooltipVisible.value).toBe(false)
  })

  it('展示后 hideTooltip 立即隐藏；Escape 同样关闭', () => {
    const { td, span } = makeOverflowTd()
    fire(td, span, '丁')
    vi.advanceTimersByTime(300)
    expect(api._tooltipVisible.value).toBe(true)
    api.hideTooltip()
    expect(api._tooltipVisible.value).toBe(false)

    fire(td, span, '戊')
    vi.advanceTimersByTime(300)
    expect(api._tooltipVisible.value).toBe(true)
    api.onTooltipKeydown({ key: 'a' } as KeyboardEvent)
    expect(api._tooltipVisible.value).toBe(true)
    api.onTooltipKeydown({ key: 'Escape' } as KeyboardEvent)
    expect(api._tooltipVisible.value).toBe(false)
  })
})
