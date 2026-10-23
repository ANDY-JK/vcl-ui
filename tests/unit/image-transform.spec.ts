/**
 * useImageTransform 变换 + 触摸手势契约（ImagePreview 下沉层，与 useImageAnnotation 同胞）
 *
 * 该 composable **没有任何生命周期钩子**（只用 ref/computed），所以可直接在测试里调用，
 * 不需要宿主组件，也就绕开了 `vue/one-component-per-file` warning 的坑。
 *
 * 覆盖：变换状态机（缩放夹紧/位移归零/旋转环绕/翻转）、imgTransform 组合、
 * 滚轮缩放、鼠标拖拽（含标注让位与命中让位）、双击 1x↔2x、
 * 双指 pinch（锚点公式 / 提前返回 / 上下限）、单指平移、轻扫切图、轻点双击、触摸取消。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref } from 'vue'
import { useImageTransform } from '@/components/data/composables/useImageTransform'
import { makeCanvas } from './anno-host'

type Opts = Parameters<typeof useImageTransform>[1]

/** 造一组合法注入项（宿主回调全部可覆写；坐标换算默认恒等，便于直接断言数值） */
function makeOpts(over: Partial<Opts> = {}) {
  const opts: Opts = {
    isMulti: () => false,
    annoActive: () => false,
    isAnnoDrawing: () => false,
    isAnnoDragging: () => false,
    startAnnoAt: vi.fn(),
    moveAnnoAt: vi.fn(),
    endAnnoDraw: vi.fn(),
    cancelAnnoGestures: vi.fn(),
    stagePoint: (x, y) => ({ x, y }),
    stageCoords: (e) => ({ x: e.clientX, y: e.clientY }),
    hitTest: () => null,
    onSwipe: vi.fn(),
    ...over,
  }
  return opts
}

/** 触摸事件造对象：happy-dom 的 TouchEvent 构造受限，这里只造被读到的字段 */
function touch(touches: Array<{ x: number; y: number }>, changed?: Array<{ x: number; y: number }>) {
  const conv = (list: Array<{ x: number; y: number }>) => list.map((t) => ({ clientX: t.x, clientY: t.y }))
  return {
    touches: conv(touches),
    changedTouches: conv(changed ?? touches),
    preventDefault: vi.fn(),
  } as unknown as TouchEvent
}

const mouse = (x: number, y: number) => ({ clientX: x, clientY: y }) as MouseEvent

let annoCanvas: ReturnType<typeof ref<HTMLCanvasElement | null>>
let canvas: ReturnType<typeof makeCanvas>
let opts: Opts
let api: ReturnType<typeof useImageTransform>
/** 可控时钟：轻点双击判定依赖 Date.now 的 300ms 窗口 */
let clock = 1_000_000

beforeEach(() => {
  clock = 1_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  canvas = makeCanvas()
  annoCanvas = ref<HTMLCanvasElement | null>(canvas.cvs)
  opts = makeOpts()
  api = useImageTransform(annoCanvas, opts)
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/** 把状态推到非默认再断言复位 —— 直接断言默认值是假绿 */
function dirty() {
  api.setScale(2.5)
  api.rotateCW()
  api.toggleFlip()
  api.onMouseDown(mouse(100, 100))
  api.onMouseMove(mouse(140, 160))
}

/* ═══════════ 变换状态机 ═══════════ */

describe('变换状态机', () => {
  it('**resetTransform：缩放/位移/旋转/翻转全部复位**', () => {
    dirty()
    expect(api.scale.value, '前置：已放大').toBe(2.5)
    expect(api.rotation.value, '前置：已旋转').toBe(90)
    expect(api.flipH.value, '前置：已翻转').toBe(true)

    api.resetTransform()
    expect(api.scale.value).toBe(1)
    expect(api.pos.value).toEqual({ x: 0, y: 0 })
    expect(api.rotation.value).toBe(0)
    expect(api.flipH.value).toBe(false)
  })

  it('**已知缺陷（P3）：resetTransform 不清 dragging → 复位后仍能在 100% 下平移**', () => {
    // resetTransform 只复位 scale/pos/rotation/flipH，**没清 dragging / dragStart**。
    // 后果：拖动途中复位（宿切换图片时常这么做）后 dragging 仍为 true，
    // 下一次 mousemove 照样写 pos —— 绕过了 onMouseDown 里「scale<=1 且未旋转则不平移」
    // 的守卫，等于 100% 下也能把图平移出画面。
    api.setScale(2)
    api.onMouseDown(mouse(0, 0))
    api.onMouseMove(mouse(50, 50))
    expect(api.dragging.value, '前置：拖动中').toBe(true)

    api.resetTransform()
    expect(api.dragging.value, '【现状】复位未清拖动标记（期望应为 false）').toBe(true)
    api.onMouseMove(mouse(120, 90))
    expect(api.pos.value, '【现状】100% 下仍被平移到 (120,90)，违反 mousedown 守卫').toEqual({ x: 120, y: 90 })
  })

  it('**setScale：夹在 [0.25, 5]**', () => {
    api.setScale(0.01)
    expect(api.scale.value, '下限 0.25').toBe(0.25)
    api.setScale(99)
    expect(api.scale.value, '上限 5').toBe(5)
    api.setScale(1.8)
    expect(api.scale.value, '区间内原样').toBe(1.8)
  })

  it('**setScale 回到 ≤1 → 位移归零**（缩回原大小时不该仍被平移到画面外）', () => {
    api.setScale(3)
    api.onMouseDown(mouse(0, 0))
    api.onMouseMove(mouse(120, 90))
    expect(api.pos.value, '前置：已平移').toEqual({ x: 120, y: 90 })

    api.setScale(1)
    expect(api.scale.value).toBe(1)
    expect(api.pos.value, '≤1 应归零').toEqual({ x: 0, y: 0 })
  })

  it('**setScale >1 保留位移**（放大时不该把用户平移抹掉）', () => {
    api.setScale(2)
    api.onMouseDown(mouse(0, 0))
    api.onMouseMove(mouse(50, 40))
    api.setScale(3)
    expect(api.pos.value, '放大应保留位移').toEqual({ x: 50, y: 40 })
  })

  it('**rotateCW：90 步进且 360 环绕**', () => {
    const seen: number[] = []
    for (let i = 0; i < 5; i++) {
      api.rotateCW()
      seen.push(api.rotation.value)
    }
    expect(seen, '270 后应回到 0 而不是 360').toEqual([90, 180, 270, 0, 90])
  })

  it('**rotateCCW：反向步进且不出现负数**', () => {
    const seen: number[] = []
    for (let i = 0; i < 5; i++) {
      api.rotateCCW()
      seen.push(api.rotation.value)
    }
    expect(seen, '0 后应回到 270 而不是 -90').toEqual([270, 180, 90, 0, 270])
  })

  it('**toggleFlip：来回翻转**', () => {
    api.toggleFlip()
    expect(api.flipH.value).toBe(true)
    api.toggleFlip()
    expect(api.flipH.value).toBe(false)
  })
})

/* ═══════════ imgTransform 组合 ═══════════ */

describe('imgTransform 组合', () => {
  it('**默认只有 translate + scale**', () => {
    expect(api.imgTransform.value).toBe('translate(0px, 0px) scale(1)')
  })

  it('**旋转非 0 时追加 rotate**（顺序在 scale 之后、翻转之前）', () => {
    api.rotateCW()
    expect(api.imgTransform.value).toBe('translate(0px, 0px) scale(1) rotate(90deg)')
  })

  it('**翻转时追加 scaleX(-1)**', () => {
    api.toggleFlip()
    expect(api.imgTransform.value).toBe('translate(0px, 0px) scale(1) scaleX(-1)')
  })

  it('**四者齐全时顺序为 translate → scale → rotate → scaleX**', () => {
    api.setScale(2)
    api.rotateCCW()
    api.toggleFlip()
    api.onMouseDown(mouse(0, 0))
    api.onMouseMove(mouse(12, 34))
    expect(api.imgTransform.value).toBe(
      'translate(12px, 34px) scale(2) rotate(270deg) scaleX(-1)',
    )
  })
})

/* ═══════════ 滚轮 ═══════════ */

describe('滚轮', () => {
  const wheelEv = (deltaY: number) => ({ deltaY, preventDefault: vi.fn() }) as unknown as WheelEvent

  it('**上滚放大 0.15 且阻止页面滚动**', () => {
    const e = wheelEv(-1)
    api.onWheel(e)
    expect(api.scale.value).toBeCloseTo(1.15, 5)
    expect(e.preventDefault, '必须阻止页面滚动').toHaveBeenCalled()
  })

  it('**下滚缩小 0.15**', () => {
    api.setScale(2)
    api.onWheel(wheelEv(1))
    expect(api.scale.value).toBeCloseTo(1.85, 5)
  })

  it('**下滚缩回 ≤1 → 位移归零**', () => {
    api.setScale(2)
    api.onMouseDown(mouse(0, 0))
    api.onMouseMove(mouse(60, 60))
    for (let i = 0; i < 20; i++) api.onWheel(wheelEv(1))
    expect(api.scale.value, '应夹在下限').toBe(0.25)
    expect(api.pos.value, '≤1 应归零').toEqual({ x: 0, y: 0 })
  })

  it('**上滚到顶被夹在 5**', () => {
    for (let i = 0; i < 40; i++) api.onWheel(wheelEv(-1))
    expect(api.scale.value).toBe(5)
  })
})

/* ═══════════ 鼠标拖拽 ═══════════ */

describe('鼠标拖拽', () => {
  it('**未放大未旋转 → 按下不进入拖动**（原始大小下平移无意义）', () => {
    api.onMouseDown(mouse(10, 10))
    expect(api.dragging.value).toBe(false)
    api.onMouseMove(mouse(80, 80))
    expect(api.pos.value, '不该产生位移').toEqual({ x: 0, y: 0 })
  })

  it('**已放大 → 按下进入拖动、移动跟手、抬起结束**', () => {
    api.setScale(2)
    api.onMouseDown(mouse(100, 100))
    expect(api.dragging.value, '应进入拖动').toBe(true)

    // 先平移到非零再二次抓取：否则 pos 为 0 时「抓取点要不要算上已有位移」看不出来
    api.onMouseMove(mouse(120, 120))
    api.onMouseUp()
    api.onMouseDown(mouse(200, 200))
    api.onMouseMove(mouse(230, 250))
    expect(api.pos.value, '二次抓取应从已有位移继续，而非跳回原点').toEqual({ x: 50, y: 70 })
    api.onMouseUp()

    // 复位后再做一次干净的单段拖拽，验加减对称
    api.resetTransform()
    api.setScale(2)
    api.onMouseDown(mouse(100, 100))
    api.onMouseMove(mouse(150, 130))
    expect(api.pos.value, '按抓取点偏移平移').toEqual({ x: 50, y: 30 })

    api.onMouseUp()
    expect(api.dragging.value, '抬起应结束').toBe(false)
    api.onMouseMove(mouse(999, 999))
    expect(api.pos.value, '抬起后移动不该再改位移').toEqual({ x: 50, y: 30 })
  })

  it('**已旋转（未放大）也允许拖动**（转了 90° 后画面可能超出容器）', () => {
    api.rotateCW()
    api.onMouseDown(mouse(20, 20))
    expect(api.dragging.value).toBe(true)
  })

  it('**命中已有标注 → 不启动图片拖拽**（拖动标注只动标注）', () => {
    opts.hitTest = () => ({ id: 'a1' })
    api.setScale(2)
    api.onMouseDown(mouse(10, 10))
    expect(api.dragging.value, '命中标注应让位').toBe(false)
  })

  it('**标注工具激活 → 鼠标按下不进入拖动**', () => {
    opts.annoActive = () => true
    api.setScale(2)
    api.onMouseDown(mouse(0, 0))
    expect(api.dragging.value, '工具激活时按下不该进入拖动').toBe(false)
    api.onMouseMove(mouse(80, 80))
    expect(api.pos.value, '工具激活时移动不该改位移').toEqual({ x: 0, y: 0 })
    api.onMouseUp()
    expect(api.dragging.value).toBe(false)
  })

  it('**拖动途中激活工具 → 移动立刻让位，抬起也不清标记（整体让位）**', () => {
    let active = false
    opts.annoActive = () => active
    api.setScale(2)
    api.onMouseDown(mouse(0, 0))
    api.onMouseMove(mouse(40, 40))
    expect(api.dragging.value, '前置：拖动中').toBe(true)
    const held = { ...api.pos.value }

    active = true
    api.onMouseMove(mouse(200, 200))
    expect(api.pos.value, '工具激活时移动不该改位移').toEqual(held)

    api.onMouseUp()
    expect(api.dragging.value, '工具激活时抬起不清拖动标记（整体让位）').toBe(true)
    active = false
    api.onMouseUp()
    expect(api.dragging.value, '工具关掉后抬起应结束拖动').toBe(false)
  })
})

/* ═══════════ 双击 ═══════════ */

describe('双击', () => {
  it('**1x → 2x**', () => {
    api.onDblClick()
    expect(api.scale.value).toBe(2)
  })

  it('**放大态 → 回 1x 且位移归零**', () => {
    api.setScale(3)
    api.onMouseDown(mouse(0, 0))
    api.onMouseMove(mouse(70, 70))
    api.setScale(3)
    api.onDblClick()
    expect(api.scale.value).toBe(1)
    expect(api.pos.value).toEqual({ x: 0, y: 0 })
  })
})

/* ═══════════ 双指 pinch ═══════════ */

describe('双指 pinch', () => {
  it('**双指按下：以 stage 为参照记录中心与参考系，并清掉单指状态**', () => {
    api.onTouchStart(touch([{ x: 110, y: 220 }, { x: 210, y: 220 }]))
    expect(opts.startAnnoAt, '双指手势不该走单指标注路径').not.toHaveBeenCalled()
    // stage left=10/top=20、宽 640 高 480 → 中心 (160,220) → stage (150,200)
    api.onTouchMove(touch([{ x: 110, y: 220 }, { x: 210, y: 220 }]))
    // 距离未变 → 缩放不变
    expect(api.scale.value).toBe(1)

    api.onTouchMove(touch([{ x: 60, y: 220 }, { x: 260, y: 220 }]))
    expect(api.scale.value, '距离 200 / 起始 100 → 2x').toBe(2)
  })

  it('**放大态继续 pinch：以当前缩放为基准（不是从 1 起算）**', () => {
    api.setScale(2)
    api.onTouchStart(touch([{ x: 0, y: 0 }, { x: 100, y: 0 }]))
    api.onTouchMove(touch([{ x: 0, y: 0 }, { x: 200, y: 0 }]))
    expect(api.scale.value, '2x 基础上翻倍应到 4x').toBe(4)
  })

  it('**pinch 锚点公式：中心对应的图片像素保持不动**', () => {
    // 起始：双指中心 (160,220) 屏幕 → stage (150,200)；stage 中心 (320,240)
    api.onTouchStart(touch([{ x: 110, y: 220 }, { x: 210, y: 220 }]))
    api.onTouchMove(touch([{ x: 60, y: 220 }, { x: 260, y: 220 }]))
    // ratio = 2 → x = 0*2 + (150-320)*(1-2) = 170；y = 0*2 + (200-240)*(1-2) = 40
    expect(api.scale.value).toBe(2)
    expect(api.pos.value, '锚点偏移应按 (1-ratio) 拉开').toEqual({ x: 170, y: 40 })
  })

  it('**pinch 缩到 ≤1 → 位移归零**（不许把图推出画面）', () => {
    api.onTouchStart(touch([{ x: 0, y: 0 }, { x: 200, y: 0 }]))
    api.onTouchMove(touch([{ x: 0, y: 0 }, { x: 100, y: 0 }])) // 0.5x
    expect(api.scale.value).toBe(0.5)
    expect(api.pos.value).toEqual({ x: 0, y: 0 })
  })

  it('**缩放比未变 → 提前返回，不动位移**', () => {
    api.onTouchStart(touch([{ x: 0, y: 0 }, { x: 100, y: 0 }]))
    api.onTouchMove(touch([{ x: 0, y: 0 }, { x: 200, y: 0 }]))
    const first = { ...api.pos.value }
    api.onTouchMove(touch([{ x: 0, y: 0 }, { x: 200, y: 0 }])) // 同距离
    expect(api.pos.value, '同比例不该被重算').toEqual(first)

    // 制造"残留拖动"：放大 → 单指拖动 → 双指 pinch → 抬一指（onTouchEnd 转成拖动且不清标记）。
    // 注意：不能再用一次 touchstart，它会清掉 _touchDragging。
    // 此刻距起点 30px，若去掉「同比例提前返回」，就会掉进拖动分支把 pos 改写 ——
    // 这一条专门盯那个提前返回。
    api.setScale(2)
    api.onTouchStart(touch([{ x: 100, y: 100 }]))
    api.onTouchMove(touch([{ x: 130, y: 130 }]))
    api.onTouchStart(touch([{ x: 0, y: 0 }, { x: 100, y: 0 }]))
    api.onTouchEnd(touch([{ x: 50, y: 0 }]))
    const before = JSON.stringify(api.pos.value)
    // 单指不会进 pinch 分支（touches<2），所以这里只验多指等距。
    // 先凭空写入非零 pos：若删掉「同比例提前返回」，多指会一路算下去并覆写 pos，差异可见。
    api.pos.value = { x: 777, y: 888 }
    api.onTouchMove(touch([{ x: 0, y: 0 }, { x: 100, y: 0 }])) // 距离仍 100，同比例
    expect(JSON.stringify(api.pos.value), '同比例时不该被覆写位移').toBe(JSON.stringify({ x: 777, y: 888 }))
    void before
  })

  it('**pinch 夹在 [0.25, 5]**', () => {
    api.onTouchStart(touch([{ x: 0, y: 0 }, { x: 100, y: 0 }]))
    api.onTouchMove(touch([{ x: 0, y: 0 }, { x: 10000, y: 0 }]))
    expect(api.scale.value, '上限 5').toBe(5)

    api.onTouchStart(touch([{ x: 0, y: 0 }, { x: 100, y: 0 }]))
    api.onTouchMove(touch([{ x: 0, y: 0 }, { x: 1, y: 0 }]))
    expect(api.scale.value, '下限 0.25').toBe(0.25)
  })

  it('**两指重合（距离为 0）→ 安全返回不乱算**', () => {
    api.onTouchStart(touch([{ x: 0, y: 0 }, { x: 100, y: 0 }]))
    api.onTouchMove(touch([{ x: 50, y: 50 }, { x: 50, y: 50 }]))
    expect(api.scale.value, '除零不该改状态').toBe(1)
    expect(api.pos.value).toEqual({ x: 0, y: 0 })
  })

  it('**没走双指 start 的 move（_pinchDist=0）→ 不缩放**', () => {
    api.onTouchMove(touch([{ x: 0, y: 0 }, { x: 300, y: 0 }]))
    expect(api.scale.value).toBe(1)
  })

  it('**无 stage → 中心与参考系回退 {0,0}**（不产生 NaN 位移）', () => {
    annoCanvas.value = null
    api.onTouchStart(touch([{ x: 40, y: 40 }, { x: 140, y: 40 }]))
    api.onTouchMove(touch([{ x: 0, y: 40 }, { x: 180, y: 40 }]))
    expect(api.scale.value).toBe(1.8)
    expect(
      Number.isFinite(api.pos.value.x) && Number.isFinite(api.pos.value.y),
      '不能出现 NaN',
    ).toBe(true)
  })
})

/* ═══════════ 单指触摸 ═══════════ */

describe('单指触摸', () => {
  it('**工具激活 → 起点交给标注绘制并直接返回**（图片手势让位）', () => {
    opts.annoActive = () => true
    api.onTouchStart(touch([{ x: 30, y: 40 }]))
    expect(opts.startAnnoAt, '应开始标注且只调一次（不得再落回图片手势）').toHaveBeenCalledTimes(1)
    expect(opts.startAnnoAt).toHaveBeenCalledWith({ x: 30, y: 40 })
    api.onTouchMove(touch([{ x: 80, y: 90 }]))
    expect(api.pos.value, '工具激活时不该平移图片').toEqual({ x: 0, y: 0 })
  })

  it('**命中标注进入拖动 → 图片手势让位**', () => {
    let draggingAnno = false
    opts.isAnnoDragging = () => draggingAnno
    // 第一次按：放行（不进入标注拖动）；第二次按：置为"已在拖动标注"
    let press = 0
    opts.startAnnoAt = vi.fn(() => {
      if (++press === 2) draggingAnno = true
    })
    // 注意不能开 hitTest：鼠标路径会用它让位，那样「isAnnoDragging 守卫」即使被删也测不出来
    opts.hitTest = () => null
    api.setScale(2)
    api.onTouchStart(touch([{ x: 10, y: 10 }]))
    api.onTouchStart(touch([{ x: 10, y: 10 }]))
    api.onTouchMove(touch([{ x: 90, y: 90 }]))
    expect(api.pos.value, '标注拖动时不该平移图片').toEqual({ x: 0, y: 0 })
  })

  it('**已放大 → 单指即可平移**', () => {
    api.setScale(2)
    api.onTouchStart(touch([{ x: 100, y: 100 }]))
    api.onTouchMove(touch([{ x: 130, y: 140 }]))
    expect(api.pos.value).toEqual({ x: 30, y: 40 })
  })

  it('**已旋转 → 单指即可平移**', () => {
    api.rotateCW()
    api.onTouchStart(touch([{ x: 0, y: 0 }]))
    api.onTouchMove(touch([{ x: 25, y: 35 }]))
    expect(api.pos.value).toEqual({ x: 25, y: 35 })
  })

  it('**原始大小 → 单指不平移**（留给轻扫切图）', () => {
    api.onTouchStart(touch([{ x: 50, y: 50 }]))
    api.onTouchMove(touch([{ x: 200, y: 200 }]))
    expect(api.pos.value).toEqual({ x: 0, y: 0 })
  })

  it('**标注绘制中移动 → 交回标注跟手，不动图片**', () => {
    opts.isAnnoDrawing = () => true
    api.onTouchMove(touch([{ x: 70, y: 80 }]))
    expect(opts.moveAnnoAt, '应把 stage 坐标交回标注').toHaveBeenCalledWith({ x: 70, y: 80 })
    expect(api.pos.value).toEqual({ x: 0, y: 0 })
  })

  it('**标注拖动中移动 → 也交回标注，不动图片**', () => {
    // 触摸起点时先放行，按下之后才把 isAnnoDragging 打开 —— 这样起点不会被让位、移动才轮到它承重
    let draggingAnno = false
    opts.isAnnoDragging = () => draggingAnno
    api.setScale(2)
    api.onTouchStart(touch([{ x: 50, y: 50 }]))
    draggingAnno = true
    api.onTouchMove(touch([{ x: 90, y: 90 }]))
    expect(opts.moveAnnoAt, '拖动标注时应交回标注').toHaveBeenCalledWith({ x: 90, y: 90 })
    expect(api.pos.value, '标注拖动时不该平移图片').toEqual({ x: 0, y: 0 })
  })

  it('**拖动中多指 → 不更新位移**（避免 pinch 与平移互相踩）', () => {
    api.setScale(2)
    api.onTouchStart(touch([{ x: 0, y: 0 }]))
    api.onTouchMove(touch([{ x: 60, y: 60 }, { x: 60, y: 60 }]))
    expect(api.pos.value, '多指时不该走单指平移分支').toEqual({ x: 0, y: 0 })
  })
})

/* ═══════════ 触摸结束 ═══════════ */

describe('触摸结束', () => {
  it('**pinch 结束仍有一指 → 顺势转为拖动平移**', () => {
    api.onTouchStart(touch([{ x: 0, y: 0 }, { x: 200, y: 0 }]))
    api.onTouchMove(touch([{ x: 0, y: 0 }, { x: 100, y: 0 }, ])) // 0.5x
    expect(api.scale.value).toBe(0.5)

    api.onTouchEnd(touch([{ x: 50, y: 0 }]))
    api.onTouchMove(touch([{ x: 90, y: 10 }]))
    expect(api.pos.value, '抬起一指后应能继续平移').toEqual({ x: 40, y: 10 })
  })

  it('**pinch 结束无指 → 不进入拖动，且不残留拖动标记**', () => {
    api.setScale(2)
    // 先把 _touchDragging 做成 true（pinch 后抬一指转拖动），再 pinch 后双手全抬
    api.onTouchStart(touch([{ x: 0, y: 0 }, { x: 200, y: 0 }]))
    api.onTouchEnd(touch([{ x: 100, y: 0 }]))
    api.onTouchStart(touch([{ x: 0, y: 0 }, { x: 200, y: 0 }]))
    api.onTouchEnd(touch([]))
    api.onTouchMove(touch([{ x: 400, y: 400 }]))
    expect(api.pos.value, '不该平移').toEqual({ x: 0, y: 0 })
  })

  it('**标注绘制中结束 → 交给标注收尾，不触发切图**', () => {
    opts.isAnnoDrawing = () => true
    opts.isMulti = () => true
    api.onTouchStart(touch([{ x: 0, y: 0 }]))
    api.onTouchEnd(touch([{ x: 300, y: 0 }], [{ x: 300, y: 0 }]))
    expect(opts.endAnnoDraw, '应交回标注收尾').toHaveBeenCalled()
    expect(opts.onSwipe, '不该切图').not.toHaveBeenCalled()
  })

  it('**轻点第一次：只记时间、不缩放、且清掉残留拖动**', () => {
    // 先制造"残留拖动"：双指命中 pinch 分支后抬一指转拖动。
    // 注意两指必须等距（100 vs 100），否则 pinch 会真的改缩放，污染后面"不缩放"的断言。
    api.setScale(2)
    api.onTouchStart(touch([{ x: 0, y: 0 }, { x: 100, y: 0 }]))
    api.onTouchEnd(touch([{ x: 50, y: 0 }]))

    api.onTouchStart(touch([{ x: 100, y: 100 }]))
    api.onTouchEnd(touch([], [{ x: 102, y: 101 }]))
    expect(api.scale.value, '首次轻点不该缩放').toBe(2)

    // 残留拖动必须已被清掉，否则下一次单指移动会继续平移图片
    const held = { ...api.pos.value }
    api.onTouchMove(touch([{ x: 90, y: 90 }]))
    expect(api.pos.value, '轻点后不该还残留拖动').toEqual(held)
  })

  it('**轻点第二次（300ms 内）→ 1x 切 2x**', () => {
    api.onTouchStart(touch([{ x: 100, y: 100 }]))
    api.onTouchEnd(touch([], [{ x: 102, y: 101 }]))
    clock += 100
    api.onTouchStart(touch([{ x: 100, y: 100 }]))
    api.onTouchEnd(touch([], [{ x: 101, y: 100 }]))
    expect(api.scale.value, '双击应切到 2x').toBe(2)
  })

  it('**放大态轻点第二次 → 回 1x 且位移归零**', () => {
    api.setScale(2)
    api.onTouchStart(touch([{ x: 100, y: 100 }]))
    api.onTouchEnd(touch([], [{ x: 102, y: 101 }]))
    clock += 100
    api.onTouchStart(touch([{ x: 100, y: 100 }]))
    api.onTouchEnd(touch([], [{ x: 101, y: 100 }]))
    expect(api.scale.value, '应回 1x').toBe(1)
    expect(api.pos.value).toEqual({ x: 0, y: 0 })
  })

  it('**轻点第二次但已超过 300ms → 重新计时，不缩放**', () => {
    api.onTouchStart(touch([{ x: 100, y: 100 }]))
    api.onTouchEnd(touch([], [{ x: 102, y: 101 }]))
    clock += 400
    api.onTouchStart(touch([{ x: 100, y: 100 }]))
    api.onTouchEnd(touch([], [{ x: 101, y: 100 }]))
    expect(api.scale.value, '超时不该算双击').toBe(1)

    // 第三次紧接上次 → 这时才算双击
    clock += 50
    api.onTouchStart(touch([{ x: 100, y: 100 }]))
    api.onTouchEnd(touch([], [{ x: 100, y: 100 }]))
    expect(api.scale.value, '紧接的那次应算双击').toBe(2)
  })

  it('**双击成功后立刻再轻点 → 不再切换**（双击后必须清零计时窗口）', () => {
    api.onTouchStart(touch([{ x: 100, y: 100 }]))
    api.onTouchEnd(touch([], [{ x: 101, y: 100 }]))
    clock += 100
    api.onTouchStart(touch([{ x: 100, y: 100 }]))
    api.onTouchEnd(touch([], [{ x: 101, y: 100 }]))
    expect(api.scale.value, '前置：已双击到 2x').toBe(2)

    clock += 100
    api.onTouchStart(touch([{ x: 100, y: 100 }]))
    api.onTouchEnd(touch([], [{ x: 101, y: 100 }]))
    expect(api.scale.value, '紧接的第三下不该又被当成双击切回 1x').toBe(2)
  })

  it('**pinch → 转拖动 → 再 pinch → 松手无指：必须退出拖动**', () => {
    api.setScale(2)
    // 第一次 pinch 后抬一指 → 进入触摸拖动
    api.onTouchStart(touch([{ x: 0, y: 0 }, { x: 200, y: 0 }]))
    api.onTouchEnd(touch([{ x: 100, y: 0 }]))
    // 再次 pinch，然后双手全抬起
    api.onTouchStart(touch([{ x: 0, y: 0 }, { x: 200, y: 0 }]))
    api.onTouchEnd(touch([]))

    const held = { ...api.pos.value }
    api.onTouchMove(touch([{ x: 500, y: 500 }]))
    expect(api.pos.value, '双手都抬起后不该还残留拖动').toEqual(held)
  })

  it('**拖动中释放（位移大）→ 结束拖动且不切图**', () => {
    opts.isMulti = () => true
    api.setScale(2)
    api.onTouchStart(touch([{ x: 100, y: 100 }]))
    api.onTouchMove(touch([{ x: 140, y: 100 }]))
    api.onTouchEnd(touch([], [{ x: 300, y: 200 }]))
    expect(api.dragging.value, '触摸拖动是独立标记，不受影响').toBe(false)
    expect(opts.onSwipe, '拖动结束不该切图').not.toHaveBeenCalled()
  })

  it('**未放大 + 多图 + 水平大位移 → 左扫下一张 / 右扫上一张**', () => {
    opts.isMulti = () => true
    api.onTouchStart(touch([{ x: 300, y: 100 }]))
    api.onTouchEnd(touch([], [{ x: 150, y: 110 }]))
    expect(opts.onSwipe, '向左扫应看下一张').toHaveBeenCalledWith('next')

    api.onTouchStart(touch([{ x: 100, y: 100 }]))
    api.onTouchEnd(touch([], [{ x: 260, y: 95 }]))
    expect(opts.onSwipe, '向右扫应看上一张').toHaveBeenLastCalledWith('prev')
  })

  it('**单图 → 水平大位移也不切图**', () => {
    api.onTouchStart(touch([{ x: 300, y: 100 }]))
    api.onTouchEnd(touch([], [{ x: 100, y: 100 }]))
    expect(opts.onSwipe).not.toHaveBeenCalled()
  })

  it('**已放大 → 水平大位移不切图**（放大态下横向是平移语义）', () => {
    opts.isMulti = () => true
    api.setScale(2)
    // 不能用 touchstart 设起点：放大态会进入触摸拖动，被 _touchDragging 分支先挡下，
    // 那样「scale<=1」这个条件即使删掉也测不出来。这里只调 onTouchEnd，让水平主导 + 未拖动成立。
    api.onTouchEnd(touch([], [{ x: 100, y: 100 }]))
    expect(opts.onSwipe, '放大态不该切图').not.toHaveBeenCalled()
  })

  it('**拖动分支上界：单指已放大拖到边缘后松手，不触发切图且清掉拖动**', () => {
    opts.isMulti = () => true
    api.setScale(2) // 放大态本身就能挡住切图，所以这条只验"拖动标记被清 + 不切图"
    api.onTouchStart(touch([{ x: 100, y: 100 }]))
    api.onTouchMove(touch([{ x: 140, y: 100 }]))
    api.onTouchEnd(touch([], [{ x: 400, y: 100 }]))
    expect(opts.onSwipe, '放大态不该切图').not.toHaveBeenCalled()
    const held = { ...api.pos.value }
    api.onTouchMove(touch([{ x: 500, y: 500 }]))
    expect(api.pos.value, '松手后不该还残留拖动').toEqual(held)
  })

  it('**纵向上界（钳制）**：多图 + 横向位移够但纵向更大 → 不切图', () => {
    opts.isMulti = () => true
    api.onTouchStart(touch([{ x: 100, y: 900 }]))
    api.onTouchEnd(touch([], [{ x: 300, y: 500 }]))
    expect(opts.onSwipe, '纵向主导不该切图').not.toHaveBeenCalled()
  })

  it('**水平位移不足阈值 → 不切图**', () => {
    opts.isMulti = () => true
    api.onTouchStart(touch([{ x: 100, y: 100 }]))
    api.onTouchEnd(touch([], [{ x: 140, y: 100 }]))
    expect(opts.onSwipe, '40px 不够 60px 阈值').not.toHaveBeenCalled()
  })
})

/* ═══════════ 触摸中断 ═══════════ */

describe('触摸中断', () => {
  it('**onTouchCancel：清 pinch 与拖动并交回标注侧清理**', () => {
    api.setScale(2)
    api.onTouchStart(touch([{ x: 0, y: 0 }, { x: 200, y: 0 }]))
    api.onTouchEnd(touch([{ x: 100, y: 0 }])) // 转成拖动平移
    api.onTouchCancel()
    expect(opts.cancelAnnoGestures, '应交回标注侧清理').toHaveBeenCalledTimes(1)

    api.onTouchMove(touch([{ x: 300, y: 300 }]))
    expect(api.pos.value, '中断后不该继续平移').toEqual({ x: 0, y: 0 })
  })

  it('**中断后再 pinch：_pinchDist 从 0 重新起算**', () => {
    api.onTouchStart(touch([{ x: 0, y: 0 }, { x: 100, y: 0 }]))
    api.onTouchCancel()
    api.onTouchMove(touch([{ x: 0, y: 0 }, { x: 500, y: 0 }]))
    expect(api.scale.value, '中断后未重新 start 不该缩放').toBe(1)

    api.onTouchStart(touch([{ x: 0, y: 0 }, { x: 100, y: 0 }]))
    api.onTouchMove(touch([{ x: 0, y: 0 }, { x: 200, y: 0 }]))
    expect(api.scale.value, '重新 start 后应正常缩放').toBe(2)
  })
})