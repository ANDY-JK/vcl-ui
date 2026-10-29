import { reportWarn } from '@/components/_internal/runtime-observer'
/**
 * S3 兼容对象存储传输层（缤纷云 Bitiful / AWS / 其它 S3 兼容端点）——零 SDK
 *
 * - SigV4 签名（实现经 aws4 参考实现交叉验证 + 缤纷云真实端点增删改查实测）
 * - 默认虚拟主机式寻址：endpoint 即「桶级访问域名」（如 https://{bucket}.s3.bitiful.net）
 *   forcePathStyle=true 时为路径式：endpoint/{bucket}/{key}（MinIO/自建网关常用）
 * - 区域：缤纷云不校验（默认 us-east-1）；AWS 系填真实区域
 * - 面板携带 AK/SK 直连：密钥会进入前端产物，仅限内部工具/私有部署使用；
 *   对外产品必须走服务端签名（预签名 URL 下发）
 * - 上传使用 UNSIGNED-PAYLOAD（浏览器无法对 Blob 预算哈希；端点兼容已实测）
 */
import { useT } from '@/components/_internal/i18n'
import { REQUEST_TIMEOUT_MS } from './request-timeout'
// 时间归一与 supabase-transport 共用零依赖叶子模块（直接引 supabase 会形成循环依赖）
import { toEpochMs } from './time-epoch'

/** 删除对象失败的线性退避基数：第 i 次重试等 i × 该值。与 supabase-transport 的同名常量结构相同、数值不同（两份都是沿用各自现状，未实测比较过谁更合适） */
const _DELETE_RETRY_STEP_MS = 200

const t = useT()

/** 列表单对象元数据（与 supabase-transport 的 CloudObjectMeta 对齐） */
export interface S3ObjectMeta {
  name: string
  size: number
  /** S3 列表不返回 content-type，按扩展名推断 */
  mimetype: string
  createdAt: number
}

export interface S3Config {
  /** 桶级访问域名（虚拟主机式，如 https://my-main-oss-2026.s3.bitiful.net）或服务根地址（路径式需 forcePathStyle） */
  endpoint: string
  /** SigV4 区域；缤纷云等兼容层不校验，默认 us-east-1 */
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  /** 路径式寻址（endpoint/{bucket}/{key}）；默认虚拟主机式 */
  forcePathStyle?: boolean
}

export function validateS3Config(cfg: S3Config): string | null {
  if (!cfg.endpoint?.trim()) return t('storage.s3EndpointRequired')
  if (!/^https?:\/\//.test(cfg.endpoint.trim())) return t('storage.s3EndpointFormat')
  if (!cfg.bucket.trim()) return t('storage.supabaseBucketRequired')
  if (!cfg.accessKeyId.trim()) return t('storage.s3AkRequired')
  if (!cfg.secretAccessKey.trim()) return t('storage.s3SkRequired')
  return null
}

/** 列表分页保护上限：对象数远超此值时视为异常场景，避免失控翻页 */
const MAX_LIST_PAGES = 200
/** 预签名展示 URL 有效期：24h（跨设备打开页面即重新签名，无需更长） */
const PRESIGN_EXPIRES_SECONDS = 86_400

/** 扩展名 → MIME（列表展示用；S3 列表不返回 content-type） */
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  pdf: 'application/pdf',
  txt: 'text/plain',
}

function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

/** AWS UriEncode：RFC3986 + 额外编码 !'()* */
function awsUriEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

export class S3Transport {
  /** 桶内对象路径前缀（路径式寻址时含 /{bucket}，虚拟主机式为 ''） */
  private readonly basePath: string
  private readonly host: string
  private readonly clock: () => Date

  constructor(
    public readonly cfg: S3Config,
    clock?: () => Date,
  ) {
    // 工厂级防御：即使调用方跳过 validateStorageConfig，空配置也在此拒绝
    const err = validateS3Config(cfg)
    if (err) throw new Error(err)
    this.clock = clock ?? (() => new Date())
    const u = new URL(cfg.endpoint.trim())
    // 虚拟主机式：endpoint 即「桶级访问域名」（桶名已在 host 里，勿再拼接）；
    // 路径式：endpoint 为服务根地址，桶进路径段
    this.host = u.host
    this.basePath = cfg.forcePathStyle ? `/${awsUriEncode(cfg.bucket)}` : u.pathname.replace(/\/+$/, '')
  }

  private get region(): string {
    return this.cfg.region?.trim() || 'us-east-1'
  }

  /** 对象访问路径：{basePath}/{逐段编码的 key}（保留 / 的文件夹语义） */
  private objectPath(name: string): string {
    return `${this.basePath}/${name.split('/').map(encodeURIComponent).join('/')}`
  }

  // ===== SigV4（实现对照 aws4 参考实现；真实端点增删改查实测通过） =====

  private amzDate(d: Date): string {
    return d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '')
  }

  private authorization(
    method: string,
    canonicalUri: string,
    query: Record<string, string>,
    headers: Record<string, string>,
    payloadHash: string,
    now: Date,
  ): string {
    const amzDate = this.amzDate(now)
    const dateShort = amzDate.slice(0, 8)
    const sorted = Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort()
    const canonHeaders = sorted.map((h) => `${h}:${String(headers[h]).trim()}\n`).join('')
    const canonQuery = Object.keys(query)
      .sort()
      .map((k) => `${awsUriEncode(k)}=${awsUriEncode(query[k])}`)
      .join('&')
    const canonicalRequest = [method, canonicalUri, canonQuery, canonHeaders, sorted.join(';'), payloadHash].join('\n')
    const scope = `${dateShort}/${this.region}/s3/aws4_request`
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n')
    const kDate = hmacSha256(`AWS4${this.cfg.secretAccessKey}`, dateShort)
    const kRegion = hmacSha256(kDate, this.region)
    const kService = hmacSha256(kRegion, 's3')
    const kSigning = hmacSha256(kService, 'aws4_request')
    const signature = toHex(hmacSha256(kSigning, stringToSign))
    return `AWS4-HMAC-SHA256 Credential=${this.cfg.accessKeyId}/${scope}, SignedHeaders=${sorted.join(';')}, Signature=${signature}`
  }

  /** 预签名 GET URL（查询串签名，供 <img> 直接展示私有对象） */
  presignGet(name: string, expiresSeconds = PRESIGN_EXPIRES_SECONDS): string {
    const now = this.clock()
    const amzDate = this.amzDate(now)
    const dateShort = amzDate.slice(0, 8)
    const scope = `${dateShort}/${this.region}/s3/aws4_request`
    const query: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.cfg.accessKeyId}/${scope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresSeconds),
      'X-Amz-SignedHeaders': 'host',
    }
    const canonicalRequest = [
      'GET',
      this.objectPath(name),
      canonicalQueryString(query),
      `host:${this.host}\n`,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n')
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n')
    const kDate = hmacSha256(`AWS4${this.cfg.secretAccessKey}`, dateShort)
    const kRegion = hmacSha256(kDate, this.region)
    const kService = hmacSha256(kRegion, 's3')
    const kSigning = hmacSha256(kService, 'aws4_request')
    const signature = toHex(hmacSha256(kSigning, stringToSign))
    return `https://${this.host}${this.objectPath(name)}?${canonicalQueryString(query)}&X-Amz-Signature=${signature}`
  }

  /** 展示用 URL（StorageBackend 统一入口） */
  objectUrl(name: string): string {
    return this.presignGet(name)
  }

  /** 带超时的原始请求（认证签名注入；host 由浏览器/运行时自动发送，不显式设置） */
  private async fetchRaw(
    path: string,
    query: Record<string, string>,
    method: string,
    body?: Blob | string,
    contentType?: string,
  ): Promise<Response> {
    const now = this.clock()
    const payloadHash = body ? 'UNSIGNED-PAYLOAD' : sha256Hex('')
    // 注意：content-length 由运行时自动携带且缤纷云不要求签名覆盖，不参与 SignedHeaders
    const headers: Record<string, string> = {
      host: this.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': this.amzDate(now),
    }
    if (contentType) headers['content-type'] = contentType
    const canonicalUri = path.split('?')[0]
    const authorization = this.authorization(method, canonicalUri, query, headers, payloadHash, now)
    const qs = canonicalQueryString(query)
    const url = `https://${this.host}${path}${qs ? '?' + qs : ''}`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
    try {
      return await fetch(url, {
        method,
        headers: { ...headers, Authorization: authorization },
        body: body as BodyInit | undefined,
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

  /** 上传/覆盖对象（同键覆盖即 S3 语义，无需 upsert 头） */
  async putObject(name: string, body: Blob | string, contentType: string): Promise<void> {
    const resp = await this.fetchRaw(this.objectPath(name), {}, 'PUT', body, contentType)
    if (!resp.ok) throw new Error(`${t('storage.cloudHttpError', { status: resp.status })}（PUT ${name}）`)
  }

  async deleteObject(name: string): Promise<void> {
    const resp = await this.fetchRaw(this.objectPath(name), {}, 'DELETE')
    // 204/200 均为成功；404 = 已不存在（幂等，视为成功）
    if (!resp.ok && resp.status !== 404) {
      throw new Error(`${t('storage.cloudHttpError', { status: resp.status })}（DELETE ${name}）`)
    }
  }

  /** 删除重试（与 supabase 传输同策略：3 次退避；404 幂等成功不重试） */
  async deleteObjectWithRetry(name: string, attempts = 3): Promise<void> {
    for (let i = 1; i <= attempts; i++) {
      try {
        await this.deleteObject(name)
        return
      } catch (e) {
        if (i === attempts) throw e
        await new Promise((r) => setTimeout(r, _DELETE_RETRY_STEP_MS * i))
      }
    }
  }

  /** 列出桶内全部对象（自动分页；S3 列表无 content-type，按扩展名推断） */
  async listObjects(): Promise<S3ObjectMeta[]> {
    const out: S3ObjectMeta[] = []
    let token: string | undefined
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const query: Record<string, string> = { 'list-type': '2', 'max-keys': '1000' }
      if (token) query['continuation-token'] = token
      const resp = await this.fetchRaw(this.basePath + '/', query, 'GET')
      if (!resp.ok) {
        const hint =
          resp.status === 403
            ? t('storage.cloudPermissionDenied')
            : t('storage.cloudHttpError', { status: resp.status })
        throw new Error(`${hint}（LIST ${this.cfg.bucket}）`)
      }
      const xml = await resp.text()
      for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const block = m[1]
        // S3 协议：Key 恒为 URL 编码（如 %E5%90%88%E5%90%8C），必须解码；裸 % 污染名跳过不崩
        let rawKey = block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? ''
        try {
          rawKey = decodeURIComponent(rawKey)
        } catch {
          reportWarn('[s3-transport] 对象键解码失败，跳过:', rawKey)
          continue
        }
        const name = decodeXml(rawKey)
        if (!name) continue
        const size = Number(block.match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0)
        const lastModified = block.match(/<LastModified>([^<]+)<\/LastModified>/)?.[1]
        out.push({
          name,
          size,
          mimetype: mimeFromName(name),
          // 非法/缺失时间一律 0：NaN 会让墓碑比较（ts > prev.ts）恒 false，删除被忽略
          createdAt: toEpochMs(lastModified),
        })
      }
      if (/<IsTruncated>true<\/IsTruncated>/.test(xml)) {
        token = decodeXml(xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] ?? '')
        if (!token) break
      } else {
        break
      }
    }
    return out
  }
}

// ===== 签名原语（同步 crypto；浏览器/node 通用） =====

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function sha256Hex(data: string): string {
  return toHex(sha256Bytes(data))
}

function canonicalQueryString(query: Record<string, string>): string {
  return Object.keys(query)
    .sort()
    .map((k) => `${awsUriEncode(k)}=${awsUriEncode(query[k])}`)
    .join('&')
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

// ---- sha256/hmac：签名必须在同步路径上（authorization() 直接返回字符串），浏览器无同步
// WebCrypto——用极小的同步纯 JS 实现（无依赖；签名仅对 <8KB 字符串，性能无压力） ----

/** 纯 JS SHA-256（同步） */
function sha256Sync(data: Uint8Array): Uint8Array {
  const K = SHA256_K
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const l = data.length
  const bitLenHi = Math.floor(l / 0x20000000)
  const bitLenLo = (l << 3) >>> 0
  const padded = new Uint8Array((((l + 8) >> 6) << 6) + 64)
  padded.set(data)
  padded[l] = 0x80
  const dv = new DataView(padded.buffer)
  dv.setUint32(padded.length - 8, bitLenHi)
  dv.setUint32(padded.length - 4, bitLenLo)
  const w = new Uint32Array(64)
  for (let i = 0; i < padded.length; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4)
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3)
      const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10)
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0
    }
    let a = H[0]
    let b = H[1]
    let c = H[2]
    let d = H[3]
    let e = H[4]
    let f = H[5]
    let g = H[6]
    let h = H[7]
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K[j] + w[j]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      h = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    H[0] = (H[0] + a) >>> 0
    H[1] = (H[1] + b) >>> 0
    H[2] = (H[2] + c) >>> 0
    H[3] = (H[3] + d) >>> 0
    H[4] = (H[4] + e) >>> 0
    H[5] = (H[5] + f) >>> 0
    H[6] = (H[6] + g) >>> 0
    H[7] = (H[7] + h) >>> 0
  }
  const out = new Uint8Array(32)
  const dvOut = new DataView(out.buffer)
  for (let i = 0; i < 8; i++) dvOut.setUint32(i * 4, H[i])
  return out
}

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0
}

/** 纯 JS HMAC-SHA256 */
function hmacSync(key: Uint8Array, data: Uint8Array): Uint8Array {
  let k = key
  if (k.length > 64) k = sha256Sync(k)
  const block = new Uint8Array(64)
  block.set(k)
  const oKey = new Uint8Array(64)
  const iKey = new Uint8Array(64)
  for (let i = 0; i < 64; i++) {
    oKey[i] = block[i] ^ 0x5c
    iKey[i] = block[i] ^ 0x36
  }
  const inner = sha256Sync(concatBytes(iKey, data))
  return sha256Sync(concatBytes(oKey, inner))
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

// SHA-256 轮常量（前 64 个素数的立方根小数部分）
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
])

function sha256Bytes(data: string): Uint8Array {
  return sha256Sync(new TextEncoder().encode(data))
}

function hmacSha256(key: string | Uint8Array, data: string): Uint8Array {
  const keyBytes = typeof key === 'string' ? new TextEncoder().encode(key) : key
  return hmacSync(keyBytes, new TextEncoder().encode(data))
}
