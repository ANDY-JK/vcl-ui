/**
 * display-data-source —— 展示类字段的**数据源解析**（业务方 2026-10-18：三种模式都要）
 *
 * 背景：展示类元素（明细表 / 图表 / 地图）不像输入框那样自己就是数据，它们得**从某个地方取数**。
 * 三种来源各有各的真实用途，缺一不可：
 *
 *   · `static` 静态配置 —— 设计时就把数据写死（演示、固定说明表、常量看板）
 *   · `field`  绑定字段 —— 展示**用户在表单里填/选出来的东西**（子表单明细、评分矩阵、
 *               选中的商品列表…）。这是"随填随变"的唯一正确做法：不在运行时猜数据源。
 *   · `api`    接口拉取 —— 数据在后端（订单明细、库存、统计）
 *
 * 三条共用一套**归一化与错误语义**，组件不必各写一遍。
 *
 * 安全：`api` 模式走 `checkApiUrl`（默认只允许同源，跨域须宿主显式放行）——
 * 与提交、联动、远程选项完全同一套策略，不给展示类开新口子。
 */
import { ref, watch, onMounted, onUnmounted, type Ref } from 'vue'
import { checkApiUrl, type ApiUrlPolicy } from './api-url-guard'
import type { FormData } from './types'

/** 数据来源模式 */
export type DisplayDataKind = 'static' | 'field' | 'api'

/** 展示类字段的数据源配置（三选一，由 kind 决定读哪个字段） */
export interface DisplayDataSource {
  /** 来源模式 */
  kind: DisplayDataKind
  /** static：设计时写死的数据（数组或对象） */
  staticData?: unknown
  /** field：绑定到某个字段的 key，取该字段当前值 */
  fieldKey?: string
  /** api：请求地址（同源或宿主显式放行的来源） */
  apiUrl?: string
  /** api：请求方法，默认 GET */
  method?: 'GET' | 'POST'
  /** api：从响应里取数据的点路径，如 `data.rows`；不填则取整个响应 */
  dataPath?: string
  /** api：POST 时的请求体（默认空对象） */
  body?: unknown
}

/** 数据源的运行时状态 */
export interface DisplayDataState {
  /** 归一化后的数据行（数组；单对象会包成一行） */
  rows: Ref<unknown[]>
  /** 原始值（未归一化，图表这类需要原始结构时用） */
  raw: Ref<unknown>
  /** 是否正在拉取（仅 api 模式会真） */
  loading: Ref<boolean>
  /** 失败原因；成功为 null。**不静默吞错**——展示区域空白时必须能说清为什么 */
  error: Ref<string | null>
}

/** `useDisplayData` 的入参（都用 getter，保证响应式追踪） */
export interface UseDisplayDataOptions {
  /** 数据源配置 getter */
  source: () => DisplayDataSource | undefined
  /** 表单数据 getter（field 模式从这里取值） */
  formData: () => FormData
  /** 外发 URL 策略 getter（api 模式用；不传 = 只允许同源） */
  apiUrlPolicy?: () => ApiUrlPolicy
  /** 注入 fetch（测试用） */
  fetcher?: typeof fetch
}

/**
 * 按点路径取值：`dataPath='data.rows'` 从 `{data:{rows:[...]}}` 取出数组。
 * 路径中任一段缺失 → 返回 undefined（调用方按"没数据"处理，不抛错）。
 */
export function extractByPath(raw: unknown, path?: string): unknown {
  if (!path) return raw
  let cur: unknown = raw
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

/**
 * 归一化成"行数组"：
 * · 数组 → 原样
 * · 对象且含数组型 `rows`/`list`/`items`/`data` → 取第一个命中的
 * · 其它对象 → 包成单行（表格至少能显示一行，好过空白）
 * · null/undefined → 空数组
 */
export function toRows(raw: unknown): unknown[] {
  if (raw === null || raw === undefined) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'object') {
    for (const k of ['rows', 'list', 'items', 'data']) {
      const v = (raw as Record<string, unknown>)[k]
      if (Array.isArray(v)) return v
    }
    return [raw]
  }
  return [] // 原始值（字符串/数字）不构成"行"，按无数据处理
}

/**
 * 解析展示类字段的数据源。三种模式统一在这里收敛。
 *
 * 失败语义：api 失败 → `error` 有值且 `rows` 置空（**不保留上一次的陈旧数据**——
 * 展示区显示过期数字比显示"加载失败"更危险）；被安全策略拒绝 → 同样进 error，不发请求。
 */
export function useDisplayData(options: UseDisplayDataOptions): DisplayDataState & { reload: () => Promise<void> } {
  const rows = ref<unknown[]>([])
  const raw = ref<unknown>(undefined)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const doFetch = options.fetcher ?? fetch

  /** 请求序号：连续切换数据源时，迟到结果不得覆盖新结果 */
  let token = 0

  function applyStatic(src: DisplayDataSource, formData: FormData): void {
    if (src.kind === 'static') {
      raw.value = src.staticData
    } else {
      // field 模式：值就是表单里那个字段的当前值，随输入响应式变化
      raw.value = src.fieldKey ? formData[src.fieldKey] : undefined
    }
    rows.value = toRows(raw.value)
    error.value = null
    loading.value = false
  }

  async function loadApi(src: DisplayDataSource): Promise<void> {
    const my = ++token
    const url = (src.apiUrl ?? '').trim()
    if (!url) {
      raw.value = undefined
      rows.value = []
      error.value = '未配置接口地址'
      loading.value = false
      return
    }
    // 与提交/联动同一套策略：默认只允许同源，跨域须宿主显式放行
    const verdict = checkApiUrl(url, options.apiUrlPolicy?.() ?? {})
    if (!verdict.ok) {
      raw.value = undefined
      rows.value = []
      error.value = `数据地址被安全策略拒绝：${verdict.reason}`
      loading.value = false
      return
    }

    loading.value = true
    error.value = null
    try {
      const res = await doFetch(verdict.url, {
        method: src.method ?? 'GET',
        headers: src.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: src.method === 'POST' ? JSON.stringify(src.body ?? {}) : undefined,
      })
      if (my !== token) return // 期间又切了数据源：丢弃本次结果
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: unknown = await res.json()
      if (my !== token) return
      const picked = extractByPath(json, src.dataPath)
      raw.value = picked
      rows.value = toRows(picked)
    } catch (err) {
      if (my !== token) return
      raw.value = undefined
      rows.value = []
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      if (my === token) loading.value = false
    }
  }

  async function reload(): Promise<void> {
    const src = options.source()
    if (!src) {
      raw.value = undefined
      rows.value = []
      error.value = null
      loading.value = false
      return
    }
    if (src.kind === 'api') await loadApi(src)
    else applyStatic(src, options.formData())
  }

  // 三种模式都要跟着变化重算：
  // · static 变了（设计器改了配置）→ 重算
  // · field 绑定值变了 → 重算（这是"随填随变"的实现点）
  // · api 配置变了 → 重新拉
  watch(
    () => {
      const src = options.source()
      if (!src) return ['none']
      if (src.kind === 'field') return ['field', src.fieldKey, options.formData()[src.fieldKey ?? '']]
      if (src.kind === 'api') return ['api', src.apiUrl, src.method, src.dataPath]
      return ['static', src.staticData]
    },
    () => {
      void reload()
    },
    { deep: true },
  )

  onMounted(() => {
    void reload()
  })
  onUnmounted(() => {
    token++ // 卸载后到达的结果直接丢弃
  })

  return { rows, raw, loading, error, reload }
}
