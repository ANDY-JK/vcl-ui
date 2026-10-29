/**
 * `useDesignerPanels` · 拖拽调宽与持久化（第 164 轮）
 *
 * 为什么补这个文件：覆盖率实测 `useDesignerPanels.ts` 是全库语句+分支最差的一个
 * （语句 59% / 分支 47.8%），**`startResize` 整段（L120-140）、`togglePanel`（L142-147）、
 * `persistPanels` 的写入分支一条都没被执行过**。它是设计器"拖分隔条调面板宽度"的唯一实现，
 * 而这类代码的经典缺陷是：**window 级监听在拖拽中途被遗弃**（组件卸载、或用户又按下另一根分隔条）。
 *
 * 本文件锁四件事：
 *   ① 拖拽语义：左右方向、clamp 上下限、实时更新、松手后落盘；
 *   ② 松手必须解绑 window 监听（否则"幽灵拖拽"——松手后鼠标一动面板还在变宽）；
 *   ③ 重复拖拽不得叠加监听（第一根没松手就按下第二根）；
 *   ④ 卸载时必须解绑（设计器切走/关闭后，残留监听会继续改已卸载组件的状态）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import FormDesigner from '@/components/form-builder/FormDesigner.vue'
import { nextTick } from 'vue'
import { useDesignerPanels } from '@/components/form-builder/designer/useDesignerPanels'

const KEY = 'vcl-designer-panels'

/** 造一个 mousedown 事件（只需 clientX + preventDefault） */
function mouseDownAt(clientX: number): MouseEvent {
  const e = new MouseEvent('mousedown', { clientX, bubbles: true, cancelable: true })
  return e
}

function moveTo(clientX: number) {
  window.dispatchEvent(new MouseEvent('mousemove', { clientX, bubbles: true }))
}
function upAt(clientX: number) {
  window.dispatchEvent(new MouseEvent('mouseup', { clientX, bubbles: true }))
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  localStorage.clear()
})

describe('useDesignerPanels · 拖拽调宽语义', () => {
  it('palette 向右拖变宽、向左拖变窄（dir=+1）', () => {
    const p = useDesignerPanels()
    const start = p.paletteW.value
    p.startResize('palette', mouseDownAt(100))

    moveTo(150) // 右移 50
    expect(p.paletteW.value).toBe(start + 50)

    // 相对起点左移 20（避免撞 150 下限：happy-dom 视口下默认宽约 165）
    moveTo(80)
    expect(p.paletteW.value).toBe(Math.max(150, start - 20))

    upAt(60)
    expect(p.resizing.value, '松手后必须退出拖拽态').toBeNull()
  })

  it('props 面板在右侧：向左拖才变宽（dir=-1）', () => {
    const p = useDesignerPanels()
    const start = p.propsW.value
    p.startResize('props', mouseDownAt(500))

    moveTo(450) // 左移 50 → 变宽
    expect(p.propsW.value).toBe(start + 50)

    moveTo(560) // 右移 60 → 变窄
    expect(p.propsW.value).toBe(start - 60)

    upAt(560)
  })

  it('拖出上下限时被夹紧（150..420），不会把画布挤没或窄到放不下内容', () => {
    const p = useDesignerPanels()
    p.startResize('palette', mouseDownAt(100))

    moveTo(-5000) // 疯狂左拖
    expect(p.paletteW.value, '下限 150').toBe(150)

    moveTo(5000) // 疯狂右拖
    expect(p.paletteW.value, '上限 420').toBe(420)

    upAt(5000)
  })

  it('拖拽期间 resizing 标明是哪一根；松手后清空', () => {
    const p = useDesignerPanels()
    expect(p.resizing.value).toBeNull()
    p.startResize('outline', mouseDownAt(0))
    expect(p.resizing.value).toBe('outline')
    upAt(0)
    expect(p.resizing.value).toBeNull()
  })

  it('mousedown 必须 preventDefault（否则拖拽会连带选中文本/触发原生拖影）', () => {
    const p = useDesignerPanels()
    const e = mouseDownAt(100)
    const spy = vi.spyOn(e, 'preventDefault')
    p.startResize('palette', e)
    expect(spy).toHaveBeenCalled()
    upAt(100)
  })

  it('松手后把布局落盘（下次打开能记住）', () => {
    const p = useDesignerPanels()
    p.startResize('palette', mouseDownAt(100))
    moveTo(160)
    upAt(160)

    const raw = localStorage.getItem(KEY)
    expect(raw, '松手应持久化').toBeTruthy()
    expect(JSON.parse(raw!).paletteW).toBe(p.paletteW.value)
  })
})

describe('useDesignerPanels · window 监听不得泄漏', () => {
  it('松手后 window 上的监听已解绑（松手再移动鼠标不得继续改宽）', () => {
    const p = useDesignerPanels()
    p.startResize('palette', mouseDownAt(100))
    moveTo(150)
    upAt(150)
    const w1 = p.paletteW.value

    moveTo(9999) // 松手后的"幽灵"移动
    expect(p.paletteW.value, '松手后鼠标移动不该再改宽（幽灵拖拽）').toBe(w1)
  })

  it('拖拽中途再按下另一根分隔条：不得叠加监听（松一次手就要全部停下）', () => {
    const p = useDesignerPanels()
    p.startResize('palette', mouseDownAt(100)) // 第一根没松手
    moveTo(140)
    const afterFirst = p.paletteW.value

    p.startResize('outline', mouseDownAt(200)) // 又按下第二根
    moveTo(260) // 相对第二根起点 +60
    const outlineAfter = p.outlineW.value

    upAt(260) // 松一次手

    // 松手后：两根都不应再跟着鼠标走
    moveTo(1000)
    expect(p.outlineW.value, 'outline 松手后仍在动 → 监听叠加').toBe(outlineAfter)
    expect(p.paletteW.value, 'palette 松手后仍在动 → 旧监听未解绑').toBe(afterFirst)
    expect(p.resizing.value, '松手后不该还有拖拽态').toBeNull()
  })

  it('**卸载后必须解绑**：拖拽中途组件消失，残留监听不得继续写状态', () => {
    const p = useDesignerPanels()
    p.startResize('palette', mouseDownAt(100))
    moveTo(140)
    const frozen = p.paletteW.value

    // 模拟组件卸载：若 hook 内部没有解绑，监听仍挂在 window 上
    p.stopResize()

    moveTo(9999)
    expect(p.paletteW.value, '组件已卸载，残留监听仍在改状态').toBe(frozen)
    expect(p.resizing.value, '卸载后不该还是拖拽态').toBeNull()
  })
})

describe('useDesignerPanels · togglePanel 显隐与落盘', () => {
  it('三根面板各自独立切换，且每次切换都落盘', () => {
    const p = useDesignerPanels()
    expect([p.showPalette.value, p.showOutline.value, p.showProps.value]).toEqual([true, true, true])

    p.togglePanel('palette')
    expect(p.showPalette.value).toBe(false)
    expect(p.showOutline.value, '只切 palette，别的不受影响').toBe(true)

    p.togglePanel('outline')
    p.togglePanel('props')
    expect([p.showPalette.value, p.showOutline.value, p.showProps.value]).toEqual([false, false, false])

    const saved = JSON.parse(localStorage.getItem(KEY)!)
    expect([saved.showPalette, saved.showOutline, saved.showProps]).toEqual([false, false, false])
  })

  it('切回来恢复显示（不是单向关闭）', () => {
    const p = useDesignerPanels()
    p.togglePanel('props')
    p.togglePanel('props')
    expect(p.showProps.value).toBe(true)
  })
})

describe('useDesignerPanels · restorePanels 逐字段还原', () => {
  it('存档里的每个字段都独立生效（缺字段时保留默认，不整体丢弃）', () => {
    localStorage.setItem(KEY, JSON.stringify({ paletteW: 300, showProps: false }))
    const p = useDesignerPanels()

    expect(p.paletteW.value, '存过的宽度生效').toBe(300)
    expect(p.showProps.value, '存过的显隐生效').toBe(false)
    expect(p.outlineW.value, '没存过的字段保留默认（不是变 0）').toBeGreaterThanOrEqual(150)
    expect(p.showOutline.value, '没存过的字段保留默认 true').toBe(true)
  })

  it('存档里的宽度越界 → 夹进 150..420', () => {
    localStorage.setItem(KEY, JSON.stringify({ paletteW: 10, outlineW: 9999, propsW: 250 }))
    const p = useDesignerPanels()
    expect(p.paletteW.value).toBe(150)
    expect(p.outlineW.value).toBe(420)
    expect(p.propsW.value).toBe(250)
  })

  it('存档类型不对（字符串/NaN）→ 忽略该字段，不污染状态', () => {
    localStorage.setItem(KEY, JSON.stringify({ paletteW: '300', showProps: 'false', propsW: 200 }))
    const p = useDesignerPanels()
    expect(typeof p.paletteW.value, '字符串宽度不该被采用').toBe('number')
    expect(p.showProps.value, '字符串 false 不该被当 false').toBe(true)
    expect(p.propsW.value, '合法字段照常生效').toBe(200)
  })
})

describe('FormDesigner · 卸载时解绑拖拽监听（接线验证）', () => {
  it('拖拽中途卸载设计器 → 它加的 mousemove/mouseup 监听必须全部被解绑', async () => {
    // 直接追踪 window 监听：只断言"卸载后没残留"，不依赖 localStorage 这类间接信号
    const added = new Set<EventListenerOrEventListenerObject>()
    const removed = new Set<EventListenerOrEventListenerObject>()
    const origAdd = window.addEventListener.bind(window)
    const origRemove = window.removeEventListener.bind(window)
    const track = ['mousemove', 'mouseup']

    vi.spyOn(window, 'addEventListener').mockImplementation((type, fn, opts) => {
      if (track.includes(type)) added.add(fn as EventListenerOrEventListenerObject)
      return origAdd(type, fn, opts)
    })
    vi.spyOn(window, 'removeEventListener').mockImplementation((type, fn, opts) => {
      if (track.includes(type)) removed.add(fn as EventListenerOrEventListenerObject)
      return origRemove(type, fn, opts)
    })

    const w = mount(FormDesigner, {
      props: { modelValue: { fields: [], layout: 'vertical' } },
      global: { stubs: { teleport: true } },
    })
    await nextTick()

    const divider = w.find('.ld-splitter--palette')
    expect(divider.exists(), '未找到 .ld-splitter--palette（模板结构变了，本用例需随之更新）').toBe(true)

    await divider.trigger('mousedown', { clientX: 100 })
    expect(added.size, '前置：按下分隔条应挂上 window 监听').toBeGreaterThan(0)

    // 拖拽中途卸载（设计器被切走/关闭）
    w.unmount()

    const leaked = [...added].filter((fn) => !removed.has(fn))
    expect(leaked.length, `卸载后仍有 ${leaked.length} 个 window 监听未解绑`).toBe(0)
  })
})
