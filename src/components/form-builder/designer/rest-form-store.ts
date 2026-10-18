/**
 * createRestFormStore —— 用**普通 REST 后端**当表单仓储（FormStore 的参考实现）
 *
 * 为什么需要：`FormStore` 有 9 个方法，宿主想「对接自己的数据库」得先把这套接口实现一遍，
 * 门槛不低。绝大多数后端其实都能提供这几条 REST 路由——于是把它做成开箱可用：
 *
 *   const store = createRestFormStore({ baseUrl: '/api/lowcode', headers: { Authorization: `Bearer ${token}` } })
 *   setActiveFormStore(store)     // 至此设计器、收集端、动态导航全部走宿主的库
 *
 * 约定的路由（宿主后端照此实现即可；`baseUrl` 已含前缀，下面用相对段表示）：
 *
 *   GET    /forms                     → 200 FormMetaItem[]
 *   GET    /forms/{id}                → 200 FormDesign ｜ 404
 *   POST   /forms                     body { id: string|null, design, name? } → 200 FormMetaItem
 *   PATCH  /forms/{id}                body { name }                        → 2xx
 *   DELETE /forms/{id}                （连同该表单的收集记录）              → 2xx
 *   GET    /records/{storageKey}      → 200 CollectRecord[]
 *   POST   /records/{storageKey}      body { record }                      → 2xx
 *   PATCH  /records/{storageKey}/{id} body { data }                        → 2xx
 *   DELETE /records/{storageKey}/{id}                                      → 2xx
 *   DELETE /records/{storageKey}      （清空）                              → 2xx
 *
 * 失败语义：非 2xx 一律抛错（**不静默返回空**）——静默会让用户以为"数据没了"，
 * 而真实原因是后端 500。`GET /forms/{id}` 的 404 是唯一例外，按"表单不存在"返回 null。
 *
 * 安全边界：`baseUrl` 属**宿主可信配置**（不是 schema 里来的），因此不再套用
 * `api-url-guard` 的同源策略；但 `headers` 里可能带令牌，宿主要自行保证不把它写进
 * 分享码 / URL 等会外发的地方。
 */
import type { FormDesign, CollectRecord } from './types'
import type { FormStore, FormMetaItem } from './store'

/** `createRestFormStore` 的配置 */
export interface RestFormStoreOptions {
  /** 后端前缀，如 `/api/lowcode`（末尾斜杠会被规整掉） */
  baseUrl: string
  /** 附加请求头；支持函数形态以便每次请求带上最新令牌 */
  headers?: Record<string, string> | (() => Record<string, string>)
  /** 注入 fetch（测试用；默认全局 fetch） */
  fetchImpl?: typeof fetch
}

/** 创建一个由 REST 后端支撑的 FormStore */
export function createRestFormStore(options: RestFormStoreOptions): FormStore {
  const doFetch = options.fetchImpl ?? fetch
  const base = options.baseUrl.endsWith('/') ? options.baseUrl.slice(0, -1) : options.baseUrl
  const headersOf = (): Record<string, string> =>
    typeof options.headers === 'function' ? options.headers() : (options.headers ?? {})

  /** 统一的请求封装：拼 JSON 头、非 2xx 抛错（错误信息带上状态码与路由，便于宿主定位） */
  async function request<T>(path: string, init?: RequestInit & { allow404?: boolean }): Promise<T | null> {
    const res = await doFetch(`${base}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...headersOf(), ...(init?.headers ?? {}) },
    })
    if (init?.allow404 && res.status === 404) return null
    if (!res.ok) throw new Error(`表单仓储请求失败 ${init?.method ?? 'GET'} ${path}：HTTP ${res.status}`)
    if (res.status === 204) return null
    const text = await res.text()
    return text ? (JSON.parse(text) as T) : null
  }

  const seg = (s: string) => encodeURIComponent(s)

  return {
    async listForms(): Promise<FormMetaItem[]> {
      return (await request<FormMetaItem[]>('/forms')) ?? []
    },
    async loadForm(id: string): Promise<FormDesign | null> {
      return await request<FormDesign>(`/forms/${seg(id)}`, { allow404: true })
    },
    async saveForm(id: string | null, design: FormDesign, name?: string): Promise<FormMetaItem> {
      const saved = await request<FormMetaItem>('/forms', {
        method: 'POST',
        body: JSON.stringify({ id, design, name }),
      })
      if (!saved) throw new Error('表单仓储保存失败：后端未返回表单元信息')
      return saved
    },
    async renameForm(id: string, name: string): Promise<void> {
      await request(`/forms/${seg(id)}`, { method: 'PATCH', body: JSON.stringify({ name }) })
    },
    async deleteForm(id: string): Promise<void> {
      await request(`/forms/${seg(id)}`, { method: 'DELETE' })
    },
    async loadRecords(storageKey: string): Promise<CollectRecord[]> {
      return (await request<CollectRecord[]>(`/records/${seg(storageKey)}`)) ?? []
    },
    async appendRecord(storageKey: string, record: CollectRecord): Promise<void> {
      await request(`/records/${seg(storageKey)}`, { method: 'POST', body: JSON.stringify({ record }) })
    },
    async updateRecord(storageKey: string, recordId: string, data: Record<string, unknown>): Promise<void> {
      await request(`/records/${seg(storageKey)}/${seg(recordId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ data }),
      })
    },
    async removeRecord(storageKey: string, recordId: string): Promise<void> {
      await request(`/records/${seg(storageKey)}/${seg(recordId)}`, { method: 'DELETE' })
    },
    async clearRecords(storageKey: string): Promise<void> {
      await request(`/records/${seg(storageKey)}`, { method: 'DELETE' })
    },
  }
}
