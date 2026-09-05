/**
 * Supabase REST 传输层 —— 两套云端存储的共用底座（合并第一步：传输下沉，行为不变）
 *
 * 服务对象：
 * - unified.ts 的 CloudKVAdapter（KV 语义）——库内此前只有接口没有实现，本模块补上
 *   `createSupabaseKVAdapter`，消费方注入 setCloudAdapter 即得云端 KV，无需自写 REST
 * - contract-storage.ts 的 SupabaseBackend（文件/Blob 语义，对账/墓碑）——私有 REST
 *   客户端（超时/错误归类/分页/重试）下沉至此，两边共用一份
 *
 * 语义分工（保持不变）：
 * - CloudKVAdapter：最小 KV 契约（get/set/remove），值以 JSON 存入 bucket 的 `_kv/` 前缀对象
 * - StorageBackend：记录/文件契约（loadAll/saveRecord/clearAll），对象键 `{appleId}-{file}`
 *   与墓碑标记——`_kv/` 前缀与数字前缀天然不冲突，同一 bucket 可混用
 */

import { useT } from '@/components/_internal/i18n'

/** 模块级 t：用户可见错误消息按当前语言 */
const t = useT()

export interface SupabaseConfig {
  url: string
  anonKey: string
  bucket: string
}

/** 云端请求超时（毫秒），大图上传也不应无限等待 */
export const REQUEST_TIMEOUT_MS = 60_000

export function validateSupabaseConfig(cfg: SupabaseConfig): string | null {
  if (!cfg || !cfg.url.trim()) return t('storage.supabaseUrlRequired')
  if (!/^https?:\/\//.test(cfg.url.trim())) return t('storage.supabaseUrlFormat')
  if (!cfg.anonKey.trim()) return t('storage.supabaseKeyRequired')
  if (!cfg.bucket.trim()) return t('storage.supabaseBucketRequired')
  return null
}

/**
 * 把任意文件名/键名转成可作 Supabase 对象键的 ASCII 形式（导出供测试/复用）。
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

/** listObjects 返回的单对象元数据 */
export interface CloudObjectMeta {
  name: string
  size: number
  mimetype: string
  createdAt: number
}

export class SupabaseTransport {
  constructor(public readonly cfg: SupabaseConfig) {
    // 工厂级防御：即使调用方跳过 validateStorageConfig，空配置也在此拒绝
    const err = validateSupabaseConfig(cfg)
    if (err) throw new Error(err)
  }

  get base(): string {
    return `${this.cfg.url.replace(/\/+$/, '')}/storage/v1`
  }

  headers(json = false): Record<string, string> {
    const h: Record<string, string> = {
      apikey: this.cfg.anonKey,
      Authorization: `Bearer ${this.cfg.anonKey}`,
    }
    if (json) h['Content-Type'] = 'application/json'
    return h
  }

  publicUrl(name: string): string {
    return `${this.cfg.url.replace(/\/+$/, '')}/storage/v1/object/public/${this.cfg.bucket}/${encodeURIComponent(name)}`
  }

  /** 展示用 URL——对象云后端统一入口（与 s3-transport 的 objectUrl 对齐） */
  objectUrl(name: string): string {
    return this.publicUrl(name)
  }

  /** 对象路径编码：按路径段 encodeURIComponent（保留 / 的文件夹语义；无斜杠名不受影响） */
  private encodeObjectPath(name: string): string {
    return name.split('/').map(encodeURIComponent).join('/')
  }

  /** 带超时的原始请求（不做 ok 归类，返回 Response 由调用方判状态）；认证头默认注入，调用方可覆盖 */
  private async fetchRaw(path: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
    try {
      return await fetch(`${this.base}${path}`, {
        ...init,
        headers: { ...this.headers(), ...(init.headers as Record<string, string> | undefined) },
        signal: ctrl.signal,
      })
    } catch (e) {
      const aborted = (e as Error)?.name === 'AbortError'
      const err = new Error(
        aborted ? t('storage.cloudTimeout', { s: REQUEST_TIMEOUT_MS / 1000 }) : t('storage.cloudNetworkError'),
      )
      ;(err as Error & { cause?: unknown }).cause = e
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  /** 带 ok 归类的请求；错误按「bucket 不存在 / 权限 / HTTP 状态」区分提示 */
  async request(path: string, init: RequestInit): Promise<Response> {
    const resp = await this.fetchRaw(path, init)
    if (!resp.ok) {
      // Supabase 行为：bucket 不存在时 list 静默返回空、单对象操作返回 400 "Bucket not found"；
      // 403 是 storage.objects 的 RLS 策略缺失
      const hint =
        resp.status === 400 || resp.status === 404
          ? t('storage.bucketMissing', { bucket: this.cfg.bucket })
          : resp.status === 403
            ? t('storage.cloudPermissionDenied')
            : t('storage.cloudHttpError', { status: resp.status })
      throw new Error(`${hint}（${path}）`)
    }
    return resp
  }

  /**
   * GET 对象字节；对象不存在（400/404）返回 null（KV 语义的「miss」），其余 !ok 状态
   * 按归类上抛（403 权限/网络故障必须暴露，不能静默当 miss）
   */
  async getObject(name: string): Promise<Response | null> {
    const path = `/object/${this.cfg.bucket}/${this.encodeObjectPath(name)}`
    const resp = await this.fetchRaw(path, { headers: this.headers() })
    if (!resp.ok) {
      if (resp.status === 400 || resp.status === 404) return null
      const hint =
        resp.status === 403 ? t('storage.cloudPermissionDenied') : t('storage.cloudHttpError', { status: resp.status })
      throw new Error(`${hint}（${path}）`)
    }
    return resp
  }

  /** 上传/覆盖对象（x-upsert：同键覆盖） */
  async putObject(name: string, body: Blob | string, contentType: string): Promise<void> {
    await this.request(`/object/${this.cfg.bucket}/${this.encodeObjectPath(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': contentType, 'x-upsert': 'true' },
      body,
    })
  }

  /** 删除对象并重试：对象刚写入时 Supabase 存在短暂不一致窗口，立即删除可能 400 */
  async deleteObjectWithRetry(name: string, attempts = 3): Promise<void> {
    for (let i = 1; i <= attempts; i++) {
      try {
        await this.request(`/object/${this.cfg.bucket}/${this.encodeObjectPath(name)}`, {
          method: 'DELETE',
        })
        return
      } catch (e) {
        if (i === attempts) throw e
        await new Promise((r) => setTimeout(r, 500 * i))
      }
    }
  }

  /** 列出 bucket 根目录所有对象（分页拉全，避免 1000 条上限静默截断） */
  async listObjects(): Promise<CloudObjectMeta[]> {
    const PAGE = 1000
    const all: CloudObjectMeta[] = []
    let offset = 0
    // Supabase 单页上限 1000：循环翻页直到返回不足一页
    for (;;) {
      const resp = await this.request(`/object/list/${this.cfg.bucket}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: '', limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } }),
      })
      const rows = (await resp.json()) as Array<{
        name: string
        created_at?: string
        metadata?: { size?: number; mimetype?: string }
      }>
      for (const r of rows) {
        if (r.name.endsWith('/')) continue
        all.push({
          name: r.name,
          size: Number(r.metadata?.size ?? 0),
          mimetype: r.metadata?.mimetype || 'application/octet-stream',
          // 对象创建时间 ≈ 上传时间；缺失/非法回退 0（导出层对 0 显示为空）
          createdAt: r.created_at ? new Date(r.created_at).getTime() : 0,
        })
      }
      if (rows.length < PAGE) break
      offset += PAGE
    }
    return all
  }
}

// ════════════════════════════════════════
// Supabase KV 适配器 —— CloudKVAdapter 的官方实现
// ════════════════════════════════════════

/** KV 对象统一前缀：与文件后端的 `{appleId}-{file}` 数字前缀、墓碑标记天然不冲突 */
const KV_PREFIX = '_kv/'

/**
 * 基于同一 bucket 的 KV 适配器（get/set/remove，值 JSON 序列化）。
 * 结构化匹配 unified.ts 的 CloudKVAdapter —— 传给 setCloudAdapter 即用。
 *
 * 语义约定：
 * - get：对象不存在（400/404）→ null；权限/网络故障 → 抛错（由 unified 降级链接住）
 * - remove：对象已不存在视同成功（幂等删除）；其余错误上抛
 */
export class SupabaseKVAdapter {
  private tr: SupabaseTransport

  constructor(cfg: SupabaseConfig) {
    this.tr = new SupabaseTransport(cfg)
  }

  private objectName(key: string): string {
    // 键名经 ASCII 清洗（中文键直接上传会 400 InvalidKey）后再 URL 编码；
    // 前缀中的 / 不参与编码（是路径分隔符），冲突域内唯一性由调用方保证
    const clean = sanitizeObjectKeyPart(key)
    // 清洗丢信息 = 不同键可能映射同一对象静默互相覆盖（如两个纯中文键都变 file），
    // 库内 key 全 ASCII 不触发；外部消费者需自查
    if (/[^\x20-\x7E]/.test(key)) {
      console.warn(
        `[supabase-kv] key 含非 ASCII 字符，清洗为 "${KV_PREFIX}${clean}"（与其他同类键可能同名互相覆盖），建议改用 ASCII key: ${key}`,
      )
    }
    return KV_PREFIX + encodeURIComponent(clean)
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const resp = await this.tr.getObject(this.objectName(key))
    if (!resp) return null
    try {
      return JSON.parse(await resp.text()) as T
    } catch (e) {
      // 云端数据损坏：按 miss 处理并留痕（下次 set 会覆盖修复），不让坏数据崩掉读取链
      console.warn('[supabase-kv] 云端 KV 解析失败，按 miss 处理:', key, e)
      return null
    }
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    await this.tr.putObject(this.objectName(key), JSON.stringify(value), 'application/json')
  }

  async remove(key: string): Promise<void> {
    try {
      await this.tr.deleteObjectWithRetry(this.objectName(key))
    } catch (e) {
      // 幂等删除：对象不存在（bucket 未建/已删）视同成功，不向调用方报错
      console.warn('[supabase-kv] 云端删除忽略（对象可能不存在）:', key, e)
    }
  }
}

/** 工厂：创建可注入 setCloudAdapter 的 Supabase KV 适配器 */
export function createSupabaseKVAdapter(cfg: SupabaseConfig): SupabaseKVAdapter {
  return new SupabaseKVAdapter(cfg)
}
