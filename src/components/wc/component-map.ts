/**
 * wc/component-map —— Custom Element 标签名 → Vue 组件的映射表（#468 从 wc/index.ts 拆出）
 *
 * 为什么单独成文件：标签名与组件的对应关系是**数据**，注册逻辑（含 SSR 兜底）是**行为**；
 * 两者混在一起让 wc 域最大文件只剩 6 行余量（116/122）。拆开后 index.ts 只负责注册。
 *
 * 表内存的是**原始组件**（构造器），不是 defineCustomElement 的结果 ——
 * 注册时才构造，避免模块加载期 eager 创建自定义元素。
 */
import { defineComponent, h } from 'vue'
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
export type WCComponent = Parameters<(typeof import('vue'))['defineCustomElement']>[0]

/**
 * 映射表值类型：Vue 3.4 下 WCComponent 解析为 Props = unknown 的 DefineComponent，
 * 真实 SFC 组件赋不进去（Vue 3.5 才放宽该约束）→ 表内只要求对象/函数，
 * 到 defineCustomElement 调用边界再用 asWC 收敛。
 */
export type MappedComponent = Record<string, unknown> | ((...args: never[]) => unknown)

/** 跨 Vue 版本收敛到 defineCustomElement 入参（3.5 解析为构造类型，须经 unknown 中转） */
export const asWC = (c: MappedComponent): WCComponent => c as unknown as WCComponent

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
export const componentMap: Record<string, MappedComponent> = {
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
