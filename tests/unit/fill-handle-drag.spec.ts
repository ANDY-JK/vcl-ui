// 填充柄拖拽状态机（useFillHandleDrag）行为锁定 —— 2026-10-21 M3 第十一刀下沉时新增。
//
// 为什么必须有：这块逻辑（105 行指针/预览状态机）此前**零测试** ——
// `fill-series.spec.ts` 只测"填什么值"的算法，不测"拖了几格、朝哪拖"。
// 下沉动作如果只靠 typecheck + 既有测试兜底，等于没验证过搬动是否改了行为。
//
// 这里用真实 DOM 事件驱动（jsdom），只 mock `document.elementFromPoint`
// —— 因为 jsdom 没有布局，无法真算出指针落在哪个 td 上。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, computed } from 'vue'
import { useFillHandleDrag, type FillBounds } from '@/components/data/composables/useFillHandleDrag'
import type { FillDirection } from '@/components/data/composables/fill-series'

/** 在 body 里铺一个 6×3 的 td 网格，供 elementFromPoint 定位 */
function makeGrid(): void {
  const html = Array.from({ length: 6 }, (_, r) =>
    Array.from(
      { length: 3 },
      (_, c) => `<tr><td data-row-idx="${r}" data-col-idx="${c}"></td></tr>`.replace(/^<tr>|<\/tr>$/g, ''),
    ).join(''),
  )
  document.body.innerHTML = `<table><tbody>${html.map((row) => `<tr>${row}</tr>`).join('')}</tbody></table>`
}

/** 取网格里的某个 td，并让 elementFromPoint 指向它 */
function pointAt(r: number, c: number): void {
  const td = document.querySelector(`td[data-row-idx="${r}"][data-col-idx="${c}"]`)
  if (!td) throw new Error(`找不到 td(${r},${c})`)
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(td as HTMLElement)
}

interface Harness {
  fillable: ReturnType<typeof ref<boolean>>
  bounds: FillBounds | null
  api: ReturnType<typeof useFillHandleDrag>
  applied: { dir: FillDirection; count: number }[]
  layerOpened: number
}

/** 装配一套 harness（每次测试独立，避免拖拽状态串味） */
function setup(opts: { fillable?: boolean; bounds?: FillBounds | null } = {}): Harness {
  const fillable = ref(opts.fillable ?? true)
  const boundsRef = ref<FillBounds | null>(
    opts.bounds === undefined ? { r0: 0, r1: 1, c0: 0, c1: 0 } : opts.bounds,
  )
  const applied: { dir: FillDirection; count: number }[] = []
  let layerOpened = 0
  const api = useFillHandleDrag({
    fillable,
    fillHandleRange: computed(() => boundsRef.value),
    markLayerOpen: () => {
      layerOpened++
    },
    applyFill: (dir, count) => {
      applied.push({ dir, count })
    },
  })
  return {
    fillable,
    get bounds() {
      return boundsRef.value
    },
    api,
    applied,
    get layerOpened() {
      return layerOpened
    },
  } as Harness
}

const mousedown = (button = 0) => new MouseEvent('mousedown', { button, bubbles: true, cancelable: true })
const moveTo = () => document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
const mouseup = () => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))

beforeEach(() => {
  makeGrid()
})
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  document.body.className = ''
})

describe('填充柄 · 起拖条件', () => {
  it('fillable=false 时不起拖', () => {
    const h = setup({ fillable: false })
    h.api.onFillHandleMouseDown(mousedown())
    expect(h.layerOpened).toBe(0)
    expect(document.body.classList.contains('dt-fill-dragging')).toBe(false)
  })

  it('没有选区时不起拖', () => {
    const h = setup({ bounds: null })
    h.api.onFillHandleMouseDown(mousedown())
    expect(h.layerOpened).toBe(0)
  })

  it('非左键（右键 button=2）不起拖', () => {
    const h = setup()
    h.api.onFillHandleMouseDown(mousedown(2))
    expect(h.layerOpened).toBe(0)
  })

  it('起拖成功：openLayer 一次 + body 加类', () => {
    const h = setup()
    h.api.onFillHandleMouseDown(mousedown())
    expect(h.layerOpened).toBe(1)
    expect(document.body.classList.contains('dt-fill-dragging')).toBe(true)
  })
})

describe('填充柄 · 四向扩展', () => {
  // 源选区 2 行 × 1 列：r0=1,r1=2,c0=1,c1=1
  const SRC: FillBounds = { r0: 1, r1: 2, c0: 1, c1: 1 }

  it('向下拖 2 格 → 预览 r1 扩展到 4', () => {
    const h = setup({ bounds: SRC })
    h.api.onFillHandleMouseDown(mousedown())
    pointAt(4, 1)
    moveTo()
    expect(h.api._fillPreview.value).toEqual({ r0: 1, r1: 4, c0: 1, c1: 1 })
    mouseup()
    expect(h.applied).toEqual([{ dir: 'down', count: 2 }])
  })

  it('向上拖 1 格 → 预览 r0 收缩到 0', () => {
    const h = setup({ bounds: SRC })
    h.api.onFillHandleMouseDown(mousedown())
    pointAt(0, 1)
    moveTo()
    expect(h.api._fillPreview.value).toEqual({ r0: 0, r1: 2, c0: 1, c1: 1 })
    mouseup()
    expect(h.applied).toEqual([{ dir: 'up', count: 1 }])
  })

  it('向右拖 1 格 → 预览 c1 扩展到 2', () => {
    const h = setup({ bounds: SRC })
    h.api.onFillHandleMouseDown(mousedown())
    pointAt(2, 2)
    moveTo()
    expect(h.api._fillPreview.value).toEqual({ r0: 1, r1: 2, c0: 1, c1: 2 })
    mouseup()
    expect(h.applied).toEqual([{ dir: 'right', count: 1 }])
  })

  it('向左拖 1 格 → 预览 c0 收缩到 0', () => {
    const h = setup({ bounds: SRC })
    h.api.onFillHandleMouseDown(mousedown())
    pointAt(2, 0)
    moveTo()
    expect(h.api._fillPreview.value).toEqual({ r0: 1, r1: 2, c0: 0, c1: 1 })
    mouseup()
    expect(h.applied).toEqual([{ dir: 'left', count: 1 }])
  })
})

describe('填充柄 · 预览与收尾', () => {
  it('指针仍在源选区内：不产生预览', () => {
    const h = setup({ bounds: { r0: 1, r1: 3, c0: 1, c1: 2 } })
    h.api.onFillHandleMouseDown(mousedown())
    pointAt(2, 1) // 选区内部
    moveTo()
    expect(h.api._fillPreview.value).toBeNull()
    mouseup()
    expect(h.applied, '没拖出去就不该填充').toEqual([])
  })

  it('拖出去又拖回来：预览被清空、松手不填充', () => {
    const h = setup({ bounds: { r0: 1, r1: 2, c0: 1, c1: 1 } })
    h.api.onFillHandleMouseDown(mousedown())
    pointAt(4, 1)
    moveTo()
    expect(h.api._fillPreview.value).not.toBeNull()
    pointAt(2, 1) // 拖回源选区
    moveTo()
    expect(h.api._fillPreview.value).toBeNull()
    mouseup()
    expect(h.applied).toEqual([])
  })

  it('松手后清理干净（body 类移除 + 预览清空 + 监听器摘除）', () => {
    const h = setup()
    h.api.onFillHandleMouseDown(mousedown())
    pointAt(3, 0)
    moveTo()
    expect(document.body.classList.contains('dt-fill-dragging')).toBe(true)
    mouseup()
    expect(document.body.classList.contains('dt-fill-dragging')).toBe(false)
    expect(h.api._fillPreview.value).toBeNull()
    // 监听器已摘：再发 mousemove 不会改预览（已为 null，且不会再被写回）
    pointAt(5, 0)
    moveTo()
    expect(h.api._fillPreview.value).toBeNull()
  })

  it('cancelFillDrag 可主动中止（数据变更/卸载路径）', () => {
    const h = setup()
    h.api.onFillHandleMouseDown(mousedown())
    pointAt(3, 0)
    moveTo()
    expect(h.api._fillPreview.value).not.toBeNull()
    h.api.cancelFillDrag()
    expect(h.api._fillPreview.value).toBeNull()
    expect(document.body.classList.contains('dt-fill-dragging')).toBe(false)
    mouseup()
    expect(h.applied, '中止后松手不该填充').toEqual([])
  })

  it('指针落在非单元格区域（elementFromPoint 返回 null）：不报错、不改预览', () => {
    const h = setup()
    h.api.onFillHandleMouseDown(mousedown())
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(null)
    expect(() => moveTo()).not.toThrow()
    expect(h.api._fillPreview.value).toBeNull()
    mouseup()
  })

  it('data-row-idx 非数字（脏 DOM）：忽略而非 NaN 污染', () => {
    const h = setup()
    h.api.onFillHandleMouseDown(mousedown())
    const td = document.createElement('td')
    td.dataset.rowIdx = 'abc'
    td.dataset.colIdx = '0'
    document.body.appendChild(td)
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(td)
    moveTo()
    expect(h.api._fillPreview.value).toBeNull()
    mouseup()
  })
})

describe('填充柄 · isInFillPreview 边界', () => {
  it('未拖拽时恒 false', () => {
    const h = setup()
    expect(h.api.isInFillPreview(0, 0)).toBe(false)
  })

  it('预览区间内 true、区间外 false（含边界）', () => {
    const h = setup({ bounds: { r0: 1, r1: 1, c0: 0, c1: 0 } })
    h.api.onFillHandleMouseDown(mousedown())
    pointAt(3, 0)
    moveTo()
    // 预览 { r0:1, r1:3, c0:0, c1:0 }
    expect(h.api.isInFillPreview(1, 0)).toBe(true)
    expect(h.api.isInFillPreview(3, 0)).toBe(true)
    expect(h.api.isInFillPreview(0, 0), '上边界外').toBe(false)
    expect(h.api.isInFillPreview(4, 0), '下边界外').toBe(false)
    expect(h.api.isInFillPreview(2, 1), '列越界').toBe(false)
    mouseup()
  })
})
