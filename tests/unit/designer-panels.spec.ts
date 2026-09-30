// useDesignerPanels · 首开默认宽随视口收放（小屏画布优先）
// 曲线与 tokens.css 的 --vcl-scale 同源（100vw/1536px 纯连续等比，无固定段）：
// 面板若走自己的曲线，缩到一半时与面板内的字号/控件脱节。
// 基准 1536 = 全库设计基准（用户主屏 1912 观感定案，2026-09-30 晚）：
// 1536 视口零变化、<1536 按比例收、>1536 按比例放。
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
  stubInnerWidth(1536)
})

afterEach(() => {
  if (realDescriptor) Object.defineProperty(window, 'innerWidth', realDescriptor)
})

describe('useDesignerPanels · 首开默认宽随视口收放', () => {
  it('1536 视口（设计基准）：与旧常数默认一致（220/190/290），零变化', () => {
    const api = mountPanels()
    expect(api.paletteW.value).toBe(220)
    expect(api.outlineW.value).toBe(190)
    expect(api.propsW.value).toBe(290)
  })

  it('1024 视口：触窄端地板 0.75（palette 165，outline 触拖拽下限 150，props 218）', () => {
    stubInnerWidth(1024)
    const api = mountPanels()
    // 1024/1536 = 0.667 < 地板 0.75 → 按 0.75：220→165、190→142.5→143（触下限 150）、290→217.5→218
    expect(api.paletteW.value).toBe(165)
    expect(api.outlineW.value).toBe(150)
    expect(api.propsW.value).toBe(218)
  })

  it('768 视口：地板生效，与 1024 同为 0.75 档（不再缩成微缩模型）', () => {
    stubInnerWidth(768)
    const api = mountPanels()
    // 768/1536 = 0.5 → 地板 0.75：220→165、190→143（触下限 150）、290→217.5→218
    expect(api.paletteW.value).toBe(165)
    expect(api.outlineW.value).toBe(150)
    expect(api.propsW.value).toBe(218)
  })

  it('1366 视口（常见小笔记本）：纯等比收到 88.9%', () => {
    stubInnerWidth(1366)
    const api = mountPanels()
    // 1366/1536 = 0.8894：220→195.7→196、190→168.98→169、290→257.9→258
    expect(api.paletteW.value).toBe(196)
    expect(api.outlineW.value).toBe(169)
    expect(api.propsW.value).toBe(258)
  })

  it('>1536 放大：1920 按 125% 等比放大（无封顶，与设计稿同构）', () => {
    stubInnerWidth(1920)
    const api = mountPanels()
    // 1920/1536 = 1.25：220→275、190→237.5→238、290→362.5→363
    expect(api.paletteW.value).toBe(275)
    expect(api.outlineW.value).toBe(238)
    expect(api.propsW.value).toBe(363)
  })

  it('存过布局：用户值优先，视口收放不覆盖', () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ paletteW: 300, propsW: 180 }))
    const api = mountPanels()
    expect(api.paletteW.value).toBe(300)
    expect(api.propsW.value).toBe(180)
  })

  it('存档损坏：回落视口等比默认（1536 基准 = 220/190/290）', () => {
    localStorage.setItem(STORE_KEY, '{broken json')
    const api = mountPanels()
    expect(api.paletteW.value).toBe(220)
    expect(api.outlineW.value).toBe(190)
    expect(api.propsW.value).toBe(290)
  })
})
