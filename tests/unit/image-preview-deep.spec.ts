/**
 * ImagePreview.vue 宿主接线 —— 此前只有「归一化 / 导航 / 关闭」6 例冒烟
 *
 * ## 为什么补（单文件口径 语句 78% / 分支 75.3% / **函数 48.6%**，37 行未覆盖）
 *
 * 37 行里绝大多数是**用户真会点的按钮与手势接线**：工具栏（旋转/翻转/缩放/复位/下载/复制）、
 * 线宽按钮、标注工具头、`fitAnnoColors` 色点裁减、键盘回落、`initialIndex` watcher。
 * 既有 `image-preview.spec.ts`（6 例）只覆盖归一化与箭头导航；
 * 两个下沉 composable 各有自己的完整 spec（`image-transform` 701 行 / `image-annotation` 775 行），
 * **唯独「宿主把 UI 事件接到 composable 上」这一层没人测** —— 而这层正是按钮点了没反应、
 * 手势接线接错、导出文件名不对的落点。
 *
 * ## 口径说明（重要）
 *
 * 本文件在 `--coverage.include=**\/data\/ImagePreview.vue` 下测得「模板行」归因会抖动
 * （与 #133 `DesignerSettings.vue` 同源问题）：单跑本文件时 `L229`（`goTo` 的守卫）报未覆盖，
 * 但 `goNext → goTo` 的点击路径确实执行过它，且同函数体 L230-233 报已覆盖。
 * 所以本文件**以行为断言为准**（变换矩阵、active 类、emit、Toast 文案、ctx 调用），
 * 不为数字造测试；仍存在的模板行缺口如实记入报告。
 *
 * ## harness 关键手法
 *
 * - `attachTo: document.body`：`.ip-stage` 必须在文档里（ResizeObserver / window mouseup / rect）
 * - `HTMLCanvasElement.prototype.getContext` 打桩成 **记录调用的 Proxy**（属性读写都兜住）
 * - `ResizeObserver` 打桩成可控类：本组件挂一个（`.ip-anno-tools` 裁减），
 *   `useImageAnnotation` 也挂一个（画布自适应）→ 按 observe 的元素区分回调
 * - `useScreenshot` 模块整体 mock：导出的文件名才是「标题接线」唯一可观测点
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import ImagePreview from '@/components/data/ImagePreview.vue'

const { downloadMock, copyMock } = vi.hoisted(() => ({
  downloadMock: vi.fn(() => true),
  copyMock: vi.fn(async () => true),
}))
vi.mock('@/components/_internal/useScreenshot', () => ({
  downloadScreenshot: downloadMock,
  copyScreenshotToClipboard: copyMock,
}))

const IMG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/* ═══════════ harness ═══════════ */

let wrappers: VueWrapper[] = []
let ctxCalls: string[] = []
let roInstances: Array<{ cb: () => void; observed: Element[]; disconnected: boolean }> = []
const origGetContext = HTMLCanvasElement.prototype.getContext
const origToBlob = HTMLCanvasElement.prototype.toBlob

/** 记录一切 ctx 调用的假 2D 上下文（paintAnno 会读写成名属性） */
function fakeCtx(): CanvasRenderingContext2D {
  const store: Record<string, unknown> = {}
  return new Proxy(store, {
    get: (t, p) => {
      if (typeof p === 'string' && !(p in t)) {
        if (/^(strokeStyle|fillStyle|lineWidth|lineCap|lineJoin|globalAlpha|font|textAlign)$/.test(p)) return undefined
        ctxCalls.push(p)
        return () => undefined
      }
      return t[p as string]
    },
    set: (t, p, v) => {
      t[p as string] = v
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

beforeEach(() => {
  wrappers = []
  ctxCalls = []
  roInstances = []
  downloadMock.mockClear()
  copyMock.mockClear()
  HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCtx()) as never
  HTMLCanvasElement.prototype.toBlob = vi.fn((cb: BlobCallback) => cb(new Blob(['x'])) as never) as never
  class FakeRO {
    cb: () => void
    observed: Element[] = []
    disconnected = false
    constructor(cb: () => void) {
      this.cb = cb
      roInstances.push(this)
    }
    observe(el: Element) {
      this.observed.push(el)
    }
    disconnect() {
      this.disconnected = true
    }
  }
  vi.stubGlobal('ResizeObserver', FakeRO)
})

afterEach(() => {
  for (const w of wrappers) w.unmount()
  HTMLCanvasElement.prototype.getContext = origGetContext
  HTMLCanvasElement.prototype.toBlob = origToBlob
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** 挂载并把 stage / 标注工具行补上可测尺寸（happy-dom 默认全 0，布局逻辑会退化） */
function setup(
  props: Record<string, unknown> = { src: [IMG, IMG, IMG] },
  opts: { stageW?: number; stageH?: number; toolsW?: number; toolsScroll?: number } = {},
) {
  const wrapper = mount(ImagePreview, { props, attachTo: document.body })
  wrappers.push(wrapper)

  const stageW = wrapper.find('.ip-stage')
  const w = opts.stageW ?? 640
  const h = opts.stageH ?? 480
  const stage = (stageW.exists() ? stageW.element : document.createElement('div')) as HTMLElement
  if (stageW.exists()) {
    Object.defineProperty(stage, 'clientWidth', { value: w, configurable: true })
    Object.defineProperty(stage, 'clientHeight', { value: h, configurable: true })
    Object.defineProperty(stage, 'getBoundingClientRect', {
      value: () => ({ left: 10, top: 20, width: w, height: h, right: 10 + w, bottom: 20 + h, x: 10, y: 20, toJSON: () => ({}) }),
      configurable: true,
    })
  }

  const tools = wrapper.find('.ip-anno-tools')
  if (tools.exists()) {
    const el = tools.element as HTMLElement
    Object.defineProperty(el, 'clientWidth', { value: opts.toolsW ?? 400, configurable: true })
    Object.defineProperty(el, 'scrollWidth', { value: opts.toolsScroll ?? 400, configurable: true })
  }
  return { wrapper, stage, toolsEl: tools.exists() ? (tools.element as HTMLElement) : null }
}

const counter = (w: VueWrapper) => w.find('.ip-counter-header').text()
const transform = (w: VueWrapper) => (w.find('.ip-img').element as HTMLElement).style.transform
const toolbarBtn = (w: VueWrapper, i: number) => w.findAll('.ip-toolbar button')[i]!
const toasts = () => [...document.querySelectorAll('.toast-item')].map((e) => e.textContent ?? '')
const allToasts = () => toasts().join(' | ')

/** 工具行使 fitAnnoColors 的 RO 回调（区分两个 RO：本组件 observe 的是 .ip-anno-tools） */
function toolsRo() {
  return roInstances.find((r) => r.observed.some((e) => e.classList.contains('ip-anno-tools')))
}
async function frame() {
  await new Promise((r) => requestAnimationFrame(() => r(undefined)))
}
/** 事件派发后必须等一拍：transform 是 computed → DOM style 在 flush 后才写（同步读是旧值） */
async function flush() {
  await nextTick()
  await nextTick()
}

function dispatchMouse(el: Element, type: string, x = 0, y = 0): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'clientX', { value: x })
  Object.defineProperty(ev, 'clientY', { value: y })
  el.dispatchEvent(ev)
  return ev
}
function dispatchWheel(el: Element, deltaY: number): Event {
  const ev = new Event('wheel', { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'deltaY', { value: deltaY })
  el.dispatchEvent(ev)
  return ev
}
function dispatchTouch(
  el: Element,
  type: string,
  pts: Array<[number, number]>,
  changed?: Array<[number, number]>,
): Event {
  const conv = (l: Array<[number, number]>) => l.map(([x, y]) => ({ clientX: x, clientY: y }))
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'touches', { value: conv(pts) })
  Object.defineProperty(ev, 'changedTouches', { value: conv(changed ?? pts) })
  el.dispatchEvent(ev)
  return ev
}

/* ═══════════ ① 归一化与 initialIndex ═══════════ */

describe('归一化与 initialIndex', () => {
  it('**src 为对象 → url + label 都保留**', () => {
    const { wrapper } = setup({ src: { url: IMG, label: '封面' } })
    expect(wrapper.find('.ip-img').attributes('src')).toBe(IMG)
    expect(wrapper.find('.ip-title').text()).toBe('封面')
  })

  it('**src 为空串 / null / undefined → 整个弹层不渲染**', () => {
    expect(setup({ src: '' }).wrapper.find('.ip-backdrop').exists()).toBe(false)
    expect(setup({ src: null }).wrapper.find('.ip-backdrop').exists()).toBe(false)
    expect(setup({}).wrapper.find('.ip-backdrop').exists()).toBe(false)
  })

  it('**混合数组（字符串 + 对象）逐项归一化**', () => {
    const { wrapper } = setup({ src: [IMG, { url: IMG, label: '第二张' }], initialIndex: 1 })
    expect(wrapper.findAll('.ip-thumb')).toHaveLength(2)
    expect(wrapper.find('.ip-title').text(), '当前张有 label 就显示 label').toBe('第二张')
    expect(counter(wrapper)).toContain('2 / 2')
  })

  it('**initialIndex 变化 → 切到该图，且不 emit change**（watcher 只改索引，不当作导航）', async () => {
    const { wrapper } = setup({ src: [IMG, IMG, IMG], initialIndex: 0 })
    await wrapper.setProps({ initialIndex: 2 })
    expect(counter(wrapper)).toContain('3 / 3')
    expect(wrapper.emitted('change'), '外部改索引不是用户导航').toBeUndefined()
  })

  it('**initialIndex 超上限 → 收敛到最后一图**', async () => {
    const { wrapper } = setup({ src: [IMG, IMG, IMG], initialIndex: 0 })
    await wrapper.setProps({ initialIndex: 99 })
    expect(counter(wrapper)).toContain('3 / 3')
  })

  it('**initialIndex 为负 → 收敛到第一图**', async () => {
    const { wrapper } = setup({ src: [IMG, IMG, IMG], initialIndex: 2 })
    await wrapper.setProps({ initialIndex: -5 })
    expect(counter(wrapper)).toContain('1 / 3')
  })

  it('**已知缺陷（P3）：initialIndex 为 NaN → currentIndex 变 NaN，整个弹层消失**', async () => {
    const { wrapper } = setup({ src: [IMG, IMG, IMG], initialIndex: 0 })
    await wrapper.setProps({ initialIndex: Number.NaN })
    // Math.max(0, Math.min(NaN, total-1)) === NaN —— `??` 与 `Math.min/max` 都拦不住 NaN
    expect(wrapper.find('.ip-backdrop').exists(), 'currentUrl 变空串 → v-if 整层消失').toBe(false)
  })
})

/* ═══════════ ② 键盘回落 ═══════════ */

describe('键盘回落（无标注工具态）', () => {
  const key = (w: VueWrapper, k: string) => w.find('.ip-overlay').trigger('keydown', { key: k })

  it('**Escape → 关闭**（无工具无选中时回落宿主）', async () => {
    const { wrapper } = setup()
    await key(wrapper, 'Escape')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('**Escape 在工具激活时不关弹层**（composable 先吞掉：取消工具）', async () => {
    const { wrapper } = setup()
    await wrapper.find('.ip-anno-tools .ip-hdr-btn').trigger('click') // 激活 rect
    expect(wrapper.find('.ip-anno-tools .ip-hdr-btn').classes()).toContain('active')
    await key(wrapper, 'Escape')
    expect(wrapper.find('.ip-anno-tools .ip-hdr-btn').classes(), '工具被取消').not.toContain('active')
    expect(wrapper.emitted('close'), '不该顺带关掉弹层').toBeUndefined()
  })

  it('**← → 在多图无工具时切图并 emit change**', async () => {
    const { wrapper } = setup()
    await key(wrapper, 'ArrowRight')
    expect(counter(wrapper)).toContain('2 / 3')
    expect(wrapper.emitted('change')?.at(-1)).toEqual([1])
    await key(wrapper, 'ArrowLeft')
    expect(counter(wrapper)).toContain('1 / 3')
    expect(wrapper.emitted('change')?.at(-1)).toEqual([0])
  })

  it('**单图时 ← → 不切图**（无下一张）', async () => {
    const { wrapper } = setup({ src: IMG })
    await key(wrapper, 'ArrowRight')
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.find('.ip-backdrop').exists(), '仍在预览中').toBe(true)
  })

  it('**标注工具激活时 ← → 不切图**（方向键归标注侧）', async () => {
    const { wrapper } = setup()
    await wrapper.find('.ip-anno-tools .ip-hdr-btn').trigger('click')
    await key(wrapper, 'ArrowRight')
    expect(counter(wrapper), '停在第 1 张').toContain('1 / 3')
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('**无关按键不误触发关闭/切图**', async () => {
    const { wrapper } = setup()
    await key(wrapper, 'a')
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(counter(wrapper)).toContain('1 / 3')
  })
})

/* ═══════════ ③ 缩略图面板 ═══════════ */

describe('缩略图面板', () => {
  it('**多图默认展开、单图不渲染面板**', () => {
    expect(setup().wrapper.find('.ip-thumbs').exists()).toBe(true)
    expect(setup({ src: IMG }).wrapper.find('.ip-thumbs').exists()).toBe(false)
  })

  it('**toggleThumbs 收起 / 再展开**', async () => {
    const { wrapper } = setup()
    const btn = wrapper.find('.ip-header-right .ip-hdr-btn')
    await btn.trigger('click')
    expect(wrapper.find('.ip-thumbs').exists()).toBe(false)
    await btn.trigger('click')
    expect(wrapper.find('.ip-thumbs').exists()).toBe(true)
  })

  it('**src 从单图变为多图 → 面板自动展开**（watch isMulti）', async () => {
    const { wrapper } = setup({ src: IMG })
    expect(wrapper.find('.ip-thumbs').exists()).toBe(false)
    await wrapper.setProps({ src: [IMG, IMG] })
    expect(wrapper.find('.ip-thumbs').exists(), '多图应自动出现缩略图').toBe(true)
  })

  it('**点缩略图 → 切图 + emit change + 复位变换 + 回到加载态**', async () => {
    const { wrapper } = setup()
    await toolbarBtn(wrapper, 2).trigger('click') // 翻转，制造非默认变换
    expect(transform(wrapper)).toContain('scaleX(-1)')
    // 先让它变成"已加载"：否则 spinner 本来就在，切图后的加载态断言分不出真假
    await wrapper.find('.ip-img').trigger('load')
    expect(wrapper.find('.ip-spinner').exists(), '前置：已加载 → 无 spinner').toBe(false)
    const thumbs = wrapper.findAll('.ip-thumb')
    expect(thumbs[0]!.classes(), '初始第 1 张 active').toContain('active')
    expect(wrapper.findAll('.ip-thumb.active'), 'active 唯一').toHaveLength(1)
    await thumbs[2]!.trigger('click')
    expect(counter(wrapper)).toContain('3 / 3')
    expect(wrapper.findAll('.ip-thumb.active'), 'active 仍唯一且已移动').toHaveLength(1)
    expect(thumbs[2]!.classes()).toContain('active')
    expect(thumbs[0]!.classes(), '旧 active 已撤').not.toContain('active')
    expect(wrapper.emitted('change')?.at(-1)).toEqual([2])
    expect(transform(wrapper), '切图必须复位变换').not.toContain('scaleX(-1)')
    expect(wrapper.find('.ip-spinner').exists(), '新图先回到加载态').toBe(true)
  })

  it('**点当前缩略图 → 不重复 emit、不复位变换**（同索引是空操作）', async () => {
    const { wrapper } = setup()
    await toolbarBtn(wrapper, 2).trigger('click')
    await wrapper.findAll('.ip-thumb')[0]!.trigger('click')
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(transform(wrapper), '同图点击不该把用户的翻转抹掉').toContain('scaleX(-1)')
  })
})

/* ═══════════ ④ fitAnnoColors 色点裁减 ═══════════ */

describe('色点按空间裁减 fitAnnoColors', () => {
  const dots = (w: VueWrapper) => w.findAll('.ip-color-dot')
  const hidden = (w: VueWrapper) => dots(w).filter((d) => (d.element as HTMLElement).style.display === 'none')

  it('**宽屏 → 全部色点可见**', () => {
    const { wrapper } = setup({ src: IMG }, { toolsW: 400, toolsScroll: 400 })
    expect(dots(wrapper).length).toBeGreaterThan(1)
    expect(hidden(wrapper)).toHaveLength(0)
  })

  it('**恰好溢出 1px → 容差内不裁减**（scrollWidth === clientWidth + 1）', async () => {
    const { wrapper } = setup({ src: IMG }, { toolsW: 100, toolsScroll: 101 })
    await wrapper.findAll('.ip-color-dot')[1]!.trigger('click')
    expect(hidden(wrapper), '容差就是为了不吃掉这 1px').toHaveLength(0)
  })

  it('**窄屏溢出 → 从后往前隐藏直到放得下，选中色保留**', async () => {
    // 前两次回调后把 scrollWidth 收窄到刚好放下前 3 个（模拟隐藏后真的不溢出）
    const { wrapper, toolsEl } = setup({ src: IMG }, { toolsW: 100, toolsScroll: 300 })
    let shrink = 0
    Object.defineProperty(toolsEl!, 'scrollWidth', {
      get: () => {
        shrink++
        return shrink <= 2 ? 300 : 100 // 隐藏 2 个后不再溢出
      },
      configurable: true,
    })
    // 触发重算：换色
    await dots(wrapper)[1]!.trigger('click')
    const hid = hidden(wrapper)
    expect(hid.length, '至少藏掉了溢出所需的数量').toBeGreaterThan(0)
    const activeIdx = dots(wrapper).findIndex((d) => d.classes().includes('active'))
    expect(activeIdx).toBe(1)
    expect((dots(wrapper)[1]!.element as HTMLElement).style.display, '当前使用的颜色恒可见').not.toBe('none')
  })

  it('**换色重算：新选中色从隐藏态恢复可见**', async () => {
    const { wrapper, toolsEl } = setup({ src: IMG }, { toolsW: 100, toolsScroll: 300 })
    Object.defineProperty(toolsEl!, 'scrollWidth', { value: 300, configurable: true }) // 恒定溢出
    await dots(wrapper)[1]!.trigger('click')
    // 恒定溢出 → 除选中色外全被隐藏
    const hiddenNow = hidden(wrapper).length
    expect(hiddenNow, '除选中色外都该藏').toBe(dots(wrapper).length - 1)
    // 换到另一个色：fitAnnoColors 先全量 display='' 再重藏 → 新选中色必须可见
    await dots(wrapper)[2]!.trigger('click')
    expect((dots(wrapper)[2]!.element as HTMLElement).style.display, '新选中色恢复可见').not.toBe('none')
    expect(dots(wrapper)[2]!.classes()).toContain('active')
  })

  it('**只剩选中色时 break 退出（不无限循环）**', async () => {
    const { wrapper, toolsEl } = setup({ src: IMG }, { toolsW: 1, toolsScroll: 100 })
  Object.defineProperty(toolsEl!, 'scrollWidth', { value: 100, configurable: true })
    // 注意：点「当前已是选中」的色不会触发 watch（ref 值未变）→ 必须换到另一个色才重算
    await dots(wrapper)[1]!.trigger('click')
    expect(hidden(wrapper).length, '除选中色外全藏').toBe(dots(wrapper).length - 1)
  })

  it('**色点数为 0 → 提前返回（不抛）**', async () => {
    const { wrapper, toolsEl } = setup({ src: IMG })
    toolsEl!.querySelectorAll('.ip-color-dot').forEach((d) => d.remove())
    expect(() => toolsRo()!.cb(), '查询不到色点时静默返回').not.toThrow()
    expect(dots(wrapper)).toHaveLength(0)
  })

  it('**卸载后 RO 回调再触发 → tools 为 null 时静默返回**', () => {
    const { wrapper } = setup({ src: IMG })
    const ro = toolsRo()
    expect(ro, '挂载时建了监听').toBeTruthy()
    wrapper.unmount()
    expect(ro!.disconnected, '卸载必须断开').toBe(true)
    expect(() => ro!.cb(), '断连后仍被触发的回调不得抛').not.toThrow()
  })

  it('**mounted 时对 .ip-anno-tools 建监听（画布自适应那个监听的是 stage）**', () => {
    const { wrapper } = setup({ src: IMG })
    const ro = toolsRo()
    expect(ro!.observed.filter((e) => e.classList.contains('ip-anno-tools'))).toHaveLength(1)
    expect(wrapper.find('.ip-anno-tools').exists()).toBe(true)
  })

  it('**无 ResizeObserver 环境 → 不建监听也不抛**', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    expect(() => setup({ src: IMG })).not.toThrow()
    expect(roInstances).toHaveLength(0)
  })
})

/* ═══════════ ⑤ 工具栏 ═══════════ */

describe('底部工具栏', () => {
  it('**按钮顺序固定：旋转×2 / 翻转 / 缩放×3 / 导出×2**', () => {
    const { wrapper } = setup({ src: IMG })
    expect(wrapper.findAll('.ip-toolbar button')).toHaveLength(8)
  })

  it('**逆时针旋转 → rotate(-90deg)**', async () => {
    const { wrapper } = setup({ src: IMG })
    await toolbarBtn(wrapper, 0).trigger('click')
    expect(transform(wrapper), '逆时针 = 270（归一化到 [0,360)，不出现负数）').toContain('rotate(270deg)')
  })

  it('**顺时针两次 → 180deg**', async () => {
    const { wrapper } = setup({ src: IMG })
    await toolbarBtn(wrapper, 1).trigger('click')
    expect(transform(wrapper)).toContain('rotate(90deg)')
    await toolbarBtn(wrapper, 1).trigger('click')
    expect(transform(wrapper)).toContain('rotate(180deg)')
  })

  it('**翻转 → scaleX(-1) 且按钮进入 active**', async () => {
    const { wrapper } = setup({ src: IMG })
    expect(toolbarBtn(wrapper, 2).classes(), '初始未翻转 → 不该带 active').not.toContain('active')
    await toolbarBtn(wrapper, 2).trigger('click')
    expect(transform(wrapper)).toContain('scaleX(-1)')
    expect(toolbarBtn(wrapper, 2).classes()).toContain('active')
  })

  it('**放大 → 1.25，缩小 → 夹在 0.25 下限**', async () => {
    const { wrapper } = setup({ src: IMG })
    await toolbarBtn(wrapper, 3).trigger('click')
    expect(transform(wrapper)).toContain('scale(1.25)')
    for (let i = 0; i < 10; i++) await toolbarBtn(wrapper, 4).trigger('click')
    expect(transform(wrapper)).toContain('scale(0.25)')
  })

  it('**缩回原始大小 → 位移一并归零**（不许把图留在画面外）', async () => {
    const { wrapper, stage } = setup({ src: IMG })
    await toolbarBtn(wrapper, 3).trigger('click')
    dispatchMouse(wrapper.find('.ip-img').element, 'mousedown', 100, 100)
    dispatchMouse(stage, 'mousemove', 140, 150)
    dispatchMouse(stage, 'mouseup', 140, 150)
    await flush()
    expect(transform(wrapper)).toContain('translate(40px, 50px)')
    await toolbarBtn(wrapper, 5).trigger('click') // 1:1
    expect(transform(wrapper)).toContain('scale(1)')
    expect(transform(wrapper), '归零位移').not.toContain('translate(40px, 50px)')
  })

  it('**未加载就点下载 → 静默返回（不导出、也不提示）**（isLoaded 接线）', async () => {
    const { wrapper } = setup({ src: IMG })
    // 补齐 natural 尺寸但不派发 load：canvas 建得出来，唯一决定导出与否的是 isLoaded getter
    const img0 = wrapper.find('.ip-img').element as HTMLImageElement
    Object.defineProperty(img0, 'naturalWidth', { value: 800, configurable: true })
    Object.defineProperty(img0, 'naturalHeight', { value: 600, configurable: true })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no cors')))
    await toolbarBtn(wrapper, 6).trigger('click')
    await flush()
    await frame()
    expect(downloadMock, '没加载不该导出').not.toHaveBeenCalled()
    // ⚠️ P3：isLoaded 为假时是**裸 return**，没有任何 notify。
    // exportFailNotLoaded 那条文案属于「已加载但 buildExportCanvas 返回 null」的路径。
    // 后果：图片加载失败（_loadState === 'error'）时用户点下载/复制完全没反应。
    expect(allToasts(), '当前实现不给任何反馈').toBe('')
  })

  it('**未加载就点复制 → 同样静默**', async () => {
    const { wrapper } = setup({ src: IMG })
    const img1 = wrapper.find('.ip-img').element as HTMLImageElement
    Object.defineProperty(img1, 'naturalWidth', { value: 800, configurable: true })
    Object.defineProperty(img1, 'naturalHeight', { value: 600, configurable: true })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no cors')))
    await toolbarBtn(wrapper, 7).trigger('click')
    await flush()
    await frame()
    expect(copyMock).not.toHaveBeenCalled()
    expect(allToasts()).toBe('')
  })

  it('**已加载点下载 → 文件名取当前标题**（title 接线）', async () => {
    const { wrapper } = setup({ src: { url: IMG, label: '封面图' } })
    const img = wrapper.find('.ip-img').element as HTMLImageElement
    Object.defineProperty(img, 'naturalWidth', { value: 800, configurable: true })
    Object.defineProperty(img, 'naturalHeight', { value: 600, configurable: true })
    await wrapper.find('.ip-img').trigger('load')
    expect(wrapper.find('.ip-spinner').exists()).toBe(false)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no cors header')))
    await toolbarBtn(wrapper, 6).trigger('click')
    // 2026-10-31 下载改走 blob 通道：toPngBlob 多一跳 Promise，等微任务排空再断言
    await Promise.resolve()
    await Promise.resolve()
    expect(downloadMock, '导出流水线要走到底').toHaveBeenCalled()
    expect(String(downloadMock.mock.calls[0]![1]), '文件名 = 标题.png').toBe('封面图.png')
  })

  it('**无标题时文件名回退 image.png**', async () => {
    const { wrapper } = setup({ src: IMG }) // 单图无 title/label
    const img = wrapper.find('.ip-img').element as HTMLImageElement
    Object.defineProperty(img, 'naturalWidth', { value: 800, configurable: true })
    Object.defineProperty(img, 'naturalHeight', { value: 600, configurable: true })
    await wrapper.find('.ip-img').trigger('load')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no cors')))
    await toolbarBtn(wrapper, 6).trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    expect(String(downloadMock.mock.calls[0]![1])).toBe('image.png')
  })

  it('**toBlob 给 null（跨域污染）→ 跨域提示，不崩**（下载已走 blob 通道）', async () => {
    const { wrapper } = setup({ src: IMG })
    HTMLCanvasElement.prototype.toBlob = vi.fn((cb: BlobCallback) => cb(null)) as never
    const img = wrapper.find('.ip-img').element as HTMLImageElement
    Object.defineProperty(img, 'naturalWidth', { value: 800, configurable: true })
    Object.defineProperty(img, 'naturalHeight', { value: 600, configurable: true })
    await wrapper.find('.ip-img').trigger('load')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no cors')))
    await toolbarBtn(wrapper, 6).trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    expect(allToasts()).toContain('跨域')
  })

  it('**已加载点复制 → 走剪贴板并提示成功**', async () => {
    const { wrapper } = setup({ src: IMG })
    const img = wrapper.find('.ip-img').element as HTMLImageElement
    Object.defineProperty(img, 'naturalWidth', { value: 800, configurable: true })
    Object.defineProperty(img, 'naturalHeight', { value: 600, configurable: true })
    await wrapper.find('.ip-img').trigger('load')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no cors')))
    await toolbarBtn(wrapper, 7).trigger('click')
    await frame()
    expect(copyMock).toHaveBeenCalled()
    expect(allToasts()).toContain('复制')
  })
})

/* ═══════════ ⑥ 标注工具头（颜色 / 线宽 / 工具） ═══════════ */

describe('标注工具头', () => {
  it('**点色点 → active 转移（唯一）**', async () => {
    const { wrapper } = setup({ src: IMG })
    const dots = wrapper.findAll('.ip-color-dot')
    await dots[1]!.trigger('click')
    expect(dots[1]!.classes()).toContain('active')
    expect(dots[0]!.classes()).not.toContain('active')
    expect(wrapper.findAll('.ip-color-dot.active')).toHaveLength(1)
  })

  it('**点线宽 → active 转移，且不误伤色点/hdr 按钮**（前缀类名陷阱）', async () => {
    const { wrapper } = setup({ src: IMG })
    const ws = wrapper.findAll('.ip-w-btn')
    expect(ws.length).toBeGreaterThan(1)
    await ws[1]!.trigger('click')
    expect(ws[1]!.classes()).toContain('active')
    expect(wrapper.findAll('.ip-w-btn.active'), '线宽单选').toHaveLength(1)
    expect(
      wrapper.findAll('.ip-hdr-btn.active').filter((b) => !b.classes().includes('ip-w-btn')),
      '工具按钮不该被线宽的 active 串上',
    ).toHaveLength(0)
  })

  it('**点工具 → active；再点同一个 → 取消**（与快捷键同语义）', async () => {
    const { wrapper } = setup({ src: IMG })
    const tools = wrapper.findAll('.ip-anno-tools .ip-hdr-btn').filter((b) => !b.classes().includes('ip-w-btn'))
    await tools[0]!.trigger('click')
    expect(tools[0]!.classes()).toContain('active')
    await tools[0]!.trigger('click')
    expect(tools[0]!.classes()).not.toContain('active')
  })

  it('**切工具互斥 + stage 光标变十字**', async () => {
    const { wrapper } = setup({ src: IMG })
    const tools = wrapper.findAll('.ip-anno-tools .ip-hdr-btn').filter((b) => !b.classes().includes('ip-w-btn'))
    await tools[0]!.trigger('click')
    expect((wrapper.find('.ip-stage').element as HTMLElement).style.cursor).toBe('crosshair')
    await tools[1]!.trigger('click')
    expect(tools[1]!.classes()).toContain('active')
    expect(tools[0]!.classes(), '互斥').not.toContain('active')
    await tools[1]!.trigger('click') // 再点取消
    expect(
      (wrapper.find('.ip-stage').element as HTMLElement).style.cursor,
      '无工具时必须回到默认光标（否则恒为 crosshair 也测不出来）',
    ).not.toBe('crosshair')
  })
})

/* ═══════════ ⑦ 视图手势与标注绘制接线 ═══════════ */

describe('手势与绘制接线', () => {
  it('**滚轮缩放并阻止页面滚动**', async () => {
    const { wrapper, stage } = setup({ src: IMG })
    const ev = dispatchWheel(stage, -100)
    await flush()
    expect(transform(wrapper), '上滚 +0.15').toContain('scale(1.15)')
    expect(ev.defaultPrevented, '画布内滚轮不该滚页面').toBe(true)
    dispatchWheel(stage, 100)
    await flush()
    // ⚠️ P3：setScale 用「scale + 步进」且不 round，1.15 - 0.15 在 IEEE754 下是
    // 0.9999999999999999 → transform 字符串出现长尾小数，界面按 99% 显示；
    // 且 scale <= 1 的「未放大」判定从此由浮点残差决定（这里恰好为真，方向偶然正确）。
    // 对照：useCanvasZoom 的 clampZoom 有 Math.round(v*100)/100，两处口径不一致。
    expect(transform(wrapper), '下滚留下浮点残差，不是干净的 1').toContain('scale(0.9999999999999999)')
    expect(0.9999999999999999, '前提：残差确实不等于 1').not.toBe(1)
    expect(0.9999999999999999 <= 1, '前提：残差仍落在「未放大」一侧').toBe(true)
  })

  it('**双击图片 → 1x 切 2x，再双击回 1x**', async () => {
    const { wrapper } = setup({ src: IMG })
    await wrapper.find('.ip-img').trigger('dblclick')
    expect(transform(wrapper)).toContain('scale(2)')
    await wrapper.find('.ip-img').trigger('dblclick')
    expect(transform(wrapper)).toContain('scale(1)')
  })

  it('**放大后拖动 → 跟手位移；抬起结束**', async () => {
    const { wrapper, stage } = setup({ src: IMG })
    dispatchWheel(stage, -100)
    await flush()
    expect(transform(wrapper), '前置：已放大才允许平移').toContain('scale(1.15)')
    dispatchMouse(wrapper.find('.ip-img').element, 'mousedown', 100, 100)
    dispatchMouse(stage, 'mousemove', 130, 120)
    await flush()
    expect(transform(wrapper)).toContain('translate(30px, 20px)')
    dispatchMouse(stage, 'mouseup', 130, 120)
    dispatchMouse(stage, 'mousemove', 200, 200)
    await flush()
    expect(transform(wrapper), '抬起后不再跟手').toContain('translate(30px, 20px)')
  })

  it('**原始大小下按下不进入拖动**（平移无意义）', async () => {
    const { wrapper, stage } = setup({ src: IMG })
    dispatchMouse(wrapper.find('.ip-img').element, 'mousedown', 100, 100)
    dispatchMouse(stage, 'mousemove', 160, 160)
    await flush()
    expect(transform(wrapper), 'scale 仍为 1 且位移为 0').toBe('translate(0px, 0px) scale(1)')
  })

  it('**触摸绘制：move 阶段画出半成品预览**（startAnnoAt 接线；rect 的签名调用是 strokeRect）', async () => {
    const { wrapper, stage } = setup({ src: IMG })
    await wrapper.findAll('.ip-anno-tools .ip-hdr-btn').filter((b) => !b.classes().includes('ip-w-btn'))[0]!.trigger('click')
    dispatchTouch(stage, 'touchstart', [[100, 100]])
    ctxCalls.length = 0
    dispatchTouch(stage, 'touchmove', [[160, 140]])
    await frame()
    await frame()
    // strokeRect 只由 paintAnno 的 rect 分支产生；挂载时 0 条标注不会产生它
    // （原断言只看 clearRect，收尾路径自己也会渲一次 → 起点这一环的探针杀不死）
    expect(ctxCalls, '半成品矩形已上屏').toContain('strokeRect')
    expect(ctxCalls, '渲染前先清屏').toContain('clearRect')
  })

  it('**触摸收尾：绘制态已复位（此后 Escape 只取消工具）**（endAnnoDraw 接线）', async () => {
    const { wrapper, stage } = setup({ src: IMG })
    const tool = wrapper.findAll('.ip-anno-tools .ip-hdr-btn').filter((b) => !b.classes().includes('ip-w-btn'))[0]!
    await tool.trigger('click')
    dispatchTouch(stage, 'touchstart', [[100, 100]])
    dispatchTouch(stage, 'touchmove', [[160, 140]]) // 此刻确实处于「绘制中」
    dispatchTouch(stage, 'touchend', [], [[160, 140]])
    await frame()
    // 收尾必须真的调了 endAnnoDraw → _annoDrawing 复位；
    // 否则 Escape 会先吞掉「取消绘制」并把工具留着（这条断言才分得开）
    await wrapper.find('.ip-overlay').trigger('keydown', { key: 'Escape' })
    expect(tool.classes(), '绘制已收尾 → Escape 取消的是工具').not.toContain('active')
    expect(wrapper.emitted('close'), '有工具时不关弹层').toBeUndefined()
  })

  it('**触摸取消 → 清掉手势，不产标注**', async () => {
    const { wrapper, stage } = setup({ src: IMG })
    await wrapper.findAll('.ip-anno-tools .ip-hdr-btn').filter((b) => !b.classes().includes('ip-w-btn'))[0]!.trigger('click')
    dispatchTouch(stage, 'touchstart', [[100, 100]])
    dispatchTouch(stage, 'touchcancel', [])
    ctxCalls.length = 0
    await frame()
    await frame()
    expect(ctxCalls.includes('clearRect'), '取消后仍可安全重渲').toBe(true)
  })

  it('**单指轻扫（多图、原始大小）→ 左扫下一张**', async () => {
    const { wrapper, stage } = setup()
    dispatchTouch(stage, 'touchstart', [[200, 100]])
    dispatchTouch(stage, 'touchmove', [[100, 100]])
    // touchend 只带 changedTouches（onTouchEnd 读抬起的指算位移）
    dispatchTouch(stage, 'touchend', [], [[100, 100]])
    await flush()
    expect(counter(wrapper)).toContain('2 / 3')
    expect(wrapper.emitted('change')?.at(-1)).toEqual([1])
  })

  it('**拖拽 img 默认行为被阻止**（draggable=false + dragstart.prevent）', async () => {
    const { wrapper } = setup({ src: IMG })
    const ev = new Event('dragstart', { bubbles: true, cancelable: true })
    wrapper.find('.ip-img').element.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(wrapper.find('.ip-img').attributes('draggable')).toBe('false')
  })

  it('**图片加载失败 → 显示错误态**', async () => {
    const { wrapper } = setup({ src: IMG })
    await wrapper.find('.ip-img').trigger('error')
    expect(wrapper.find('.ip-error').exists()).toBe(true)
    expect(wrapper.find('.ip-img').classes()).toContain('invisible')
  })

  it('**图加载成功 → 去掉隐形类并触发重渲**', async () => {
    const { wrapper } = setup({ src: IMG })
    await wrapper.find('.ip-img').trigger('load')
    expect(wrapper.find('.ip-img').classes()).not.toContain('invisible')
    expect(wrapper.find('.ip-spinner').exists()).toBe(false)
  })
})

/* ═══════════ ⑧ 弹层关闭路径 ═══════════ */

describe('弹层关闭', () => {
  it('**点击遮罩本身（self）→ 关闭**', async () => {
    const { wrapper } = setup({ src: IMG })
    await wrapper.find('.ip-backdrop').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('**点击弹层内部 → 不关闭**（.self 语义）', async () => {
    const { wrapper } = setup({ src: IMG })
    await wrapper.find('.ip-stage').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('**关闭按钮 → 关闭**', async () => {
    const { wrapper } = setup({ src: IMG })
    await wrapper.find('.ip-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('**卸载 → 断开色点 RO 且可安全重挂**', () => {
    const a = setup({ src: IMG })
    a.wrapper.unmount()
    expect(toolsRo()!.disconnected).toBe(true)
    expect(() => setup({ src: IMG })).not.toThrow()
  })
})