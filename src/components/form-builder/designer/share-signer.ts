/**
 * share-signer —— 分享码签名的**可插拔签发者**（第五轮审查 R5-C3 的后续硬化）
 *
 * 为什么要有这一层：
 *   分享码 `FD1.<base64(JSON)>` 未签名时，任何拿到链接的人都能改 schema 再转发。
 *   `share.ts` 已提供 HMAC 签名（FD2），但**密钥若打进前端包，签名只挡得住手动改 Base64 的人**——
 *   真正的防伪要由服务端签发。可是本项目目前**不上服务器**，所以这里不写死任何一种：
 *
 *     · 本地/自用（默认）：`createHmacSigner(key)` —— 浏览器内 HMAC，零后端依赖；
 *     · 接入服务端（将来）：`createHttpSigner({ signUrl, verifyUrl })` —— 把签发/验签交给后端，
 *       前端只传原文、只收签名/结论，密钥不出服务端。
 *
 * 宿主用法：
 *   import { setActiveShareSigner, createHmacSigner } from 'vcl-ui/form-builder'
 *   setActiveShareSigner(createHmacSigner(import.meta.env.VITE_SHARE_KEY))   // 本地
 *   setActiveShareSigner(createHttpSigner({ signUrl: '/api/share/sign' }))  // 将来接后端
 *
 * 设计取舍：**默认不启用**（active signer 为 null）——保持现有 FD1 链接可用，不制造破坏性变更；
 * 宿主显式设置后才产出 FD2。
 */

/** 待签名原文与签名都按 base64url 字符串传递（与 share.ts 的 content 段同形） */
export interface ShareSigner {
  /** 名称，用于日志/UI 显示当前签发方式 */
  readonly name: string
  /** 对原文生成签名 */
  sign(payload: string): Promise<string>
  /** 校验签名；实现方应做**定长比较**，避免时序侧信道 */
  verify(payload: string, signature: string): Promise<boolean>
}

/** 定长比较（字符串长度不同直接 false；长度相同逐字符异或累积） */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * 浏览器内 HMAC-SHA256 签发者。
 * 适用：同源自用 / 内部工具 / 还没上后端时先把格式定下来。
 * **不适用**：跨端防伪——密钥会随前端包分发。
 */
export function createHmacSigner(key: string): ShareSigner {
  if (!key) throw new Error('createHmacSigner: key 不能为空')
  const enc = new TextEncoder()
  let cached: CryptoKey | null = null
  const cryptoKey = async () => {
    if (!cached) {
      cached = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    }
    return cached
  }
  return {
    name: 'hmac-local',
    async sign(payload) {
      const mac = await crypto.subtle.sign('HMAC', await cryptoKey(), enc.encode(payload))
      return toBase64Url(new Uint8Array(mac))
    },
    async verify(payload, signature) {
      return timingSafeEqualStr(await this.sign(payload), signature)
    },
  }
}

export interface HttpSignerOptions {
  /** 签发端点：POST { payload } → { signature } */
  signUrl: string
  /** 验签端点：POST { payload, signature } → { valid }；不传则本地不做校验（只签发） */
  verifyUrl?: string
  /** 额外请求头（如 Authorization） */
  headers?: Record<string, string>
  /** 注入 fetch（测试用；默认全局 fetch） */
  fetchImpl?: typeof fetch
}

/**
 * 服务端签发者（**接缝**）：密钥留在后端，前端只收发原文/签名。
 *
 * 契约（后端按此实现即可，本项目当前不上服务器，故只有契约没有实现）：
 *   POST {signUrl}   body {"payload":"<base64url>"}         → 200 {"signature":"<base64url>"}
 *   POST {verifyUrl} body {"payload":"...","signature":"..."} → 200 {"valid":true|false}
 * 失败语义：非 2xx 或结构不符 → 抛错（**不静默降级为"未签名"**，否则防伪形同虚设）。
 */
export function createHttpSigner(opts: HttpSignerOptions): ShareSigner {
  const doFetch = opts.fetchImpl ?? fetch
  const post = async (url: string, body: unknown): Promise<Record<string, unknown>> => {
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`分享码签发服务返回 HTTP ${res.status}`)
    return (await res.json()) as Record<string, unknown>
  }
  return {
    name: 'http-server',
    async sign(payload) {
      const json = await post(opts.signUrl, { payload })
      const sig = json.signature
      if (typeof sig !== 'string' || !sig) throw new Error('分享码签发服务未返回 signature')
      return sig
    },
    async verify(payload, signature) {
      if (!opts.verifyUrl) return false // 没配验签端点就不接受"已验证"
      const json = await post(opts.verifyUrl, { payload, signature })
      return json.valid === true
    },
  }
}

// ── 全局当前签发者（宿主显式设置才生效；默认 null = 产出未签名 FD1） ──────────
let activeSigner: ShareSigner | null = null

/** 设置当前签发者；传 null 恢复"不签名" */
export function setActiveShareSigner(signer: ShareSigner | null): void {
  activeSigner = signer
}

/** 读取当前签发者（未设置返回 null） */
export function getActiveShareSigner(): ShareSigner | null {
  return activeSigner
}
