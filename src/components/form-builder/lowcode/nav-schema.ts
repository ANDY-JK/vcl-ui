/**
 * nav-schema —— 用户自建导航项的**配置契约与校验**（不可信输入的第一道闸）
 *
 * ## 为什么需要它（产品形态决定的）
 *
 * 宿主要的产品形态是：「只搭一个导航外壳 + 一个低代码入口，其余导航项由用户自建」。
 * 那么这份导航定义**不是源码，是数据** —— 可能来自后端下发，也可能来自用户在设计器里导出。
 * 数据是不可信输入，于是有两个都不能接受的极端：
 *
 *   · 「一个错字整站白屏」：未校验就交给渲染层，一个 `kind` 拼错就把外壳搞崩；
 *   · 「静默过滤掉坏的」：用户配了没生效、又不知道为什么 —— 比报错更难查。
 *
 * 所以本模块的产出是 **「可用项 + 问题清单」两样都给**，而不是"只返回好的"。
 * 这与 `display-data-source.ts` 的「不静默吞错」是同一条口径。
 *
 * ## 安全默认（都不依赖宿主记得）
 *
 * | 面 | 默认 | 理由 |
 * |---|---|---|
 * | `link.url` | 只允许 `http(s)://`、单斜杠站内路径、`#hash`、`./`/`../` | `javascript:` / `data:` 是 XSS 面；`//host` 协议相对写法是经典走私（静默升到别人域），一并拒 |
 * | `data.display`（api） | 过 `checkApiUrl`，**与提交/联动/展示类同一套策略** | 不给导航开新口子；被拒时**保留导航项**（用户能看到"数据地址被拒"而不是页签凭空消失） |
 * | `form.schema` | 只做「是不是对象」的形状判定，不解释内容 | 表单 schema 的解释权在 `FormBuilder`/`useFormSchema`，此处不重造 |
 * | 未知 `kind` | **丢弃该项**并记 issue | 渲染层没有对应的安全回落，留着一个渲染不出来的页签只会误导 |
 * | 嵌套深度 / 节点总数 | 2 层 / 200 项 | 外壳是单层菜单 + 分组；再深就不是"导航"而是树，且超大配置会拖垮渲染 |
 *
 * ## 明确不做
 *
 * - **不做权限判定**：`requiredPermission` 只透传给宿主，判定交给宿主的权限模型
 *   （与 `NavNode.requiredPermission` 的既有分工一致）。
 * - **不解析表单 schema 的内容**：只判形状，见上表。
 * - **不做 i18n**：用户自建导航项的文案是用户数据，不该进库的语言包。
 */
import { checkApiUrl, type ApiUrlPolicy } from '../api-url-guard'
import type { DisplayDataSource, DisplayDataKind } from '../display-data-source'

/** 导航项种类：分组本身不可选，其余四种都对应一个"页面" */
export type NavNodeKind = 'group' | 'form' | 'data' | 'link' | 'custom'

/** 全部导航项共有的字段 */
export interface NavNodeBase {
  /** 唯一键（稳定锚点；选中态与路由都以它为准） */
  key: string
  /** 显示名 */
  label: string
  /** 图标名（透传给宿主的导航组件；本库不解释） */
  icon?: string
  /** 所需权限（**只透传**，判定交宿主） */
  requiredPermission?: string
  /** 角标文案（如"新"/计数；透传） */
  badge?: string
}

/** 分组：只用来收拢子项，自身不可选 */
export interface NavGroupNode extends NavNodeBase {
  kind: 'group'
  children: NavNode[]
}

/** 表单页：`formId`（从 FormStore 取设计）或 `schema`（内联设计）二者之一 */
export interface NavFormNode extends NavNodeBase {
  kind: 'form'
  formId?: string
  /** 内联表单 schema。只判"是对象"，内容解释权在 FormBuilder */
  schema?: Record<string, unknown>
}

/** 数据页：三模式数据源（与展示类字段同一套 `DisplayDataSource`，不另造一套） */
export interface NavDataNode extends NavNodeBase {
  kind: 'data'
  display?: DisplayDataSource
  /** 列定义（透传给渲染层；本库不解释） */
  columns?: unknown[]
}

/** 外链页：URL 已过安全闸 */
export interface NavLinkNode extends NavNodeBase {
  kind: 'link'
  url: string
}

/** 自定义页：宿主用 `payload` 自己渲染（本库只搬运，不解释） */
export interface NavCustomNode extends NavNodeBase {
  kind: 'custom'
  payload?: unknown
}

export type NavNode = NavGroupNode | NavFormNode | NavDataNode | NavLinkNode | NavCustomNode

/** 问题代码（机器可判；文案给人看） */
export type NavSchemaIssueCode =
  | 'root-shape'
  | 'not-object'
  | 'missing-key'
  | 'duplicate-key'
  | 'missing-label'
  | 'unknown-kind'
  | 'group-empty'
  | 'missing-form-source'
  | 'missing-url'
  | 'unsafe-url'
  | 'display-rejected'
  | 'too-deep'
  | 'too-many'

/** 一条问题：`path` 是配置里的位置（如 `items[2].children[0]`），便于用户定位 */
export interface NavSchemaIssue {
  path: string
  code: NavSchemaIssueCode
  message: string
}

/** 校验结果：可用项 + 问题清单（**两样都给**，见文件头） */
export interface ParsedNavSchema {
  nodes: NavNode[]
  issues: NavSchemaIssue[]
}

/** 可选项 */
export interface ParseNavSchemaOptions {
  /** api 数据源的 URL 策略；不传 = 只允许同源（与提交/联动同一默认） */
  apiUrlPolicy?: ApiUrlPolicy
  /** 判定相对/绝对时用的 base（默认 `location.origin`；SSR 或测试可显式给） */
  base?: string
  /** 最大嵌套深度，默认 2（root=1 层，group 的子项=2 层） */
  maxDepth?: number
  /** 最大节点数（含分组），默认 200 */
  maxNodes?: number
}

const KINDS: readonly NavNodeKind[] = ['group', 'form', 'data', 'link', 'custom']
const DISPLAY_KINDS: readonly DisplayDataKind[] = ['static', 'field', 'api']

/** URL 是否安全（导航链接的口径，**与 checkApiUrl 语义不同**：外链是合法导航，接口默认只允许同源） */
export function isSafeNavUrl(raw: string): boolean {
  const url = raw.trim()
  if (!url) return false
  // 协议相对 `//host/path` 静默升到别人的域 → 拒（要么写全 https://，要么写站内 /path）
  if (url.startsWith('//')) return false
  if (url.startsWith('/') || url.startsWith('#') || url.startsWith('./') || url.startsWith('../')) return true
  // 只放行 http/https；javascript:/data:/vbscript:/file: 等一律拒
  return /^https?:\/\//i.test(url)
}

/** 是否为跨源链接（渲染层据此加 `rel="noopener"` / `target="_blank"` 防反向标签劫持） */
export function isExternalNavUrl(raw: string, base?: string): boolean {
  if (!/^https?:\/\//i.test(raw.trim())) return false
  const b = base ?? (typeof location !== 'undefined' ? location.origin : '')
  if (!b) return false // 拿不到 base 时不妄下结论，交给渲染层按保守策略处理
  try {
    return new URL(raw.trim()).origin !== new URL(b).origin
  } catch {
    return false
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * 校验并归一化用户自建的导航配置。
 *
 * 入参接受 `{ items: [...] }` 或裸数组（后端下发两种写法都常见）。
 * `nodes` 里只含**能安全渲染**的项；被拒的项在 `issues` 里逐条说明原因。
 */
export function parseNavSchema(raw: unknown, options: ParseNavSchemaOptions = {}): ParsedNavSchema {
  const maxDepth = options.maxDepth ?? 2
  const maxNodes = options.maxNodes ?? 200
  const issues: NavSchemaIssue[] = []
  const seen = new Set<string>()
  let count = 0

  const list = Array.isArray(raw) ? raw : isPlainObject(raw) ? raw.items : undefined
  if (!Array.isArray(list)) {
    issues.push({
      path: 'items',
      code: 'root-shape',
      message: '导航配置应形如 { items: [...] } 或直接是数组',
    })
    return { nodes: [], issues }
  }

  const walk = (arr: unknown[], path: string, depth: number): NavNode[] => {
    const out: NavNode[] = []
    for (const [i, entry] of arr.entries()) {
      const at = `${path}[${i}]`
      if (count >= maxNodes) {
        issues.push({ path: at, code: 'too-many', message: `导航项超过 ${maxNodes} 个上限，其余已忽略` })
        break
      }
      if (!isPlainObject(entry)) {
        issues.push({ path: at, code: 'not-object', message: '导航项应为对象' })
        continue
      }

      const key = typeof entry.key === 'string' ? entry.key.trim() : ''
      if (!key) {
        issues.push({ path: at, code: 'missing-key', message: '缺少 key（选中态与路由的稳定锚点）' })
        continue
      }
      if (seen.has(key)) {
        issues.push({ path: at, code: 'duplicate-key', message: `key "${key}" 重复，后者已忽略（选中态会错乱）` })
        continue
      }

      const kind = entry.kind
      if (typeof kind !== 'string' || !KINDS.includes(kind as NavNodeKind)) {
        issues.push({
          path: at,
          code: 'unknown-kind',
          message: `未知 kind "${String(kind)}"，可选：${KINDS.join(' / ')}`,
        })
        continue
      }

      let label = typeof entry.label === 'string' ? entry.label.trim() : ''
      if (!label) {
        issues.push({ path: at, code: 'missing-label', message: '缺少 label，暂用 key 展示' })
        label = key
      }

      seen.add(key)
      count++

      const base: NavNodeBase = { key, label }
      if (typeof entry.icon === 'string' && entry.icon) base.icon = entry.icon
      if (typeof entry.requiredPermission === 'string' && entry.requiredPermission) {
        base.requiredPermission = entry.requiredPermission
      }
      if (typeof entry.badge === 'string' && entry.badge) base.badge = entry.badge

      if (kind === 'group') {
        const children = entry.children
        if (!Array.isArray(children) || children.length === 0) {
          issues.push({ path: at, code: 'group-empty', message: '空分组是死菜单，已忽略该分组' })
          continue
        }
        if (depth + 1 > maxDepth) {
          issues.push({
            path: at,
            code: 'too-deep',
            message: `嵌套超过 ${maxDepth} 层，子项已忽略（再深就不该叫导航了）`,
          })
          continue
        }
        out.push({ ...base, kind: 'group', children: walk(children, `${at}.children`, depth + 1) })
        continue
      }

      if (kind === 'form') {
        const formId = typeof entry.formId === 'string' ? entry.formId.trim() : ''
        const schema = isPlainObject(entry.schema) ? entry.schema : undefined
        if (!formId && !schema) {
          issues.push({
            path: at,
            code: 'missing-form-source',
            message: '表单页需要 formId（从 FormStore 取）或 schema（内联设计）二者之一',
          })
          continue
        }
        out.push({ ...base, kind: 'form', ...(formId ? { formId } : {}), ...(schema ? { schema } : {}) })
        continue
      }

      if (kind === 'data') {
        const display = parseDisplay(entry.display, at, options, issues)
        const columns = Array.isArray(entry.columns) ? entry.columns : undefined
        out.push({ ...base, kind: 'data', ...(display ? { display } : {}), ...(columns ? { columns } : {}) })
        continue
      }

      if (kind === 'link') {
        const url = typeof entry.url === 'string' ? entry.url.trim() : ''
        if (!url) {
          issues.push({ path: at, code: 'missing-url', message: '外链页需要 url' })
          continue
        }
        if (!isSafeNavUrl(url)) {
          issues.push({
            path: at,
            code: 'unsafe-url',
            message: `不安全的链接地址 "${url}"（只允许 http(s):// 或站内相对路径）`,
          })
          continue
        }
        out.push({ ...base, kind: 'link', url })
        continue
      }

      // custom：宿主自己渲染，本库只搬运 payload
      out.push({ ...base, kind: 'custom', ...(entry.payload === undefined ? {} : { payload: entry.payload }) })
    }
    return out
  }

  return { nodes: walk(list, 'items', 1), issues }
}

/** 数据源解析：形状不对就**丢掉数据源但保留页签**（空白能解释，页签消失不能） */
function parseDisplay(
  raw: unknown,
  at: string,
  options: ParseNavSchemaOptions,
  issues: NavSchemaIssue[],
): DisplayDataSource | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isPlainObject(raw)) {
    issues.push({ path: `${at}.display`, code: 'display-rejected', message: 'display 应为对象，已忽略' })
    return undefined
  }
  const kind = raw.kind
  if (typeof kind !== 'string' || !DISPLAY_KINDS.includes(kind as DisplayDataKind)) {
    issues.push({
      path: `${at}.display`,
      code: 'display-rejected',
      message: `未知数据来源 kind "${String(kind)}"，可选：${DISPLAY_KINDS.join(' / ')}`,
    })
    return undefined
  }
  const display: DisplayDataSource = { kind: kind as DisplayDataKind }
  if (typeof raw.fieldKey === 'string' && raw.fieldKey) display.fieldKey = raw.fieldKey
  if (raw.staticData !== undefined) display.staticData = raw.staticData
  if (typeof raw.dataPath === 'string' && raw.dataPath) display.dataPath = raw.dataPath
  if (raw.method === 'GET' || raw.method === 'POST') display.method = raw.method
  if (raw.body !== undefined) display.body = raw.body

  if (kind === 'api') {
    const apiUrl = typeof raw.apiUrl === 'string' ? raw.apiUrl.trim() : ''
    display.apiUrl = apiUrl
    if (!apiUrl) {
      issues.push({ path: `${at}.display`, code: 'display-rejected', message: 'api 模式需要 apiUrl' })
      return display // 仍返回：页签在，运行时给出"未配置接口地址"
    }
    // 与提交/联动/展示类同一套策略 —— 不给导航开新口子
    const verdict = checkApiUrl(apiUrl, options.apiUrlPolicy ?? {}, options.base)
    if (!verdict.ok) {
      issues.push({
        path: `${at}.display`,
        code: 'display-rejected',
        message: `数据地址被安全策略拒绝：${verdict.reason}`,
      })
    }
  }
  return display
}

/**
 * 展平成"可选项"（去掉分组，按前序深度优先）——渲染层与键盘导航直接消费。
 * 选中态只可能落在这些项上：分组自身不可选。
 */
export function flattenNavNodes(nodes: readonly NavNode[]): NavNode[] {
  const out: NavNode[] = []
  for (const n of nodes) {
    if (n.kind === 'group') out.push(...flattenNavNodes(n.children))
    else out.push(n)
  }
  return out
}

/** 按 key 找项（含分组内部；key 全局唯一，所以找到即唯一） */
export function findNavNode(nodes: readonly NavNode[], key: string): NavNode | null {
  for (const n of nodes) {
    if (n.key === key) return n
    if (n.kind === 'group') {
      const hit = findNavNode(n.children, key)
      if (hit) return hit
    }
  }
  return null
}

/** 第一个可选项（用于"挂载即选中第一个"；全空时返回 null，外壳显示空态而不是假页签） */
export function firstSelectableNode(nodes: readonly NavNode[]): NavNode | null {
  return flattenNavNodes(nodes)[0] ?? null
}
