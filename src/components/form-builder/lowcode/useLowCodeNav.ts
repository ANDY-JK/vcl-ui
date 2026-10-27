/**
 * useLowCodeNav —— 导航外壳的**状态层**：把「用户自建的导航定义」变成可渲染的导航 + 选中态
 *
 * ## 与已有模块的分工（不重造）
 *
 * | 能力 | 已有落点 | 本模块怎么用 |
 * |---|---|---|
 * | 配置校验（不可信输入） | `nav-schema.ts` | 直接调 `parseNavSchema`，不重复实现规则 |
 * | 表单 → 导航项 | `useFormNav` / `buildFormNavItems` | `forms` 模式委托给它，不重写映射 |
 * | 数据页取数（三模式） | `display-data-source.ts` | 页面渲染层消费，本层不取数 |
 * | 外发 URL 安全 | `api-url-guard.ts` | api 模式导航定义走同一套策略 |
 *
 * ## 三种导航定义来源（`NavSource`）
 *
 * - `static`：配置内置（演示、写死菜单、宿主自己算出来的数组）
 * - `api`：从用户后端拉导航定义（`checkApiUrl` 把关，默认只允许同源）
 * - `forms`：**由用户在低代码入口里建的表单自动派生** —— 这正是"宿主只搭框架、
 *   用户自建导航项"的主路径：加一个表单就多一个导航项，不必宿主改代码
 *
 * **为什么不设 `field` 模式**：展示类的 `field` 模式是"绑到表单某个字段的当前值"，
 * 导航定义不属于表单字段（导航是外壳层，不在任何表单里）。宿主要用自己 state 算导航，
 * 走 `static` 传 getter/数组即可，语义更清楚、不必造一个用不上的模式。
 *
 * ## 两处易错点（已按此实现并测）
 *
 * 1. **选中态不能悬空**：`refresh()` 后原来的选中 key 可能已不存在（用户删了那个导航项）。
 *    此时必须把选中态收敛（回落第一个可选项或置空），否则外壳会渲染一个指向不存在项的页面。
 * 2. **迟到结果不得覆盖新结果**：api 模式下连续 refresh / 卸载后到达的响应一律丢弃（token 序号），
 *    与 `useDisplayData` 的竞态处理同款 —— 否则快速切换数据源会看到旧导航闪回。
 */
import { computed, onMounted, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue'
import { checkApiUrl, type ApiUrlPolicy } from '../api-url-guard'
import { extractByPath } from '../display-data-source'
import { useFormNav } from '../useFormNav'
import type { FormStore } from '../designer/store'
import {
  findNavNode,
  firstSelectableNode,
  flattenNavNodes,
  parseNavSchema,
  type NavNode,
  type NavSchemaIssue,
} from './nav-schema'

/** 导航定义的来源（三选一，见文件头"为什么不设 field 模式"） */
export type NavSource =
  | { kind: 'static'; nodes: unknown }
  | { kind: 'api'; url: string; method?: 'GET' | 'POST'; dataPath?: string; body?: unknown }
  | {
      kind: 'forms'
      /**
       * 图标名或按表单计算的函数（`FormNavItem.icon` 的同名能力，透传到导航项）。
       *
       * **这里没有 `basePath`**：`useFormNav` 的 `basePath`/`toPath` 只影响它产出的
       * `path` 建议值，而本层刻意不承载 `path`（路由约定属于宿主，本层只给 `key`/`formId`）。
       * 曾经收过这个参数 —— 负向对照证明它**没有任何可观测效果**（传与不传，导航项逐字相同），
       * 于是删掉，不留"配了等于没配"的选项。
       */
      icon?: string | ((form: { id: string; name: string }) => string | undefined)
    }

/** 可选项 */
/** 选中态被收敛的原因：key 不存在 / 指向分组 / 按配置置空 */
export type SelectionAdjustReason = 'not-found' | 'group' | 'none'

/** 选中态收敛回执（宿主据此修正自己存的"上次访问页"） */
export interface SelectionAdjustPayload {
  /** 收敛前的 key（一定非空） */
  from: string
  /** 收敛后的 key；`null` 表示没有可选项 */
  to: string | null
  reason: SelectionAdjustReason
}

export interface UseLowCodeNavOptions {
  /**
   * 选中态被**收敛**时回调（第 144 轮）。
   *
   * 为什么需要：`settleSelection()` 会把悬空/指向分组的 key 改掉，而宿主的 `v-model`
   * 往往存在 localStorage / 服务端 —— 静默改写等于篡改宿主状态，用户下次打开还在错页，
   * 排查时也没有任何痕迹。低代码的主路径是"用户自建导航项"，删项/改 key 是常态。
   */
  onSelectionAdjust?: (payload: SelectionAdjustPayload) => void
  /** 导航定义来源；不传 = 空导航（外壳显示空态，不报错） */
  source?: NavSource | (() => NavSource | undefined)
  /** 外发 URL 策略（api 模式用）；不传 = 只允许同源 */
  apiUrlPolicy?: () => ApiUrlPolicy
  /** 注入 fetch（测试/宿主自定义） */
  fetcher?: typeof fetch
  /** 权限过滤：返回 false 的项不进导航（判定交宿主，本层只调） */
  filter?: (node: NavNode) => boolean
  /**
   * 受控选中：宿主把自己那枚 ref 的**所有权交给本层**，本层会直接写它
   * （不做 `update:modelValue` 回环 —— 单一真源，避免"两边都写"的同步 bug）。
   * 不传则本层自持；两种情况下 `selectedKey` 都指向同一枚 ref。
   */
  modelValue?: Ref<string | null>
  /** 选中变化通知（**只通知**：本层不碰宿主的路由/数据，改什么由宿主决定） */
  onSelect?: (node: NavNode) => void
  /** 是否在挂载时自动加载，默认 true */
  autoLoad?: boolean
  /** 加载后若无可选项是否自动选中第一个，默认 true */
  autoSelect?: boolean
  /**
   * `forms` 模式的数据源（不传则用 `getActiveFormStore()`）。
   *
   * 支持**函数形态**（与 `source` 同款）：宿主可能在中途换实现 —— 登录后从匿名后端换成
   * 带令牌的后端、或从内存实现切到 REST 实现。传常量就是把当时那一份**定格**了，
   * `refresh()` 只会拿旧 store 重取一遍（表现为"切了实现但导航没变"，还不报错）。
   */
  formStore?: FormStore | (() => FormStore | undefined)
}

/** 返回值 */
export interface UseLowCodeNavResult {
  /** 校验通过的导航树（含分组；渲染用） */
  nodes: Ref<NavNode[]>
  /** 展平后的可选项（键盘/索引导航用；分组不在其中） */
  leaves: ComputedRef<NavNode[]>
  /** 配置问题清单（**不静默吞错**：配了没生效必须能说清为什么） */
  issues: Ref<NavSchemaIssue[]>
  /** 是否正在加载（api / forms 模式会真） */
  loading: Ref<boolean>
  /** 加载失败原因；成功为 null。失败时 `nodes` **保留上一次的值**（导航不因一次抖动消失） */
  error: Ref<string | null>
  /** 当前选中的 key（受控时就是宿主交出的那枚 ref，本层会写它 —— 见 `modelValue` 说明） */
  selectedKey: Ref<string | null>
  /** 当前选中项（已校验存在；悬空时自动收敛为 null） */
  current: ComputedRef<NavNode | null>
  /** 选中某项（不存在或不可选则忽略，并返回 false） */
  select: (key: string) => boolean
  /** 重新加载导航定义并收敛选中态 */
  refresh: () => Promise<void>
}

/**
 * 组合式函数：加载 + 校验 + 过滤 + 选中态。
 *
 * 失败语义（与 `useFormNav` 对齐）：
 * · 加载失败 → `error` 有值、`nodes` 保留上一次的值（不清空）；
 * · **校验问题不算失败** → 进 `issues`，可用项照常渲染。
 */
export function useLowCodeNav(options: UseLowCodeNavOptions = {}): UseLowCodeNavResult {
  const nodes = ref<NavNode[]>([])
  const issues = ref<NavSchemaIssue[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const internalKey = ref<string | null>(null)
  const selectedKey = options.modelValue ?? internalKey
  const doFetch = options.fetcher ?? fetch
  /** 归一成 getter：数组来源与函数来源在后续分支里必须是同一个可判别的值 */
  const staticSource = typeof options.source === 'function' ? undefined : options.source
  const getSource = (): NavSource | undefined =>
    typeof options.source === 'function' ? options.source() : staticSource

  /**
   * 表单仓储同样归一成 getter（与 `source` 同款）：
   * 常量形态在 setup 时定格（"传了就稳定"的直觉不变），**函数形态每次 refresh 重取** ——
   * 宿主换了实现（登录态/后端切换）后，`refresh()` 立刻用新的那一份。
   */
  const staticFormStore = typeof options.formStore === 'function' ? undefined : options.formStore
  const storeOf = (): FormStore | undefined =>
    typeof options.formStore === 'function' ? options.formStore() : staticFormStore

  /** 请求序号：连续刷新 / 卸载后到达的结果一律丢弃（见文件头易错点 2） */
  let token = 0
  let disposed = false

  /** 权限过滤：分组只有在"还有可见子项"时才保留（否则是空菜单） */
  const applyFilter = (list: readonly NavNode[]): NavNode[] => {
    const out: NavNode[] = []
    for (const n of list) {
      if (n.kind === 'group') {
        const children = applyFilter(n.children)
        if (children.length) out.push({ ...n, children })
        continue
      }
      if (!options.filter || options.filter(n)) out.push(n)
    }
    return out
  }

  /**
   * 选中态收敛：key 不存在（或指向分组）时回落第一个可选项，避免悬空（见文件头易错点 1）。
   *
   * 收敛是必须的，但**必须留回执**：宿主存着这枚 key，静默改掉它等于替宿主做了决定，
   * 且宿主无从察觉。原因分三档，便于宿主区分"配置写错了"和"这一项被删了"。
   */
  const settleSelection = (): void => {
    const cur = selectedKey.value
    const hit = cur ? findNavNode(nodes.value, cur) : null
    if (hit && hit.kind !== 'group') return // 有效，不动也不通知

    const to = options.autoSelect === false ? null : (firstSelectableNode(nodes.value)?.key ?? null)
    selectedKey.value = to
    // 只有"原来真有一个 key 却被改掉"才算收敛；本来就是空的无须打扰宿主
    if (cur) {
      const reason: SelectionAdjustReason = !hit ? 'not-found' : 'group'
      options.onSelectionAdjust?.({ from: cur, to, reason: to === null ? 'none' : reason })
    }
  }

  async function loadFromApi(src: Extract<NavSource, { kind: 'api' }>): Promise<unknown> {
    const url = (src.url ?? '').trim()
    if (!url) throw new Error('未配置导航接口地址')
    // 与提交/联动/展示类同一套策略：默认只允许同源，跨域须宿主显式放行
    const verdict = checkApiUrl(url, options.apiUrlPolicy?.() ?? {})
    if (!verdict.ok) throw new Error(`导航地址被安全策略拒绝：${verdict.reason}`)
    const res = await doFetch(verdict.url, {
      method: src.method ?? 'GET',
      headers: src.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: src.method === 'POST' ? JSON.stringify(src.body ?? {}) : undefined,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json: unknown = await res.json()
    return extractByPath(json, src.dataPath)
  }

  async function refresh(): Promise<void> {
    if (disposed) return
    const my = ++token
    loading.value = true
    error.value = null
    try {
      const src = getSource()
      let raw: unknown = undefined
      if (!src) raw = []
      else if (src.kind === 'static') raw = src.nodes
      else if (src.kind === 'api') raw = await loadFromApi(src)
      else {
        // forms 模式：用户在低代码入口建的表单自动成为导航项（委托 useFormNav，不重写映射）
        // 每次 refresh 都重取一次 store：宿主换实现后（getter 形态）能立刻跟上
        const store = storeOf()
        const formNav = useFormNav({
          ...(src.icon === undefined ? {} : { icon: src.icon }),
          ...(store === undefined ? {} : { store }),
          autoLoad: false,
        })
        const items = await formNav.refresh()
        if (my !== token || disposed) return
        if (formNav.error.value) error.value = formNav.error.value
        raw = items.map((it) => ({
          key: it.key,
          label: it.label,
          kind: 'form' as const,
          formId: it.formId,
          ...(it.icon ? { icon: it.icon } : {}),
        }))
      }
      if (my !== token || disposed) return
      const parsed = parseNavSchema(raw, {
        ...(options.apiUrlPolicy ? { apiUrlPolicy: options.apiUrlPolicy() } : {}),
      })
      nodes.value = applyFilter(parsed.nodes)
      issues.value = parsed.issues
      settleSelection()
    } catch (err) {
      if (my !== token || disposed) return
      // 保留上一次的导航：一次网络抖动不该让整条导航消失
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      if (my === token && !disposed) loading.value = false
    }
  }

  const leaves = computed(() => flattenNavNodes(nodes.value))
  const current = computed(() => {
    const k = selectedKey.value
    if (!k) return null
    const hit = findNavNode(nodes.value, k)
    return hit && hit.kind !== 'group' ? hit : null
  })

  function select(key: string): boolean {
    const hit = findNavNode(nodes.value, key)
    if (!hit || hit.kind === 'group') return false // 分组不可选
    selectedKey.value = key
    options.onSelect?.(hit) // **只通知，不偷偷改宿主的路由/数据**
    return true
  }

  if (options.autoLoad !== false) {
    onMounted(() => {
      void refresh()
    })
  }
  onUnmounted(() => {
    disposed = true
    token++ // 卸载后到达的结果直接丢弃
    // loading 必须在这里收掉：`finally` 里的 `!disposed` 守卫会让它在卸载后**永久停在 true**，
    // 而 refs 可能比宿主活得更久（宿主把导航状态存进自己的 store / keep-alive 复用时），
    // 那时外壳会一直转圈。卸载语义是"这次加载不再有人消费结果"，不是"永远正在加载"。
    loading.value = false
  })

  // 来源变了（宿主换接口/换配置，或原地改了配置对象里的字段）→ 重新加载。
  //
  // 这里**不再写"来源签名数组"**：负向对照实测过，在 `deep: true` 下签名内容不影响是否触发 ——
  // 把签名从 `['api', url, method, dataPath]` 换成 `['api']`，切换接口照样重载（全绿）。
  // 那个签名从写下起就没起过作用，属于"看起来在判等、实际是装饰"的假防线，故删掉：
  // 触发条件就明确成「getter 依赖的任意变化 + deep 遍历到的嵌套字段变化」。
  watch(
    getSource,
    () => {
      if (!disposed) void refresh()
    },
    { deep: true },
  )

  return {
    nodes,
    leaves,
    issues,
    loading,
    error,
    selectedKey,
    current,
    select,
    refresh,
  }
}
