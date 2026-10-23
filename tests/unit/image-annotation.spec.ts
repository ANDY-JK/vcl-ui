/**
 * useImageAnnotation 标注引擎契约（自 ImagePreview.vue 下沉的绘制子系统）
 *
 * 已有 image-anno-paint.spec.ts 只覆盖「绘制原语」（paintAnno / mapAnnoToImage 的
 * 描边与坐标映射），**引擎侧全部状态机**零覆盖：工具互斥与取消清理、切图清空、
 * rAF 节流渲染、命中检测（rect 负宽高 / 椭圆 / 画笔阈值）、绘制-拖动-收尾三段流、
 * 零尺寸拒收、window mouseup 兜底绑定、Escape 三级取消、工具快捷键、卸载清理。
 *
 * 断言落在**返回面可观测状态**（annotations/annoTool/annoSelected/isAnnoDrawing）
 * 与 paintAnno 的调用参数上，不依赖内部私有变量。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { mountAnnoHost, makeCanvas } from './anno-host'
import type { AnnoType } from '@/components/data/composables/annotation-types'

const h = vi.hoisted(() => ({
  /** paintAnno 每次调用：标注 id / 是否选中 / 缩放比 */
  paint: [] as Array<{ id: string; selected: boolean; s: number }>,
  /** rAF 回调队列（手动驱动，避免真实帧时序） */
  raf: [] as Array<FrameRequestCallback>,
  cancelRaf: [] as number[],
  /** ResizeObserver 实例（断言 observe/disconnect/回调重渲） */
  ro: [] as Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; cb: () => void }>,
}))

vi.mock('@/components/data/composables/image-anno-paint', () => ({
  paintAnno: (_ctx: unknown, a: { id: string }, selected: boolean, s: number) => {
    h.paint.push({ id: a.id, selected, s })
  },
}))

class FakeResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  cb: () => void
  constructor(cb: () => void) {
    this.cb = cb
    h.ro.push(this)
  }
}

/** 驱动已排队的 rAF 回调（模拟一帧），让 renderAnnos 真正落到 _renderAnnosNow */
async function flushRaf(): Promise<void> {
  const cbs = h.raf.splice(0)
  for (const cb of cbs) cb(0)
  await nextTick()
}

const down = (x: number, y: number) => ({ clientX: x, clientY: y }) as MouseEvent

let host: ReturnType<typeof mountAnnoHost>
let canvas: ReturnType<typeof makeCanvas>
/** 个别用例会临时再挂一个宿主（无 ResizeObserver 环境），一并纳入清理 */
let extras: Array<ReturnType<typeof mountAnnoHost>> = []

beforeEach(() => {
  h.paint.length = 0
  h.raf.length = 0
  h.cancelRaf.length = 0
  h.ro.length = 0
  extras = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    h.raf.push(cb)
    return h.raf.length
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    h.cancelRaf.push(id)
  })
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  host = mountAnnoHost()
  canvas = makeCanvas()
  host.annoCanvas.value = canvas.cvs
})

afterEach(() => {
  host.wrapper.unmount()
  for (const e of extras) e.wrapper.unmount()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/* ═══════════ 工具切换与取消 ═══════════ */

describe('工具切换与取消', () => {
  it('**激活工具 → 再点同一工具 = 取消**', () => {
    const { api } = host
    api.setAnnoTool('rect')
    expect(api.annoTool.value).toBe('rect')
    api.setAnnoTool('rect')
    expect(api.annoTool.value, '同工具再点应取消').toBeNull()
  })

  it('**切换工具互斥**（rect → circle 不会同时激活）', () => {
    const { api } = host
    api.setAnnoTool('rect')
    api.setAnnoTool('circle')
    expect(api.annoTool.value).toBe('circle')
    api.setAnnoTool('pen')
    expect(api.annoTool.value).toBe('pen')
  })

  it('**切换/取消工具时清空选中**', () => {
    const { api } = host
    api.annoSelected.value = 'a1'
    api.setAnnoTool('rect')
    expect(api.annoSelected.value, '切工具应清选中').toBeNull()
  })

  it('**取消工具清掉半成品绘制（防幽灵标注）**', async () => {
    const { api } = host
    api.setAnnoTool('rect')
    api.annoStartAt({ x: 10, y: 10 })
    api.annoMoveAt({ x: 40, y: 40 })
    expect(api.isAnnoDrawing(), '前置：绘制中').toBe(true)

    h.paint.length = 0
    api.setAnnoTool(null)
    expect(api.isAnnoDrawing(), '取消后应复位绘制态').toBe(false)
    await flushRaf()
    expect(h.paint.length, '取消后画布上不该残留半成品').toBe(0)
    // 复位后半成品不应再被收下
    api.onAnnoMouseUp()
    await flushRaf()
    expect(api.annotations.value.length, '不该产出幽灵标注').toBe(0)
  })
})

/* ═══════════ 切图清空 ═══════════ */

describe('切图清空', () => {
  it('**currentIndex 变化 → 标注/工具/选中/绘制态全部复位**', async () => {
    const { api, currentIndex } = host
    api.setAnnoTool('rect')
    api.annoStartAt({ x: 5, y: 5 })
    api.annoMoveAt({ x: 40, y: 30 })
    api.onAnnoMouseUp()
    expect(api.annotations.value.length, '前置：已有 1 条标注').toBe(1)
    api.setAnnoTool('circle')
    api.annoSelected.value = 'a1'

    currentIndex.value = 1
    await nextTick()

    expect(api.annotations.value.length, '切图应清空标注').toBe(0)
    expect(api.annoTool.value, '工具应复位').toBeNull()
    expect(api.annoSelected.value, '选中应复位').toBeNull()
    expect(api.isAnnoDrawing(), '绘制态应复位').toBe(false)
  })

  it('**拖动中切图 → 解绑 window mouseup（切图后松手不再改标注）**', async () => {
    const { api, currentIndex } = host
    // 造一条标注并命中它进入拖动
    api.setAnnoTool('rect')
    api.annoStartAt({ x: 10, y: 10 })
    api.annoMoveAt({ x: 60, y: 40 })
    api.onAnnoMouseUp()
    api.setAnnoTool(null)
    api.annoStartAt({ x: 20, y: 20 })
    expect(api.isAnnoDragging(), '前置：拖动中').toBe(true)

    currentIndex.value = 1
    await nextTick()
    expect(api.isAnnoDragging(), '切图应复位拖动').toBe(false)

    // 切图后再松手：不该因残留绑定而改动任何状态
    api.annotations.value = [{ type: 'rect', id: 'keep', x: 0, y: 0, w: 10, h: 10, color: '#000', lw: 2 }]
    window.dispatchEvent(new MouseEvent('mouseup'))
    await nextTick()
    expect(api.isAnnoDrawing(), '不该被残留绑定改回绘制态').toBe(false)
  })
})

/* ═══════════ 渲染与节流 ═══════════ */

describe('渲染与节流', () => {
  it('**renderAnnos 有 rAF 节流：连续调用只排队一次**', async () => {
    const { api } = host
    api.renderAnnos()
    api.renderAnnos()
    api.renderAnnos()
    expect(h.raf.length, '三连调只该排队一帧').toBe(1)

    await flushRaf()
    api.renderAnnos()
    expect(h.raf.length, '帧跑完后可再次排队').toBe(1)
  })

  it('**渲染：画布尺寸跟 stage、清屏、每个标注画一次且带选中标记**', async () => {
    const { api } = host
    api.annotations.value = [
      { type: 'rect', id: 'r1', x: 0, y: 0, w: 10, h: 10, color: '#f00', lw: 2 },
      { type: 'circle', id: 'c1', x: 5, y: 5, w: 20, h: 20, color: '#0f0', lw: 2 },
    ]
    api.annoSelected.value = 'c1'
    api.renderAnnos()
    await flushRaf()

    expect(canvas.cvs.width, '画布宽应跟 stage').toBe(canvas.w)
    expect(canvas.cvs.height, '画布高应跟 stage').toBe(canvas.h)
    expect(canvas.ctx.clearRect, '应先清屏').toHaveBeenCalledWith(0, 0, canvas.w, canvas.h)
    expect(
      h.paint.map((p) => p.id),
      '两条标注各画一次',
    ).toEqual(['r1', 'c1'])
    expect(h.paint.map((p) => p.selected), '选中项应带选中标记').toEqual([false, true])
    expect(
      h.paint.every((p) => p.s === 1),
      '屏幕渲染缩放比为 1',
    ).toBe(true)
  })

  it('**无画布 → 静默返回（不抛、不画）**', async () => {
    const { api } = host
    host.annoCanvas.value = null
    api.annotations.value = [{ type: 'rect', id: 'r1', x: 0, y: 0, w: 1, h: 1, color: '#000', lw: 2 }]
    api.renderAnnos()
    await flushRaf()
    expect(h.paint.length, '无画布不该绘制').toBe(0)
  })

  it('**画布无父容器（拿不到 stage）→ 静默返回**', async () => {
    const { api } = host
    const orphan = document.createElement('canvas')
    Object.defineProperty(orphan, 'getContext', { value: vi.fn(), configurable: true })
    host.annoCanvas.value = orphan
    api.annotations.value = [{ type: 'rect', id: 'r1', x: 0, y: 0, w: 1, h: 1, color: '#000', lw: 2 }]
    api.renderAnnos()
    await flushRaf()
    expect(h.paint.length, '无 stage 不该绘制').toBe(0)
  })

  it('**绘制中的半成品也参与渲染**（预览随鼠标变）', async () => {
    const { api } = host
    api.setAnnoTool('rect')
    api.annoStartAt({ x: 10, y: 10 })
    api.annoMoveAt({ x: 50, y: 40 })
    api.renderAnnos()
    await flushRaf()
    expect(h.paint.length, '半成品应被画出来').toBe(1)
    expect(api.annotations.value.length, '此时还不该落库').toBe(0)
  })

  it('**画布 ref 赋值 → 对 stage 挂 ResizeObserver 并跟尺寸重渲**', async () => {
    const ro = h.ro[0]!
    expect(ro, '应在 onMounted 建 ResizeObserver').toBeTruthy()
    expect(ro.observe, '应 observe 画布的父 stage').toHaveBeenCalledWith(canvas.stage)
  })

  it('**ResizeObserver 回调 → 立即重渲**（stage 尺寸变化跟手）', async () => {
    const { api } = host
    api.annotations.value = [{ type: 'rect', id: 'r1', x: 0, y: 0, w: 5, h: 5, color: '#000', lw: 2 }]
    h.paint.length = 0
    h.ro[0]!.cb()
    await flushRaf()
    expect(h.paint.length, 'RO 回调应触发重渲').toBe(1)
  })

  it('**无 ResizeObserver 环境 → 跳过自适应监听但仍能渲染**', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const before = h.ro.length
    const noRo = mountAnnoHost()
    extras.push(noRo)
    noRo.annoCanvas.value = canvas.cvs // 画布仍要接上，否则渲染会停在「无画布」早退
    expect(h.ro.length, '不该在无 RO 环境下建实例').toBe(before)

    noRo.api.annotations.value = [{ type: 'rect', id: 'r1', x: 0, y: 0, w: 5, h: 5, color: '#000', lw: 2 }]
    h.paint.length = 0
    noRo.api.renderAnnos()
    await flushRaf()
    expect(h.paint.length, '无 RO 也应能正常渲染').toBe(1)
  })
})

/* ═══════════ 命中检测 ═══════════ */

describe('命中检测', () => {
  const rect = (over: Partial<Record<string, number>> = {}) => ({
    type: 'rect' as const,
    id: 'r1',
    x: 100,
    y: 100,
    w: 50,
    h: 30,
    color: '#000',
    lw: 2,
    ...over,
  })

  it('**rect：内部与边缘 pad 容差内命中，远处不命中**', () => {
    const { api } = host
    api.annotations.value = [rect()]
    expect(api.hitTest({ x: 120, y: 110 })?.id, '内部应命中').toBe('r1')
    expect(api.hitTest({ x: 97, y: 110 })?.id, 'pad 容差内应命中').toBe('r1')
    expect(api.hitTest({ x: 80, y: 110 }), '远处不该命中').toBeNull()
  })

  it('**rect：负宽高（反向拖拽）仍按归一化区域命中**', () => {
    const { api } = host
    api.annotations.value = [rect({ x: 150, y: 130, w: -50, h: -30 })]
    expect(api.hitTest({ x: 120, y: 110 })?.id, '归一化后内部应命中').toBe('r1')
    expect(api.hitTest({ x: 160, y: 120 }), '归一化区域外不该命中').toBeNull()
  })

  it('**circle：椭圆内命中、外不命中**', () => {
    const { api } = host
    api.annotations.value = [{ type: 'circle', id: 'c1', x: 100, y: 100, w: 80, h: 40, color: '#000', lw: 2 }]
    expect(api.hitTest({ x: 140, y: 120 })?.id, '中心应命中').toBe('c1')
    expect(api.hitTest({ x: 139, y: 100 })?.id, '长轴方向容差内应命中').toBe('c1')
    expect(api.hitTest({ x: 200, y: 120 }), '椭圆外不该命中').toBeNull()
  })

  it('**pen：笔画附近（pad + 线宽）命中，离远不命中**', () => {
    const { api } = host
    api.annotations.value = [
      {
        type: 'pen',
        id: 'p1',
        // 两点拉开距离：鉴别点只靠近其中一点，避免「靠近另一点」把变异掩盖过去
        points: [
          { x: 50, y: 50 },
          { x: 200, y: 200 },
        ],
        color: '#000',
        lw: 4,
      },
    ]
    expect(api.hitTest({ x: 52, y: 52 })?.id, '笔画附近应命中').toBe('p1')
    // 距 (50,50) 恰好 7px：大于 pad(6) 但小于 pad+lw(6+4) —— 专门盯「阈值必须算上线宽」
    expect(api.hitTest({ x: 57, y: 50 })?.id, '粗细也应计入命中阈值').toBe('p1')
    expect(api.hitTest({ x: 120, y: 120 }), '离两段笔画都远不该命中').toBeNull()
  })

  it('**空列表 → null；重叠时取最上层（后添加的优先）**', () => {
    const { api } = host
    expect(api.hitTest({ x: 1, y: 1 }), '空列表应 null').toBeNull()

    api.annotations.value = [rect({ id: 'bottom' }), rect({ id: 'top', x: 100, y: 100, w: 60, h: 40 })]
    expect(api.hitTest({ x: 120, y: 110 })?.id, '应取后添加（更上层）的那条').toBe('top')
  })
})

/* ═══════════ 删除 ═══════════ */

describe('删除', () => {
  it('**deleteAnno 移除指定标注并排队重渲**', async () => {
    const { api } = host
    api.annotations.value = [
      { type: 'rect', id: 'a1', x: 0, y: 0, w: 5, h: 5, color: '#000', lw: 2 },
      { type: 'rect', id: 'a2', x: 9, y: 9, w: 5, h: 5, color: '#000', lw: 2 },
    ]
    h.raf.length = 0
    api.deleteAnno('a1')
    expect(
      api.annotations.value.map((a) => a.id),
      '只删指定项',
    ).toEqual(['a2'])
    expect(h.raf.length, '删除应触发重渲').toBeGreaterThan(0)
  })

  it('**删的是选中项 → 选中复位；删别的 → 选中保持**', () => {
    const { api } = host
    api.annotations.value = [
      { type: 'rect', id: 'a1', x: 0, y: 0, w: 5, h: 5, color: '#000', lw: 2 },
      { type: 'rect', id: 'a2', x: 9, y: 9, w: 5, h: 5, color: '#000', lw: 2 },
    ]
    api.annoSelected.value = 'a2'
    api.deleteAnno('a1')
    expect(api.annoSelected.value, '删非选中项不该清选中').toBe('a2')

    api.deleteAnno('a2')
    expect(api.annoSelected.value, '删选中项应清选中').toBeNull()
  })
})

/* ═══════════ 绘制三段流 ═══════════ */

describe('绘制三段流', () => {
  const start = (api: ReturnType<typeof mountAnnoHost>['api'], t: AnnoType, x = 10, y = 10) => {
    api.setAnnoTool(t)
    api.annoStartAt({ x, y })
  }

  it('**rect：start → move → up 产出标注且宽高为位移**', async () => {
    const { api } = host
    start(api, 'rect')
    api.annoMoveAt({ x: 60, y: 40 })
    api.onAnnoMouseUp()
    await flushRaf()

    const a = api.annotations.value[0]!
    expect(a.type).toBe('rect')
    expect(a.x).toBe(10)
    expect(a.y).toBe(10)
    expect(a.w, 'w = 位移').toBe(50)
    expect(a.h, 'h = 位移').toBe(30)
    expect(api.isAnnoDrawing(), 'up 后应结束绘制').toBe(false)
  })

  it('**circle 与 pen 各自产出对应 type**', async () => {
    const { api } = host
    start(api, 'circle')
    api.annoMoveAt({ x: 30, y: 20 })
    api.onAnnoMouseUp()

    api.setAnnoTool('pen')
    api.annoStartAt({ x: 1, y: 1 })
    api.annoMoveAt({ x: 2, y: 2 })
    api.annoMoveAt({ x: 3, y: 3 })
    api.onAnnoMouseUp()
    await flushRaf()

    expect(
      api.annotations.value.map((a) => a.type),
      '两种工具都应落库',
    ).toEqual(['circle', 'pen'])
    const pen = api.annotations.value[1]!
    expect(pen.type === 'pen' && pen.points.length, '画笔应记录全部采样点').toBe(3)
  })

  it('**每条标注拿到互不相同的 id**', async () => {
    const { api } = host
    api.setAnnoTool('rect')
    api.annoStartAt({ x: 0, y: 0 })
    api.annoMoveAt({ x: 10, y: 10 })
    api.onAnnoMouseUp()
    api.annoStartAt({ x: 50, y: 50 })
    api.annoMoveAt({ x: 70, y: 70 })
    api.onAnnoMouseUp()
    await flushRaf()

    const ids = api.annotations.value.map((a) => a.id)
    expect(ids.length, '应落库两条').toBe(2)
    expect(new Set(ids).size, 'id 必须唯一（否则删除/选中会串）').toBe(2)
  })

  it('**颜色/线宽取自当前工具设置**', async () => {
    const { api } = host
    api.annoColor.value = '#22c55e'
    api.annoWidth.value = 6
    start(api, 'rect')
    api.annoMoveAt({ x: 40, y: 40 })
    api.onAnnoMouseUp()
    await flushRaf()
    expect(api.annotations.value[0]!.color, '应带当前颜色').toBe('#22c55e')
    expect(api.annotations.value[0]!.lw, '应带当前线宽').toBe(6)
  })

  it('**零尺寸 rect 拒收（点一下不出标注）**', async () => {
    const { api } = host
    start(api, 'rect')
    api.onAnnoMouseUp()
    await flushRaf()
    expect(api.annotations.value.length, '零尺寸不该落库').toBe(0)
  })

  it('**画笔只有一个采样点拒收（须 ≥2 点）**', async () => {
    const { api } = host
    start(api, 'pen')
    api.onAnnoMouseUp()
    await flushRaf()
    expect(api.annotations.value.length, '单点画笔不该落库').toBe(0)
  })

  it('**反向拖拽（非零负尺寸）仍落库**——只拒零尺寸，不拒负', async () => {
    const { api } = host
    start(api, 'rect', 80, 60)
    api.annoMoveAt({ x: 30, y: 20 })
    api.onAnnoMouseUp()
    await flushRaf()
    expect(api.annotations.value.length, '负尺寸应落库').toBe(1)
    expect(api.annotations.value[0]!.w, 'w 保留负值（归一化交给渲染/命中）').toBe(-50)
  })

  it('**未开始绘制时 move 是空操作**', () => {
    const { api } = host
    expect(() => api.annoMoveAt({ x: 1, y: 1 }), '不该抛').not.toThrow()
    expect(api.annotations.value.length).toBe(0)
  })

  it('**绘制中 window mouseup 也能收尾**（鼠标移出 stage 的兜底绑定真实生效）', async () => {
    const { api } = host
    start(api, 'rect')
    api.annoMoveAt({ x: 55, y: 25 })
    window.dispatchEvent(new MouseEvent('mouseup'))
    await flushRaf()
    expect(api.annotations.value.length, 'window mouseup 应收下标注').toBe(1)
    expect(api.isAnnoDrawing()).toBe(false)
  })

  it('**未绘制时 mouseup 只解绑，不影响已有标注**', async () => {
    const { api } = host
    api.annotations.value = [{ type: 'rect', id: 'kept', x: 0, y: 0, w: 4, h: 4, color: '#000', lw: 2 }]
    api.onAnnoMouseUp()
    await flushRaf()
    expect(api.annotations.value.length, '不该新增').toBe(1)
  })
})

/* ═══════════ 选中与拖动 ═══════════ */

describe('选中与拖动', () => {
  const seed = (api: ReturnType<typeof mountAnnoHost>['api']) => {
    api.annotations.value = [{ type: 'rect', id: 'a1', x: 100, y: 100, w: 60, h: 40, color: '#000', lw: 2 }]
  }

  it('**无工具时命中 → 选中并进入拖动**', () => {
    const { api } = host
    seed(api)
    api.annoStartAt({ x: 130, y: 120 })
    expect(api.annoSelected.value, '应选中命中项').toBe('a1')
    expect(api.isAnnoDragging(), '应进入拖动').toBe(true)
  })

  it('**拖动 rect：位置按位移更新，且数组引用变化（触发响应式）**', async () => {
    const { api } = host
    seed(api)
    const before = api.annotations.value
    api.annoStartAt({ x: 130, y: 120 })
    api.annoMoveAt({ x: 160, y: 150 })
    await flushRaf()

    const a = api.annotations.value[0]!
    expect(a.x, 'dx=+30').toBe(130)
    expect(a.y, 'dy=+30').toBe(130)
    expect(api.annotations.value, '应换新数组引用以触发视图更新').not.toBe(before)
  })

  it('**拖动 circle 同样按位移更新**', async () => {
    const { api } = host
    api.annotations.value = [{ type: 'circle', id: 'c1', x: 100, y: 100, w: 60, h: 40, color: '#000', lw: 2 }]
    api.annoStartAt({ x: 130, y: 120 })
    api.annoMoveAt({ x: 110, y: 130 })
    await flushRaf()
    const a = api.annotations.value[0]!
    expect([a.x, a.y], '(-20, +10)').toEqual([80, 110])
  })

  it('**拖动 pen：不改点位，但仍刷新数组引用**', async () => {
    const { api } = host
    api.annotations.value = [
      { type: 'pen', id: 'p1', points: [{ x: 10, y: 10 }], color: '#000', lw: 2 },
    ]
    const before = api.annotations.value
    api.annoStartAt({ x: 10, y: 10 })
    api.annoMoveAt({ x: 99, y: 99 })
    await flushRaf()
    expect(api.annotations.value, '画笔拖动应刷新引用').not.toBe(before)
    const p = api.annotations.value[0]!
    expect(p.type === 'pen' && p.points[0], '点位不该被拖动改掉').toEqual({ x: 10, y: 10 })
  })

  it('**无工具且未命中 → 清除选中**', () => {
    const { api } = host
    seed(api)
    api.annoSelected.value = 'a1'
    api.annoStartAt({ x: 999, y: 999 })
    expect(api.annoSelected.value, '点空白应取消选中').toBeNull()
    expect(api.isAnnoDragging()).toBe(false)
  })

  it('**拖动收尾：收到 mouseup 后停止拖动并立即重渲一次**', async () => {
    const { api } = host
    seed(api)
    api.annoStartAt({ x: 130, y: 120 })
    expect(api.isAnnoDragging()).toBe(true)
    h.paint.length = 0
    api.onAnnoMouseUp()
    // 拖动分支走的是同步 _renderAnnosNow（不是 rAF），所以无需 flush 就应有绘制
    expect(h.paint.length, '松手时应立即重渲（同步）').toBeGreaterThan(0)
    await flushRaf()
    expect(api.isAnnoDragging(), '松手应结束拖动').toBe(false)
    expect(api.annoSelected.value, '松手不应取消选中').toBe('a1')
  })

  it('**拖动中标注已被移除 → move 安全返回（不抛、不复活）**', async () => {
    const { api } = host
    seed(api)
    api.annoStartAt({ x: 130, y: 120 })
    expect(api.isAnnoDragging(), '前置：拖动中').toBe(true)

    api.annotations.value = [] // 外部把这条标注删了（或切图清空）
    expect(() => api.annoMoveAt({ x: 200, y: 200 }), '找不到目标不该抛').not.toThrow()
    await flushRaf()
    expect(api.annotations.value.length, '不该被复活').toBe(0)
  })

  it('**拖动中切图后松手不再改位置**（残留 _annoDragOrig 必须清）', async () => {
    const { api, currentIndex } = host
    seed(api)
    api.annoStartAt({ x: 130, y: 120 })
    api.annoMoveAt({ x: 140, y: 130 })
    currentIndex.value = 1
    await nextTick()

    api.annotations.value = [{ type: 'rect', id: 'a1', x: 100, y: 100, w: 60, h: 40, color: '#000', lw: 2 }]
    api.annoMoveAt({ x: 500, y: 500 })
    await flushRaf()
    expect(api.annotations.value[0]!.x, '切图后不该继续被拖动').toBe(100)
  })
})

/* ═══════════ 坐标换算 ═══════════ */

describe('坐标换算', () => {
  it('**stagePoint：屏幕坐标减去 stage 的 rect 偏移**', () => {
    const { api } = host
    expect(api.stagePoint(110, 220), 'left=10/top=20 → 减掉').toEqual({ x: 100, y: 200 })
  })

  it('**无 stage → 返回 {0,0}**（拿不到容器时不产生 NaN 坐标）', () => {
    const { api } = host
    host.annoCanvas.value = null
    expect(api.stagePoint(50, 60)).toEqual({ x: 0, y: 0 })
  })

  it('**鼠标事件经 stageCoords 换算后再绘制**', async () => {
    const { api } = host
    api.setAnnoTool('rect')
    api.onAnnoMouseDown(down(110, 220)) // → stage (100, 200)
    api.onAnnoMouseMove(down(160, 250)) // → stage (150, 230)
    api.onAnnoMouseUp()
    await flushRaf()
    const a = api.annotations.value[0]!
    expect([a.x, a.y], '起点应为换算后的 stage 坐标').toEqual([100, 200])
    expect([a.w, a.h], '尺寸按换算后位移').toEqual([50, 30])
  })
})

/* ═══════════ 触摸中断清理 ═══════════ */

describe('触摸中断清理', () => {
  it('**resetAnnoGestures：丢弃半成品并复位绘制/拖动**', async () => {
    const { api } = host
    api.setAnnoTool('rect')
    api.annoStartAt({ x: 10, y: 10 })
    api.annoMoveAt({ x: 40, y: 40 })
    h.paint.length = 0
    api.resetAnnoGestures()
    expect(api.isAnnoDrawing(), '应复位绘制态').toBe(false)
    expect(api.isAnnoDragging(), '应复位拖动态').toBe(false)
    await flushRaf()
    expect(h.paint.length, '中断后画布上不该残留半成品').toBe(0)

    api.onAnnoMouseUp()
    await flushRaf()
    expect(api.annotations.value.length, '半成品不该被收下').toBe(0)
  })
})

/* ═══════════ 键盘 ═══════════ */

describe('键盘', () => {
  const key = (k: string, init: KeyboardEventInit = {}) =>
    ({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...init }) as KeyboardEvent

  it('**Escape 三级之一：绘制中 → 只取消绘制，不删已有标注**', async () => {
    const { api } = host
    api.annotations.value = [{ type: 'rect', id: 'a1', x: 0, y: 0, w: 5, h: 5, color: '#000', lw: 2 }]
    api.setAnnoTool('rect')
    api.annoStartAt({ x: 10, y: 10 })
    api.onKeydown(key('Escape'))
    expect(api.isAnnoDrawing(), '应取消绘制').toBe(false)
    expect(api.annotations.value.length, '不该删标注').toBe(1)
    expect(api.annoTool.value, '工具应保持激活').toBe('rect')
    void (await flushRaf())
  })

  it('**Escape 三级之二：已选中（无绘制）→ 只取消选中**', () => {
    const { api } = host
    api.annotations.value = [{ type: 'rect', id: 'a1', x: 0, y: 0, w: 5, h: 5, color: '#000', lw: 2 }]
    api.annoSelected.value = 'a1'
    api.onKeydown(key('Escape'))
    expect(api.annoSelected.value, '应取消选中').toBeNull()
    expect(api.annotations.value.length, '标注保留').toBe(1)
  })

  it('**Escape 三级之三：仅工具激活 → 取消工具（并清绘制残留）**', () => {
    const { api } = host
    api.setAnnoTool('circle')
    api.annoSelected.value = null
    api.onKeydown(key('Escape'))
    expect(api.annoTool.value, '应取消工具').toBeNull()
  })

  it('**Delete / Backspace + 选中 → 删除该标注**', () => {
    const { api } = host
    api.annotations.value = [
      { type: 'rect', id: 'a1', x: 0, y: 0, w: 5, h: 5, color: '#000', lw: 2 },
      { type: 'rect', id: 'a2', x: 9, y: 9, w: 5, h: 5, color: '#000', lw: 2 },
    ]
    api.annoSelected.value = 'a1'
    api.onKeydown(key('Delete'))
    expect(api.annotations.value.map((a) => a.id), 'Delete 应删选中').toEqual(['a2'])

    api.annoSelected.value = 'a2'
    api.onKeydown(key('Backspace'))
    expect(api.annotations.value.length, 'Backspace 应删选中').toBe(0)
  })

  it('**R / P / C 切工具（大小写不敏感）**', () => {
    const { api } = host
    api.onKeydown(key('r'))
    expect(api.annoTool.value).toBe('rect')
    api.onKeydown(key('P'))
    expect(api.annoTool.value, '大写也应识别').toBe('pen')
    api.onKeydown(key('c'))
    expect(api.annoTool.value).toBe('circle')
  })

  it('**再按同一工具键 = 取消**（与点击按钮同语义）', () => {
    const { api } = host
    api.onKeydown(key('r'))
    expect(api.annoTool.value).toBe('rect')
    api.onKeydown(key('r'))
    expect(api.annoTool.value).toBeNull()
  })

  it('**带 Ctrl/Alt 的工具键不生效，回落宿主**', () => {
    const { api, fallback } = host
    api.onKeydown(key('r', { ctrlKey: true }))
    expect(api.annoTool.value, 'Ctrl+R 不该切工具').toBeNull()
    api.onKeydown(key('p', { altKey: true }))
    expect(api.annoTool.value, 'Alt+P 不该切工具').toBeNull()
    expect(fallback, '应回落宿主').toHaveBeenCalledTimes(2)
  })

  it('**无标注/无工具时的普通键回落宿主**', () => {
    const { api, fallback } = host
    api.onKeydown(key('ArrowLeft'))
    api.onKeydown(key('x'))
    expect(fallback, '两次都应回落').toHaveBeenCalledTimes(2)
    expect(api.annoTool.value).toBeNull()
  })

  it('**无选中时的 Delete 回落宿主**（不该吞掉宿主的删除语义）', () => {
    const { api, fallback } = host
    api.onKeydown(key('Delete'))
    expect(fallback, '无选中应回落').toHaveBeenCalledTimes(1)
  })

  it('**有选中时的普通键仍回落宿主**（只有标注相关键被吞）', () => {
    const { api, fallback } = host
    api.annotations.value = [{ type: 'rect', id: 'a1', x: 0, y: 0, w: 5, h: 5, color: '#000', lw: 2 }]
    api.annoSelected.value = 'a1'
    api.onKeydown(key('ArrowRight'))
    expect(fallback, '方向键应回落给宿主切图').toHaveBeenCalledTimes(1)
    expect(api.annoSelected.value, '不该清选中').toBe('a1')
  })
})

/* ═══════════ 卸载清理 ═══════════ */

describe('卸载清理', () => {
  it('**卸载：取消未执行的 rAF、断开 ResizeObserver、解绑 window mouseup**', async () => {
    const { api, wrapper } = host
    const ro = h.ro[0]!
    api.renderAnnos() // 排一帧但不跑，制造待取消的 rAF
    expect(h.raf.length, '前置：有排队帧').toBeGreaterThan(0)

    // 必须比「增量」而不是「是否调用过」：beforeEach 里给画布 ref 赋值会触发 watch，
    // 那条路径也会调一次 disconnect —— 只看 toHaveBeenCalled 的话，卸载漏掉也测不出来。
    const before = ro.disconnect.mock.calls.length
    wrapper.unmount()

    expect(ro.disconnect.mock.calls.length, '卸载应再断一次 ResizeObserver').toBeGreaterThan(before)
    expect(h.cancelRaf.length, '应取消未执行的 rAF').toBeGreaterThan(0)

    // window mouseup 已解绑：再派发不该抛、也不该产出标注
    window.dispatchEvent(new MouseEvent('mouseup'))
    expect(api.annotations.value.length).toBe(0)
  })
})