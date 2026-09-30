// useDesignerPanels · 首开默认宽随视口收放（小屏画布优先）
// 曲线与 tokens.css 的 --vcl-scale 同源（100vw/1440px 纯连续等比，无固定段）：
// 面板若走自己的曲线，缩到一半时与面板内的字号/控件脱节。
// 基准 1440 = 全库设计基准（主受众笔记本）：1440 视口零变化、<1440 按比例收、>1440 按比例放。
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
  stubInnerWidth(1440)
})

afterEach(() => {
  if (realDescriptor) Object.defineProperty(window, 'innerWidth', realDescriptor)
})

describe('useDesignerPanels · 首开默认宽随视口收放', () => {
  it('1440 视口（设计基准）：与旧常数默认一致（220/190/290），零变化', () => {
    const api = mountPanels()
    expect(api.paletteW.value).toBe(220)
    expect(api.outlineW.value).toBe(190)
    expect(api.propsW.value).toBe(290)
  })

  it('1024 视口：纯等比收到 71.1%（面板触到拖拽下限 150）', () => {
    stubInnerWidth(1024)
    const api = mountPanels()
    // 1024/1440 = 0.7111：220→156.4、190→135.1（触下限 150）、290→206.2
    expect(api.paletteW.value).toBe(156)
    expect(api.outlineW.value).toBe(150) // 135 < 下限 150 → 150
    expect(api.propsW.value).toBe(206)
  })

  it('1366 视口（常见小笔记本）：纯等比收到 94.9%', () => {
    stubInnerWidth(1366)
    const api = mountPanels()
    // 1366/1440 = 0.9486：220→208.7、190→180.2、290→275.1
    expect(api.paletteW.value).toBe(209)
    expect(api.outlineW.value).toBe(180)
    expect(api.propsW.value).toBe(275)
  })

  it('>1440 放大：1920 按 133.3% 等比放大（无封顶，与设计稿同构）', () => {
    stubInnerWidth(1920)
    const api = mountPanels()
    // 1920/1440 = 1.3333：220→293.3、190→253.3、290→386.7
    expect(api.paletteW.value).toBe(293)
    expect(api.outlineW.value).toBe(253)
    expect(api.propsW.value).toBe(387)
  })

  it('存过布局：用户值优先，视口收放不覆盖', () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ paletteW: 300, propsW: 180 }))
    const api = mountPanels()
    expect(api.paletteW.value).toBe(300)
    expect(api.propsW.value).toBe(180)
  })

  it('存档损坏：回落视口等比默认（1440 基准 = 220/190/290）', () => {
    localStorage.setItem(STORE_KEY, '{broken json')
    const api = mountPanels()
    expect(api.paletteW.value).toBe(220)
    expect(api.outlineW.value).toBe(190)
    expect(api.propsW.value).toBe(290)
  })
})
