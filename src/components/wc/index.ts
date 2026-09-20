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
 */

import { defineComponent, defineCustomElement, h } from 'vue'
import Button from '../basic/Button.vue'
import Input from '../form/Input.vue'
import Tag from '../basic/Tag.vue'
import Group from '../form/Group.vue'
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

/** defineCustomElement 接受的组件形态（公共 API defineWC 保持此严格签名） */
type WCComponent = Parameters<typeof defineCustomElement>[0]

/**
 * 映射表值类型：Vue 3.4 下 WCComponent 解析为 Props = unknown 的 DefineComponent，
 * 真实 SFC 组件赋不进去（Vue 3.5 才放宽该约束）→ 表内只要求对象/函数，
 * 到 defineCustomElement 调用边界再用 asWC 收敛。
 */
type MappedComponent = Record<string, unknown> | ((...args: never[]) => unknown)

/** 跨 Vue 版本收敛到 defineCustomElement 入参（3.5 解析为构造类型，须经 unknown 中转） */
const asWC = (c: MappedComponent): WCComponent => c as unknown as WCComponent

/** Group 是五合一组件（默认 type=radio）；作为 vc-switch 注册时默认锁定为开关形态 */
const Switch = defineComponent({
  name: 'VcSwitchElement',
  props: {
    ...(Group.props as WCComponent extends { props?: infer P } ? P : Record<string, never>),
    type: { ...((Group.props as Record<string, { default?: unknown }> | undefined)?.type ?? {}), default: 'switch' },
  },
  setup(rawProps) {
    const props = rawProps as { type?: string } & Record<string, unknown>
    // WC 桥接边界：attrs→props 透传的形状无法用 TS 精确表达，此处断言收敛
    return () => h(Group, { ...props, type: props.type ?? 'switch' } as never)
  },
})

/** 组件 → Custom Element 标签名映射（存原始组件，注册时才 defineCustomElement，避免模块加载期 eager 构造） */
const componentMap: Record<string, MappedComponent> = {
  'vc-button': Button,
  'vc-input': Input,
  'vc-tag': Tag,
  'vc-switch': Switch,
  'vc-toast': Toast,
  'vc-loading': Loading,
  'vc-pagination': Pagination,
  'vc-breadcrumb': Breadcrumb,
  'vc-steps': Steps,
  'vc-tabs': Tabs,
  'vc-progress-bar': ProgressBar,
  'vc-divider': Divider,
  'vc-empty': Empty,
  'vc-skeleton': Skeleton,
  'vc-result': Result,
}

/**
 * 注册所有支持的 Web Components
 * 可传入前缀自定义标签名，如 registerWebComponents('my') → <my-button>
 */
export function registerWebComponents(prefix = 'vc'): void {
  // SSR/Node 环境（自定义元素注册表不存在）：跳过并告警，不让库入口直接炸
  if (typeof customElements === 'undefined') {
    console.warn('[wc] 当前环境无 customElements（SSR/Node），跳过 Web Components 注册')
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
    console.warn('[wc] 当前环境无 customElements（SSR/Node），跳过注册:', name)
    return
  }
  if (!customElements.get(name)) {
    customElements.define(name, defineCustomElement(component))
  }
}

export { defineCustomElement }
