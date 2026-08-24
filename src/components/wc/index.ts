/**
 * Web Components 封装 — 将 Vue 组件注册为 Custom Elements
 *
 * 使用 Vue 3 原生 defineCustomElement（无需 @vue/web-component-wrapper），
 * 支持在 React/Angular/原生 HTML 中使用 Vue 组件库。
 *
 * 用法：
 *   import { registerWebComponents } from 'vue-component-lib/wc'
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
 */

import { defineCustomElement } from 'vue'
import Button from '../basic/Button.vue'
import Input from '../form/Input.vue'
import Tag from '../basic/Tag.vue'
import Switch from '../form/Group.vue'
import Toast from '../feedback/Toast.vue'
import Loading from '../feedback/Loading.vue'
import Pagination from '../nav/Pagination.vue'
import Breadcrumb from '../nav/Breadcrumb.vue'
import Steps from '../nav/Steps.vue'
import Tabs from '../nav/Tabs.vue'
import ProgressBar from '../data/ProgressBar.vue'
import Divider from '../data/Divider.vue'
import Empty from '../data/Empty.vue'
import Skeleton from '../data/Skeleton.vue'
import Result from '../feedback/Result.vue'

/** 组件 → Custom Element 标签名映射 */
const componentMap: Record<string, ReturnType<typeof defineCustomElement>> = {
  'vc-button': defineCustomElement(Button),
  'vc-input': defineCustomElement(Input),
  'vc-tag': defineCustomElement(Tag),
  'vc-switch': defineCustomElement(Switch),
  'vc-toast': defineCustomElement(Toast),
  'vc-loading': defineCustomElement(Loading),
  'vc-pagination': defineCustomElement(Pagination),
  'vc-breadcrumb': defineCustomElement(Breadcrumb),
  'vc-steps': defineCustomElement(Steps),
  'vc-tabs': defineCustomElement(Tabs),
  'vc-progress-bar': defineCustomElement(ProgressBar),
  'vc-divider': defineCustomElement(Divider),
  'vc-empty': defineCustomElement(Empty),
  'vc-skeleton': defineCustomElement(Skeleton),
  'vc-result': defineCustomElement(Result),
}

/**
 * 注册所有支持的 Web Components
 * 可传入前缀自定义标签名，如 registerWebComponents('my') → <my-button>
 */
export function registerWebComponents(prefix = 'vc'): void {
  for (const [tagName, element] of Object.entries(componentMap)) {
    const customName = tagName.replace(/^vc-/, `${prefix}-`)
    if (!customElements.get(customName)) {
      customElements.define(customName, element)
    }
  }
}

/** 单独注册一个组件为 Custom Element */
export function defineWC(name: string, component: Parameters<typeof defineCustomElement>[0]): void {
  if (!customElements.get(name)) {
    customElements.define(name, defineCustomElement(component))
  }
}

export { defineCustomElement }
