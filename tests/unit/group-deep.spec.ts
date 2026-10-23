/**
 * Group 组件深度：slider 指针拖拽 / rate 悬浮 / 单项禁用守卫 / 标签与无障碍属性
 *
 * ## 为什么补这些
 *
 * group-modes.spec.ts 已覆盖五种模式的**键盘**操作、max 限制、DOM 层 disabled、
 * 无障碍属性；留白集中在三条「只有指针才能走到的路径」：
 *   ① **slider 的拖拽链**（`posToValue → pickThumb → onThumbDown/onTrackDown →
 *      window pointermove/up → emitChange`）整块零覆盖 —— 键盘只测到 ArrowLeft/Right，
 *      而拖拽还会经过「轨道百分比换算」「区间取最近的那个 thumb」「bindWindowPointer
 *      按需挂载/pointerup 即摘」三件事，任一处错都表现为「拖不动」或「拖完不提交」。
 *   ② **rate 的悬浮预览**（`onHoverRate` + allowHalf 的半星判定）—— 只测点击的话，
 *      「鼠标划过时星数不跟随」「移出后不复原」这两个高频体感缺陷都测不到。
 *   ③ **单项 disabled 的 JS 守卫** —— 已有用例只验了 DOM 上带 `disabled` 属性，
 *      那是浏览器层的拦截；把属性摘掉后 JS 里那道 `if (opt.disabled) return` 才是
 *      真正的最后一道防线（服务端渲染、程序化 dispatch、或属性被误删时全靠它）。
 *
 * ## 三个构造要点
 *
 *   ① happy-dom 没有 `setPointerCapture`，`onThumbDown` 会直接抛 → 每个 thumb 补桩。
 *   ② `pointerdown/move/up` 的 `clientX` 不能经 `trigger()` 传 → 手造 Event + defineProperty。
 *   ③ 轨道换算读 `getBoundingClientRect()`（happy-dom 全 0）→ 必须按用例给不同宽度，
 *      顺带把「宽度为 0 时退回 min」这条防御分支也测了。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Group from '@/components/form/Group.vue'

const OPTS = [
  { label: '甲', value: 'a' },
  { label: '乙', value: 'b' },
  { label: '丙', value: 'c', disabled: true },
]

const mounted: ReturnType<typeof mount>[] = []
function mountGroup(props: Record<string, unknown>) {
  const w = mount(Group, { props, attachTo: document.body })
  mounted.push(w)
  return w
}
afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

type Rect = { left: number; width: number }
function boxRect(el: Element, r: Rect): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: r.left,
      width: r.width,
      right: r.left + r.width,
      top: 0,
      bottom: 10,
      height: 10,
      x: r.left,
      y: 0,
      toJSON: () => ({}),
    }),
  })
}

function firePointer(el: Element | Window, type: string, clientX: number, pointerId = 1): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'clientX', { value: clientX })
  Object.defineProperty(ev, 'pointerId', { value: pointerId })
  el.dispatchEvent(ev)
  return ev
}

/** 给所有 thumb 补 setPointerCapture（happy-dom 不实现） */
function stubCapture(w: ReturnType<typeof mount>): void {
  for (const el of w.findAll('.slider-thumb')) {
    Object.defineProperty(el.element, 'setPointerCapture', { value: () => {}, configurable: true })
  }
}

/* ══════════════════ 单项禁用：JS 守卫（DOM 属性只是第一道） ══════════════════ */

describe('单项禁用的 JS 守卫（摘掉 disabled 属性后仍不该生效）', () => {
  it('**radio：禁用的那一项点了不 emit，其它项正常**', async () => {
    const w = mountGroup({ type: 'radio', modelValue: 'a', options: OPTS })
    const inputs = w.findAll('.choice-input')

    expect((inputs[2]!.element as HTMLInputElement).disabled, '前置：第三项 DOM 已禁用').toBe(true)
    ;(inputs[2]!.element as HTMLInputElement).removeAttribute('disabled')
    await inputs[2]!.trigger('change')
    expect(w.emitted('update:modelValue'), 'JS 守卫应挡住').toBeFalsy()

    await inputs[1]!.trigger('change')
    expect(w.emitted('update:modelValue')?.[0], '正常项不受影响').toEqual(['b'])
  })

  it('**checkbox：禁用项同样进不了数组**（不能靠 DOM 属性保命）', async () => {
    const w = mountGroup({ type: 'checkbox', modelValue: [], options: OPTS })
    const inputs = w.findAll('.choice-input')
    ;(inputs[2]!.element as HTMLInputElement).removeAttribute('disabled')
    await inputs[2]!.trigger('change')
    expect(w.emitted('update:modelValue'), '禁用项不该被追加').toBeFalsy()
  })

  it('**禁用项的 label 带 disabled 类，供样式与测试定位**', () => {
    const w = mountGroup({ type: 'radio', modelValue: '', options: OPTS })
    const labels = w.findAll('.choice-item')
    expect(labels[0]!.classes()).not.toContain('disabled')
    expect(labels[2]!.classes(), '第三项禁用').toContain('disabled')
  })

  it('**整组 disabled → 每项都带 disabled 类**', () => {
    const w = mountGroup({ type: 'checkbox', modelValue: [], options: OPTS, disabled: true })
    expect(w.findAll('.choice-item').every((l) => l.classes().includes('disabled'))).toBe(true)
  })

  it('**整组 disabled 时 JS 守卫同样拦住**（摘掉 input 的 disabled 也进不去）', async () => {
    const w = mountGroup({ type: 'radio', modelValue: 'a', options: OPTS, disabled: true })
    const input = w.findAll('.choice-input')[1]!
    expect((input.element as HTMLInputElement).disabled, '前置：DOM 已禁用').toBe(true)
    ;(input.element as HTMLInputElement).removeAttribute('disabled')
    await input.trigger('change')
    expect(w.emitted('update:modelValue'), 'props.disabled 那道守卫应挡住').toBeFalsy()
  })
})

/* ══════════════════ radio / checkbox 的标签与选中态渲染 ══════════════════ */

describe('选项标签与选中态', () => {
  it('**radio 渲染 opt.label 而非 opt.value**（显示名与取值可以不同）', () => {
    const w = mountGroup({ type: 'radio', modelValue: 'a', options: OPTS })
    expect(w.findAll('.choice-label').map((l) => l.text())).toEqual(['甲', '乙', '丙'])
  })

  it('**checkbox 同样渲染 label**', () => {
    const w = mountGroup({ type: 'checkbox', modelValue: ['b'], options: OPTS })
    const labels = w.findAll('.choice-label').map((l) => l.text())
    expect(labels).toEqual(['甲', '乙', '丙'])

    const boxes = w.findAll('.choice-box')
    expect(boxes[1]!.classes(), '已选项带 checked').toContain('checked')
    expect(boxes[0]!.classes()).not.toContain('checked')
    expect(w.findAll('.choice-box')[1]!.find('svg').exists(), '已选项渲染对勾').toBe(true)
  })

  it('**radio 选中项渲染实心点，未选中不渲染**', () => {
    const w = mountGroup({ type: 'radio', modelValue: 'b', options: OPTS })
    expect(w.findAll('.radio-dot').length, '只有一个选中').toBe(1)
    expect(w.findAll('.choice-box')[1]!.classes()).toContain('checked')
  })

  it('**checkbox 在 toggle 时按字符串比较**（数字与字符串值不该互相打架）', async () => {
    const w = mountGroup({ type: 'checkbox', modelValue: [1], options: [{ label: '一', value: 1 }] })
    const box = w.findAll('.choice-box')[0]!
    expect(box.classes(), '数字 1 已选中').toContain('checked')
    await w.findAll('.choice-input')[0]!.trigger('change')
    expect(w.emitted('update:modelValue')?.[0], '再点应取消').toEqual([[]])
  })

  it('**"1" 与 1 视为同一个值**（后端 JSON 里数字可能变成字符串）', async () => {
    const w = mountGroup({ type: 'checkbox', modelValue: ['1'], options: [{ label: '一', value: 1 }] })
    expect(w.findAll('.choice-box')[0]!.classes(), '字符串 "1" 应命中数字 1 的选项').toContain('checked')

    await w.findAll('.choice-input')[0]!.trigger('change')
    expect(w.emitted('update:modelValue')?.[0], '再点应把它移除而不是重复追加').toEqual([[]])
  })
})

/* ══════════════════ switch ══════════════════ */

describe('switch 的标签与键盘', () => {
  it('**label 渲染成可见文本**（不是只当 aria-label）', () => {
    const w = mountGroup({ type: 'switch', modelValue: false, label: '启用通知' })
    expect(w.find('.switch-label').text()).toBe('启用通知')
  })

  it('**无 label 时不渲染 label 节点**', () => {
    const w = mountGroup({ type: 'switch', modelValue: false })
    expect(w.find('.switch-label').exists()).toBe(false)
  })

  it('**Enter / Space 都能切换**（键盘用户不该只能在轨道上点）', async () => {
    const w = mountGroup({ type: 'switch', modelValue: false })
    await w.find('.switch').trigger('keydown', { key: 'Enter' })
    await w.find('.switch').trigger('keydown', { key: ' ' })
    const ev = w.emitted('update:modelValue')!
    expect(ev.length, '两次按键两次提交').toBe(2)
    expect(ev[0]![0]).toBe(true)
    expect(ev[1]![0]).toBe(true) // modelValue 未受控更新，仍是 false → 取反还是 true
  })

  it('**disabled 时键盘守卫拦住**（摘掉 tabindex 也不该生效）', async () => {
    const w = mountGroup({ type: 'switch', modelValue: false, disabled: true })
    await w.find('.switch').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue'), 'JS 守卫应挡住').toBeFalsy()
  })

  it('**aria-checked 与 tabindex 随状态变化**（读屏与 Tab 顺序都靠它）', () => {
    const off = mountGroup({ type: 'switch', modelValue: false, label: 'x' })
    expect(off.find('.switch').attributes('aria-checked')).toBe('false')
    expect(off.find('.switch').attributes('tabindex')).toBe('0')
    expect(off.find('.switch').attributes('aria-disabled')).toBe('false')

    const on = mountGroup({ type: 'switch', modelValue: true, label: 'x' })
    expect(on.find('.switch').attributes('aria-checked'), '开启态').toBe('true')

    const dis = mountGroup({ type: 'switch', modelValue: false, disabled: true })
    expect(dis.find('.switch').attributes('aria-disabled')).toBe('true')
    expect(dis.find('.switch').attributes('tabindex'), '禁用项不进 Tab 序列').toBe('-1')
  })
})

/* ══════════════════ rate：悬浮预览 ══════════════════ */

describe('rate 悬浮预览', () => {
  /** 造一个带 rect 的星按钮，让 getHalfVal 能算出「左半 / 右半」 */
  function starAt(w: ReturnType<typeof mount>, i: number, width = 20): Element {
    const btn = w.findAll('.rate-btn')[i]!.element
    boxRect(btn, { left: 0, width })
    return btn
  }

  it('**非半星模式：划过第 4 颗 → 4 颗点亮，移出复原**', async () => {
    const w = mountGroup({ type: 'rate', modelValue: 1 })
    expect(w.findAll('.rate-btn.active').length, '初始只亮第 1 颗').toBe(1)

    firePointer(starAt(w, 3), 'mousemove', 5)
    await nextTick()
    expect(w.findAll('.rate-btn.active').length, '悬浮应临时点亮到第 4 颗').toBe(4)

    await w.find('.rate').trigger('mouseleave')
    await nextTick()
    expect(w.findAll('.rate-btn.active').length, '移出应回落到模型值').toBe(1)
  })

  it('**半星模式：划过左半 → 显示半星（half-wrap 出现）**', async () => {
    const w = mountGroup({ type: 'rate', modelValue: 1, allowHalf: true })
    firePointer(starAt(w, 2, 20), 'mousemove', 4) // 第 3 颗左半
    await nextTick()
    expect(w.find('.half-wrap').exists(), '应渲染半星结构').toBe(true)
    expect(w.findAll('.rate-btn.active').length, '1、2 整星 + 第 3 颗半星').toBe(3)
  })

  it('**半星模式：划过右半 → 整星，不出半星结构**', async () => {
    const w = mountGroup({ type: 'rate', modelValue: 1, allowHalf: true })
    firePointer(starAt(w, 2, 20), 'mousemove', 18) // 右半
    await nextTick()
    expect(w.find('.half-wrap').exists()).toBe(false)
    expect(w.findAll('.rate-btn.active').length).toBe(3)
  })

  it('**鼠标点击（detail>0）才走半星判定；键盘触发的 click（detail=0）恒选整星**', async () => {
    const w = mountGroup({ type: 'rate', modelValue: 0, allowHalf: true })
    const btn = starAt(w, 2, 20)

    // 键盘：detail=0，即使点在左半也应是整星
    const kb = new MouseEvent('click', { bubbles: true, detail: 0, clientX: 2 })
    btn.dispatchEvent(kb)
    await nextTick()
    expect(w.emitted('update:modelValue')?.[0], '键盘恒整星').toEqual([3])

    // 鼠标：detail=1 + 左半 → 半星
    const mouse = new MouseEvent('click', { bubbles: true, detail: 1, clientX: 2 })
    btn.dispatchEvent(mouse)
    await nextTick()
    expect(w.emitted('update:modelValue')?.[1], '鼠标左半 = 半星').toEqual([2.5])
  })

  it('**半星值渲染：modelValue=2.5 → 前两颗整星 + 第三颗半星**', () => {
    const w = mountGroup({ type: 'rate', modelValue: 2.5, allowHalf: true })
    expect(w.findAll('.rate-btn').length).toBe(5)
    expect(w.find('.half-wrap').exists(), '第三颗是半星').toBe(true)
    expect(w.findAll('.rate-btn.active').length, '半星也算点亮').toBe(3)
  })

  it('**disabled 时星按钮的 JS 守卫也拦住**（摘掉 DOM disabled 也不能选）', async () => {
    const w = mountGroup({ type: 'rate', modelValue: 2, allowHalf: true, disabled: true })
    const btn = w.findAll('.rate-btn')[2]!.element as HTMLButtonElement
    expect(btn.disabled, '前置：DOM 层已禁用').toBe(true)
    boxRect(btn, { left: 0, width: 20 })
    btn.removeAttribute('disabled')
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, clientX: 2 }))
    await nextTick()
    expect(w.emitted('update:modelValue'), 'JS 守卫应挡住').toBeFalsy()
  })

  it('**rate 的组容器用 role=group 而非谎报 slider**（slider 要求容器可聚焦可方向键调）', () => {
    const w = mountGroup({ type: 'rate', modelValue: 0 })
    const root = w.find('.rate')
    expect(root.attributes('role')).toBe('group')
    expect(root.attributes('aria-label'), '组说明应带当前值与上限').toContain('5')
    expect(w.findAll('.rate-btn')[0]!.attributes('aria-label'), '每颗星自带说明').toContain('1')
  })
})

/* ══════════════════ slider：拖拽链 ══════════════════ */

describe('slider 指针拖拽', () => {
  it('**轨道点击 → 按百分比换算取值并提交**', async () => {
    const w = mountGroup({ type: 'slider', modelValue: 0, min: 0, sliderMax: 100, step: 1 })
    stubCapture(w)
    const track = w.find('.slider-track').element
    boxRect(track, { left: 0, width: 200 })

    firePointer(track, 'pointerdown', 150) // 75%
    await nextTick()
    expect(w.emitted('update:modelValue')?.[0], '150/200 = 75').toEqual([75])
  })

  it('**拖拽期间 window pointermove 持续更新，pointerup 才提交 change**', async () => {
    const w = mountGroup({ type: 'slider', modelValue: 0, min: 0, sliderMax: 100, step: 1 })
    stubCapture(w)
    const track = w.find('.slider-track').element
    boxRect(track, { left: 0, width: 200 })

    firePointer(track, 'pointerdown', 100) // 50
    await nextTick()
    expect(w.emitted('change'), '按下本身不提交 change').toBeFalsy()

    firePointer(window, 'pointermove', 120) // 60
    firePointer(window, 'pointermove', 160) // 80
    await nextTick()
    const updates = w.emitted('update:modelValue')!
    expect(updates.map((u) => u[0]), '按下 50 → 移动 60 → 80').toEqual([50, 60, 80])
    expect(w.emitted('change'), '移动过程中仍不提交').toBeFalsy()

    firePointer(window, 'pointerup', 160)
    await nextTick()
    expect(w.emitted('change'), '松手提交').toBeTruthy()
  })

  it('**未按下时的 pointermove 不产生更新**（监听是按需挂载的，不该常驻）', async () => {
    const w = mountGroup({ type: 'slider', modelValue: 10 })
    stubCapture(w)
    firePointer(window, 'pointermove', 180)
    await nextTick()
    expect(w.emitted('update:modelValue'), '没按下就移动 → 无动作').toBeFalsy()
  })

  it('**轨道宽度为 0 → 退回 min，不产生 NaN**（布局未就绪时也不能算出脏值）', async () => {
    const w = mountGroup({ type: 'slider', modelValue: 50, min: 5, sliderMax: 100, step: 1 })
    stubCapture(w)
    const track = w.find('.slider-track').element
    boxRect(track, { left: 0, width: 0 })

    firePointer(track, 'pointerdown', 150)
    await nextTick()
    expect(w.emitted('update:modelValue')?.[0], '按 min 兜底').toEqual([5])
  })

  it('**拖出两端 → 钳制在 min / max**', async () => {
    const w = mountGroup({ type: 'slider', modelValue: 0, min: 0, sliderMax: 100, step: 1 })
    stubCapture(w)
    const track = w.find('.slider-track').element
    boxRect(track, { left: 0, width: 200 })

    firePointer(track, 'pointerdown', 1000) // 远超右端
    await nextTick()
    expect(w.emitted('update:modelValue')?.[0], '钳到 max').toEqual([100])

    firePointer(window, 'pointermove', -500) // 远超左端
    await nextTick()
    expect(w.emitted('update:modelValue')?.[1], '钳到 min').toEqual([0])
  })

  it('**步进对齐：step=10 时 53% 应落到 50**', async () => {
    const w = mountGroup({ type: 'slider', modelValue: 0, min: 0, sliderMax: 100, step: 10 })
    stubCapture(w)
    const track = w.find('.slider-track').element
    boxRect(track, { left: 0, width: 200 })

    firePointer(track, 'pointerdown', 106) // 53%
    await nextTick()
    expect(w.emitted('update:modelValue')?.[0], '对齐到 50').toEqual([50])
  })
})

/* ══════════════════ slider：区间模式 ══════════════════ */

describe('slider 区间模式', () => {
  it('**反序入参 [80,20] 会被归一成 [20,80]**（不能画出负宽填充条）', () => {
    const w = mountGroup({ type: 'slider', modelValue: [80, 20], min: 0, sliderMax: 100 })
    const value = w.find('.slider-value').text()
    expect(value, '显示应按归一后的顺序').toBe('20 ~ 80')
    expect(w.find('.slider-root').classes(), '区间模式加 is-range').toContain('is-range')
  })

  it('**区间模式渲染两个 thumb，各带区间语义的 aria-label**', () => {
    const w = mountGroup({ type: 'slider', modelValue: [20, 80], min: 0, sliderMax: 100 })
    const thumbs = w.findAll('.slider-thumb')
    expect(thumbs.length).toBe(2)
    expect(thumbs[0]!.attributes('aria-valuenow')).toBe('20')
    expect(thumbs[1]!.attributes('aria-valuenow')).toBe('80')
    expect(thumbs[0]!.attributes('aria-label'), '起始 thumb').not.toBe(thumbs[1]!.attributes('aria-label'))
  })

  it('**点轨道靠近哪个 thumb 就拖哪个**（近左拖起点，且不越过终点）', async () => {
    const w = mountGroup({ type: 'slider', modelValue: [20, 80], min: 0, sliderMax: 100, step: 1 })
    stubCapture(w)
    const track = w.find('.slider-track').element
    boxRect(track, { left: 0, width: 200 })

    // 点在 30% 处（距 20 更近）→ 拖起点到 30，终点保持 80
    firePointer(track, 'pointerdown', 60)
    await nextTick()
    expect(w.emitted('update:modelValue')?.[0], '只动起点').toEqual([[30, 80]])
  })

  it('**起点被拖过终点时，终点跟着让位**（区间不能反向）', async () => {
    const w = mountGroup({ type: 'slider', modelValue: [20, 80], min: 0, sliderMax: 100, step: 1 })
    stubCapture(w)
    const track = w.find('.slider-track').element
    boxRect(track, { left: 0, width: 200 })

    firePointer(track, 'pointerdown', 40) // 20 处，选起点
    await nextTick()
    firePointer(window, 'pointermove', 190) // 95 处，超过终点 80
    await nextTick()
    expect(w.emitted('update:modelValue')?.at(-1)?.[0], '终点被推到 95').toEqual([95, 95])
  })

  it('**拖终点时起点不让位**（只动被按住的那个）', async () => {
    const w = mountGroup({ type: 'slider', modelValue: [20, 80], min: 0, sliderMax: 100, step: 1 })
    stubCapture(w)
    const track = w.find('.slider-track').element
    boxRect(track, { left: 0, width: 200 })

    firePointer(track, 'pointerdown', 160) // 80 处，选终点
    await nextTick()
    firePointer(window, 'pointermove', 100) // 50 处
    await nextTick()
    expect(w.emitted('update:modelValue')?.at(-1)?.[0], '起点 20 不动').toEqual([20, 50])
  })

  it('**终点被拖到起点以下时，起点跟着让位**（区间任何时候都不能反向）', async () => {
    const w = mountGroup({ type: 'slider', modelValue: [20, 80], min: 0, sliderMax: 100, step: 1 })
    stubCapture(w)
    const track = w.find('.slider-track').element
    boxRect(track, { left: 0, width: 200 })

    firePointer(track, 'pointerdown', 160) // 80 处，选终点
    await nextTick()
    firePointer(window, 'pointermove', 20) // 10 处，低于起点 20
    await nextTick()
    // 源码 setValue 的终点分支是 `[Math.min(a, v), v]` → [10, 10]：起点被压到 10
    expect(w.emitted('update:modelValue')?.at(-1)?.[0], '起点被压到 10').toEqual([10, 10])
  })
})

/* ══════════════════ slider：键盘补面 ══════════════════ */

describe('slider 键盘的剩余分支', () => {
  it('**无关按键不拦默认、不提交**（不能把 Tab/字母键吃掉）', async () => {
    const w = mountGroup({ type: 'slider', modelValue: 50 })
    const thumb = w.find('.slider-thumb')
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    thumb.element.dispatchEvent(ev)
    await nextTick()
    expect(ev.defaultPrevented, 'Tab 不该被拦').toBe(false)
    expect(w.emitted('update:modelValue'), '也不该提交').toBeFalsy()
  })

  it('**ArrowUp / ArrowDown 与左右等价**', async () => {
    const w = mountGroup({ type: 'slider', modelValue: 50, step: 5 })
    const thumb = w.find('.slider-thumb')
    await thumb.trigger('keydown', { key: 'ArrowUp' })
    await thumb.trigger('keydown', { key: 'ArrowDown' })
    expect(w.emitted('update:modelValue')!.map((u) => u[0]), '55 再回 50').toEqual([55, 45])
  })

  it('**方向键必须阻止默认行为**（否则会连带滚动整个表单容器）', async () => {
    const w = mountGroup({ type: 'slider', modelValue: 50 })
    const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    w.find('.slider-thumb').element.dispatchEvent(ev)
    await nextTick()
    expect(ev.defaultPrevented, 'ArrowRight 应被拦').toBe(true)
  })

  it('**键盘同时提交 change —— 但它发的是更新前的值（已登记 P2 缺陷）**', async () => {
    // 源码 emitChange() 读的是 `range.value`（由 props.modelValue 派生），而 props
    // 要等父组件重渲染后才刷新 → 「setValue 写新值 + 同步 emitChange」这一对永远差一拍。
    // 实测：v-model 父组件收到 update:modelValue=51、父值确实变 51，但 change 参数是 50。
    // 拖拽路径在「逐帧移动」时正确（帧间 props 已刷新），同 tick 派发时同样是旧值。
    const w = mountGroup({ type: 'slider', modelValue: 50 })
    await w.find('.slider-thumb').trigger('keydown', { key: 'ArrowRight' })

    expect(w.emitted('update:modelValue')?.[0], '写入的是新值（v-model 正常）').toEqual([51])
    expect(w.emitted('change')?.[0], '现状：提交的是旧值').toEqual([50])
  })

  it('**disabled 时键盘守卫拦住**', async () => {
    const w = mountGroup({ type: 'slider', modelValue: 50, disabled: true })
    await w.find('.slider-thumb').trigger('keydown', { key: 'ArrowRight' })
    expect(w.emitted('update:modelValue')).toBeFalsy()
  })

  it('**按下 thumb 时 DOM 有 dragging 标记，松手后清掉**（拖拽的视觉反馈依赖它）', async () => {
    const w = mountGroup({ type: 'slider', modelValue: 0, min: 0, sliderMax: 100 })
    stubCapture(w)
    const track = w.find('.slider-track').element
    boxRect(track, { left: 0, width: 200 })

    firePointer(track, 'pointerdown', 100)
    await nextTick()
    expect(w.find('.slider-track').classes(), '轨道拖拽态').toContain('dragging')
    expect(w.find('.slider-thumb').classes(), '当前 thumb 拖拽态').toContain('dragging')

    firePointer(window, 'pointerup', 100)
    await nextTick()
    expect(w.find('.slider-track').classes(), '松手清掉').not.toContain('dragging')
  })

  it('**从 thumb 上按下去也能拖**（这才是最常见的起手式，不能只支持点轨道）', async () => {
    const w = mountGroup({ type: 'slider', modelValue: 20, min: 0, sliderMax: 100, step: 1 })
    stubCapture(w)
    const track = w.find('.slider-track').element
    boxRect(track, { left: 0, width: 200 })
    const thumb = w.find('.slider-thumb').element
    let captured = 0
    Object.defineProperty(thumb, 'setPointerCapture', {
      value: () => {
        captured++
      },
      configurable: true,
    })

    firePointer(thumb, 'pointerdown', 40) // 20%
    await nextTick()
    expect(captured, '应捕获指针，否则拖出控件就丢事件').toBe(1)
    expect(w.emitted('update:modelValue')?.[0], '按住即先对齐到当前位置').toEqual([20])
    expect(w.find('.slider-thumb').classes()).toContain('dragging')

    firePointer(window, 'pointermove', 120) // 60%
    await nextTick()
    expect(w.emitted('update:modelValue')?.at(-1)?.[0], '拖到 60%').toBe(60)
  })

  it('**区间模式从第 2 个 thumb 起拖 → 拖的是终点，起点不动**', async () => {
    const w = mountGroup({ type: 'slider', modelValue: [20, 60], min: 0, sliderMax: 100, step: 1 })
    stubCapture(w)
    const track = w.find('.slider-track').element
    boxRect(track, { left: 0, width: 200 })
    const thumbs = w.findAll('.slider-thumb')
    expect(thumbs.length).toBe(2)

    firePointer(thumbs[1]!.element, 'pointerdown', 120) // 60%
    await nextTick()
    firePointer(window, 'pointermove', 180) // 90%
    await nextTick()
    expect(w.emitted('update:modelValue')?.at(-1)?.[0], '只动终点').toEqual([20, 90])
  })

  it('**disabled 时从 thumb 按下不进入拖拽**', async () => {
    const w = mountGroup({ type: 'slider', modelValue: 20, disabled: true })
    stubCapture(w)
    const track = w.find('.slider-track').element
    boxRect(track, { left: 0, width: 200 })
    firePointer(w.find('.slider-thumb').element, 'pointerdown', 100)
    await nextTick()
    expect(w.emitted('update:modelValue')).toBeFalsy()
    expect(w.find('.slider-thumb').classes()).not.toContain('dragging')
  })

  it('**disabled 时按轨道不进入拖拽态**', async () => {
    const w = mountGroup({ type: 'slider', modelValue: 0, disabled: true })
    stubCapture(w)
    const track = w.find('.slider-track').element
    boxRect(track, { left: 0, width: 200 })
    firePointer(track, 'pointerdown', 100)
    await nextTick()
    expect(w.find('.slider-track').classes()).not.toContain('dragging')
    expect(w.emitted('update:modelValue')).toBeFalsy()
  })
})

/* ══════════════════ slider：渲染与卸载 ══════════════════ */

describe('slider 渲染细节与监听清理', () => {
  it('**填充条宽度反映百分比；单值从 0% 起，区间从起点起**', () => {
    const single = mountGroup({ type: 'slider', modelValue: 30, min: 0, sliderMax: 100 })
    expect(single.find('.slider-fill').attributes('style')).toContain('width: 30%')

    const ranged = mountGroup({ type: 'slider', modelValue: [20, 60], min: 0, sliderMax: 100 })
    const style = ranged.find('.slider-fill').attributes('style')!
    expect(style, '起点 20%').toContain('left: 20%')
    expect(style, '宽度 40%').toContain('width: 40%')
  })

  it('**sliderMax == min 时用 span=1 兜底，不产生除零**', () => {
    const w = mountGroup({ type: 'slider', modelValue: 5, min: 5, sliderMax: 5 })
    const style = w.find('.slider-fill').attributes('style')!
    // span 兜底为 1 时 pct=(5-5)/1=0 → 明确的 width: 0%；
    // 若 span 为 0 会算出 NaN%，而 Vue/happy-dom 会**丢弃非法 CSS 值**（不是渲染出 NaN），
    // 所以只能正向断言 0%，不能只断言「不含 NaN」（那样两种实现都能过）。
    expect(style, 'span 兜底后应为 0%').toContain('width: 0%')
  })

  it('**showValue=false 时不显示数值**', () => {
    const w = mountGroup({ type: 'slider', modelValue: 30, showValue: false })
    expect(w.find('.slider-value').exists()).toBe(false)
  })

  it('**thumb 的 left% 跟着值走**（不跟值的话拖到哪都看不出位置）', () => {
    const w = mountGroup({ type: 'slider', modelValue: 30, min: 0, sliderMax: 100 })
    expect(w.find('.slider-thumb').attributes('style'), '30% 处').toContain('left: 30%')

    const ranged = mountGroup({ type: 'slider', modelValue: [20, 60], min: 0, sliderMax: 100 })
    const thumbs = ranged.findAll('.slider-thumb')
    expect(thumbs[0]!.attributes('style')).toContain('left: 20%')
    expect(thumbs[1]!.attributes('style')).toContain('left: 60%')
  })

  it('**松手后立即解绑 window 监听**（不留常驻监听，避免整页指针事件都进回调）', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const w = mountGroup({ type: 'slider', modelValue: 0, min: 0, sliderMax: 100 })
    stubCapture(w)
    const track = w.find('.slider-track').element
    boxRect(track, { left: 0, width: 200 })

    firePointer(track, 'pointerdown', 100)
    await nextTick()
    removeSpy.mockClear()

    firePointer(window, 'pointerup', 100)
    await nextTick()
    const removed = removeSpy.mock.calls.map((c) => c[0])
    expect(removed, 'pointerup 即摘 pointermove').toContain('pointermove')
    expect(removed, 'pointerup 即摘 pointerup 自身').toContain('pointerup')
  })

  it('**aria-valuemin / max 取自 min / sliderMax**（不是写死的 0/100）', () => {
    const w = mountGroup({ type: 'slider', modelValue: 30, min: 10, sliderMax: 60 })
    const thumb = w.find('.slider-thumb')
    expect(thumb.attributes('aria-valuemin')).toBe('10')
    expect(thumb.attributes('aria-valuemax')).toBe('60')
    expect(thumb.attributes('aria-valuenow')).toBe('30')
  })

  it('**卸载时摘掉 window 指针监听**（按需挂载的监听必须在卸载时回收）', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const w = mountGroup({ type: 'slider', modelValue: 0, min: 0, sliderMax: 100 })
    stubCapture(w)
    const track = w.find('.slider-track').element
    boxRect(track, { left: 0, width: 200 })
    firePointer(track, 'pointerdown', 100) // 挂上监听

    const addSpy = vi.spyOn(window, 'addEventListener')
    expect(addSpy, '这里只关心卸载').toBeTruthy()

    w.unmount()
    mounted.pop()
    const removed = removeSpy.mock.calls.map((c) => c[0])
    expect(removed, '应摘掉 pointermove').toContain('pointermove')
    expect(removed, '应摘掉 pointerup').toContain('pointerup')
  })
})
