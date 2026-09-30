import { reportWarn } from '@/components/_internal/runtime-observer'
/**
 * 合同收集存储适配层
 *
 * 后端由调用方决定、三选一互斥（不做双写/双读）：
 * - local    浏览器本地 IndexedDB（零配置；不用云端时的默认）
 * - supabase Supabase Storage（REST 直连，无需 SDK；配置 url + anonKey + bucket 即用）
 * - s3       S3 兼容对象存储（缤纷云 Bitiful 等；配置 endpoint + bucket + AK/SK，零 SDK SigV4）
 *
 * 防御约定（调用方可能不按规则办事）：
 * - 即使跳过 validateStorageConfig，createBackend 也会在配置不合法时抛清晰错误
 * - 云端请求带超时；bucket 不存在 / 断网给出可区分的错误信息
 * - 上传 Content-Type 以文件真实 MIME（blob.type）为准，忽略 "image/*" 这类泛 MIME
 * - clearAll 不再静默吞错，全部失败时报错
 */

import { dbPut, dbGetAll, dbClear } from './indexedDB'
import { useT } from '@/components/_internal/i18n'
import { envValue } from '@/components/_internal/env-guard'
import {
  SupabaseTransport,
  sanitizeObjectKeyPart,
  validateSupabaseConfig,
  type SupabaseConfig,
} from './supabase-transport'
import { S3Transport, validateS3Config, type S3Config } from './s3-transport'

/** 模块级 t：用户可见错误消息按当前语言 */
const t = useT()

// 兼容再导出：实现已下沉 supabase-transport.ts（两套云端存储共用传输层），原路径不变
export { sanitizeObjectKeyPart, validateSupabaseConfig, validateS3Config }
export type { SupabaseConfig, S3Config }

export interface StoreFile {
  name: string
  /** 图片本体：本地落盘为 Blob（毫秒级，相机返回重建页面前已存好）；云端引用/兼容旧数据为 string（data: 或 http(s) URL） */
  dataUrl: string | Blob
  size: number
  type: string
}

/**
 * 一个目标（门店）的收集状态。
 *
 * - slots：多照片位（slotKey → 文件）。slotKey 由 FormSchema 的照片位字段 key 推导
 *   （返利函 rebatePhoto、陈列 frontPhoto/backPhoto、柜机协议 contractPhoto）。
 * - contract：单文件位兼容别名（= slots['contract']）。旧代码/旧数据读 contract，
 *   新代码写 slots；存储层对 contract 位双向镜像，保证旧消费方零改动。
 */
export interface StoreUploadState {
  /** 单文件位兼容别名（= slots['contract']，旧数据格式） */
  contract?: StoreFile
  /** 多照片位：slotKey → 文件 */
  slots?: Record<string, StoreFile>
  ts: number
}

/** 读某照片位的文件（兼容：'contract' 位回退到旧 contract 字段） */
export function getSlotFile(state: StoreUploadState | undefined, slotKey: string): StoreFile | undefined {
  if (!state) return undefined
  return state.slots?.[slotKey] ?? (slotKey === 'contract' ? state.contract : undefined)
}

/** 全部照片位是否都已收齐 */
export function allSlotsFilled(state: StoreUploadState | undefined, slotKeys: string[]): boolean {
  if (!state || slotKeys.length === 0) return false
  return slotKeys.every((k) => !!getSlotFile(state, k))
}

/** 设置某照片位文件（file 为空 = 删除该位）；返回新 state（immutable） */
export function setSlotFile(
  state: StoreUploadState | undefined,
  slotKey: string,
  file: StoreFile | undefined,
): StoreUploadState {
  const base = state ? { ...state, slots: { ...(state.slots ?? {}) } } : { slots: {}, ts: Date.now() }
  const slots = base.slots!
  if (file) slots[slotKey] = file
  else delete slots[slotKey]
  // contract 位镜像到旧字段（兼容旧消费方/旧数据）
  if (slotKey === 'contract') base.contract = slots.contract ? { ...slots.contract } : undefined
  base.ts = Date.now()
  return base
}

export interface StorageBackend {
  readonly kind: 'local' | 'supabase' | 's3'
  /**
   * 加载全部记录，返回 targetId → 上传状态
   * @param slotKeys 本任务的照片位 key 集合（云端对象名解析需要；无则全按单文件位处理）
   */
  loadAll(slotKeys?: string[]): Promise<Map<number, StoreUploadState>>
  /** 保存/更新某目标记录（state 中对应 slot 为空表示该目标该位被删除） */
  saveRecord(targetId: number, state: StoreUploadState): Promise<void>
  /** 清空全部记录 */
  clearAll(): Promise<void>
}

// ===== 本地 IndexedDB（复用统一存储层 indexedDB.ts，不再自开引擎） =====

const STORE_NAME = 'uploads'

/** 本地落盘记录：appleId 冗余存于 value，dbGetAll 反查归属时无需依赖 store key
 *
 * ⛔ 受保护契约（依赖 indexedDB.ts 的 StoreItem 包装格式，见该文件头部注释）：
 * - dbPut 自动包裹 StoreItem（keyPath:'key'），dbGetAll 返回**解包后**的 value ——
 *   本接口即解包后形态，形状变更必须同步 contract-storage 与 tests/unit/contract-storage.spec.ts
 * - store key = String(appleId)，value 内 appleId 与 key 必须一致（loadAll 以 value.appleId 为归属）
 */
interface LocalRecord {
  contract?: StoreFile
  slots?: Record<string, StoreFile>
  ts: number
  appleId: number
}

export class IndexedDBBackend implements StorageBackend {
  readonly kind = 'local' as const

  async loadAll(_slotKeys?: string[]): Promise<Map<number, StoreUploadState>> {
    const map = new Map<number, StoreUploadState>()
    try {
      const rows = await dbGetAll<LocalRecord>(STORE_NAME)
      for (const row of rows) {
        // appleId 为 0 是合法值（不能走 truthy 判断，否则 0 号记录被静默丢弃）
        if (row && typeof row.appleId === 'number') {
          map.set(row.appleId, {
            contract: row.contract ? { ...row.contract } : undefined,
            slots: row.slots ? { ...row.slots } : undefined,
            ts: row.ts,
          })
        }
      }
    } catch (e) {
      reportWarn('[contract-storage] IndexedDB 加载失败:', e)
    }
    return map
  }

  async saveRecord(appleId: number, state: StoreUploadState): Promise<void> {
    // 复用统一层 dbPut；失败不阻塞 UI（保持原语义）
    try {
      await dbPut(STORE_NAME, String(appleId), {
        contract: state.contract ? { ...state.contract } : undefined,
        slots: state.slots ? { ...state.slots } : undefined,
        ts: state.ts,
        appleId,
      })
    } catch (e) {
      reportWarn('[contract-storage] IndexedDB 保存失败:', appleId, e)
    }
  }

  async clearAll(): Promise<void> {
    try {
      await dbClear(STORE_NAME)
    } catch (e) {
      reportWarn('[contract-storage] IndexedDB 清空失败:', e)
    }
  }
}

// ===== Supabase Storage（REST 直连，零 SDK）——传输细节见 supabase-transport.ts =====

/** 墓碑对象名前缀：删除门店时上传的空标记对象，让其他设备对账时知道「该门店已删除」。
 * 没有墓碑，其他设备本地残留的真实字节会在 loadAll 对账时被当作「上传中断/失败」
 * 补传回云端——「PC 删了、手机刷新又传回去、图片复活」。
 * 名字带删除时间戳（{appleId}-__deleted__-{ts}）：对账时比较本地记录 ts 与墓碑 ts，
 * 本地最后操作晚于删除 = 删除后重新拍的新数据（保留并上云），早于删除 = 删除前残留（清理）。
 * 不携带时间戳的旧格式（{appleId}-__deleted__）按「最新删除」解析（ts = MAX_SAFE_INTEGER）。
 * 标记不会被 sanitizeObjectKeyPart 产出（其首尾下划线会被清理，不可能以 `__deleted__` 开头）。
 */
export const TOMBSTONE_MARKER = '__deleted__'

/** 解析墓碑对象键（去掉 `{appleId}-` 前缀后的部分），返回删除时间戳；非墓碑返回 null */
function parseTombstoneKey(key: string): number | null {
  if (key === TOMBSTONE_MARKER) return Number.MAX_SAFE_INTEGER // 旧格式：按最新删除处理（仍生效）
  if (key.startsWith(`${TOMBSTONE_MARKER}-`)) {
    const ts = Number(key.slice(TOMBSTONE_MARKER.length + 1))
    if (Number.isFinite(ts)) return ts
  }
  return null
}

/** dataURL → Blob（供上传到云端） */
function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',')
  const mime = meta.match(/^data:([^;]+)/)?.[1] || 'application/octet-stream'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

// ===== 对象云存储通用后端——supabase / S3 兼容（缤纷云等）共用，传输可插拔 =====

/** 对象云传输的最小接口（SupabaseTransport / S3Transport 各自实现） */
export interface ObjectCloudTransport {
  listObjects(): Promise<{ name: string; size: number; mimetype: string; createdAt: number }[]>
  putObject(name: string, body: Blob | string, contentType: string): Promise<void>
  deleteObjectWithRetry(name: string): Promise<void>
  /** 展示用 URL（supabase 公有 URL / S3 预签名） */
  objectUrl(name: string): string
}

export class ObjectCloudBackend implements StorageBackend {
  readonly kind: 'supabase' | 's3'

  /** appleId → slotKey → 云端对象名（含路径），上传/加载时维护，删除时据此定位 */
  private paths = new Map<number, Map<string, string>>()
  /** 已删除标记（墓碑）：appleId → 墓碑对象名与删除时间戳；loadAll 解析填充，删除时写入，重新上传时清理 */
  readonly tombstones = new Map<number, { name: string; ts: number }>()
  protected tr: ObjectCloudTransport

  constructor(tr: ObjectCloudTransport, kind: 'supabase' | 's3') {
    this.tr = tr
    this.kind = kind
  }

  /**
   * 对象名：
   * - 单文件位（contract）：{appleId}-{ASCII 化文件名}（旧格式，向后兼容）
   * - 多照片位：{appleId}-{slotKey}-{ASCII 化文件名}
   * 对象键用 sanitizeObjectKeyPart 的 ASCII 形式（保留数字与扩展名）——历史原因是
   * Supabase 拒绝非 ASCII 键；保持 ASCII 兼容旧数据与列表解析，展示名取自键本身。
   */
  protected objectName(appleId: number, slotKey: string, fileName: string): string {
    const ascii = sanitizeObjectKeyPart(fileName)
    return slotKey === 'contract' || !slotKey ? `${appleId}-${ascii}` : `${appleId}-${slotKey}-${ascii}`
  }

  private tombstoneName(appleId: number, ts: number): string {
    return `${appleId}-${TOMBSTONE_MARKER}-${ts}`
  }

  async loadAll(slotKeys: string[] = ['contract']): Promise<Map<number, StoreUploadState>> {
    const map = new Map<number, StoreUploadState>()
    const objects = await this.tr.listObjects()
    // 第一遍：收集墓碑（appleId → 最新删除时间戳）。同一门店多个墓碑取最新
    const tbSeen = new Map<number, { name: string; ts: number }>()
    for (const obj of objects) {
      const m = obj.name.match(/^(\d+)-/)
      if (!m) continue
      const key = obj.name.slice(m[0].length)
      const ts = parseTombstoneKey(key)
      if (ts === null) continue
      const appleId = Number(m[1])
      const prev = tbSeen.get(appleId)
      if (!prev || ts > prev.ts) tbSeen.set(appleId, { name: obj.name, ts })
    }
    // 第二遍：解析图片对象。同一门店存在图片对象时「图片优先」——那是删除后重新上传
    // 的成果（墓碑没清干净的场景），墓碑标记作废并异步清理残留对象
    this.tombstones.clear()
    for (const [id, tb] of tbSeen) this.tombstones.set(id, tb)
    // 兼容旧数据：历史对象名 {appleId}-{ascii} 没有 slot 段 → 归入默认位 'contract'
    const DEFAULT_SLOT = 'contract'
    const slotSet = new Set(slotKeys.length ? slotKeys : [DEFAULT_SLOT])
    for (const obj of objects) {
      const m = obj.name.match(/^(\d+)-/)
      if (!m) continue
      const appleId = Number(m[1])
      const key = obj.name.slice(m[0].length)
      if (parseTombstoneKey(key) !== null) continue
      // 解析 slotKey：对象名 {appleId}-{slotKey}-{ascii}；slotKey 不在本任务照片位集合则按旧格式整体当文件名（归默认位）
      let slotKey = DEFAULT_SLOT
      let rest = key
      const firstDash = key.indexOf('-')
      if (firstDash > 0) {
        const maybeSlot = key.slice(0, firstDash)
        if (slotSet.has(maybeSlot)) {
          slotKey = maybeSlot
          rest = key.slice(firstDash + 1)
        }
      }
      if (this.tombstones.has(appleId)) {
        const tb = this.tombstones.get(appleId)!
        this.tombstones.delete(appleId)
        this.tr.deleteObjectWithRetry(tb.name).catch(() => {})
        reportWarn('[contract-storage] 删除后重新上传成功，清理残留墓碑:', appleId)
      }
      // bucket 被外部写入含裸 % 的对象名时 decodeURIComponent 会抛 URIError——
      // 跳过该条并告警，不让单个污染对象崩掉整次 loadAll
      let name = rest
      try {
        name = decodeURIComponent(rest)
      } catch {
        reportWarn('[contract-storage] 对象名 URI 解码失败，跳过:', obj.name)
      }
      if (!this.paths.get(appleId)) this.paths.set(appleId, new Map())
      this.paths.get(appleId)!.set(slotKey, obj.name)
      const prev = map.get(appleId)
      const file = { name, dataUrl: this.tr.objectUrl(obj.name), size: obj.size, type: obj.mimetype }
      if (prev) {
        // 同目标多照片位：合并到 slots
        prev.slots = { ...(prev.slots ?? {}), [slotKey]: file }
      } else {
        map.set(appleId, {
          contract: slotKey === DEFAULT_SLOT ? file : undefined,
          slots: { [slotKey]: file },
          // 上传时间取对象创建时间（≈ 上传时刻）；缺失回退 0（导出层对 0 显示为空）
          ts: obj.createdAt,
        })
      }
    }
    return map
  }

  async saveRecord(appleId: number, state: StoreUploadState): Promise<void> {
    const slots = state.slots ?? (state.contract ? { contract: state.contract } : undefined)
    // 全部照片位都删了：删云端全部对象 + 上传墓碑（删除广播，防其他设备补传复活）
    if (!slots || Object.keys(slots).length === 0) {
      // 优先用已知对象名；映射缺失（跨设备上传/页面刷新后路径丢失）时按 appleId 前缀
      // 从云端列出删除——否则删除静默跳过云端，下次加载又"复活"
      const known = this.paths.get(appleId)
      if (known && known.size > 0) {
        for (const name of known.values()) await this.tr.deleteObjectWithRetry(name)
        this.paths.delete(appleId)
      } else {
        const objects = await this.tr.listObjects()
        const targets = objects.filter((o) => {
          const m = o.name.match(/^(\d+)-/)
          return m && Number(m[1]) === appleId && parseTombstoneKey(o.name.slice(m[0].length)) === null
        })
        for (const t of targets) await this.tr.deleteObjectWithRetry(t.name)
      }
      // 清旧墓碑（避免同名堆积），再写新墓碑。墓碑写失败 = 删除未向其他设备广播，
      // 必须抛错（不静默）——否则下次对账会把已删图片当上传中断补传回来
      const oldTb = this.tombstones.get(appleId)
      if (oldTb) {
        await this.tr.deleteObjectWithRetry(oldTb.name)
        this.tombstones.delete(appleId)
      }
      const ts = Date.now()
      await this.tr.putObject(this.tombstoneName(appleId, ts), '', 'text/plain')
      this.tombstones.set(appleId, { name: this.tombstoneName(appleId, ts), ts })
      return
    }
    // 上传/覆盖文件（逐个照片位）
    if (!this.paths.get(appleId)) this.paths.set(appleId, new Map())
    const pathMap = this.paths.get(appleId)!
    for (const [slotKey, f] of Object.entries(slots)) {
      const name = this.objectName(appleId, slotKey, f.name)
      let blob: Blob
      if (typeof f.dataUrl === 'string') {
        if (f.dataUrl.startsWith('data:')) {
          blob = dataUrlToBlob(f.dataUrl)
        } else {
          // URL 引用：源不可达（对象已删/死链）时禁止把 404 错误体当图片上传，否则云端存出损坏对象
          const resp = await fetch(f.dataUrl)
          if (!resp.ok) throw new Error(t('storage.sourceImageUnavailable', { status: resp.status }))
          blob = await resp.blob()
        }
      } else {
        blob = f.dataUrl
      }
      // Content-Type 以文件真实 MIME 为准（blob.type）；"image/*" 这类泛 MIME 会被浏览器识别为具体类型
      await this.tr.putObject(name, blob, blob.type || 'application/octet-stream')
      pathMap.set(slotKey, name)
    }
    // 重新上传成功后清墓碑（先传后清：清墓碑失败不丢新图片——墓碑残留由 loadAll 的
    // 「图片优先」规则兜底，下次该门店删除/上传时也会清理）
    const oldTb = this.tombstones.get(appleId)
    if (oldTb) {
      try {
        await this.tr.deleteObjectWithRetry(oldTb.name)
        this.tombstones.delete(appleId)
      } catch (e) {
        reportWarn('[contract-storage] 墓碑清理失败（图片已上传，下次对账自动清理）:', appleId, e)
      }
    }
  }

  async clearAll(): Promise<void> {
    const objects = await this.tr.listObjects()
    const failed: string[] = []
    for (const obj of objects) {
      try {
        await this.tr.deleteObjectWithRetry(obj.name)
      } catch (e) {
        failed.push(obj.name)
        reportWarn('[contract-storage] 云端删除失败:', obj.name, e)
      }
    }
    if (failed.length) throw new Error(t('storage.clearPartialFail', { n: failed.length }))
    this.paths.clear()
    this.tombstones.clear()
  }
}

/** Supabase Storage 云端后端（REST 直连，零 SDK）——传输细节见 supabase-transport.ts */
export class SupabaseBackend extends ObjectCloudBackend {
  readonly kind = 'supabase' as const

  constructor(cfg: SupabaseConfig) {
    // 工厂级防御：即使调用方跳过 validateStorageConfig，空配置也在此拒绝
    super(new SupabaseTransport(cfg), 'supabase')
  }
}

/** S3 兼容对象存储云端后端（缤纷云 Bitiful / AWS / 其它 S3 兼容端点）——传输细节见 s3-transport.ts */
export class S3Backend extends ObjectCloudBackend {
  readonly kind = 's3' as const

  constructor(cfg: S3Config) {
    super(new S3Transport(cfg), 's3')
  }
}

// ===== 组合后端：本地可靠落盘 + 云端后台同步 =====
//
// 移动端拍照场景：`<input capture>` 调起系统相机时，浏览器（尤其 Android
// WebView）可能杀掉网页进程，拍照返回即整页重建。若只异步上传云端，保存
// 未完成页面就没了，图片即丢失。组合后端保证：
// - saveRecord 先 await 本地 IndexedDB 落盘（Blob 直接存，毫秒级），再后台同步云端
// - loadAll 先取本地（立即恢复），再以云端为源对账合并，并补传本地有而云端缺的

/** dataUrl 是否为「非本地的云端 URL 引用」（相对 Blob / base64 真实字节） */
function isUrlRef(dataUrl: string | Blob | undefined): boolean {
  return typeof dataUrl === 'string' && !dataUrl.startsWith('data:')
}

/** CompositeBackend 对账所需的最小云端能力（SupabaseBackend/S3Backend 实现；测试可注入假实现） */
interface CloudBackend {
  readonly kind: 'supabase' | 's3'
  /** appleId → 墓碑对象名与删除时间戳（对账据此区分删除残留与删除后新拍的照片） */
  readonly tombstones: Map<number, { name: string; ts: number }>
  loadAll(slotKeys?: string[]): Promise<Map<number, StoreUploadState>>
  saveRecord(appleId: number, state: StoreUploadState): Promise<void>
  clearAll(): Promise<void>
}

export class CompositeBackend implements StorageBackend {
  readonly kind: 'local' | 'supabase' | 's3'
  private local: StorageBackend = new IndexedDBBackend()
  private cloud: CloudBackend | null
  /** 每个 appleId 在飞的上传 Promise：清空/删除前先等它完成，避免「删除后上传又复活对象」 */
  private pendingCloud = new Map<number, Promise<void>>()
  /** 云端标记为已删除的门店（appleId → 删除时间戳）：由 cloud.loadAll 填充，对账据此清理残留/跳过补传 */
  readonly tombstones = new Map<number, number>()

  /**
   * cloud 为 null 时退化为纯本地；否则本地 + 云端双写。
   * onSyncError：云端后台同步失败时回调（上传本地成功但云端没传上时，用户需要知道，
   * 否则会误以为已上传——PC/其他设备打开就是空的）
   * internals：仅供测试注入假本地/假云端；业务调用不传
   */
  constructor(
    cloud: SupabaseConfig | null,
    private onSyncError?: (appleId: number, e: unknown) => void,
    internals?: { local?: StorageBackend; cloud?: CloudBackend | null },
  ) {
    // 工厂级防御：即使调用方跳过 validateStorageConfig，配置不合法也在此拒绝
    this.cloud = cloud ? new SupabaseBackend(cloud) : null
    if (internals?.cloud !== undefined) this.cloud = internals.cloud
    if (internals?.local) this.local = internals.local
    this.kind = this.cloud ? this.cloud.kind : 'local'
  }

  /** 记录在飞上传；同门店操作链式排队（上传→删除按序执行） */
  private trackPending(appleId: number, p: Promise<void>): void {
    const prev = this.pendingCloud.get(appleId)
    const next = (prev ?? Promise.resolve()).then(() => p).catch(() => {})
    this.pendingCloud.set(appleId, next)
    next.finally(() => {
      if (this.pendingCloud.get(appleId) === next) this.pendingCloud.delete(appleId)
    })
  }

  /** 等待在飞上传完成；appleId 为空则等全部 */
  private async waitPending(appleId?: number): Promise<void> {
    if (appleId != null) {
      const p = this.pendingCloud.get(appleId)
      if (p) await p
      return
    }
    const all = [...this.pendingCloud.values()]
    if (all.length) await Promise.all(all)
  }

  async loadAll(slotKeys: string[] = ['contract']): Promise<Map<number, StoreUploadState>> {
    const localMap = await this.local.loadAll(slotKeys)
    if (!this.cloud) return localMap
    // 云端失败不阻断本地恢复（真机相机返回刷新后本地数据优先可用），错误留日志
    let cloudMap: Map<number, StoreUploadState>
    try {
      cloudMap = await this.cloud.loadAll(slotKeys)
    } catch (e) {
      reportWarn('[contract-storage] 云端对账失败，仅恢复本地:', e)
      return localMap
    }
    // 同步云端墓碑集合（appleId → 删除时间戳），决定对账时哪些门店「已删除」
    this.tombstones.clear()
    for (const [id, tb] of this.cloud.tombstones) this.tombstones.set(id, tb.ts)
    // 本地为真实图片（Blob 或 base64）时保持本地为准：云端 URL 只是引用，对象删除即死链。
    // 云端覆盖仅当本地缺该记录（跨设备新同步来的数据）。
    for (const [id, state] of cloudMap) {
      const localState = localMap.get(id)
      const localHasBytes = !!localState?.slots && Object.values(localState.slots).some((f) => !isUrlRef(f.dataUrl))
      if (localHasBytes) continue
      localMap.set(id, state)
      // 云端数据回写本地缓存（保留云端 URL 引用；下次打开仍可读到）
      this.local.saveRecord(id, state).catch(() => {})
    }
    // 清理本地死链：本地存的是云端 URL 引用（非真实字节）而云端已无该对象 → 引用失效，
    // 继续保留页面会显示损坏图；删掉让用户重新上传。
    for (const [id, state] of localMap) {
      const hasRef = state.slots && Object.values(state.slots).some((f) => isUrlRef(f.dataUrl))
      if (hasRef && !cloudMap.has(id)) {
        this.local.saveRecord(id, { slots: {}, ts: state.ts }).catch(() => {})
        localMap.delete(id)
        reportWarn('[contract-storage] 清理失效的云端引用:', id)
      }
    }
    // 清理云端已删除门店的本地残留字节：墓碑表明该门店在别的设备上被删过，
    // 本地残留的真实字节若不清理，会走下面的补传把已删除图片又传回云端（"复活"）。
    // 本地记录时间晚于墓碑删除时间 = 删除之后重新拍的新照片，保留（补传循环负责上云）
    for (const [id, tbTs] of this.tombstones) {
      if (!localMap.has(id)) continue
      const localTs = localMap.get(id)?.ts ?? 0
      if (localTs > tbTs) continue
      this.local.saveRecord(id, { slots: {}, ts: Date.now() }).catch(() => {})
      localMap.delete(id)
      reportWarn('[contract-storage] 清理已删除门店的本地残留:', id)
    }
    // 对账补传：本地有真实字节而云端既没有对象也没有「有效的」墓碑（上次上传中断/失败），
    // 后台补传不阻塞；墓碑门店且本地数据不新（删除残留）跳过——那是其他设备主动删的，不能补。
    // 墓碑门店但本地数据更新（删除后重拍）则照常补传，SupabaseBackend 上传时会顺手清墓碑
    for (const [id, state] of localMap) {
      const hasBytes = !!state.slots && Object.values(state.slots).some((f) => !isUrlRef(f.dataUrl))
      if (!hasBytes) continue // URL 引用不可补传（源对象已删则无处取）
      if (!cloudMap.has(id)) {
        const tbTs = this.tombstones.get(id)
        if (tbTs !== undefined && (state.ts ?? 0) <= tbTs) continue
        this.cloud.saveRecord(id, state).catch((e) => {
          reportWarn('[contract-storage] 对账补传失败:', e)
          this.onSyncError?.(id, e)
        })
      }
    }
    return localMap
  }

  async saveRecord(appleId: number, state: StoreUploadState): Promise<void> {
    // 本地先落盘（await，快速），页面刷新/进程被杀前数据已保住
    await this.local.saveRecord(appleId, state)
    if (!this.cloud) return
    const hasAny = !!state.slots && Object.keys(state.slots).length > 0
    // 删除场景：先等该门店在飞的上传完成（对象已存在），再删云端，避免「删了又复活」。
    // 删除失败必须向上抛（不吞）：否则本地已置空、云端还在，下次加载云端覆盖回来 = 删掉又复活。
    if (!hasAny) {
      await this.waitPending(appleId)
      const p = this.cloud.saveRecord(appleId, state).catch((e) => {
        reportWarn('[contract-storage] 云端删除失败:', e)
        throw e
      })
      this.trackPending(appleId, p)
      await p // 删除需确保完成：云端对象已删才返回
      return
    }
    // 上传场景：云端后台同步（不阻塞 UI，但记录在飞 Promise 供删除/清空等待）。
    // 同步失败不能静默：本地已记录但云端没传上，其他设备打开就是空的，用户必须知道
    const p = this.cloud.saveRecord(appleId, state).catch((e) => {
      reportWarn('[contract-storage] 云端同步失败:', e)
      this.onSyncError?.(appleId, e)
    })
    this.trackPending(appleId, p)
  }

  async clearAll(): Promise<void> {
    // 先等所有在飞上传完成（对象都已落云端），再清空，避免清完又被上传复活
    await this.waitPending()
    await this.local.clearAll()
    this.tombstones.clear()
    if (this.cloud) await this.cloud.clearAll()
  }
}

// ===== 工厂：按配置选择后端 =====

export interface StorageConfig {
  backend: 'local' | 'supabase' | 's3'
  /* supabase 后端配置（非 supabase 时为空串） */
  url: string
  anonKey: string
  bucket: string
  /* S3 兼容后端配置（缤纷云 Bitiful 等；非 s3 时为空串）。bucket 复用上方字段 */
  /** 桶级访问域名，如 https://my-main-oss-2026.s3.bitiful.net */
  endpoint: string
  /** SigV4 区域；缤纷云不校验（默认 us-east-1） */
  region: string
  accessKeyId: string
  secretAccessKey: string
}

/** 空白配置（本地后端起点） */
export function emptyStorageConfig(): StorageConfig {
  return {
    backend: 'local',
    url: '',
    anonKey: '',
    bucket: '',
    endpoint: '',
    region: '',
    accessKeyId: '',
    secretAccessKey: '',
  }
}

/** 环境变量默认配置：仅开发期生效。S3 兼容（缤纷云等）配齐则优先 → Supabase 配齐次之 → 本地 */
export function defaultStorageConfigFromEnv(): StorageConfig {
  const s3 = {
    endpoint: envValue('VITE_S3_ENDPOINT') ?? '',
    region: envValue('VITE_S3_REGION') ?? '',
    bucket: envValue('VITE_S3_BUCKET') ?? '',
    accessKeyId: envValue('VITE_S3_ACCESS_KEY_ID') ?? '',
    secretAccessKey: envValue('VITE_S3_SECRET_ACCESS_KEY') ?? '',
  }
  if (s3.endpoint && s3.bucket && s3.accessKeyId && s3.secretAccessKey) {
    return { backend: 's3', url: '', anonKey: '', ...s3 }
  }
  const supabase = {
    url: envValue('VITE_SUPABASE_URL') ?? '',
    anonKey: envValue('VITE_SUPABASE_ANON_KEY') ?? '',
    bucket: envValue('VITE_SUPABASE_BUCKET') ?? '',
  }
  if (supabase.url && supabase.anonKey && supabase.bucket) {
    return {
      backend: 'supabase',
      ...supabase,
      endpoint: '',
      region: '',
      accessKeyId: '',
      secretAccessKey: '',
    }
  }
  return emptyStorageConfig()
}

/** 本地后端是唯一零配置选项；supabase / s3 各自必填项缺一不可 */
export function validateStorageConfig(cfg: StorageConfig): string | null {
  if (cfg.backend === 'local') return null
  if (cfg.backend === 's3') {
    return validateS3Config({
      endpoint: cfg.endpoint,
      region: cfg.region,
      bucket: cfg.bucket,
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    })
  }
  return validateSupabaseConfig({ url: cfg.url, anonKey: cfg.anonKey, bucket: cfg.bucket })
}

/** 存储后端工厂：按 cfg.backend（local/s3/supabase）装配对应实现（本地缓存 + 云端对账），onSyncError 接收单文件同步失败 */
export function createBackend(cfg: StorageConfig, onSyncError?: (appleId: number, e: unknown) => void): StorageBackend {
  if (cfg.backend === 's3') {
    const cloud = new S3Backend({
      endpoint: cfg.endpoint,
      region: cfg.region,
      bucket: cfg.bucket,
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    })
    return new CompositeBackend(null, onSyncError, { cloud })
  }
  if (cfg.backend === 'supabase') {
    // 工厂级防御：即使调用方跳过 validateStorageConfig，空配置也在此拒绝
    return new CompositeBackend({ url: cfg.url, anonKey: cfg.anonKey, bucket: cfg.bucket }, onSyncError)
  }
  return new CompositeBackend(null, onSyncError)
}
