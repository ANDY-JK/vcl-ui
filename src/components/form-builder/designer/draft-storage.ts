/**
 * draft-storage —— 设计器草稿的**可插拔持久化**（H.1 第 2 项：草稿上云准备）
 *
 * 现状与目标：
 *   设计器草稿原先写死走 IndexedDB（`dbPut/dbGet/dbDelete`），**换设备就丢**。
 *   跨端续填需要云存储，但本项目**目前不上服务器**，所以这里不写死任何一种：
 *
 *     · 本地（默认）：`createIndexedDbDraftStorage()` —— 现有行为，零改动；
 *     · 云（将来）：`createHttpDraftStorage({ loadUrl, saveUrl, clearUrl })` —— 契约已成，接后端即用。
 *
 * 分层原则：**策略留在这层之外**。容量上限（2MB）、脏数据拒载、响应式纯化都属
 * 「与存哪儿无关」的规则，放在 useDesignerDraft 里统一执行；适配器只负责「把一份纯 JSON 存进去 / 取出来」。
 * 这样换存储不会悄悄丢掉任何一道防护。
 */

import { scopedKey } from './storage-scope'

export interface DraftStorage {
  /** 名称，用于日志/UI 显示当前草稿存在哪 */
  readonly name: string
  /** 取原始草稿值（不做校验，调用方校验）；无草稿返回 null */
  load(): Promise<unknown>
  /** 写入一份纯 JSON 草稿 */
  save(draft: unknown): Promise<void>
  /** 删除草稿 */
  clear(): Promise<void>
}

/** IndexedDB store 名（设计器草稿专用，与运行时 form-drafts 区分） */
export const DRAFT_STORE = 'form-designer-drafts'
/** 草稿存储键（单设计器全局一份：恢复「最近一次未保存的设计」语义） */
export const DRAFT_KEY = 'designer-autosave'

/** 本地实现：IndexedDB + TTL（默认，与改造前逐字节同行为） */
export function createIndexedDbDraftStorage(ttl: number): DraftStorage {
  // 惰性 import 不必要：indexedDB 模块自身对不可用环境有守卫，导入期不碰 DOM
  return {
    name: 'indexeddb-local',
    async load() {
      const { dbGet } = await import('@/components/storage/indexedDB')
      return await dbGet<unknown>(DRAFT_STORE, scopedKey(DRAFT_KEY))
    },
    async save(draft) {
      const { dbPut } = await import('@/components/storage/indexedDB')
      await dbPut(DRAFT_STORE, scopedKey(DRAFT_KEY), draft, ttl)
    },
    async clear() {
      const { dbDelete } = await import('@/components/storage/indexedDB')
      await dbDelete(DRAFT_STORE, scopedKey(DRAFT_KEY))
    },
  }
}

export interface HttpDraftStorageOptions {
  /** 读取草稿：GET → 200 草稿 JSON；204/404 视为"无草稿"；其余非 2xx 抛错 */
  loadUrl: string
  /** 保存草稿：POST { draft } */
  saveUrl: string
  /** 删除草稿：DELETE */
  clearUrl: string
  /** 额外请求头（如 Authorization / 租户标识） */
  headers?: Record<string, string> | (() => Record<string, string>)
  /** 注入 fetch（测试用） */
  fetchImpl?: typeof fetch
}

/**
 * 云实现（**接缝**）：把草稿存到后端，实现跨设备续填。
 *
 * 契约（后端按此实现即可；本项目暂不上服务器，故只有契约没有服务端实现）：
 *   GET    {loadUrl}              → 200 {nodes,meta,savedAt} ｜ 204/404 无草稿
 *   POST   {saveUrl}   body {draft} → 200/204
 *   DELETE {clearUrl}             → 200/204
 * 失败语义：非 2xx 一律抛错（**不静默降级为"本地暂存"**——那会让用户以为存上了）。
 */
export function createHttpDraftStorage(opts: HttpDraftStorageOptions): DraftStorage {
  const doFetch = opts.fetchImpl ?? fetch
  const headersOf = () => (typeof opts.headers === 'function' ? opts.headers() : (opts.headers ?? {}))
  return {
    name: 'http-cloud',
    async load() {
      const res = await doFetch(opts.loadUrl, { method: 'GET', headers: headersOf() })
      if (res.status === 204 || res.status === 404) return null
      if (!res.ok) throw new Error(`草稿读取失败：HTTP ${res.status}`)
      return await res.json()
    },
    async save(draft) {
      const res = await doFetch(opts.saveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headersOf() },
        body: JSON.stringify({ draft }),
      })
      if (!res.ok) throw new Error(`草稿保存失败：HTTP ${res.status}`)
    },
    async clear() {
      const res = await doFetch(opts.clearUrl, { method: 'DELETE', headers: headersOf() })
      if (!res.ok) throw new Error(`草稿清除失败：HTTP ${res.status}`)
    },
  }
}

// ── 当前生效的存储（默认 = 本地 IndexedDB，宿主可换成云适配器） ──────────────
let active: DraftStorage | null = null

/** 设置当前草稿存储；传 null 恢复默认（本地 IndexedDB） */
export function setActiveDraftStorage(storage: DraftStorage | null): void {
  active = storage
}

/** 读取当前草稿存储（未显式设置时返回默认的本地实现） */
export function getActiveDraftStorage(defaultTtl: number): DraftStorage {
  return active ?? createIndexedDbDraftStorage(defaultTtl)
}
