// 矩形选区指针编排行为（2026-10-21，审查 TD-02 第十二刀）
//
// ## 为什么补这套测试
//
// 把 DataTable.vue 里 163 行「鼠标拖选/长按选格」的指针编排下沉到
// `useRangePointer.ts` 时发现：**现有 28 个 DataTable 测试里没有一个覆盖鼠标拖选**。
// 只有 `table-edit.spec.ts` 覆盖 Shift+Arrow 键盘扩展、
// `data-table-mount.spec.ts` 覆盖填充柄渲染 —— 它们都不经过那段被搬走的代码。
//
// 也就是说：**这次下沉如果没有这两条测试，我可以把它改坏而全链依然全绿。**
// 这是"重构前先补测试"的典型场景。
//
// ## 覆盖的六条语义
//
// ① 长按（不动鼠标）300ms → 激活选区
// ② 按下即拖（超过 6px 阈值）→ 立即激活，无需等长按
// ③ 拖拽未超阈值就松手 → **不激活**（避免手抖误选）
// ④ 选区激活后松手 → 抑制紧随的 click（否则刚拖出的选区被单击逻辑取消）
// ⑤ cellSelection=false → 完全不参与拖选
// ⑥ 卸载时摘掉 document 监听器（否则销毁后仍响应 mousemove）
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { useRangePointer } from '@/components/data/composables/useRangePointer'

/**
 * 所有挂载的宿主统一登记，afterEach 一并卸载。
 *
 * ⚠️ 第一版每个测试各自 `mount({ attachTo: document.body })` 却**多数没卸载**，
 * 于是 `document.querySelector('td')` 拿到的往往是**上一个测试残留的 td**
 * （其组件已销毁或 api 指向旧实例）—— 表现就是"handler 根本没被调用"，
 * 而实际上 handler 挂在另一个元素上。5 个测试里 3 个失败全由这个泄漏引起。
 */
let mounted: VueWrapper[] = []

/** 造一个最小宿主：一个可 mousedown 的格子，其余依赖全是桩 */
function setup(opts: { cellSelection?: boolean; editable?: boolean } = {}) {
  const rangeSel = ref<unknown>(null)
  const scrollContainer = ref<HTMLElement | null>(null)
  const calls = {
    startRange: vi.fn(),
    updateRange: vi.fn(),
    clearRange: vi.fn(),
  }

  let api: ReturnType<typeof useRangePointer> | null = null

  const Host = defineComponent({
    setup() {
      api = useRangePointer({
        editable: () => opts.editable !== false,
        editing: () => false,
        cellSelection: () => opts.cellSelection !== false,
        rowDisplayIndex: (i) => i,
        rowsSnapshot: () => ['r1', 'r2'],
        colsSnapshot: () => ['c1', 'c2'],
        cellValue: () => 'v',
        rowKeyOf: () => 'r1',
        rangeSel,
        scrollContainer,
        ...calls,
      })
      return () =>
        h('div', [
          h('td', {
            'data-row-idx': '0',
            'data-col-idx': '0',
            onMousedown: (e: MouseEvent) => api!.onCellMouseDown(e, {}, { key: 'c1' }, 0, 0),
          }),
        ])
    },
  })

  const wrapper = mount(Host, { attachTo: document.body })
  mounted.push(wrapper)
  return { wrapper, calls, rangeSel, getApi: () => api! }
}

/** 派发一个真实的 mouse 事件（jsdom 下 clientX/Y 必须显式给） */
function fireMouse(type: string, x: number, y: number) {
  const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 })
  document.dispatchEvent(e)
  return e
}

beforeEach(() => {
  vi.useFakeTimers()
  mounted = []
})
afterEach(() => {
  // 统一卸载：不卸载会让 document.body 里累积残留节点，
  // 后续测试的 document.querySelector('td') 会拿到旧元素（详见文件头注释）
  for (const w of mounted) w.unmount()
  mounted = []
  vi.useRealTimers()
  document.body.className = ''
})

describe('长按激活', () => {
  it('按住不动 300ms → 激活选区（startRange + updateRange 各一次）', async () => {
    const { calls, rangeSel } = setup()
    // 先让 rangeSel 有值，模拟 cell-select 已建立状态
    rangeSel.value = {}

    const td = document.querySelector('td')!
    td.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true, button: 0 }))

    // 未到 300ms：不应激活
    vi.advanceTimersByTime(200)
    expect(calls.startRange, '200ms 时不该激活').not.toHaveBeenCalled()

    // 到 300ms：激活
    vi.advanceTimersByTime(120)
    expect(calls.startRange, '300ms 后应激活').toHaveBeenCalledTimes(1)
    expect(calls.updateRange, '长按未移动也应选中锚点格').toHaveBeenCalledWith(0, 0)

    fireMouse('mouseup', 100, 100)
  })
})

describe('按下即拖激活（无需等长按）', () => {
  it('拖动超过 6px 阈值 → 立即激活', async () => {
    const { calls, rangeSel } = setup()
    rangeSel.value = {}

    const td = document.querySelector('td')!
    td.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true, button: 0 }))

    // 拖 10px（超过阈值 6）
    fireMouse('mousemove', 110, 100)
    expect(calls.startRange, '超阈值应立即激活，不等 300ms').toHaveBeenCalledTimes(1)

    fireMouse('mouseup', 110, 100)
  })

  it('拖动未超阈值就松手 → 不激活（防手抖误选）', async () => {
    const { calls, rangeSel } = setup()
    rangeSel.value = {}

    const td = document.querySelector('td')!
    td.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true, button: 0 }))

    // 只拖 3px（未超 6）
    fireMouse('mousemove', 103, 100)
    fireMouse('mouseup', 103, 100)

    // 推进超过长按窗口，也不该激活（mouseup 已清掉计时器）
    vi.advanceTimersByTime(500)
    expect(calls.startRange, '未超阈值不该激活').not.toHaveBeenCalled()
  })
})

describe('click 抑制', () => {
  it('选区激活后松手 → shouldSuppressClick 为 true（防紧随的 click 取消选区）', async () => {
    const { calls, rangeSel, getApi } = setup()
    rangeSel.value = {}

    const td = document.querySelector('td')!
    td.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true, button: 0 }))
    fireMouse('mousemove', 120, 100) // 激活
    expect(calls.startRange).toHaveBeenCalled()

    fireMouse('mouseup', 120, 100)
    expect(getApi().shouldSuppressClick(), '激活后的松手应抑制 click').toBe(true)

    // 200ms 后自动解除
    vi.advanceTimersByTime(250)
    expect(getApi().shouldSuppressClick(), '200ms 后应解除抑制').toBe(false)
  })
})

describe('开关与清理', () => {
  it('cellSelection=false → 完全不参与拖选', async () => {
    const { calls } = setup({ cellSelection: false })
    const td = document.querySelector('td')!
    td.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true, button: 0 }))
    vi.advanceTimersByTime(400)
    expect(calls.startRange, 'cellSelection=false 不该激活').not.toHaveBeenCalled()
  })

  it('卸载后 document 上的监听器被摘掉（否则销毁后仍响应 mousemove）', async () => {
    const { wrapper, calls, rangeSel } = setup()
    rangeSel.value = {}

    const td = document.querySelector('td')!
    td.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true, button: 0 }))

    // 卸载（此时 mouseup 还没发生 → 监听器仍挂着，正是泄漏场景）
    wrapper.unmount()
    calls.startRange.mockClear()

    // 卸载后再移动/计时，不应再触发任何调用
    fireMouse('mousemove', 200, 200)
    vi.advanceTimersByTime(500)
    expect(calls.startRange, '卸载后不该再激活').not.toHaveBeenCalled()
    expect(document.body.classList.contains('dt-range-selecting'), '卸载应清掉 body 类').toBe(false)
  })
})
