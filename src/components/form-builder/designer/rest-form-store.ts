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
  /**
   * 写冲突（后端 409）时的策略，默认 `'throw'`：
   *
   * - `'throw'`（推荐）：把 `RestStoreConflictError` 抛给调用方 —— 由 UI 决定"要覆盖吗/重新编辑"。
   *   低代码表单常常是两个人开着同一张表，**静默覆盖会让先改的人无声丢工作**，所以默认不替用户做决定。
   * - `'retry'`：自动重读最新版本号后重试**一次**（适合"我的改动就是要覆盖"的场景，例如改标签）；
   *   仍冲突则照旧抛错（不无限重试）。
   *
   * 后端不支持 `rev`（响应里没有版本号）时两种策略都不会触发 —— 行为与旧版完全一致。
   */
  onConflict?: 'throw' | 'retry'
}

/**
 * 写冲突（HTTP 409）：说明"你读到的是旧版本"。
 *
 * `currentRev` 是库里的当前版本号（后端会带回来），宿主可据此决定：
 * 提示用户"有人改过了"、或把本地改动叠加到最新数据上重试。
 */
export class RestStoreConflictError extends Error {
  readonly code = 'conflict'

  constructor(
    message: string,
    /** 冲突时的最新版本号（后端没带则 undefined） */
    readonly currentRev?: number,
  ) {
    super(message)
    this.name = 'RestStoreConflictError'
  }
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
    // 409 单独识别：它是**业务冲突**（"你带的是旧版本"），不是"请求失败"——
    // 混进通用错误里，宿主就只能给用户看"保存失败，请重试"，掩盖真实原因
    if (res.status === 409) {
      let currentRev: number | undefined
      try {
        const body = (await res.json()) as { currentRev?: number }
        if (typeof body?.currentRev === 'number') currentRev = body.currentRev
      } catch {
        // 后端没回 JSON 也不影响判冲突
      }
      throw new RestStoreConflictError(
        `表单仓储冲突：${init?.method ?? 'GET'} ${path} 的版本已过期（当前 rev=${currentRev ?? '未知'}）`,
        currentRev,
      )
    }
    if (!res.ok) throw new Error(`表单仓储请求失败 ${init?.method ?? 'GET'} ${path}：HTTP ${res.status}`)
    if (res.status === 204) return null
    const text = await res.text()
    return text ? (JSON.parse(text) as T) : null
  }

  const seg = (s: string) => encodeURIComponent(s)

  /**
   * 版本号缓存：**读到过才带**。
   *
   * 为什么不做成"没有 rev 就先 GET 一次"：那会让每次写多一次往返，而绝大多数写在
   * 单端场景下没有冲突风险。宿主需要强一致时，先 `listForms()` / `loadRecords()` 即可（它们会填缓存）。
   */
  const formRev = new Map<string, number>()
  /** 读全过的 storageKey（整表 GET 且未分页）：只有这种状态下的条数才准 */
  const readFullKeys = new Set<string>()
  /** 最近一次读全时看到的条数（供 clearRecords 兜底带 count） */
  const lastReadCount = new Map<string, number>()
  const recordRev = new Map<string, number>()
  const recordKey = (storageKey: string, recordId: string) => `${storageKey}\u0000${recordId}`
  const withRev = (rev: number | undefined, payload: Record<string, unknown>) =>
    rev === undefined ? payload : { ...payload, rev }
  const isConflict = (err: unknown): err is RestStoreConflictError =>
    err instanceof RestStoreConflictError || (err as { code?: string })?.code === 'conflict'

  const listFormsImpl = async (): Promise<FormMetaItem[]> => {
    const list = (await request<FormMetaItem[]>('/forms')) ?? []
    for (const f of list) {
      const rev = (f as { rev?: unknown }).rev
      if (typeof rev === 'number') formRev.set(f.id, rev)
    }
    return list
  }

  const loadRecordsImpl = async (storageKey: string): Promise<CollectRecord[]> => {
    const list = (await request<CollectRecord[]>(`/records/${seg(storageKey)}`)) ?? []
    for (const r of list) {
      const rev = (r as { rev?: unknown }).rev
      if (typeof rev === 'number') recordRev.set(recordKey(storageKey, r.id), rev)
    }
    // 「已读全」只有这一条路径能置位（整表 GET 且无分页参数）；条数与读到的快照一起存，
    // 供 clearRecords 在需要时带 count 护栏（TD-31）
    readFullKeys.add(storageKey)
    lastReadCount.set(storageKey, list.length)
    return list
  }

  /**
   * 写操作统一走这里：按 `onConflict` 策略决定"冲突就抛"还是"刷新版本重试一次"。
   * 重试**只做一次**：真并发下继续重试只是在替用户赌运气，第二次冲突应当如实抛给调用方。
   */
  async function writeWith<T>(
    send: (rev: number | undefined) => Promise<T>,
    rev: number | undefined,
    refresh: () => Promise<number | undefined>,
  ): Promise<T> {
    try {
      return await send(rev)
    } catch (err) {
      if (!isConflict(err) || options.onConflict !== 'retry') throw err
      const fresh = await refresh()
      // 刷新后仍拿不到版本号（后端不支持 rev）就没必要重试了，原样抛出
      if (fresh === undefined) throw err
      return await send(fresh)
    }
  }

  return {
    listForms: listFormsImpl,
    async loadForm(id: string): Promise<FormDesign | null> {
      return await request<FormDesign>(`/forms/${seg(id)}`, { allow404: true })
    },
    async saveForm(id: string | null, design: FormDesign, name?: string): Promise<FormMetaItem> {
      const rev = id ? formRev.get(id) : undefined
      const saved = await writeWith(
        (r) =>
          request<FormMetaItem>('/forms', {
            method: 'POST',
            body: JSON.stringify(withRev(r, { id, design, name })),
          }),
        rev,
        async () => {
          await listFormsImpl()
          return id ? formRev.get(id) : undefined
        },
      )
      if (!saved) throw new Error('表单仓储保存失败：后端未返回表单元信息')
      const savedRev = (saved as { rev?: unknown }).rev
      if (typeof savedRev === 'number') formRev.set(saved.id, savedRev)
      return saved
    },
    async renameForm(id: string, name: string): Promise<void> {
      const rev = formRev.get(id)
      await writeWith(
        (r) =>
          request(`/forms/${seg(id)}`, {
            method: 'PATCH',
            body: JSON.stringify(withRev(r, { name })),
          }),
        rev,
        async () => {
          await listFormsImpl()
          return formRev.get(id)
        },
      )
      // PATCH 回 204（不带新版本号）：本地 +1 保持后续写入的 rev 正确
      if (rev !== undefined) formRev.set(id, rev + 1)
    },
    async deleteForm(id: string): Promise<void> {
      const rev = formRev.get(id)
      // 读到过版本号就带上：**删掉一个别人刚改过的项**是最不可逆的静默数据丢失，
      // 后端会回 409 而不是照删。
      //
      // 这里**故意不走** `writeWith` 的自动重试：它的重试会先刷新 rev 再重发，
      // 那等于"把别人刚改的那一版删掉" —— 与乐观锁的本意正好相反。
      // 冲突就直接抛给宿主（`RestStoreConflictError` 带 `currentRev`），由人来决定。
      await request(`/forms/${seg(id)}${rev === undefined ? '' : `?rev=${rev}`}`, { method: 'DELETE' })
      formRev.delete(id)
    },
    loadRecords: loadRecordsImpl,
    async appendRecord(storageKey: string, record: CollectRecord): Promise<void> {
      await request(`/records/${seg(storageKey)}`, { method: 'POST', body: JSON.stringify({ record }) })
      // 新记录的版本号由后端定（1 起），这里不猜；下次读就拿到了
    },
    async updateRecord(storageKey: string, recordId: string, data: Record<string, unknown>): Promise<void> {
      const k = recordKey(storageKey, recordId)
      const rev = recordRev.get(k)
      await writeWith(
        (r) =>
          request(`/records/${seg(storageKey)}/${seg(recordId)}`, {
            method: 'PATCH',
            body: JSON.stringify(withRev(r, { data })),
          }),
        rev,
        async () => {
          await loadRecordsImpl(storageKey)
          return recordRev.get(k)
        },
      )
      if (rev !== undefined) recordRev.set(k, rev + 1)
    },
    async removeRecord(storageKey: string, recordId: string): Promise<void> {
      const k = recordKey(storageKey, recordId)
      const rev = recordRev.get(k)
      // 同 `deleteForm`：带 rev 让"删掉别人刚改的记录"变成 409，而不是静默成功
      await request(`/records/${seg(storageKey)}/${seg(recordId)}${rev === undefined ? '' : `?rev=${rev}`}`, {
        method: 'DELETE',
      })
      recordRev.delete(k)
    },
    async clearRecords(storageKey: string, expectedCount?: number): Promise<void> {
      // 整表清空的**条数护栏**：宿主显式传 expectedCount 时原样带上；
      // 没传但此前 loadRecords 读过全表，就用读到的条数兜底（那时 count 是准的）。
      // 两者都没有就不带 —— 裸 DELETE 是既有契约（tests/unit/rest-form-store-rev.spec.ts 钉住），
      // 护栏留给需要它的宿主显式表达（TD-31）。
      const count = expectedCount ?? (readFullKeys.has(storageKey) ? lastReadCount.get(storageKey) : undefined)
      const qs = count === undefined ? '' : `?count=${count}`
      await request(`/records/${seg(storageKey)}${qs}`, { method: 'DELETE' })
      for (const k of [...recordRev.keys()]) {
        if (k.startsWith(`${storageKey}\u0000`)) recordRev.delete(k)
      }
    },
  }
}
