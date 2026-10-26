/**
 * 容器渲染辅助（tabs / collapse / steps 共用）— 拆分自 FormBuilder（超 800 行约束整改）
 *
 * 这里只放**纯函数**（不碰响应式），所以能单独测、也能被 FormBuilder 以外的地方复用。
 * 与 `useFormSteps`（steps 布局的整体步进）不是一回事：那个管布局级步骤，
 * 这里管「单个容器节点内部」的激活项与槽位裁剪。
 */
import type { FormField } from './types'

/** tabs 里的单个页签定义（只需 name，其余字段透传） */
export interface TabLike {
  name: string
}

/**
 * 解析 tabs 容器当前应激活的页签名。
 *
 * ⚠️ 必须校验存的名字**是否还在列表里**。失效路径有两条，都会让容器正文整块空白：
 * ① 设计器「标签页」文本框按下标重生成 `name`（`'tab'+(i+1)`）—— 删掉中间一行，后面的 name 全部前移；
 * ② 外部直接改 schema / 重新导入模板换掉了 name。
 * 失效后 `fieldsInTab` 的 `findIndex` 得到 -1，`slot === -1` 永远不成立 → 一个字段都不渲染，
 * 而页签栏高亮的仍是那个已不存在的页（用户看到"有页签、没内容"）。
 *
 * @param tabs 容器定义的页签列表
 * @param stored 运行时记住的激活页签名（可能已失效）
 * @returns 仍然有效的激活名；失效或未设置时回落第一个；列表为空时返回空串
 */
export function resolveActiveTab(tabs: readonly TabLike[], stored: string | undefined): string {
  if (stored !== undefined && tabs.some((t) => t.name === stored)) return stored
  return tabs[0]?.name ?? ''
}

/** 折叠项（只需 expanded，判断"用户是否手动切换过"） */
export interface CollapsibleLike {
  expanded?: boolean
}

/**
 * 解析 collapse 容器某折叠项是否展开：用户手动开合过就用记住的状态，否则用定义里的默认值。
 * @param items 折叠项定义
 * @param index 折叠项下标
 * @param stored 运行时记住的展开状态（undefined = 用户没碰过）
 */
export function resolveCollapsed(
  items: readonly CollapsibleLike[],
  index: number,
  stored: boolean | undefined,
): boolean {
  if (stored !== undefined) return stored
  return items[index]?.expanded ?? false
}

/**
 * 按容器槽位裁剪字段：字段的 `container.slot` 就是它属于第几个页签/折叠项/步骤。
 *
 * tabs / collapse / steps 三种容器的槽位语义完全相同，因此共用这一个函数
 * （此前 `fieldsInCollapse` / `fieldsInStep` 是两份逐字重复的实现，改一处忘另一处）。
 */
export function fieldsInSlot(fields: readonly FormField[], index: number): FormField[] {
  return fields.filter((f) => (f.container?.slot ?? 0) === index)
}
