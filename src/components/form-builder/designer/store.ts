/**
 * 表单存储抽象层 — 依赖倒置设计
 *
 * 接口全异步（Promise）：本地实现同步语义包装，云端实现走 Supabase REST。
 * 存储方式切换：getActiveFormStore/setActiveFormStore 全局单例 + 偏好持久化，
 * FormDesigner 的「数据存储」设置与 FormCollect 共享同一活动实例。
 *
 * 云端实现（createCloudFormStore）：复用 storage 模块的 SupabaseKVAdapter，
 * 三类 JSON 对象——表单索引 / 单表单设计 / 收集记录，anon key 为公开密钥（Supabase RLS 管控权限）。
 */

import type { FormDesign, CollectRecord } from './types'
import { formCollectStorageKey } from './types'
import { formatDateTimeZh } from '@/components/form/utils/date-utils'
import { uuid } from '@/components/_internal/utils'
import { useT } from '@/components/_internal/i18n'
import { envValue } from '@/components/_internal/env-guard'
import { SupabaseKVAdapter, validateSupabaseConfig, type SupabaseConfig } from '@/components/storage/supabase-transport'
/**
 * 收集记录条数上限（本地与云端同一口径）：收集型表单长跑会无限累积撑爆存储配额，
 * 超限淘汰最旧记录 —— 配额满的表现是"新记录永远写不进去"，比丢旧记录更糟。
 */
const MAX_RECORDS = 500

/** 模块级 t：纯 .ts 文件，各函数直接用 */
const t = useT()

/** 已保存的表单元信息（列表展示用） */
export interface FormMetaItem {
  id: string
  name: string
  updatedAt: string
  /** 收集记录完整存储 key（含 fd_collect_ 前缀，与 FormCollect 传入 store 方法的 storageKey 一致） */
  collectKey: string
}

export interface FormStore {
  /** 表单列表（不含完整设计，仅元信息） */
  listForms(): Promise<FormMetaItem[]>
  /** 读取表单完整设计 */
  loadForm(id: string): Promise<FormDesign | null>
  /** 新建/保存表单（id 为空则新建） */
  saveForm(id: string | null, design: FormDesign, name?: string): Promise<FormMetaItem>
  /** 重命名 */
  renameForm(id: string, name: string): Promise<void>
  /** 删除表单（连同其收集记录） */
  deleteForm(id: string): Promise<void>
  /** 读取某表单的收集记录 */
  loadRecords(storageKey: string): Promise<CollectRecord[]>
  /** 追加收集记录 */
  appendRecord(storageKey: string, record: CollectRecord): Promise<void>
  /**
   * 原地更新收集记录（记录级审核/编辑后保存）。
   * 可选方法：外部注入的 SaaS 实现可能没有，调用方需做能力检测降级。
   */
  updateRecord?(storageKey: string, recordId: string, data: Record<string, unknown>): Promise<void>
  /** 删除单条收集记录 */
  removeRecord(storageKey: string, recordId: string): Promise<void>
  /** 清空某表单收集记录 */
  clearRecords(storageKey: string): Promise<void>
}

// ════════════════════════════════════════
// 本地实现（localStorage）
// ════════════════════════════════════════

const FORMS_KEY = 'fd_forms_index'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 容量满静默
  }
}

/** 创建 localStorage 形态的表单存储（草稿/表单列表/收集数据全走本机） */
export function createLocalFormStore(): FormStore {
  function listForms(): FormMetaItem[] {
    return migrateCollectKeys(read<FormMetaItem[]>(FORMS_KEY, []))
  }
  function saveIndex(list: FormMetaItem[]): void {
    write(FORMS_KEY, list)
  }

  /**
   * 读时迁移：老版本 collectKey 是字段结构指纹，结构相同的表单共用一个数据桶。
   * 首次读到索引时把数据搬到 fd_collect_<表单id>；老键只被一个表引用就清掉，
   * 被多个表共用则保留（各留一份副本，宁可重复也不丢数据）。
   */
  function migrateCollectKeys(list: FormMetaItem[]): FormMetaItem[] {
    const usage = new Map<string, number>()
    for (const it of list) usage.set(it.collectKey, (usage.get(it.collectKey) ?? 0) + 1)
    let changed = false
    for (const item of list) {
      const next = formCollectStorageKey(item.id)
      if (item.collectKey === next) continue
      const legacy = item.collectKey
      const legacyData = read<CollectRecord[] | null>(legacy, null)
      if (legacyData && read<CollectRecord[] | null>(next, null) === null) {
        write(next, legacyData)
        if (legacy && usage.get(legacy) === 1) localStorage.removeItem(legacy)
      }
      item.collectKey = next
      changed = true
    }
    if (changed) saveIndex(list)
    return list
  }

  function genId(): string {
    return uuid('f_')
  }

  return {
    async listForms() {
      return listForms()
    },

    async loadForm(id: string): Promise<FormDesign | null> {
      return read<FormDesign | null>(`fd_form_${id}`, null)
    },

    async saveForm(id, design, name) {
      const index = listForms()
      const now = formatDateTimeZh()
      let item: FormMetaItem
      if (id) {
        const found = index.find((x) => x.id === id)
        if (!found) throw new Error(t('fbd.formNotFound', { id }))
        item = found
        item.name = name ?? item.name
        item.updatedAt = now
      } else {
        // collectKey 以表单 id 为锚（formCollectStorageKey）：结构相同的表单不再共用一个数据桶
        const id = genId()
        item = {
          id,
          name: name || design.meta.title || t('fbd.untitled'),
          updatedAt: now,
          collectKey: formCollectStorageKey(id),
        }
        index.unshift(item)
      }
      saveIndex(index)
      write(`fd_form_${item.id}`, design)
      return item
    },

    async renameForm(id, name) {
      const index = listForms()
      const item = index.find((x) => x.id === id)
      if (!item) return
      item.name = name
      saveIndex(index)
    },

    async deleteForm(id) {
      const index = listForms()
      const itemIndex = index.findIndex((x) => x.id === id)
      if (itemIndex === -1) return
      const item = index[itemIndex]
      index.splice(itemIndex, 1)
      saveIndex(index)
      localStorage.removeItem(`fd_form_${id}`)
      if (item) localStorage.removeItem(item.collectKey)
    },

    async loadRecords(storageKey) {
      return read<CollectRecord[]>(storageKey, [])
    },

    async appendRecord(storageKey, record) {
      const list = await this.loadRecords(storageKey)
      list.unshift(record)
      write(storageKey, list.length > MAX_RECORDS ? list.slice(0, MAX_RECORDS) : list)
    },

    async updateRecord(storageKey, recordId, data) {
      const list = await this.loadRecords(storageKey)
      const idx = list.findIndex((r) => r.id === recordId)
      if (idx === -1) return
      list[idx] = { ...list[idx], data: { ...data } }
      write(storageKey, list)
    },

    async removeRecord(storageKey, recordId) {
      const list = await this.loadRecords(storageKey)
      write(
        storageKey,
        list.filter((r) => r.id !== recordId),
      )
    },

    async clearRecords(storageKey) {
      localStorage.removeItem(storageKey)
    },
  }
}

// ════════════════════════════════════════
// 云端实现（Supabase Storage，复用 KV 适配器）
// ════════════════════════════════════════

/** 云端对象键：表单索引 / 单表单设计 / 收集记录（键均为 ASCII，无需额外清洗） */
const CLOUD_INDEX_KEY = 'fd_forms_index'
const cloudFormKey = (id: string): string => `fd_form_${id}`

/**
 * 创建云端 FormStore（Supabase Storage bucket 存 JSON 对象）。
 *
 * 与本地的差异（如实告知调用方）：
 * - 所有方法为真实网络请求，错误（配置缺失/权限/网络）原样上抛，由 UI 层展示
 * - 索引是单对象整读整写：多端并发保存同一索引存在丢更新窗口（单人/小团队场景够用）
 * - anon key 属公开密钥（浏览器可见），访问控制依赖 Supabase RLS 策略
 */
export function createCloudFormStore(cfg: SupabaseConfig): FormStore {
  const err = validateSupabaseConfig(cfg)
  if (err) throw new Error(err)
  const kv = new SupabaseKVAdapter(cfg)

  async function listForms(): Promise<FormMetaItem[]> {
    return migrateCollectKeys((await kv.get<FormMetaItem[]>(CLOUD_INDEX_KEY)) ?? [])
  }
  async function saveIndex(list: FormMetaItem[]): Promise<void> {
    await kv.set(CLOUD_INDEX_KEY, list)
  }

  /** 读时迁移：与本地实现同语义（老指纹键 → fd_collect_<表单id>），见 createLocalFormStore 注释 */
  async function migrateCollectKeys(list: FormMetaItem[]): Promise<FormMetaItem[]> {
    const usage = new Map<string, number>()
    for (const it of list) usage.set(it.collectKey, (usage.get(it.collectKey) ?? 0) + 1)
    let changed = false
    for (const item of list) {
      const next = formCollectStorageKey(item.id)
      if (item.collectKey === next) continue
      const legacy = item.collectKey
      const legacyData = legacy ? await kv.get<CollectRecord[]>(legacy) : null
      if (legacyData && !(await kv.get<CollectRecord[]>(next))) {
        await kv.set(next, legacyData)
        if (usage.get(legacy) === 1) await kv.remove(legacy)
      }
      item.collectKey = next
      changed = true
    }
    if (changed) await saveIndex(list)
    return list
  }

  return {
    async listForms() {
      return listForms()
    },

    async loadForm(id) {
      return kv.get<FormDesign>(cloudFormKey(id))
    },

    async saveForm(id, design, name) {
      const index = await listForms()
      const now = formatDateTimeZh()
      let item: FormMetaItem
      if (id) {
        const found = index.find((x) => x.id === id)
        if (!found) throw new Error(t('fbd.formNotFound', { id }))
        item = found
        item.name = name ?? item.name
        item.updatedAt = now
      } else {
        const id = uuid('f_')
        item = {
          id,
          name: name || design.meta.title || t('fbd.untitled'),
          updatedAt: now,
          collectKey: formCollectStorageKey(id),
        }
        index.unshift(item)
      }
      await kv.set(cloudFormKey(item.id), design)
      await saveIndex(index)
      return item
    },

    async renameForm(id, name) {
      const index = await listForms()
      const item = index.find((x) => x.id === id)
      if (!item) return
      item.name = name
      await saveIndex(index)
    },

    async deleteForm(id) {
      const index = await listForms()
      const itemIndex = index.findIndex((x) => x.id === id)
      if (itemIndex === -1) return
      const [item] = index.splice(itemIndex, 1)
      await saveIndex(index)
      await kv.remove(cloudFormKey(id))
      if (item) await kv.remove(item.collectKey)
    },

    async loadRecords(storageKey) {
      return (await kv.get<CollectRecord[]>(storageKey)) ?? []
    },

    async appendRecord(storageKey, record) {
      const list = await this.loadRecords(storageKey)
      list.unshift(record)
      const next = list.length > MAX_RECORDS ? list.slice(0, MAX_RECORDS) : list
      await kv.set(storageKey, next)
    },

    async updateRecord(storageKey, recordId, data) {
      const list = await this.loadRecords(storageKey)
      const idx = list.findIndex((r) => r.id === recordId)
      if (idx === -1) return
      list[idx] = { ...list[idx], data: { ...data } }
      await kv.set(storageKey, list)
    },

    async removeRecord(storageKey, recordId) {
      const list = await this.loadRecords(storageKey)
      await kv.set(
        storageKey,
        list.filter((r) => r.id !== recordId),
      )
    },

    async clearRecords(storageKey) {
      await kv.remove(storageKey)
    },
  }
}

// ════════════════════════════════════════
// 存储方式（模式）与全局活动 store
// ════════════════════════════════════════

export type FormStoreMode = 'local' | 'cloud'

/** 云端连接配置（anon key 为公开密钥，仅存浏览器本地偏好） */
export interface FormCloudConfig {
  url: string
  anonKey: string
  bucket: string
}

const MODE_KEY = 'fd_store_mode_v1'
const CLOUD_CFG_KEY = 'fd_cloud_cfg_v1'

/** 读取存储方式偏好（无记录/非法值回退 local） */
export function loadStoreMode(): FormStoreMode {
  try {
    const raw = localStorage.getItem(MODE_KEY)
    return raw === 'cloud' ? 'cloud' : 'local'
  } catch {
    return 'local'
  }
}

/** 持久化存储模式选择（local / cloud，启动时恢复） */
export function saveStoreMode(mode: FormStoreMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    /* 配额满忽略 */
  }
}

/** 读取云端配置偏好（未配置返回 null） */
export function loadCloudConfig(): FormCloudConfig | null {
  try {
    const raw = localStorage.getItem(CLOUD_CFG_KEY)
    if (!raw) return null
    const cfg = JSON.parse(raw) as Partial<FormCloudConfig>
    if (!cfg.url || !cfg.anonKey || !cfg.bucket) return null
    return { url: String(cfg.url), anonKey: String(cfg.anonKey), bucket: String(cfg.bucket) }
  } catch {
    return null
  }
}

/** 持久化云端存储配置（传 null 清除，回落本地模式） */
export function saveCloudConfig(cfg: FormCloudConfig | null): void {
  try {
    if (cfg) localStorage.setItem(CLOUD_CFG_KEY, JSON.stringify(cfg))
    else localStorage.removeItem(CLOUD_CFG_KEY)
  } catch {
    /* 配额满忽略 */
  }
}

/** 全局活动 store（模块级单例）：FormDesigner 切换存储方式后，FormCollect 等消费方自动跟随 */
let _activeStore: FormStore | null = null

/** 云端配置 env 兜底：仅开发期生效（VITE_SUPABASE_* 已配置时「云端」选项免手填），生产构建恒为 null */
export function envCloudConfig(): FormCloudConfig | null {
  const url = envValue('VITE_SUPABASE_URL')
  const anonKey = envValue('VITE_SUPABASE_ANON_KEY')
  const bucket = envValue('VITE_SUPABASE_BUCKET')
  if (url && anonKey && bucket) return { url, anonKey, bucket }
  return null
}

/** 获取全局活动 FormStore：首次调用按持久化偏好初始化（云端配置缺失时诚实回退本地） */
export function getActiveFormStore(): FormStore {
  if (_activeStore) return _activeStore
  if (loadStoreMode() === 'cloud') {
    const cfg = loadCloudConfig() ?? envCloudConfig()
    if (cfg) {
      try {
        _activeStore = createCloudFormStore(cfg)
      } catch {
        _activeStore = createLocalFormStore()
      }
      return _activeStore
    }
  }
  _activeStore = createLocalFormStore()
  return _activeStore
}

/** 覆盖全局活动 FormStore（设计器切换存储方式 / 宿主注入自定义实现） */
export function setActiveFormStore(store: FormStore): void {
  _activeStore = store
}

/** 工厂：按模式创建 store（配置非法时抛错，调用方决定降级） */
export function createFormStore(mode: FormStoreMode, cfg?: FormCloudConfig): FormStore {
  if (mode === 'cloud') {
    const c = cfg ?? loadCloudConfig() ?? envCloudConfig()
    if (!c) throw new Error(t('fbd.cloudConfigMissing'))
    return createCloudFormStore(c)
  }
  return createLocalFormStore()
}
