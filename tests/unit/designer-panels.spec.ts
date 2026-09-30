// useDesignerPanels · 首开默认宽随视口收放（小屏画布优先）
// 曲线与 tokens.css 的 --vcl-scale 同源（100vw/1280px 纯连续等比，无固定段）：
// 面板若走自己的曲线，缩到一半时与面板内的字号/控件脱节。
// 基准 1280 = 全库设计基准（主受众笔记本与 IDE 内嵌面板）：1280 视口零变化、
// <1280 按比例收（桌面区间 ≥1024 仍 ≥0.8 观感正常）、>1280 按比例放。
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
  stubInnerWidth(1280)
})

afterEach(() => {
  if (realDescriptor) Object.defineProperty(window, 'innerWidth', realDescriptor)
})

describe('useDesignerPanels · 首开默认宽随视口收放', () => {
  it('1280 视口（设计基准）：与旧常数默认一致（220/190/290），零变化', () => {
    const api = mountPanels()
    expect(api.paletteW.value).toBe(220)
    expect(api.outlineW.value).toBe(190)
    expect(api.propsW.value).toBe(290)
  })

  it('1024 视口：纯等比收到 80%（面板收小，未触拖拽下限 150）', () => {
    stubInnerWidth(1024)
    const api = mountPanels()
    // 1024/1280 = 0.8：220→176、190→152、290→232
    expect(api.paletteW.value).toBe(176)
    expect(api.outlineW.value).toBe(152)
    expect(api.propsW.value).toBe(232)
  })

  it('1366 视口（常见小笔记本）：纯等比放到 106.7%', () => {
    stubInnerWidth(1366)
    const api = mountPanels()
    // 1366/1280 = 1.0672：220→234.8、190→202.8、290→309.5
    expect(api.paletteW.value).toBe(235)
    expect(api.outlineW.value).toBe(203)
    expect(api.propsW.value).toBe(309)
  })

  it('>1280 放大：1920 按 150% 等比放大（无封顶，与设计稿同构）', () => {
    stubInnerWidth(1920)
    const api = mountPanels()
    // 1920/1280 = 1.5：220→330、190→285、290→435
    expect(api.paletteW.value).toBe(330)
    expect(api.outlineW.value).toBe(285)
    expect(api.propsW.value).toBe(435)
  })

  it('存过布局：用户值优先，视口收放不覆盖', () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ paletteW: 300, propsW: 180 }))
    const api = mountPanels()
    expect(api.paletteW.value).toBe(300)
    expect(api.propsW.value).toBe(180)
  })

  it('存档损坏：回落视口等比默认（1280 基准 = 220/190/290）', () => {
    localStorage.setItem(STORE_KEY, '{broken json')
    const api = mountPanels()
    expect(api.paletteW.value).toBe(220)
    expect(api.outlineW.value).toBe(190)
    expect(api.propsW.value).toBe(290)
  })
})
