// useDesignerPanels · 首开默认宽随视口收放（小屏画布优先）
// 锁定：≤1024 收至拖拽下限 150、1920 与旧常数默认逐像素一致、>1920 按比例放大、
//       1366 常见小笔记本取 71.1% 等比档、存过布局的用户值优先、损坏存档回落收放默认。
// 曲线与 tokens.css 的 --vcl-scale 同源（100vw/1920px 纯连续等比，无固定段）：
// 面板若走自己的曲线，缩到一半时与面板内的字号/控件脱节。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ref, defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useDesignerPanels } from '@/components/form-builder/designer/useDesignerPanels'

/** 与 useDesignerPanels 的 PANEL_STORE_KEY 一致 */
const STORE_KEY = 'vcl-designer-panels'

/** 挂载宿主组件提供 setup 上下文（composable 里有 onUnmounted / watch） */
function mountPanels(): ReturnType<typeof useDesignerPanels> {
  const capture: Record<string, unknown> = {}
  const Host = defineComponent({
    setup() {
      Object.assign(capture, useDesignerPanels(ref<HTMLElement | null>(null)))
      return () => h('div')
    },
  })
  mount(Host)
  return capture as ReturnType<typeof useDesignerPanels>
}

/** happy-dom 的 innerWidth 可能是原型 getter：用可配置自有属性覆盖，测完还原 */
const realDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth')
function stubInnerWidth(w: number): void {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}

beforeEach(() => {
  localStorage.removeItem(STORE_KEY)
  stubInnerWidth(1920)
})

afterEach(() => {
  if (realDescriptor) Object.defineProperty(window, 'innerWidth', realDescriptor)
})

describe('useDesignerPanels · 首开默认宽随视口收放', () => {
  it('1024 视口：纯等比收到 53.3%，三面板全部触到拖拽下限 150', () => {
    stubInnerWidth(1024)
    const api = mountPanels()
    // 1024/1920 = 0.5333：220×0.5333=117.3、190×0.5333=101.3、290×0.5333=154.7
    expect(api.paletteW.value).toBe(150) // 117 < 下限 150 → 150
    expect(api.outlineW.value).toBe(150) // 101 < 下限 150 → 150
    expect(api.propsW.value).toBe(155) // 154.7 → 155
  })

  it('1920 视口：与旧常数默认一致（220/190/290），大屏零变化', () => {
    stubInnerWidth(1920)
    const api = mountPanels()
    expect(api.paletteW.value).toBe(220)
    expect(api.outlineW.value).toBe(190)
    expect(api.propsW.value).toBe(290)
  })

  it('>1920 放大：2560 按 133.3% 等比放大（无封顶，与设计稿同构）', () => {
    stubInnerWidth(2560)
    const api = mountPanels()
    // 2560/1920 = 1.3333
    expect(api.paletteW.value).toBe(293) // 220×1.3333=293.3 → 293
    expect(api.outlineW.value).toBe(253) // 190×1.3333=253.3 → 253
    expect(api.propsW.value).toBe(387) // 290×1.3333=386.7 → 387
  })

  it('1366 视口（常见小笔记本）：纯等比收到 71.1%', () => {
    stubInnerWidth(1366)
    const api = mountPanels()
    // 1366/1920 = 0.71146：220→156.5、190→135.2（触到下限 150）、290→206.3
    expect(api.paletteW.value).toBe(157) // 220×0.71146=156.5 → 157
    expect(api.outlineW.value).toBe(150) // 190×0.71146=135.2 < 下限 150 → 150
    expect(api.propsW.value).toBe(206) // 290×0.71146=206.3 → 206
  })

  it('存过布局：用户值优先，视口收放不覆盖', () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ paletteW: 300, propsW: 180 }))
    const api = mountPanels()
    expect(api.paletteW.value).toBe(300)
    expect(api.propsW.value).toBe(180)
  })

  it('存档损坏：回落视口等比默认（1920 基准 = 220）', () => {
    localStorage.setItem(STORE_KEY, '{broken json')
    const api = mountPanels()
    expect(api.paletteW.value).toBe(220)
  })
})
