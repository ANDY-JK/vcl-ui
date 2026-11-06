import { reportWarn } from '@/components/_internal/runtime-observer'
// 设计令牌必须先于本域组件样式（Q3 域级 CSS 自包含；与主入口 index.ts 同口径）
import '../tokens.css'
/**
 * Web Components 封装 — 将 Vue 组件注册为 Custom Elements
 *
 * 使用 Vue 3 原生 defineCustomElement（无需 @vue/web-component-wrapper），
 * 支持在 React/Angular/原生 HTML 中使用 Vue 组件库。
 *
 * 用法：
 *   import { registerWebComponents } from 'vcl-ui/wc'
 *   registerWebComponents()  // 注册所有组件为 Custom Elements
 *
 *   <!-- 在任意框架/HTML 中使用 -->
 *   <vc-button type="primary">按钮</vc-button>
 *   <vc-input placeholder="请输入"></vc-input>
 *
 * 注意：
 *   1. Shadow DOM 模式下样式隔离，需手动注入全局 CSS
 *   2. 属性传递仅支持字符串/数字/布尔值，复杂对象用 JSON 字符串
 *   3. 事件监听用 addEventListener('click', ...) 而非 @click
 *
 * 标签名 → 组件的映射表在 `./component-map`（#468 拆出，注册逻辑与数据分离）。
 */

import { defineCustomElement } from 'vue'
import { asWC, componentMap } from './component-map'

/**
 * 注册所有支持的 Web Components
 * 可传入前缀自定义标签名，如 registerWebComponents('my') → <my-button>
 */
export function registerWebComponents(prefix = 'vc'): void {
  // SSR/Node 环境（自定义元素注册表不存在）：跳过并告警，不让库入口直接炸
  if (typeof customElements === 'undefined') {
    reportWarn('[wc] 当前环境无 customElements（SSR/Node），跳过 Web Components 注册')
    return
  }
  for (const [tagName, component] of Object.entries(componentMap)) {
    const customName = tagName.replace(/^vc-/, `${prefix}-`)
    if (!customElements.get(customName)) {
      customElements.define(customName, defineCustomElement(asWC(component)))
    }
  }
}

/** 单独注册一个组件为 Custom Element */
export function defineWC(name: string, component: Parameters<typeof defineCustomElement>[0]): void {
  if (typeof customElements === 'undefined') {
    reportWarn('[wc] 当前环境无 customElements（SSR/Node），跳过注册:', name)
    return
  }
  if (!customElements.get(name)) {
    customElements.define(name, defineCustomElement(component))
  }
}

export { defineCustomElement }
