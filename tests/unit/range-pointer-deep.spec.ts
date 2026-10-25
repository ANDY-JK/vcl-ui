/**
 * useRangePointer.ts 的深水区 —— 自动滚动 / 早退分支 / 边缘检测 / 收口清理
 *
 * ## 为什么补（单文件口径 语句 65.5% / **分支 40%** / 函数 90.9%，32/110 行未覆盖）
 *
 * `range-pointer.spec.ts` 已经锁住六条核心语义（长按激活 / 拖拽激活 / 防手抖 / click 抑制 /
 * cellSelection 开关 / 卸载摘监听）。未覆盖的恰好是**边界条件与自动滚动**：
 *
 * ① **`autoScrollTick` 整函数零覆盖（L118-132）**：拖到容器边缘时每 50ms 滚 16px，
 *    让用户能把选区拖出视口。这是「长表格跨屏拖选」的唯一实现，不测等于没做。
 * ② **边缘检测的两个轴各自双向（L127-131）**：上下左右四个边界都要能触发，
 *    `dx || dy` 全为 0 时要 `stopAutoScroll()` 自停。
 * ③ **早退分支**（L109 / L120 / L136 / L146 / L150 / L153）：`active` 幂等、容器消失、
 *    无候选、无选区、未命中 td、坐标非法 —— 每条都是一个具体的健壮性缺口。
 * ④ **`onUp` 的清理完整性（L173-188）**：清 timer、摘两个监听器、停自动滚动、
 *    去 body class、置 suppressClick、清候选 —— 少任何一条都会留下幽灵状态。
 * ⑤ **`onCellMouseDown` 的三重前置 + 可交互元素排除（L199-213）**：输入框/按钮里的
 *    点击不该起选区（否则表单控件点不动）。
 * ⑥ **卸载收口（L238-244）**：除了摘监听器，还要清 timer / 停滚动 / 去 class。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { useRangePointer, type RangePointerDeps } from '@/components/data/composables/useRangePointer'

const mounted: VueWrapper[] = []

interface SetupOpts {
  cellSelection?: boolean
  editable?: boolean
  editing?: boolean
  rowKey?: string | undefined
  /** 是否把 scrollContainer 指向一个真实容器 */
  withScroll?: boolean
}

const waitFx = (ms: number) => vi.advanceTimersByTimeAsync(ms)

function setup(opts: SetupOpts = {}) {
  const rangeSel = ref<unknown>(null)
  const scrollContainer = ref<HTMLElement | null>(null)
  const calls = {
    startRange: vi.fn(),
    updateRange: vi.fn(),
    clearRange: vi.fn(),
  }
  // ⚠️ 不要用 vi.fn() 当元素方法：ref() 会把 DOM 对象包成响应式代理，
  // 代理读取方法时会 bind，导致 spy 身份丢失（"not a spy" 报错）。
  // 用纯记录数组，与身份无关，断言只关心「滚了多少」。
  const scrollCalls: Array<[number, number]> = []
  const scrollEl = {
    getBoundingClientRect: () => ({ top: 100, bottom: 400, left: 50, right: 650 }) as DOMRect,
    scrollBy: (x: number, y: number) => void scrollCalls.push([x, y]),
  } as unknown as HTMLElement

  let api: ReturnType<typeof useRangePointer> | null = null
  const Host = defineComponent({
    setup() {
      api = useRangePointer({
        editable: () => opts.editable !== false,
        editing: () => opts.editing === true,
        cellSelection: () => opts.cellSelection !== false,
        rowDisplayIndex: (i) => i,
        rowsSnapshot: () => ['r1', 'r2', 'r3'],
        colsSnapshot: () => ['c1', 'c2', 'c3'],
        cellValue: () => 'v0',
        rowKeyOf: () => ('rowKey' in opts ? opts.rowKey : 'r1'),
        rangeSel,
        scrollContainer,
        ...calls,
      } as RangePointerDeps)
      return () =>
        h('div', [
          h(
            'td',
            {
              class: 'cell',
              'data-row-idx': '0',
              'data-col-idx': '0',
              onMousedown: (e: MouseEvent) => api!.onCellMouseDown(e, {}, { key: 'c1' }, 0, 0),
            },
            'x',
          ),
        ])
    },
  })
  const w = mount(Host, { attachTo: document.body })
  mounted.push(w)
  if (opts.withScroll) scrollContainer.value = scrollEl
  return { api: api!, calls, w, rangeSel, scrollContainer, scrollEl, scrollCalls }
}

/** 造一个真实 DOM 事件（happy-dom 下 trigger 不能传 clientX） */
function mouse(type: string, init: MouseEventInit & { target?: Element } = {}) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init })
  return ev
}

/** 让 elementFromPoint 返回指定 td（或 null） */
function stubElementFromPoint(el: Element | null) {
  const orig = document.elementFromPoint
  document.elementFromPoint = (() => el) as typeof document.elementFromPoint
  return () => {
    document.elementFromPoint = orig
  }
}

/** 造一个带 data-row-idx / data-col-idx 的 td 并挂到 body 上 */
function makeTd(ri: number, ci: number, opts: { invalid?: boolean } = {}) {
  const td = document.createElement('td')
  td.setAttribute('data-row-idx', opts.invalid ? 'abc' : String(ri))
  td.setAttribute('data-col-idx', Number.isNaN(ci) ? 'abc' : String(ci))
  document.body.appendChild(td)
  return td
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
  document.body.className = ''
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/* ═══════════ ① 激活的幂等与候选缺失 ═══════════ */

describe('activate 的早退', () => {
  it('**长按到点时候选已被清掉 → 不激活**（onUp 后再走定时器）', async () => {
    const { api, calls, w } = setup()
    const td = w.find('.cell').element
    td.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    document.dispatchEvent(mouse('mouseup', { clientX: 10, clientY: 10 }))
    await waitFx(400) // 长按定时器已被 onUp 清掉，这里只是确认不会再激活
    expect(calls.startRange, '候选择已清，不激活').not.toHaveBeenCalled()
    expect(api.shouldSuppressClick(), '未激活 → 不抑制 click').toBe(false)
  })

  it('**重复激活是幂等的**（拖拽激活后再长按到点也只 startRange 一次）', async () => {
    const { calls, w } = setup()
    const td = w.find('.cell').element
    td.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    // 拖过阈值 → activate#1（内部会 clearTimer，所以长按定时器此刻已被清）
    document.dispatchEvent(mouse('mousemove', { clientX: 30, clientY: 30 }))
    expect(calls.startRange, '拖拽激活一次').toHaveBeenCalledTimes(1)
    // 再到点也不会重复激活
    await waitFx(400)
    expect(calls.startRange, '仍只有一次').toHaveBeenCalledTimes(1)
  })

  it('**同时满足「已激活」与「候选仍在」时 activate 直接返回**（L109 的 active 早退）', async () => {
    const { calls, w } = setup()
    const td = w.find('.cell').element
    // 拖拽激活 → active=true，但 candidate 仍保留（onUp 才清）
    td.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    // 用 300ms 一次跨过阈值 + 定时器到点：先把时间推到 299ms 再拖（此时定时器还在）
    await waitFx(299)
    document.dispatchEvent(mouse('mousemove', { clientX: 100, clientY: 100 }))
    expect(calls.startRange, '拖拽激活').toHaveBeenCalledTimes(1)
    // 现在 active=true 且 candidate 非空；把剩余 1ms 走完让定时器到点 → activate 二次进入
    await waitFx(1)
    expect(calls.startRange, '二次进入被 active 挡下').toHaveBeenCalledTimes(1)
    document.dispatchEvent(mouse('mouseup', {}))
  })

  it('**激活时挂上 dt-range-selecting 类，松手后摘掉**', async () => {
    const { calls, w } = setup()
    const td = w.find('.cell').element
    td.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    await waitFx(300)
    expect(document.body.classList.contains('dt-range-selecting'), '激活时挂上').toBe(true)
    // 长按未移动也必须选中锚点格：startRange 建选区后紧跟一次 updateRange
    expect(calls.updateRange, '锚点格被选中').toHaveBeenCalledWith(0, 0)
    document.dispatchEvent(mouse('mouseup', { clientX: 10, clientY: 10 }))
    expect(document.body.classList.contains('dt-range-selecting'), '松手后摘掉').toBe(false)
  })

  it('**未激活就松手：不挂/不摘 class、不抑制 click**', async () => {
    const { api, w } = setup()
    const td = w.find('.cell').element
    td.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    document.dispatchEvent(mouse('mouseup', { clientX: 10, clientY: 10 }))
    expect(document.body.classList.contains('dt-range-selecting')).toBe(false)
    expect(api.shouldSuppressClick()).toBe(false)
  })
})

/* ═══════════ ② mousemove 的早退 ═══════════ */

describe('onMove 的早退分支', () => {
  it('**没有候选（未 mousedown）→ mousemove 无副作用**', async () => {
    const { calls } = setup()
    document.dispatchEvent(mouse('mousemove', { clientX: 100, clientY: 100 }))
    expect(calls.startRange).not.toHaveBeenCalled()
    expect(calls.updateRange).not.toHaveBeenCalled()
  })

  it('**激活后 rangeSel 为空 → 不更新选区**（startRange 被桩掉了）', async () => {
    const { calls, w } = setup()
    // 桩掉的 startRange 不设置 rangeSel → 保持 null
    const td0 = makeTd(1, 1)
    const restore = stubElementFromPoint(td0)
    w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    await waitFx(300)
    calls.updateRange.mockClear()
    document.dispatchEvent(mouse('mousemove', { clientX: 200, clientY: 200 }))
    expect(calls.updateRange, 'rangeSel 为空时不写').not.toHaveBeenCalled()
    restore()
  })

  it('**命中 td → 把格坐标交给 updateRange**（拖选跟随鼠标）', async () => {
    const { calls, rangeSel, w } = setup()
    rangeSel.value = {}
    const td = makeTd(2, 1)
    const restore = stubElementFromPoint(td)
    w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    await waitFx(300)
    calls.updateRange.mockClear()
    document.dispatchEvent(mouse('mousemove', { clientX: 200, clientY: 200 }))
    expect(calls.updateRange, '传的是 td 上的行/列索引').toHaveBeenCalledWith(2, 1)
    restore()
  })

  it('**未命中 td → 不更新**（鼠标移到表格外）', async () => {
    const { calls, rangeSel, w } = setup()
    rangeSel.value = {}
    const restore = stubElementFromPoint(null)
    w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    await waitFx(300)
    calls.updateRange.mockClear()
    document.dispatchEvent(mouse('mousemove', { clientX: 500, clientY: 500 }))
    expect(calls.updateRange).not.toHaveBeenCalled()
    restore()
  })

  it('**td 的 data 坐标非法 → 不更新**（防 NaN 污染选区）', async () => {
    const { calls, rangeSel, w } = setup()
    rangeSel.value = {}
    const bad = makeTd(0, 0, { invalid: true })
    const restore = stubElementFromPoint(bad)
    w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    await waitFx(300)
    calls.updateRange.mockClear()
    document.dispatchEvent(mouse('mousemove', { clientX: 200, clientY: 200 }))
    expect(calls.updateRange, 'NaN 被挡下').not.toHaveBeenCalled()
    restore()
  })

  it('**拖拽未过阈值就 mousemove：不激活、不更新**', async () => {
    const { calls, w } = setup()
    w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    document.dispatchEvent(mouse('mousemove', { clientX: 13, clientY: 12 })) // 差 3/2，均 < 6
    expect(calls.startRange).not.toHaveBeenCalled()
    expect(calls.updateRange).not.toHaveBeenCalled()
  })

  it('**恰好 6px 阈值即激活**（>= 而非 >）', async () => {
    const { calls, w } = setup()
    w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    document.dispatchEvent(mouse('mousemove', { clientX: 16, clientY: 10 }))
    expect(calls.startRange).toHaveBeenCalledTimes(1)
  })

  it('**纵向位移也算**（取 max(dx,dy)）', async () => {
    const { calls, w } = setup()
    w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    document.dispatchEvent(mouse('mousemove', { clientX: 10, clientY: 17 }))
    expect(calls.startRange).toHaveBeenCalledTimes(1)
  })
})

/* ═══════════ ③ 边缘自动滚动（整块零覆盖） ═══════════ */

describe('边缘自动滚动', () => {
  /** 进入激活态并让 elementFromPoint 命中一个合法 td */
  async function enterActive(withScroll = true) {
    const ctx = setup({ withScroll })
    // ⚠️ 必须让 rangeSel 有值：onMove 在 L146 发现容器选区为空就早退，
    // 走不到后面的边缘检测（L156-169）
    ctx.rangeSel.value = { anchor: { rowIndex: 0, colIndex: 0 } }
    const td = makeTd(1, 1)
    const restore = stubElementFromPoint(td)
    ctx.w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    await waitFx(300)
    ctx.calls.updateRange.mockClear()
    return { ...ctx, td, restore }
  }

  it('**贴近上边（top+30 内）→ 向上滚 -16**', async () => {
    const { scrollCalls, restore, w } = await enterActive()
    // 容器 top=100；贴边 = y < 130
    document.dispatchEvent(mouse('mousemove', { clientX: 300, clientY: 110 }))
    await waitFx(50)
    expect(scrollCalls, '向上滚一格').toContainEqual([0, -16])
    document.dispatchEvent(mouse('mouseup', {}))
    restore()
    w.unmount()
  })

  it('**贴近下边（bottom-30 内）→ 向下滚 +16**', async () => {
    const { scrollCalls, restore, w } = await enterActive()
    // 容器 bottom=400；贴边 = y > 370
    document.dispatchEvent(mouse('mousemove', { clientX: 300, clientY: 390 }))
    await waitFx(50)
    expect(scrollCalls, '向下滚一格').toContainEqual([0, 16])
    document.dispatchEvent(mouse('mouseup', {}))
    restore()
    w.unmount()
  })

  it('**贴近左边（left+30 内）→ 向左滚 -16**', async () => {
    const { scrollCalls, restore, w } = await enterActive()
    // 容器 left=50；贴边 = x < 80
    document.dispatchEvent(mouse('mousemove', { clientX: 60, clientY: 250 }))
    await waitFx(50)
    expect(scrollCalls, '向左滚一格').toContainEqual([-16, 0])
    document.dispatchEvent(mouse('mouseup', {}))
    restore()
    w.unmount()
  })

  it('**贴近右边（right-30 内）→ 向右滚 +16**', async () => {
    const { scrollCalls, restore, w } = await enterActive()
    // 容器 right=650；贴边 = x > 620
    document.dispatchEvent(mouse('mousemove', { clientX: 640, clientY: 250 }))
    await waitFx(50)
    expect(scrollCalls, '向右滚一格').toContainEqual([16, 0])
    document.dispatchEvent(mouse('mouseup', {}))
    restore()
    w.unmount()
  })

  it('**左上角同时贴两个边 → dx 与 dy 一起生效**', async () => {
    const { scrollCalls, restore, w } = await enterActive()
    document.dispatchEvent(mouse('mousemove', { clientX: 60, clientY: 110 }))
    await waitFx(50)
    expect(scrollCalls, '斜向滚').toContainEqual([-16, -16])
    document.dispatchEvent(mouse('mouseup', {}))
    restore()
    w.unmount()
  })

  it('**移出边缘区 → 停止自动滚动**（不再继续滚）', async () => {
    const { scrollCalls, restore, w } = await enterActive()
    document.dispatchEvent(mouse('mousemove', { clientX: 300, clientY: 110 })) // 贴边 → 起滚动
    await waitFx(50)
    const firstCount = scrollCalls.length
    expect(firstCount, '前置：已在滚').toBeGreaterThan(0)
    document.dispatchEvent(mouse('mousemove', { clientX: 300, clientY: 250 })) // 移到中间 → 停
    await waitFx(300)
    expect(scrollCalls.length, '停止后不再新增').toBe(firstCount)
    document.dispatchEvent(mouse('mouseup', {}))
    restore()
    w.unmount()
  })

  it('**只起一个滚动定时器**（边缘内连续 mousemove 不叠加）', async () => {
    const { scrollCalls, restore, w } = await enterActive()
    for (let i = 0; i < 5; i++) document.dispatchEvent(mouse('mousemove', { clientX: 300, clientY: 110 }))
    await waitFx(50)
    expect(scrollCalls.length, '50ms 内只 tick 一次').toBe(1)
    document.dispatchEvent(mouse('mouseup', {}))
    restore()
    w.unmount()
  })

  it('**滚动定时器 tick 时容器消失 → 自停**（不再抛错）', async () => {
    const { scrollContainer, restore, w } = await enterActive()
    document.dispatchEvent(mouse('mousemove', { clientX: 300, clientY: 110 }))
    scrollContainer.value = null
    expect(() => vi.advanceTimersByTime(200)).not.toThrow()
    document.dispatchEvent(mouse('mouseup', {}))
    restore()
    w.unmount()
  })

  it('**松手后不再滚**（onUp 停掉自动滚动 + 摘监听）', async () => {
    const { scrollCalls, restore, w } = await enterActive()
    document.dispatchEvent(mouse('mousemove', { clientX: 300, clientY: 110 }))
    document.dispatchEvent(mouse('mouseup', {}))
    scrollCalls.length = 0
    await waitFx(300)
    expect(scrollCalls, '松手后不再滚').toHaveLength(0)
    restore()
    w.unmount()
  })

  it('**tick 时鼠标已不在边缘 → 定时器在 tick 内部自停**（L132，不靠 onMove）', async () => {
    const { scrollCalls, rangeSel, w, scrollContainer } = setup({ withScroll: true })
    rangeSel.value = { anchor: { rowIndex: 0, colIndex: 0 } }
    const td = makeTd(1, 1)
    const restore = stubElementFromPoint(td)
    w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    await waitFx(300)
    document.dispatchEvent(mouse('mousemove', { clientX: 300, clientY: 110 })) // 贴边 → 起定时器
    await waitFx(50)
    scrollCalls.length = 0
    // 让容器的可视区「移走」：鼠标(110) 不再落在 top+30 内
    ;(scrollContainer.value as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
      ({ top: 0, bottom: 200, left: 0, right: 700 }) as DOMRect
    // 注意：这里不能再派发 mousemove（否则走 onMove 的 L166 分支），只让 tick 自己发现
    await waitFx(50)
    expect(scrollCalls, 'tick 内部发现不在边缘 → 滚 0').toHaveLength(0)
    document.dispatchEvent(mouse('mouseup', {}))
    restore()
    w.unmount()
  })

  it('**edges 的宽度就是 30px**：距上边 35px 不滚、25px 滚（EDGE_ZONE_PX 精度）', async () => {
    const { scrollCalls, restore, w } = await enterActive()
    // 容器 top=100：y=135 距边 35px（>30，不该触发）；y=125 距边 25px（<30，该触发）
    document.dispatchEvent(mouse('mousemove', { clientX: 300, clientY: 135 }))
    await waitFx(120)
    expect(scrollCalls, '距边 35px 不滚').toHaveLength(0)
    document.dispatchEvent(mouse('mousemove', { clientX: 300, clientY: 125 }))
    await waitFx(60)
    expect(scrollCalls, '距边 25px 滚').toContainEqual([0, -16])
    document.dispatchEvent(mouse('mouseup', {}))
    restore()
    w.unmount()
  })

  it('**tick 自停后不再继续 tick**（否则定时器永久泄漏）', async () => {
    const { rangeSel, w, scrollContainer } = setup({ withScroll: true })
    rangeSel.value = { anchor: { rowIndex: 0, colIndex: 0 } }
    const td = makeTd(1, 1)
    const restore = stubElementFromPoint(td)
    let gbcr = 0
    const origRect = () => ({ top: 100, bottom: 400, left: 50, right: 650 }) as DOMRect
    ;(scrollContainer.value as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => {
      gbcr++
      return origRect()
    }
    w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    await waitFx(300)
    document.dispatchEvent(mouse('mousemove', { clientX: 300, clientY: 110 })) // 贴边 → 起定时器且 tick 一次
    await waitFx(50)
    // 让 tick 算出 dx=dy=0：把容器可视区整体移走（每次调用仍计数，用来观测 tick 次数）
    ;(scrollContainer.value as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => {
      gbcr++
      return { top: 0, bottom: 200, left: 0, right: 700 } as DOMRect
    }
    const before = gbcr
    await waitFx(300) // 300ms / 50ms = 最多 6 次 tick
    const ticks = gbcr - before
    // 自停后只该有 1 次（发现无方向 → stopAutoScroll）；不自停会有 6 次
    expect(ticks, '自停后不再 tick').toBeLessThanOrEqual(1)
    document.dispatchEvent(mouse('mouseup', {}))
    restore()
    w.unmount()
  })

  it('**鼠标在容器中间（非边缘）→ 不滚**', async () => {
    const { scrollCalls, restore, w } = await enterActive()
    document.dispatchEvent(mouse('mousemove', { clientX: 300, clientY: 250 }))
    await waitFx(300)
    expect(scrollCalls, '中间区域不滚').toHaveLength(0)
    document.dispatchEvent(mouse('mouseup', {}))
    restore()
    w.unmount()
  })
})

/* ═══════════ ④ onCellMouseDown 的前置与排除 ═══════════ */

describe('onCellMouseDown 前置条件', () => {
  it('**editable=false → 不起选区**', async () => {
    const { calls, w } = setup({ editable: false })
    w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    await waitFx(400)
    expect(calls.clearRange, '连 clearRange 都不调').not.toHaveBeenCalled()
    expect(calls.startRange).not.toHaveBeenCalled()
  })

  it('**cellSelection=false → 完全不参与拖选**（连 preventDefault 都不做）', async () => {
    const { calls, w } = setup({ cellSelection: false })
    const ev = mouse('mousedown', { clientX: 10, clientY: 10 })
    w.find('.cell').element.dispatchEvent(ev)
    await waitFx(400)
    expect(calls.clearRange, '不清旧选区').not.toHaveBeenCalled()
    expect(calls.startRange, '不激活').not.toHaveBeenCalled()
    expect(ev.defaultPrevented, '保留浏览器默认的文本选择').toBe(false)
  })

  it('**editing=true → 不起选区**（编辑中拖选会抢走文本选择）', async () => {
    const { calls, w } = setup({ editing: true })
    w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    await waitFx(400)
    expect(calls.startRange).not.toHaveBeenCalled()
  })

  it('**非左键（右键/中键）→ 不起选区**', async () => {
    const { calls, w } = setup()
    w.find('.cell').element.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true, cancelable: true }))
    await waitFx(400)
    expect(calls.clearRange).not.toHaveBeenCalled()
  })

  it('**起选区时先 clearRange**（新旧选区互斥）', async () => {
    const { calls, w } = setup()
    w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    expect(calls.clearRange, 'mousedown 立即清旧选区').toHaveBeenCalledTimes(1)
  })

  it('**mousedown 会 preventDefault**（阻止文本选择）', async () => {
    const { w } = setup()
    const ev = mouse('mousedown', { clientX: 10, clientY: 10 })
    w.find('.cell').element.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })

  for (const sel of ['input', 'button', 'select', 'textarea', 'a', '.cell-expand-icon', '.cell-options-arrow', '.cell-image']) {
    it(`**点击 ${sel} 内部不起选区**（否则表单控件点不动）`, async () => {
      const { calls, w } = setup()
      const inner = document.createElement(sel.split('.')[0] === sel && sel.startsWith('.') ? 'span' : sel)
      if (sel.startsWith('.')) inner.className = sel.slice(1)
      w.find('.cell').element.appendChild(inner)
      inner.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
      expect(calls.clearRange).not.toHaveBeenCalled()
    })
  }

  it('**target 为 null（程序化派发）→ 不抛错且照常起选区**（源码注释记录的健壮性缺口）', async () => {
    const { calls, w } = setup()
    // dispatchEvent 到 document 再冒泡到 td 时 target 仍是 td；构造 target=null 的场景：
    // 直接调 api 拿不到 onCellMouseDown 的 event，只能用一个 target 为 null 的裸对象走 closeToReal
    const td = w.find('.cell').element
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: 10 })
    Object.defineProperty(ev, 'target', { value: null })
    expect(() => td.dispatchEvent(ev)).not.toThrow()
    expect(calls.clearRange, 'target 为空也照常起选区').toHaveBeenCalled()
    void calls
  })

  it('**rowKeyOf 返回 undefined → 候选的 rk 用空串兜底**（仍能激活）', async () => {
    const { calls, w } = setup({ rowKey: undefined })
    w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    await waitFx(300)
    expect(calls.startRange).toHaveBeenCalledTimes(1)
    // startRange 的第 2 个参数是列索引，第 3/4 个是行列快照
    expect(calls.startRange.mock.calls[0]![2]).toEqual(['r1', 'r2', 'r3'])
  })
})

/* ═══════════ ⑤ 卸载收口 ═══════════ */

describe('卸载收口', () => {
  it('**卸载后长按定时器不再触发**（clearTimer）', async () => {
    const { calls, w } = setup()
    w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    w.unmount()
    await waitFx(500)
    expect(calls.startRange, '卸载后不激活').not.toHaveBeenCalled()
  })

  it('**卸载时摘掉 body class**（否则整页鼠标样式卡在 selecting）', async () => {
    const { w } = setup()
    w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    await waitFx(300)
    expect(document.body.classList.contains('dt-range-selecting'), '前置：已挂上').toBe(true)
    w.unmount()
    expect(document.body.classList.contains('dt-range-selecting'), '卸载后摘掉').toBe(false)
  })

  it('**卸载后 mousemove/mouseup 都不再被处理**', async () => {
    const { calls, w } = setup()
    const td0 = makeTd(1, 1)
    const restore = stubElementFromPoint(td0)
    w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    await waitFx(300)
    calls.updateRange.mockClear()
    w.unmount()
    document.dispatchEvent(mouse('mousemove', { clientX: 200, clientY: 200 }))
    document.dispatchEvent(mouse('mouseup', {}))
    expect(calls.updateRange, '监听器已摘').not.toHaveBeenCalled()
    restore()
  })

  it('**卸载时停止自动滚动**（否则销毁后还在滚）', async () => {
    const { scrollCalls, rangeSel, w } = setup({ withScroll: true })
    rangeSel.value = { anchor: { rowIndex: 0, colIndex: 0 } }
    const td0 = makeTd(1, 1)
    const restore = stubElementFromPoint(td0)
    w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    await waitFx(300)
    document.dispatchEvent(mouse('mousemove', { clientX: 300, clientY: 110 }))
    await waitFx(50)
    expect(scrollCalls.length, '前置：已在滚').toBeGreaterThan(0)
    w.unmount()
    scrollCalls.length = 0
    await waitFx(300)
    expect(scrollCalls, '卸载后不再滚').toHaveLength(0)
    restore()
  })
})

/* ═══════════ ⑥ 返回值契约 ═══════════ */

describe('返回值', () => {
  it('**rowDisplayIndex 原样透传**（调用方用它做行号显示）', () => {
    const { api } = setup()
    expect(api.rowDisplayIndex(3)).toBe(3)
  })

  it('**shouldSuppressClick 在抑制窗口内为 true、200ms 后转 false**', async () => {
    const { api, w } = setup()
    w.find('.cell').element.dispatchEvent(mouse('mousedown', { clientX: 10, clientY: 10 }))
    await waitFx(300)
    document.dispatchEvent(mouse('mouseup', { clientX: 10, clientY: 10 }))
    expect(api.shouldSuppressClick(), '刚松手：抑制中').toBe(true)
    await waitFx(199)
    expect(api.shouldSuppressClick(), '199ms 仍在窗口内').toBe(true)
    await waitFx(1)
    expect(api.shouldSuppressClick(), '200ms 后放行').toBe(false)
  })
})