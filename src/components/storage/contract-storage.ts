/**
 * 合同收集存储适配层
 *
 * 后端由调用方决定、二选一互斥（不做双写/双读）：
 * - local    浏览器本地 IndexedDB（零配置；不用云端时的默认）
 * - supabase Supabase Storage（REST 直连，无需 SDK；配置 url + anonKey + bucket 即用）
 *
 * 防御约定（调用方可能不按规则办事）：
 * - 即使跳过 validateStorageConfig，createBackend 也会在配置不合法时抛清晰错误
 * - 云端请求带超时；bucket 不存在 / 断网给出可区分的错误信息
 * - 上传 Content-Type 以文件真实 MIME（blob.type）为准，忽略 "image/*" 这类泛 MIME
 * - clearAll 不再静默吞错，全部失败时报错
 */

import { dbPut, dbGetAll, dbClear } from './indexedDB'

export interface StoreFile {
  name: string
  /** 图片本体：本地落盘为 Blob（毫秒级，相机返回重建页面前已存好）；云端引用/兼容旧数据为 string（data: 或 http(s) URL） */
  dataUrl: string | Blob
  size: number
  type: string
}
export interface StoreUploadState {
  contract?: StoreFile
  ts: number
}

export interface StorageBackend {
  readonly kind: 'local' | 'supabase'
  /** 加载全部记录，返回 appleId → 上传状态 */
  loadAll(): Promise<Map<number, StoreUploadState>>
  /** 保存/更新某门店记录（contract 为空表示该门店文件被删除） */
  saveRecord(appleId: number, state: StoreUploadState): Promise<void>
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
  ts: number
  appleId: number
}

export class IndexedDBBackend implements StorageBackend {
  readonly kind = 'local' as const

  async loadAll(): Promise<Map<number, StoreUploadState>> {
    const map = new Map<number, StoreUploadState>()
    try {
      const rows = await dbGetAll<LocalRecord>(STORE_NAME)
      for (const row of rows) {
        if (row && row.appleId) map.set(row.appleId, { contract: row.contract, ts: row.ts })
      }
    } catch (e) {
      console.warn('[contract-storage] IndexedDB 加载失败:', e)
    }
    return map
  }

  async saveRecord(appleId: number, state: StoreUploadState): Promise<void> {
    // 复用统一层 dbPut；失败不阻塞 UI（保持原语义）
    try {
      await dbPut(STORE_NAME, String(appleId), { contract: state.contract, ts: state.ts, appleId })
    } catch (e) {
      console.warn('[contract-storage] IndexedDB 保存失败:', appleId, e)
    }
  }

  async clearAll(): Promise<void> {
    try {
      await dbClear(STORE_NAME)
    } catch (e) {
      console.warn('[contract-storage] IndexedDB 清空失败:', e)
    }
  }
}

// ===== Supabase Storage（REST 直连，零 SDK） =====

export interface SupabaseConfig {
  url: string
  anonKey: string
  bucket: string
}

/** 云端请求超时（毫秒），大图上传也不应无限等待 */
const REQUEST_TIMEOUT_MS = 60_000

function validateSupabaseConfig(cfg: SupabaseConfig): string | null {
  if (!cfg || !cfg.url.trim()) return '请填写 Supabase 项目 URL'
  if (!/^https?:\/\//.test(cfg.url.trim())) return 'Supabase URL 需以 http(s):// 开头'
  if (!cfg.anonKey.trim()) return '请填写 anon public key'
  if (!cfg.bucket.trim()) return '请填写 Storage bucket 名称'
  return null
}

/**
 * 墓碑对象名前缀：删除门店时上传的空标记对象，让其他设备对账时知道「该门店已删除」。
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

/**
 * 把任意文件名转成可作 Supabase 对象键的 ASCII 形式（导出供测试/复用）。
 * Supabase 对象键只接受 ASCII——含中文的对象名上传返回 400 InvalidKey（实测）。
 * 规则（按序）：
 * 1. 先分离扩展名（.jpg 等），扩展名本身也做 ASCII 清洗，非 ASCII 扩展名丢弃
 * 2. 主体剔除所有非 ASCII 字符、路径/URL 敏感字符（\ / : * ? " < > |）转 _
 * 3. 空白（含中间空格）转 _，首尾的 _ . - 清理
 * 4. 主体为空回退 file；主体超长截断到 60 字符（对象键过长同样有被后端拒绝的风险）
 */
export function sanitizeObjectKeyPart(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  let ext = dot > 0 ? fileName.slice(dot) : ''
  ext = ext.replace(/[^\x20-\x7E]+/g, '').replace(/\s+/g, '')
  if (!/^\.[\w.]+$/.test(ext)) ext = ''
  const bodySrc = dot > 0 ? fileName.slice(0, dot) : fileName
  let body = bodySrc
    .replace(/[^\x20-\x7E]+/g, '') // 中文等非 ASCII 剔除
    .replace(/[\\/:*?"<>|]+/g, '_') // 路径/URL 敏感字符
    .replace(/\s+/g, '_') // 空白（含中间空格）
    .replace(/^[_.,-]+/, '')
    .replace(/[_.,-]+$/, '')
  if (!body) body = 'file'
  body = body.slice(0, 60)
  return body + ext
}

export class SupabaseBackend implements StorageBackend {
  readonly kind = 'supabase' as const

  /** appleId → 云端对象名（含路径），上传/加载时维护，删除时据此定位 */
  private paths = new Map<number, string>()
  /** 已删除标记（墓碑）：appleId → 墓碑对象名与删除时间戳；loadAll 解析填充，删除时写入，重新上传时清理 */
  readonly tombstones = new Map<number, { name: string; ts: number }>()

  constructor(private cfg: SupabaseConfig) {
    // 工厂级防御：即使调用方跳过 validateStorageConfig，空配置也在此拒绝
    const err = validateSupabaseConfig(cfg)
    if (err) throw new Error(err)
  }

  private get base() {
    return `${this.cfg.url.replace(/\/+$/, '')}/storage/v1`
  }

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = {
      apikey: this.cfg.anonKey,
      Authorization: `Bearer ${this.cfg.anonKey}`,
    }
    if (json) h['Content-Type'] = 'application/json'
    return h
  }

  /**
   * 对象名：{appleId}-{ASCII 化文件名}。
   * Supabase 对象键只接受 ASCII——含中文等非 ASCII 字符的对象名上传返回
   * 400 InvalidKey（实测：「拍照-…」这类文件名上传必失败）。文件名本身无业务
   * 含义（仅展示），对象键用 sanitizeObjectKeyPart 的 ASCII 形式（保留数字与扩展名），
   * 列表解析/展示名字都基于该键。
   */
  private objectName(appleId: number, fileName: string): string {
    return `${appleId}-${sanitizeObjectKeyPart(fileName)}`
  }

  private tombstoneName(appleId: number, ts: number): string {
    return `${appleId}-${TOMBSTONE_MARKER}-${ts}`
  }

  private publicUrl(name: string): string {
    return `${this.cfg.url.replace(/\/+$/, '')}/storage/v1/object/public/${this.cfg.bucket}/${encodeURIComponent(name)}`
  }

  /** 带超时的请求；错误按「bucket 不存在 / 网络」区分提示 */
  private async request(path: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
    let resp: Response
    try {
      resp = await fetch(`${this.base}${path}`, { ...init, signal: ctrl.signal })
    } catch (e) {
      const aborted = (e as Error)?.name === 'AbortError'
      const err = new Error(
        aborted ? `云端请求超时（${REQUEST_TIMEOUT_MS / 1000}s），请检查网络后重试` : '云端网络异常，请检查网络连接',
      )
      ;(err as Error & { cause?: unknown }).cause = e
      throw err
    } finally {
      clearTimeout(timer)
    }
    if (!resp.ok) {
      // Supabase 行为：bucket 不存在时 list 静默返回空、单对象操作返回 400 "Bucket not found"；
      // 403 是 storage.objects 的 RLS 策略缺失
      const hint =
        resp.status === 400 || resp.status === 404
          ? `bucket「${this.cfg.bucket}」不存在或无权访问，请在 Supabase 控制台创建 public bucket`
          : resp.status === 403
            ? '云端权限不足，请检查 storage.objects 的 RLS 策略（见 notes/supabase-storage-setup.md）'
            : `云端返回 HTTP ${resp.status}`
      throw new Error(`${hint}（${path}）`)
    }
    return resp
  }

  /** 删除对象并重试：对象刚写入时 Supabase 存在短暂不一致窗口，立即删除可能 400 */
  private async deleteObjectWithRetry(name: string, attempts = 3): Promise<void> {
    for (let i = 1; i <= attempts; i++) {
      try {
        await this.request(`/object/${this.cfg.bucket}/${encodeURIComponent(name)}`, {
          method: 'DELETE',
          headers: this.headers(),
        })
        return
      } catch (e) {
        if (i === attempts) throw e
        await new Promise((r) => setTimeout(r, 500 * i))
      }
    }
  }

  /** 列出 bucket 根目录所有对象，返回 { name, size, mimetype, createdAt }[] */
  private async listObjects(): Promise<Array<{ name: string; size: number; mimetype: string; createdAt: number }>> {
    const resp = await this.request(`/object/list/${this.cfg.bucket}`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ prefix: '', limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
    })
    const rows = (await resp.json()) as Array<{ name: string; created_at?: string; metadata?: { size?: number; mimetype?: string } }>
    return rows
      .filter((r) => !r.name.endsWith('/'))
      .map((r) => ({
        name: r.name,
        size: Number(r.metadata?.size ?? 0),
        mimetype: r.metadata?.mimetype || 'application/octet-stream',
        // 对象创建时间 ≈ 上传时间；缺失/非法回退 0（导出层对 0 显示为空）
        createdAt: r.created_at ? new Date(r.created_at).getTime() : 0,
      }))
  }

  async loadAll(): Promise<Map<number, StoreUploadState>> {
    const map = new Map<number, StoreUploadState>()
    const objects = await this.listObjects()
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
    for (const obj of objects) {
      const m = obj.name.match(/^(\d+)-/)
      if (!m) continue
      const appleId = Number(m[1])
      const key = obj.name.slice(m[0].length)
      if (parseTombstoneKey(key) !== null) continue
      if (this.tombstones.has(appleId)) {
        const tb = this.tombstones.get(appleId)!
        this.tombstones.delete(appleId)
        this.deleteObjectWithRetry(tb.name).catch(() => {})
        console.warn('[contract-storage] 删除后重新上传成功，清理残留墓碑:', appleId)
      }
      const name = decodeURIComponent(key)
      this.paths.set(appleId, obj.name)
      map.set(appleId, {
        contract: { name, dataUrl: this.publicUrl(obj.name), size: obj.size, type: obj.mimetype },
        // 上传时间取对象创建时间（≈ 上传时刻）；缺失回退 0（导出层对 0 显示为空）
        ts: obj.createdAt,
      })
    }
    return map
  }

  async saveRecord(appleId: number, state: StoreUploadState): Promise<void> {
    // 文件被删除：删云端对象 + 上传带时间戳的墓碑标记，让其他设备对账时知道
    // 「该门店已删除、本地残留不得补传」（否则 PC 删了，手机本地字节刷新时被当作
    // 上传中断补传回来，图片"复活"）。墓碑带删除时间：删除后重新拍的新照片
    // （本地 ts 更新）对账时不会被误清。
    if (!state.contract) {
      // 优先用已知对象名；映射缺失（跨设备上传/页面刷新后路径丢失）时按 appleId 前缀
      // 从云端列出删除——否则删除静默跳过云端，下次加载又"复活"
      const old = this.paths.get(appleId)
      if (old) {
        await this.deleteObjectWithRetry(old)
        this.paths.delete(appleId)
      } else {
        const objects = await this.listObjects()
        const targets = objects.filter((o) => {
          const m = o.name.match(/^(\d+)-/)
          return m && Number(m[1]) === appleId && parseTombstoneKey(o.name.slice(m[0].length)) === null
        })
        for (const t of targets) await this.deleteObjectWithRetry(t.name)
      }
      // 清旧墓碑（避免同名堆积），再写新墓碑。墓碑写失败 = 删除未向其他设备广播，
      // 必须抛错（不静默）——否则下次对账会把已删图片当上传中断补传回来
      const oldTb = this.tombstones.get(appleId)
      if (oldTb) {
        await this.deleteObjectWithRetry(oldTb.name)
        this.tombstones.delete(appleId)
      }
      const ts = Date.now()
      await this.request(`/object/${this.cfg.bucket}/${this.tombstoneName(appleId, ts)}`, {
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'text/plain', 'x-upsert': 'true' },
        body: '',
      })
      this.tombstones.set(appleId, { name: this.tombstoneName(appleId, ts), ts })
      return
    }
    // 上传/覆盖文件
    const f = state.contract
    const name = this.objectName(appleId, f.name)
    let blob: Blob
    if (typeof f.dataUrl === 'string') {
      if (f.dataUrl.startsWith('data:')) {
        blob = dataUrlToBlob(f.dataUrl)
      } else {
        // URL 引用：源不可达（对象已删/死链）时禁止把 404 错误体当图片上传，否则云端存出损坏对象
        const resp = await fetch(f.dataUrl)
        if (!resp.ok) throw new Error(`源图片不可用（HTTP ${resp.status}），已跳过上传`)
        blob = await resp.blob()
      }
    } else {
      blob = f.dataUrl
    }
    // Content-Type 以文件真实 MIME 为准（blob.type）；"image/*" 这类泛 MIME 会被浏览器识别为具体类型
    await this.request(`/object/${this.cfg.bucket}/${name}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': blob.type || 'application/octet-stream', 'x-upsert': 'true' },
      body: blob,
    })
    this.paths.set(appleId, name)
    // 重新上传成功后清墓碑（先传后清：清墓碑失败不丢新图片——墓碑残留由 loadAll 的
    // 「图片优先」规则兜底，下次该门店删除/上传时也会清理）
    const oldTb = this.tombstones.get(appleId)
    if (oldTb) {
      try {
        await this.deleteObjectWithRetry(oldTb.name)
        this.tombstones.delete(appleId)
      } catch (e) {
        console.warn('[contract-storage] 墓碑清理失败（图片已上传，下次对账自动清理）:', appleId, e)
      }
    }
  }

  async clearAll(): Promise<void> {
    const objects = await this.listObjects()
    const failed: string[] = []
    for (const obj of objects) {
      try {
        await this.deleteObjectWithRetry(obj.name)
      } catch (e) {
        failed.push(obj.name)
        console.warn('[contract-storage] 云端删除失败:', obj.name, e)
      }
    }
    if (failed.length) throw new Error(`云端有 ${failed.length} 个对象删除失败，请重试`)
    this.paths.clear()
    this.tombstones.clear()
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

/** CompositeBackend 对账所需的最小云端能力（SupabaseBackend 实现；测试可注入假实现） */
interface CloudBackend {
  /** appleId → 墓碑对象名与删除时间戳（对账据此区分删除残留与删除后新拍的照片） */
  readonly tombstones: Map<number, { name: string; ts: number }>
  loadAll(): Promise<Map<number, StoreUploadState>>
  saveRecord(appleId: number, state: StoreUploadState): Promise<void>
  clearAll(): Promise<void>
}

export class CompositeBackend implements StorageBackend {
  readonly kind: 'local' | 'supabase'
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
    this.kind = this.cloud ? 'supabase' : 'local'
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

  async loadAll(): Promise<Map<number, StoreUploadState>> {
    const localMap = await this.local.loadAll()
    if (!this.cloud) return localMap
    // 云端失败不阻断本地恢复（真机相机返回刷新后本地数据优先可用），错误留日志
    let cloudMap: Map<number, StoreUploadState>
    try {
      cloudMap = await this.cloud.loadAll()
    } catch (e) {
      console.warn('[contract-storage] 云端对账失败，仅恢复本地:', e)
      return localMap
    }
    // 同步云端墓碑集合（appleId → 删除时间戳），决定对账时哪些门店「已删除」
    this.tombstones.clear()
    for (const [id, tb] of this.cloud.tombstones) this.tombstones.set(id, tb.ts)
    // 本地为真实图片（Blob 或 base64）时保持本地为准：云端 URL 只是引用，对象删除即死链。
    // 云端覆盖仅当本地缺该记录（跨设备新同步来的数据）。
    for (const [id, state] of cloudMap) {
      const localState = localMap.get(id)
      const localHasBytes = !!localState?.contract && !isUrlRef(localState.contract.dataUrl)
      if (localHasBytes) continue
      localMap.set(id, state)
      // 云端数据回写本地缓存（保留云端 URL 引用；下次打开仍可读到）
      this.local.saveRecord(id, state).catch(() => {})
    }
    // 清理本地死链：本地存的是云端 URL 引用（非真实字节）而云端已无该对象 → 引用失效，
    // 继续保留页面会显示损坏图；删掉让用户重新上传。
    for (const [id, state] of localMap) {
      if (state.contract && isUrlRef(state.contract.dataUrl) && !cloudMap.has(id)) {
        this.local.saveRecord(id, { contract: undefined, ts: state.ts }).catch(() => {})
        localMap.delete(id)
        console.warn('[contract-storage] 清理失效的云端引用:', id)
      }
    }
    // 清理云端已删除门店的本地残留字节：墓碑表明该门店在别的设备上被删过，
    // 本地残留的真实字节若不清理，会走下面的补传把已删除图片又传回云端（"复活"）。
    // 本地记录时间晚于墓碑删除时间 = 删除之后重新拍的新照片，保留（补传循环负责上云）
    for (const [id, tbTs] of this.tombstones) {
      if (!localMap.has(id)) continue
      const localTs = localMap.get(id)?.ts ?? 0
      if (localTs > tbTs) continue
      this.local.saveRecord(id, { contract: undefined, ts: Date.now() }).catch(() => {})
      localMap.delete(id)
      console.warn('[contract-storage] 清理已删除门店的本地残留:', id)
    }
    // 对账补传：本地有真实字节而云端既没有对象也没有「有效的」墓碑（上次上传中断/失败），
    // 后台补传不阻塞；墓碑门店且本地数据不新（删除残留）跳过——那是其他设备主动删的，不能补。
    // 墓碑门店但本地数据更新（删除后重拍）则照常补传，SupabaseBackend 上传时会顺手清墓碑
    for (const [id, state] of localMap) {
      const hasBytes = state.contract && !isUrlRef(state.contract.dataUrl)
      if (!hasBytes) continue // URL 引用不可补传（源对象已删则无处取）
      if (!cloudMap.has(id)) {
        const tbTs = this.tombstones.get(id)
        if (tbTs !== undefined && (state.ts ?? 0) <= tbTs) continue
        this.cloud.saveRecord(id, state).catch((e) => {
          console.warn('[contract-storage] 对账补传失败:', e)
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
    // 删除场景：先等该门店在飞的上传完成（对象已存在），再删云端，避免「删了又复活」。
    // 删除失败必须向上抛（不吞）：否则本地已置空、云端还在，下次加载云端覆盖回来 = 删掉又复活。
    if (!state.contract) {
      await this.waitPending(appleId)
      const p = this.cloud.saveRecord(appleId, state).catch((e) => {
        console.warn('[contract-storage] 云端删除失败:', e)
        throw e
      })
      this.trackPending(appleId, p)
      await p // 删除需确保完成：云端对象已删才返回
      return
    }
    // 上传场景：云端后台同步（不阻塞 UI，但记录在飞 Promise 供删除/清空等待）。
    // 同步失败不能静默：本地已记录但云端没传上，其他设备打开就是空的，用户必须知道
    const p = this.cloud.saveRecord(appleId, state).catch((e) => {
      console.warn('[contract-storage] 云端同步失败:', e)
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
  backend: 'local' | 'supabase'
  url: string
  anonKey: string
  bucket: string
}

/** 本地后端是唯一零配置选项；supabase 三项配置缺一不可 */
export function validateStorageConfig(cfg: StorageConfig): string | null {
  if (cfg.backend === 'local') return null
  return validateSupabaseConfig({ url: cfg.url, anonKey: cfg.anonKey, bucket: cfg.bucket })
}

export function createBackend(cfg: StorageConfig, onSyncError?: (appleId: number, e: unknown) => void): StorageBackend {
  if (cfg.backend === 'supabase') {
    // 工厂级防御：即使调用方跳过 validateStorageConfig，配置不合法也在此拒绝
    return new CompositeBackend({ url: cfg.url, anonKey: cfg.anonKey, bucket: cfg.bucket }, onSyncError)
  }
  return new CompositeBackend(null, onSyncError)
}
