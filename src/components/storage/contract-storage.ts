import { reportEvent, reportWarn } from '@/components/_internal/runtime-observer'
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

/** 照片位文件（#438：跨域被 form-builder 使用，从 storage 域入口导出） */
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

/** 存储后端契约（#438：跨域被 form-builder 使用，从 storage 域入口导出） */
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
      reportEvent('storage/load-failed', '[contract-storage] IndexedDB 加载失败:', { error: String(e) }, 'warn')
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
      reportEvent(
        'storage/save-failed',
        '[contract-storage] IndexedDB 保存失败:',
        { appleId, error: String(e) },
        'error',
      )
    }
  }

  async clearAll(): Promise<void> {
    try {
      await dbClear(STORE_NAME)
    } catch (e) {
      reportEvent('storage/clear-failed', '[contract-storage] IndexedDB 清空失败:', { error: String(e) }, 'warn')
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
        reportEvent(
          'storage/cloud-delete-failed',
          '[contract-storage] 云端删除失败:',
          { name: obj.name, error: String(e) },
          'warn',
        )
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

// ===== 工厂：按配置选择后端 =====

/** 存储配置（#438：跨域被 form-builder 使用，从 storage 域入口导出） */
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

/**
 * 把配置收敛成**只带当前后端字段**的形态（其余后端字段一律置空串）。
 *
 * 为什么必须有它（第 160 轮实测）：`StorageConfig` 的字段注释写着「supabase 后端配置
 * （非 supabase 时为空串）」「S3 兼容后端配置（非 s3 时为空串）」——这是**契约**，
 * `defaultStorageConfigFromEnv()` 也遵守它。但配置面板在编辑副本上让用户切后端时，
 * 上一个后端已填的值会留在副本里，保存后整份交给宿主：
 * ① 宿主把 cfg 落 localStorage（`persistStorageConfig` 只脱敏 `secretAccessKey`，
 *    `url`/`anonKey`/`accessKeyId`/`endpoint` 照存）→ 用户以为「切到 local 就干净了」，
 *    磁盘上却还留着别的后端的地址与凭据标识；
 * ② 在 s3 与 supabase 之间来回切时，旧后端的地址会被**静默复用**（面板里看着"已经填好"），
 *    实际连到的是上一次的项目。
 * 以「保存时收敛」而不是「切换时清空」实现：切换时清空会把用户正在对比/复制到一半的输入
 * 一起抹掉，代价更大；收敛只影响真正发出去的配置。
 *
 * `bucket` 是两个云后端**共用**的字段（见 `StorageConfig` 注释「bucket 复用上方字段」），
 * 故 local 以外的后端都保留；`local` 无任何字段，全部置空。
 *
 * @param cfg 任意来源的配置（可能带残留字段）
 * @returns 新的配置对象（不改动入参），满足「非当前后端的字段为空串」
 */
export function normalizeForBackend(cfg: StorageConfig): StorageConfig {
  const out: StorageConfig = { ...emptyStorageConfig(), backend: cfg.backend }
  if (cfg.backend === 'local') return out
  out.bucket = cfg.bucket
  if (cfg.backend === 'supabase') {
    out.url = cfg.url
    out.anonKey = cfg.anonKey
  } else {
    out.endpoint = cfg.endpoint
    out.region = cfg.region
    out.accessKeyId = cfg.accessKeyId
    out.secretAccessKey = cfg.secretAccessKey
  }
  return out
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
