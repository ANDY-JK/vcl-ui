// useDesignerPanels · 首开默认宽随视口收放（小屏画布优先）
// 锁定：≤1024 收至 88% 地板、1920 与旧常数默认逐像素一致、>1920 封顶、
//       1366 常见小笔记本取中档、存过布局的用户值优先、损坏存档回落收放默认。
// 曲线与 tokens.css 的 --vcl-scale 同源（1024 → 0.88，1920 → 1）：
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
  stubInnerWidth(1024)
})

afterEach(() => {
  if (realDescriptor) Object.defineProperty(window, 'innerWidth', realDescriptor)
})

describe('useDesignerPanels · 首开默认宽随视口收放', () => {
  it('1024 视口：三面板收到 88% 地板（大纲不低于拖拽下限 150）', () => {
    const api = mountPanels()
    expect(api.paletteW.value).toBe(194) // 220×0.88=193.6 → 194
    expect(api.outlineW.value).toBe(167) // 190×0.88=167.2 → 167
    expect(api.propsW.value).toBe(255) // 290×0.88=255.2 → 255
  })

  it('1920 视口：与旧常数默认一致（220/190/290），大屏零变化', () => {
    stubInnerWidth(1920)
    const api = mountPanels()
    expect(api.paletteW.value).toBe(220)
    expect(api.outlineW.value).toBe(190)
    expect(api.propsW.value).toBe(290)
  })

  it('>1920 封顶：2560 与 1920 同值', () => {
    stubInnerWidth(2560)
    const api = mountPanels()
    expect(api.paletteW.value).toBe(220)
    expect(api.propsW.value).toBe(290)
  })

  it('1366 视口（常见小笔记本）：取 ~93.6% 中档', () => {
    stubInnerWidth(1366)
    const api = mountPanels()
    // fit = (1366-1024)/896 = 0.3817；scale = 0.88 + 0.12×0.3817 = 0.9258
    expect(api.paletteW.value).toBe(204) // 220×0.9258=203.7 → 204
    expect(api.outlineW.value).toBe(176) // 190×0.9258=175.9 → 176
    expect(api.propsW.value).toBe(268) // 290×0.9258=268.5 → 268（Math.round 半数进位）
  })

  it('存过布局：用户值优先，视口收放不覆盖', () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ paletteW: 300, propsW: 180 }))
    const api = mountPanels()
    expect(api.paletteW.value).toBe(300)
    expect(api.propsW.value).toBe(180)
  })

  it('存档损坏：回落视口收放默认', () => {
    localStorage.setItem(STORE_KEY, '{broken json')
    const api = mountPanels()
    expect(api.paletteW.value).toBe(194)
  })
})
