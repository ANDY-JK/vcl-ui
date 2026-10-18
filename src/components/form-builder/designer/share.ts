/**
 * 表单分享码 — 把 FormDesign 压缩为可复制的短串，跨设备/跨人还原表单
 *
 * 格式（两种，签名可选）：
 * - `FD1.⟨base64url(JSON)⟩`              未签名
 * - `FD2.⟨base64url(JSON)⟩.⟨base64url(HMAC)⟩` 已签名（见 signShareCode / verifyShareCode）
 *
 * - 前缀带版本号，导入端按前缀识别（粘贴纯 JSON 走原有导入路径，互不干扰）
 * - base64url（+→- /→_ 去 =）可安全放入 URL/聊天窗口，不含换行
 * - UTF-8 经 TextEncoder 编码后转二进制串再 btoa，支持中文内容
 * - **签名解决的是「伪造」而不是「泄露」**：分享码内容本来就随链接给人，签名只让宿主能拒绝
 *   非自己签发的码（例如有人改了 schema 里的 apiUrl 再发出去）。密钥由宿主持有，
 *   浏览器端签名只适合「同源自用」；跨端防伪应由服务端签发。
 *
 * 短链：`S.<formId>` — 设计已存 store（本地/云端），链接只带表单 id（几十字符），
 * 二维码容量有限（~2953 字节），完整分享码常超容，短链保证任何表单都能生成二维码。
 * 扫码端从 store 按 id 加载设计（同设备本地可开；跨设备需云端 store 或复制完整链接）。
 */

import { FORM_DESIGN_VERSION, type FormDesign } from './types'
import type { ShareSigner } from './share-signer'

/** 设计分享码前缀：FD1 + base64 串，指向单份完整表单设计（容量大，与 S + id 短链互补） */
export const SHARE_CODE_PREFIX = 'FD1.'
/** 已签名分享码前缀（第二段是内容、第三段是签名） */
export const SHARE_CODE_SIGNED_PREFIX = 'FD2.'
/** 短链前缀：S + formId，指向 store 中已保存的表单设计（JSDoc/文档说明文字忌写裸尖括号，VitePress 会当 HTML 标签） */
export const SHARE_ID_PREFIX = 'S.'

/**
 * 拼接分享链接的基址。SSR / 无 location 环境回落为相对路径（`#/form/...`），
 * 不抛错——服务端渲染时链接由客户端 hydrate 后再补全即可。
 */
function linkBase(): string {
  if (typeof location === 'undefined' || !location.origin) return ''
  return `${location.origin}${location.pathname}`
}

/** 生成短链标识（设计已存 store，仅带 id） */
export function encodeShareId(formId: string): string {
  return SHARE_ID_PREFIX + formId
}

/** 解析短链标识 → 表单 id；非短链返回 null */
export function parseShareId(code: string): string | null {
  const raw = (code ?? '').trim()
  if (!raw.startsWith(SHARE_ID_PREFIX)) return null
  const id = raw.slice(SHARE_ID_PREFIX.length)
  return id ? id : null
}

/** 完整分享链接（编码全部设计，跨设备可靠但长）；SSR 下返回相对链接 */
export function shareFullLink(shareCode: string): string {
  return `${linkBase()}#/form/${shareCode}`
}

/** 短链链接（设计存 store，短到二维码能放下）；SSR 下返回相对链接 */
export function shareShortLink(formId: string): string {
  return `${linkBase()}#/form/${encodeShareId(formId)}`
}

/** FormDesign → 分享码（内容不加密：仅传输编码，敏感表单请勿外发） */
export function encodeShareCode(design: FormDesign): string {
  const payload = {
    schemaVersion: design.schemaVersion ?? FORM_DESIGN_VERSION,
    meta: design.meta ?? {},
    nodes: design.nodes ?? design.fields ?? [],
  }
  return SHARE_CODE_PREFIX + toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
}

/** 分享码 → FormDesign；非分享码/损坏内容返回 null（导入面板据此走 JSON 路径或报错） */
export function decodeShareCode(code: string): FormDesign | null {
  const parsed = parseShareCode(code)
  return parsed ? parsed.design : null
}

/** 解析结果：design 为内容；signed 表示是否带签名；sig 为签名原文（未签名时 null） */
export interface ParsedShareCode {
  design: FormDesign
  signed: boolean
  /** 待验签的原文字节串（把 FD2.⟨content⟩.⟨sig⟩ 里的 content 还原为 b64 后的字节） */
  signedPayload: string | null
  sig: string | null
}

/**
 * 解析分享码（含签名分段），成功返回结构，失败返回 null。
 * 注意：**这里不验签**（库不持有宿主密钥）——调用方拿到 signedPayload/sig 后用
 * `verifyShareCode(parsed, key)` 做验签，或直接用 `decodeShareCodeVerified(code, key)`。
 */
export function parseShareCode(code: string): ParsedShareCode | null {
  const raw = (code ?? '').trim()
  const signed = raw.startsWith(SHARE_CODE_SIGNED_PREFIX)
  if (!signed && !raw.startsWith(SHARE_CODE_PREFIX)) return null

  const body = signed ? raw.slice(SHARE_CODE_SIGNED_PREFIX.length) : raw.slice(SHARE_CODE_PREFIX.length)
  // FD2 的 body 形如 `⟨content⟩.⟨sig⟩`；content 的 base64url 字符集不含 '.'

  const dot = signed ? body.lastIndexOf('.') : -1
  const content = dot >= 0 ? body.slice(0, dot) : body
  const sig = dot >= 0 ? body.slice(dot + 1) : null

  try {
    const bytes = fromBase64Url(content)
    const data = JSON.parse(new TextDecoder().decode(bytes)) as Partial<FormDesign>
    if (!data || typeof data !== 'object') return null
    // nodes（v3）或 fields（v2）任一为数组才认定有效
    if (!Array.isArray(data.nodes) && !Array.isArray(data.fields)) return null
    const design = { ...data, meta: data.meta ?? {}, nodes: (data.nodes ?? data.fields ?? []) as FormDesign['nodes'] }
    return { design, signed: signed && !!sig, signedPayload: content, sig }
  } catch {
    return null
  }
}

// ── 签名（HMAC-SHA256，WebCrypto）──────────────────────────────────────────
// 用途：让宿主能拒绝「不是自己签发」的分享码（有人改了 schema 里的 apiUrl 再发出去）。
// 密钥由宿主持有；浏览器端密钥会进前端包，**只适合同源自用**，跨端防伪请由服务端签发。

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(b64url: string): Uint8Array {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** 计算签名（HMAC-SHA256，输出 base64url） */
export async function signPayload(payload: string, key: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const mac = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(payload))
  return toBase64Url(new Uint8Array(mac))
}

/** 把未签名分享码升级为已签名（FD1.⟨content⟩ → FD2.⟨content⟩.⟨sig⟩）；已是签名码则重签 */
export async function signShareCode(code: string, key: string): Promise<string | null> {
  const parsed = parseShareCode(code)
  if (!parsed || !parsed.signedPayload) return null
  const sig = await signPayload(parsed.signedPayload, key)
  return `${SHARE_CODE_SIGNED_PREFIX}${parsed.signedPayload}.${sig}`
}

/** 验签：已签名码必须验过才返回 design；未签名的码返回 null（requireSigned 语义） */
export async function decodeShareCodeVerified(code: string, key: string): Promise<FormDesign | null> {
  const parsed = parseShareCode(code)
  if (!parsed || !parsed.signed || !parsed.signedPayload || !parsed.sig) return null
  const expect = await signPayload(parsed.signedPayload, key)
  // 定长比较，避免时序侧信道（签名长度固定）
  if (expect.length !== parsed.sig.length) return null
  let diff = 0
  for (let i = 0; i < expect.length; i++) diff |= expect.charCodeAt(i) ^ parsed.sig.charCodeAt(i)
  return diff === 0 ? parsed.design : null
}

// ── 与可插拔签发者（ShareSigner）协作的版本 ────────────────────────────────
// 上面的 signShareCode / decodeShareCodeVerified 是「密钥放在前端」的 HMAC 版本；
// 下面两个把签发/验签委托给 ShareSigner —— 宿主可注入服务端签发者，密钥不出后端。
// 见 designer/share-signer.ts（含 createHmacSigner / createHttpSigner 与契约说明）。

/** 用签发者把分享码升级为 FD2（已是签名码则重签） */
export async function signShareCodeWith(code: string, signer: ShareSigner): Promise<string | null> {
  const parsed = parseShareCode(code)
  if (!parsed || !parsed.signedPayload) return null
  const sig = await signer.sign(parsed.signedPayload)
  return `${SHARE_CODE_SIGNED_PREFIX}${parsed.signedPayload}.${sig}`
}

/**
 * 用签发者验签。
 * 返回 'ok' | 'unsigned' | 'bad-signature' —— 三种情形必须分开：
 * 「没签名」与「签名不对」对调用方意味着完全不同的处置（前者可放行，后者必须拒）。
 */
export async function verifyShareCodeWith(
  code: string,
  signer: ShareSigner,
): Promise<{ status: 'ok' | 'unsigned' | 'bad-signature'; design: FormDesign | null }> {
  const parsed = parseShareCode(code)
  if (!parsed) return { status: 'bad-signature', design: null }
  if (!parsed.signed || !parsed.signedPayload || !parsed.sig) {
    return { status: 'unsigned', design: parsed.design }
  }
  const ok = await signer.verify(parsed.signedPayload, parsed.sig)
  return ok ? { status: 'ok', design: parsed.design } : { status: 'bad-signature', design: null }
}
