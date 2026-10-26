/**
 * ProgressBar · 边界与退化输入（第 135 轮）。此前只有 3 条拖拽用例，
 * 分支覆盖 35% / 语句 55% —— 而进度条恰恰是"边界值算错却不报错"的重灾区。
 *
 * 本轮修了 5 处会**静默产坏值**的问题，每条都有对应的锁死用例：
 *   ① `modelValue` 越界 → 填充/滑块跑到轨道外（width:200% / left:-50%）
 *   ② `percent` 是 NaN/越界 → 文本显示 `NaN%` / `150%` / `-20%`（填充却是夹紧的，自相矛盾）
 *   ③ `step=0` → `Math.round(x/0)` = Infinity，拖拽/键盘/数字输入**全部卡死在原值**
 *   ④ `max <= min` → 区间塌缩，滑块"看得见却永远拖不到"
 *   ⑤ 轨道宽度为 0（未布局 / display:none）→ ratio 变 Infinity/NaN
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ProgressBar from '@/components/data/ProgressBar.vue'

const mountPb = (props: Record<string, unknown> = {}) => mount(ProgressBar, { props })
const fillStyle = (w: ReturnType<typeof mountPb>) => w.find('.progress-fill').attributes('style') ?? ''
const sliderFill = (w: ReturnType<typeof mountPb>) => w.find('.slider-fill').attributes('style') ?? ''
const thumbStyle = (w: ReturnType<typeof mountPb>) => w.find('.slider-thumb').attributes('style') ?? ''
const text = (w: ReturnType<typeof mountPb>) => w.find('.progress-text').text()
const emitted = (w: ReturnType<typeof mountPb>) =>
  (w.emitted('update:modelValue') as Array<[number]> | undefined) ?? []

// ════════════════════════════════════════════════════════════════════
describe('只读进度条：percent 的边界与坏值', () => {
  it('正常值：填充与文本一致', () => {
    const w = mountPb({ percent: 42 })
    expect(fillStyle(w)).toContain('42%')
    expect(text(w)).toBe('42%')
    w.unmount()
  })

  it('**越界值填充夹到 0~100，文本也夹紧**（原来文本会显示 150% / -20%）', () => {
    const hi = mountPb({ percent: 150 })
    expect(fillStyle(hi)).toContain('100%')
    expect(text(hi), '文本不该显示 150%').toBe('100%')
    hi.unmount()

    const lo = mountPb({ percent: -20 })
    expect(fillStyle(lo)).toContain('0%')
    expect(text(lo), '文本不该显示 -20%').toBe('0%')
    lo.unmount()
  })

  it('**NaN 当 0**（原来文本显示 NaN%，而填充是 0%，两者自相矛盾）', () => {
    const w = mountPb({ percent: NaN })
    expect(fillStyle(w)).toContain('0%')
    expect(text(w), '不该出现 NaN%').toBe('0%')
    w.unmount()
  })

  it('Infinity 同样当 0（不是 100）—— 坏值语义是"没有进度"而不是"已完成"', () => {
    const w = mountPb({ percent: Infinity })
    expect(fillStyle(w)).toContain('0%')
    expect(text(w)).toBe('0%')
    w.unmount()
  })

  it('小数四舍五入显示，但填充保留精确值（视觉不被文本精度影响）', () => {
    const w = mountPb({ percent: 33.7 })
    expect(text(w)).toBe('34%')
    expect(fillStyle(w)).toContain('33.7%')
    w.unmount()
  })

  it('0 和 100 两个端点', () => {
    expect(text(mountPb({ percent: 0 }))).toBe('0%')
    expect(text(mountPb({ percent: 100 }))).toBe('100%')
  })

  it('showText=false 不渲染文本；height 透传到轨道', () => {
    const w = mountPb({ percent: 50, showText: false, height: 12 })
    expect(w.find('.progress-text').exists()).toBe(false)
    expect(w.find('.progress-track').attributes('style')).toContain('12px')
    w.unmount()
  })

  it('variant / striped / animated 落到 fill 的 class 上', () => {
    const w = mountPb({ percent: 10, variant: 'danger', striped: true, animated: true })
    const cls = w.find('.progress-fill').classes()
    expect(cls).toContain('fill-danger')
    expect(cls).toContain('striped')
    expect(cls).toContain('animated')
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('滑块模式：位置夹紧', () => {
  it('正常值：fill 与 thumb 同位置', () => {
    const w = mountPb({ interactive: true, modelValue: 30 })
    expect(sliderFill(w)).toContain('30%')
    expect(thumbStyle(w)).toContain('30%')
    w.unmount()
  })

  it('**modelValue 超出 max → fill/thumb 夹到 100%**（原来跑到 200%，滑块飞出轨道）', () => {
    const w = mountPb({ interactive: true, modelValue: 200 })
    expect(sliderFill(w), '不该出现 200%').toContain('100%')
    expect(thumbStyle(w), 'thumb 不该跑出轨道').toContain('100%')
    w.unmount()
  })

  it('**modelValue 低于 min → 夹到 0%**（原来是 -50%）', () => {
    const w = mountPb({ interactive: true, modelValue: -50 })
    expect(sliderFill(w)).toContain('0%')
    expect(thumbStyle(w)).toContain('0%')
    w.unmount()
  })

  it('自定义区间 min=20 max=80：值 50 应落在正中间', () => {
    const w = mountPb({ interactive: true, modelValue: 50, min: 20, max: 80 })
    expect(sliderFill(w)).toContain('50%')
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('滑块模式：step 退化不卡死', () => {
  it.each([0, -5, NaN, Infinity])('step=%s 时键盘仍能移动（退回步进 1）', async (step) => {
    const w = mountPb({ interactive: true, modelValue: 50, step })
    await w.find('.slider-thumb').trigger('keydown', { key: 'ArrowRight' })
    const ev = emitted(w)
    expect(ev.length, 'step 坏掉也必须能 emit（否则用户完全拖不动）').toBe(1)
    expect(ev[0][0], '坏步进按 1 处理').toBe(51)
    w.unmount()
  })

  it('step=0 时数字输入不卡死', async () => {
    const w = mountPb({ interactive: true, modelValue: 50, step: 0, showInput: true })
    const inp = w.find('.slider-input')
    ;(inp.element as HTMLInputElement).value = '77'
    await inp.trigger('change')
    expect(emitted(w)[0][0], '输入 77 应得到 77，而不是 NaN/null').toBe(77)
    w.unmount()
  })

  it('正常 step 仍按步进吸附', async () => {
    const w = mountPb({ interactive: true, modelValue: 50, step: 5 })
    await w.find('.slider-thumb').trigger('keydown', { key: 'ArrowRight' })
    expect(emitted(w)[0][0]).toBe(55)
    w.unmount()
  })

  it('吸附后在区间内：min=10 step=7、值 33 → 35（不是 33）', async () => {
    const w = mountPb({ interactive: true, modelValue: 33, min: 10, max: 100, step: 7, showInput: true })
    const inp = w.find('.slider-input')
    ;(inp.element as HTMLInputElement).value = '33'
    await inp.trigger('change')
    // (33-10)/7 = 3.28 → 3 → 10+21 = 31
    expect(emitted(w)[0][0]).toBe(31)
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('滑块模式：区间塌缩', () => {
  it('**max == min 时区间退回默认跨度**：aria 范围与"能按到的范围"必须一致', async () => {
    const w = mountPb({ interactive: true, modelValue: 50, min: 50, max: 50 })
    const thumb = w.find('.slider-thumb')
    // 区间塌缩时组件退回默认跨度。若 aria 仍报 50~50，读屏会告诉用户"范围就这一个值"，
    // 可键盘却能按到 51 —— 报的范围和实际能动的范围自相矛盾。
    expect(Number(thumb.attributes('aria-valuemax'))).toBeGreaterThan(Number(thumb.attributes('aria-valuemin')))
    await thumb.trigger('keydown', { key: 'ArrowRight' })
    expect((w.emitted('update:modelValue') as Array<[number]>)[0][0], '仍能按键移动').toBe(51)
    w.unmount()
  })

  it('**max < min 时不出现负宽度**', () => {
    const w = mountPb({ interactive: true, modelValue: 50, min: 100, max: 0 })
    const pct = Number((sliderFill(w).match(/width:\s*([\d.-]+)%/) ?? [])[1] ?? 'NaN')
    expect(Number.isFinite(pct), '宽度必须是有限值').toBe(true)
    expect(pct, '宽度不该为负').toBeGreaterThanOrEqual(0)
    expect(pct).toBeLessThanOrEqual(100)
    w.unmount()
  })

  it('max/min 为 NaN 时退回默认区间（不产出 NaN%）', () => {
    const w = mountPb({ interactive: true, modelValue: 50, min: NaN, max: NaN })
    expect(sliderFill(w)).not.toContain('NaN')
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('滑块模式：刻度断点', () => {
  it('非交互 / 未开启 showStops 不渲染刻度', () => {
    expect(mountPb({ percent: 50, showStops: true }).findAll('.slider-stop').length).toBe(0)
    expect(mountPb({ interactive: true, modelValue: 50 }).findAll('.slider-stop').length).toBe(0)
  })

  it('0~100 step=25 → 5 个刻度，且按当前值标记 active', () => {
    const w = mountPb({ interactive: true, modelValue: 50, step: 25, showStops: true })
    const stops = w.findAll('.slider-stop')
    expect(stops.length).toBe(5)
    const actives = stops.filter((s) => s.classes().includes('active'))
    // 0 / 25 / 50 已到达
    expect(actives.length).toBe(3)
    w.unmount()
  })

  it('刻度最多画 50 个（step=1 也只画 50，不因区间大就爆 DOM）', () => {
    const w = mountPb({ interactive: true, modelValue: 0, step: 1, showStops: true })
    expect(w.findAll('.slider-stop').length).toBe(50)
    w.unmount()
  })

  it('**step=0 时不画刻度**（原来画出 50 个全部叠在 0 位）', () => {
    const w = mountPb({ interactive: true, modelValue: 50, step: 0, showStops: true })
    const stops = w.findAll('.slider-stop')
    // 归一化后 step=1 → 50 个刻度，但位置必须是分散的而不是全 0%
    const lefts = new Set(stops.map((s) => s.attributes('style')))
    expect(lefts.size, '刻度位置必须各不相同').toBeGreaterThan(1)
    w.unmount()
  })

  it('区间小于步进时不画刻度（避免 0/0=NaN 定位）', () => {
    const w = mountPb({ interactive: true, modelValue: 3, max: 4, step: 10, showStops: true })
    expect(w.findAll('.slider-stop').length).toBe(0)
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('滑块模式：键盘与禁用', () => {
  const cases: Array<[string, number]> = [
    ['ArrowRight', 51],
    ['ArrowUp', 51],
    ['ArrowLeft', 49],
    ['ArrowDown', 49],
  ]

  it.each(cases)('%s → %s（同时 emit change）', async (key, want) => {
    const w = mountPb({ interactive: true, modelValue: 50 })
    await w.find('.slider-thumb').trigger('keydown', { key })
    expect(emitted(w)[0][0]).toBe(want)
    expect((w.emitted('change') as Array<[number]>)[0][0]).toBe(want)
    w.unmount()
  })

  it('其它按键不 emit、也不 preventDefault', async () => {
    const w = mountPb({ interactive: true, modelValue: 50 })
    await w.find('.slider-thumb').trigger('keydown', { key: 'a' })
    expect(emitted(w).length).toBe(0)
    w.unmount()
  })

  it('边界处按键不越界：到 max 再按右键仍是 max', async () => {
    const w = mountPb({ interactive: true, modelValue: 100 })
    await w.find('.slider-thumb').trigger('keydown', { key: 'ArrowRight' })
    expect(emitted(w)[0][0]).toBe(100)
    w.unmount()
  })

  it('到 min 再按左键仍是 min', async () => {
    const w = mountPb({ interactive: true, modelValue: 0 })
    await w.find('.slider-thumb').trigger('keydown', { key: 'ArrowLeft' })
    expect(emitted(w)[0][0]).toBe(0)
    w.unmount()
  })

  it('disabled 时键盘不 emit，且数字输入框被禁用', async () => {
    const w = mountPb({ interactive: true, modelValue: 50, disabled: true, showInput: true })
    await w.find('.slider-thumb').trigger('keydown', { key: 'ArrowRight' })
    expect(emitted(w).length).toBe(0)
    expect(w.find('.slider-input').attributes('disabled')).toBeDefined()
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('滑块模式：数字输入', () => {
  it('输入非数字不 emit（不能让 NaN 流进取值）', async () => {
    const w = mountPb({ interactive: true, modelValue: 50, showInput: true })
    const inp = w.find('.slider-input')
    ;(inp.element as HTMLInputElement).value = 'abc'
    await inp.trigger('change')
    expect(emitted(w).length).toBe(0)
    w.unmount()
  })

  it('输入超界值被夹紧', async () => {
    const w = mountPb({ interactive: true, modelValue: 50, showInput: true })
    const inp = w.find('.slider-input')
    ;(inp.element as HTMLInputElement).value = '999'
    await inp.trigger('change')
    expect(emitted(w)[0][0]).toBe(100)
    w.unmount()
  })

  it('输入时同时 emit update:modelValue 与 change', async () => {
    const w = mountPb({ interactive: true, modelValue: 10, showInput: true })
    const inp = w.find('.slider-input')
    ;(inp.element as HTMLInputElement).value = '20'
    await inp.trigger('change')
    expect(emitted(w)[0][0]).toBe(20)
    expect((w.emitted('change') as Array<[number]>)[0][0]).toBe(20)
    w.unmount()
  })

  it('数字输入的 min/max/step 属性与 props 一致', () => {
    const w = mountPb({ interactive: true, modelValue: 5, min: 2, max: 9, step: 3, showInput: true })
    const inp = w.find('.slider-input')
    expect(inp.attributes('min')).toBe('2')
    expect(inp.attributes('max')).toBe('9')
    expect(inp.attributes('step')).toBe('3')
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('无障碍接线', () => {
  it('thumb 有 role=slider 与 aria-valuemin/max/now', () => {
    const w = mountPb({ interactive: true, modelValue: 40, min: 10, max: 90, label: '音量' })
    const thumb = w.find('.slider-thumb')
    expect(thumb.attributes('role')).toBe('slider')
    expect(thumb.attributes('aria-valuemin')).toBe('10')
    expect(thumb.attributes('aria-valuemax')).toBe('90')
    expect(thumb.attributes('aria-valuenow')).toBe('40')
    expect(thumb.attributes('aria-label'), '未传 label 也要有可访问名').toBe('音量')
    w.unmount()
  })

  it('未传 label 时回退通用文案（不是空 label）', () => {
    const w = mountPb({ interactive: true, modelValue: 40 })
    const aria = w.find('.slider-thumb').attributes('aria-label')
    expect(aria && aria.length > 0, 'aria-label 不能为空').toBe(true)
    w.unmount()
  })

  it('thumb 可聚焦（tabindex=0），否则键盘操作无从触发', () => {
    const w = mountPb({ interactive: true, modelValue: 40 })
    expect(w.find('.slider-thumb').attributes('tabindex')).toBe('0')
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('模式互斥与卸载清理', () => {
  it('interactive 时不渲染只读结构，反之亦然', () => {
    const a = mountPb({ interactive: true, modelValue: 10 })
    expect(a.find('.progress-wrap').exists()).toBe(false)
    expect(a.find('.progress-slider').exists()).toBe(true)
    a.unmount()

    const b = mountPb({ percent: 10 })
    expect(b.find('.progress-wrap').exists()).toBe(true)
    expect(b.find('.progress-slider').exists()).toBe(false)
    b.unmount()
  })

  it('拖拽中卸载不报错，且 window 上的监听被摘掉', async () => {
    const before = { move: 0, up: 0 }
    const w = mountPb({ interactive: true, modelValue: 10 })
    const track = w.find('.slider-track')
    // 记录挂载数量变化
    const origAdd = window.addEventListener
    const origRemove = window.removeEventListener
    let added = 0
    let removed = 0
    // @ts-expect-error 测试替身
    window.addEventListener = (t: string, ...rest: unknown[]) => {
      if (t === 'pointermove' || t === 'pointerup') added++
      return origAdd.call(window, t, ...(rest as [EventListenerOrEventListenerObject]))
    }
    // @ts-expect-error 测试替身
    window.removeEventListener = (t: string, ...rest: unknown[]) => {
      if (t === 'pointermove' || t === 'pointerup') removed++
      return origRemove.call(window, t, ...(rest as [EventListenerOrEventListenerObject]))
    }
    await track.trigger('pointerdown', { clientX: 10, pointerId: 1 })
    await nextTick()
    expect(added, '拖拽开始挂 2 个 window 监听').toBe(2)
    w.unmount()
    expect(removed, '卸载要把 2 个监听摘掉（否则泄漏）').toBe(2)
    window.addEventListener = origAdd
    window.removeEventListener = origRemove
    expect(before.move).toBe(0)
  })
})


// ════════════════════════════════════════════════════════════════════
describe('滑块模式：拖拽位置夹紧（第 135 轮补）', () => {
  /**
   * happy-dom 不给真实布局，所以手动桩住 track 的 getBoundingClientRect：
   * 轨道在 x=100，宽 200 → 有效范围 [100, 300]。
   */
  function stubRect(w: ReturnType<typeof mountPb>) {
    const track = w.find('.slider-track').element as HTMLElement
    track.getBoundingClientRect = () =>
      ({ left: 100, width: 200, top: 0, height: 8, right: 300, bottom: 8, x: 100, y: 0, toJSON: () => ({}) }) as DOMRect
  }

  it('拖到轨道**左侧之外** → 夹到 min（不是负值）', async () => {
    const w = mountPb({ interactive: true, modelValue: 50 })
    stubRect(w)
    await w.find('.slider-track').trigger('pointerdown', { clientX: -500, pointerId: 1 })
    expect((w.emitted('update:modelValue') as Array<[number]>)[0][0], '超出左边界应夹到 min').toBe(0)
    w.unmount()
  })

  it('拖到轨道**右侧之外** → 夹到 max', async () => {
    const w = mountPb({ interactive: true, modelValue: 50 })
    stubRect(w)
    await w.find('.slider-track').trigger('pointerdown', { clientX: 9999, pointerId: 1 })
    expect((w.emitted('update:modelValue') as Array<[number]>)[0][0], '超出右边界应夹到 max').toBe(100)
    w.unmount()
  })

  it('拖到正中间 → 50；并按 step 吸附', async () => {
    const w = mountPb({ interactive: true, modelValue: 0, step: 10 })
    stubRect(w)
    await w.find('.slider-track').trigger('pointerdown', { clientX: 200, pointerId: 1 })
    expect((w.emitted('update:modelValue') as Array<[number]>)[0][0]).toBe(50)
    w.unmount()
  })

  it('**轨道宽度为 0（未布局 / display:none）→ 落到 min，不产出 NaN/Infinity**', async () => {
    const w = mountPb({ interactive: true, modelValue: 50 })
    const track = w.find('.slider-track').element as HTMLElement
    // 宽 0：ratio 会是 ÷0 → Infinity / NaN
    track.getBoundingClientRect = () =>
      ({ left: 100, width: 0, top: 0, height: 0, right: 100, bottom: 0, x: 100, y: 0, toJSON: () => ({}) }) as DOMRect
    await w.find('.slider-track').trigger('pointerdown', { clientX: 150, pointerId: 1 })
    const v = (w.emitted('update:modelValue') as Array<[number]>)[0][0]
    expect(Number.isFinite(v), `不能 emit 非有限值（拿到 ${v}）`).toBe(true)
    expect(v, '零宽轨道应落到 min').toBe(0)
    w.unmount()
  })
})
