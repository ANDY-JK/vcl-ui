/**
 * page-resolver —— 「表单页要渲染什么」的唯一接缝（设计数据 → 渲染 schema）
 *
 * ## 为什么单独立一层
 *
 * 导航项上的 `form` 页有两种来源：**内联 schema**（配置自带）与 **`formId`**（用户在设计器里
 * 存的表单）。后者要经过一条容易搞错的链：
 *
 *   `FormStore.loadForm(id)` → `FormDesign`（**设计器节点树** `nodes: DesignerNode[]`）
 *   → `toFormSchema(design.nodes, design.meta)` → `FormSchema`（**渲染器 schema** `fields: FormField[]`）
 *   → `<FormBuilder :schema>`
 *
 * 这两套结构名字很像但不是一回事（`nodes` vs `fields`），漏了转换就会把设计树直接喂给渲染器 ——
 * 后果是**画布上有的字段一个都不显示**（不报错，只是空表单），属于最难查的那类问题。
 * 所以转换只放在这里一处，并有专门的测试钉住 `nodes → fields` 这一步确实发生过。
 *
 * ## 语义
 *
 * - 解析器**只负责"拿到能渲染的 schema"**，不渲染、不取数、不提交。
 * - 拿不到时返回 `{ status: 'missing', reason }` 而不是抛错：**"表单被删了"是正常业务态**
 *   （用户在设计器里删掉表单，导航项还在直到下次刷新），该显示空态而不是错误态。
 * - 真正的基础设施故障（网络/存储抛错）**照常往上抛**，由外壳区分成错误态并可重试。
 * - 形状不对（`fields` 不是数组）判为 `missing` 并说明原因：**不把可疑数据交给渲染器**，
 *   否则错误会以"渲染器内部崩溃"的形式出现，怪不到配置头上。
 */
import { getActiveFormStore, type FormStore } from '../designer/store'
import { migrateFieldsToNodes, toFormSchema, type FormDesign } from '../designer/types'
import type { FormSchema } from '../types'
import type { NavFormNode } from './nav-schema'

/** 表单页解析结果：`ready` 有可渲染 schema；`missing` 是正常业务态（空态 + 原因） */
export type FormPageOutcome = { status: 'ready'; schema: FormSchema } | { status: 'missing'; reason: string }

/** 表单页解析器（可注入：测试用假实现，宿主也可换成自己后端的取数逻辑） */
export type FormPageResolver = (node: NavFormNode) => Promise<FormPageOutcome>

/** 这份 schema 能不能交给渲染器（只判最小形状：`fields` 必须是数组） */
export function isRenderableSchema(v: unknown): v is FormSchema {
  return typeof v === 'object' && v !== null && Array.isArray((v as { fields?: unknown }).fields)
}

/**
 * 收口：**形状**与**内容**两道分开判，且原因不同 —— 二者混在一起会让"设计空了"伪装成成功。
 *
 * - 形状不对（`fields` 不是数组）：可疑数据不进渲染器，否则错误以"渲染器内部崩溃"的形式出现；
 * - 形状对但没有字段：**空态**（去设计器里加字段），不是 `ready` —— 否则外壳会给出一个
 *   只有提交按钮的空页面，看上去像"渲染成功"。
 */
function finish(schema: unknown, source: string): FormPageOutcome {
  if (!isRenderableSchema(schema)) return { status: 'missing', reason: `${source} 缺少 fields 数组，无法渲染` }
  if (schema.fields.length === 0) {
    return { status: 'missing', reason: `${source} 没有可渲染字段（去设计器里加一个）` }
  }
  return { status: 'ready', schema }
}

/** 设计数据 → 渲染 schema；v2 legacy（只有 `fields`）也兼容（宿主后端可能还没迁移） */
export function designToSchema(design: FormDesign): FormSchema {
  const nodes =
    Array.isArray(design.nodes) && design.nodes.length ? design.nodes : migrateFieldsToNodes(design.fields ?? [])
  return toFormSchema(nodes, design.meta)
}

/**
 * 默认解析器：内联 schema 直接用；`formId` 走 FormStore（不传则用宿主注入的活动实例）。
 *
 * 抛错语义：`loadForm` 抛错 → **原样往上抛**（外壳转成错误态 + 可重试）；
 * 返回 `null` → `missing`（表单不存在，空态）。
 */
export function createFormPageResolver(store?: FormStore): FormPageResolver {
  return async (node) => {
    if (node.schema) return finish(node.schema, '内联 schema')
    const formId = node.formId
    if (!formId) return { status: 'missing', reason: '该表单页既没有 formId 也没有内联 schema' }
    const s = store ?? getActiveFormStore()
    const design = await s.loadForm(formId) // 抛错原样上抛：外壳转错误态 + 可重试
    if (!design) return { status: 'missing', reason: `找不到表单 ${formId}（可能已被删除）` }
    return finish(designToSchema(design), `表单 ${formId} 的设计数据`)
  }
}
